/**
 * @jest-environment node
 */

const {
    assertXaiTranscribeEnabled,
    getConfiguredTranscribeModelOption,
    getTranscribeAlternateModelOption,
    getTranscribeDefaultModelOption,
    getTranscribeTaskTimeout,
    isMaiTranscribeEnabled,
    isMaiTranscribeModelOption,
    isXaiTranscribeDefaultEnabled,
    isXaiTranscribeEnabled,
    isXaiTranscribeModelOption,
    normalizeTranscribeTaskMetadata,
    assertTranscribeModelOptionEnabled,
} = require("../transcribe-model-options.js");

describe("transcribe model option flags", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.ENABLE_XAI_TRANSCRIBE;
        delete process.env.ENABLE_XAI_TRANSCRIBE_DEFAULT;
        delete process.env.ENABLE_MAI_TRANSCRIBE;
        delete process.env.TRANSCRIBE_DEFAULT_MODEL_OPTION;
        delete process.env.TRANSCRIBE_ALTERNATE_MODEL_OPTION;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test("requires an explicit xAI capability flag", () => {
        process.env.NODE_ENV = "production";
        expect(isXaiTranscribeEnabled()).toBe(false);
        expect(isXaiTranscribeDefaultEnabled()).toBe(false);

        process.env.ENABLE_XAI_TRANSCRIBE = "true";
        expect(isXaiTranscribeEnabled()).toBe(true);
    });

    test("requires an explicit MAI capability flag", () => {
        expect(isMaiTranscribeEnabled()).toBe(false);
        expect(isMaiTranscribeModelOption("MAI-Transcribe-1.5")).toBe(true);
        expect(isMaiTranscribeModelOption("mai-fast")).toBe(false);
        expect(() =>
            assertTranscribeModelOptionEnabled("MAI-Transcribe-1.5"),
        ).toThrow("MAI transcription is not enabled");

        process.env.ENABLE_MAI_TRANSCRIBE = "true";
        expect(isMaiTranscribeEnabled()).toBe(true);
        expect(() =>
            assertTranscribeModelOptionEnabled("MAI-Transcribe-1.5"),
        ).not.toThrow();
    });

    test("normalizes MAI task metadata to supported phrase-level options", () => {
        expect(
            normalizeTranscribeTaskMetadata({
                modelOption: "MAI-Transcribe-1.5",
                wordTimestamped: true,
                maxLineCount: 1,
                maxLineWidth: 35,
                maxWordsPerLine: 3,
                highlightWords: true,
            }),
        ).toMatchObject({
            modelOption: "MAI-Transcribe-1.5",
            wordTimestamped: false,
            maxLineCount: undefined,
            maxLineWidth: undefined,
            maxWordsPerLine: undefined,
            highlightWords: false,
        });

        const whisperMetadata = {
            modelOption: "Whisper",
            wordTimestamped: true,
            maxWordsPerLine: 3,
        };
        expect(normalizeTranscribeTaskMetadata(whisperMetadata)).toBe(
            whisperMetadata,
        );
    });

    test("uses a longer worker timeout for MAI transcription", () => {
        expect(getTranscribeTaskTimeout("MAI-Transcribe-1.5")).toBe(
            60 * 60 * 1000,
        );
        expect(getTranscribeTaskTimeout("Whisper")).toBeUndefined();
    });

    test("requires an explicit default flag after capability is enabled", () => {
        process.env.NODE_ENV = "development";
        expect(isXaiTranscribeEnabled()).toBe(false);
        expect(isXaiTranscribeDefaultEnabled()).toBe(false);

        process.env.ENABLE_XAI_TRANSCRIBE = "true";
        expect(isXaiTranscribeDefaultEnabled()).toBe(false);

        process.env.ENABLE_XAI_TRANSCRIBE_DEFAULT = "true";
        expect(isXaiTranscribeDefaultEnabled()).toBe(true);
    });

    test("recognizes and guards xAI model names", () => {
        process.env.NODE_ENV = "production";
        expect(isXaiTranscribeModelOption("xAI + Gemini")).toBe(true);
        expect(isXaiTranscribeModelOption("Whisper")).toBe(false);
        expect(() => assertXaiTranscribeEnabled("xAI")).toThrow(
            "xAI transcription is not enabled",
        );
        expect(() => assertXaiTranscribeEnabled("Whisper")).not.toThrow();
    });

    test("normalizes configured transcribe model options", () => {
        expect(getConfiguredTranscribeModelOption(" whisper ")).toBe("Whisper");
        expect(getConfiguredTranscribeModelOption("xai+gemini")).toBe(null);
        expect(getConfiguredTranscribeModelOption("mai-1.5")).toBe(null);

        process.env.ENABLE_XAI_TRANSCRIBE = "true";
        process.env.ENABLE_MAI_TRANSCRIBE = "true";
        expect(getConfiguredTranscribeModelOption("xai+gemini")).toBe(
            "xAI + Gemini",
        );
        expect(getConfiguredTranscribeModelOption("mai transcribe 1.5")).toBe(
            "MAI-Transcribe-1.5",
        );
        expect(getConfiguredTranscribeModelOption("unknown")).toBe(null);
    });

    test("uses configured default and alternate models with legacy fallback", () => {
        expect(getTranscribeDefaultModelOption()).toBe("Whisper");
        expect(getTranscribeAlternateModelOption()).toBe("Whisper");

        process.env.ENABLE_XAI_TRANSCRIBE = "true";
        process.env.ENABLE_XAI_TRANSCRIBE_DEFAULT = "true";
        expect(getTranscribeDefaultModelOption()).toBe("xAI + Gemini");

        process.env.TRANSCRIBE_DEFAULT_MODEL_OPTION = "Gemini";
        process.env.ENABLE_MAI_TRANSCRIBE = "true";
        process.env.TRANSCRIBE_ALTERNATE_MODEL_OPTION = "MAI-Transcribe-1.5";
        expect(getTranscribeDefaultModelOption()).toBe("Gemini");
        expect(getTranscribeAlternateModelOption()).toBe("MAI-Transcribe-1.5");
    });
});
