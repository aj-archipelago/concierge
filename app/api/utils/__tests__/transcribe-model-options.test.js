/**
 * @jest-environment node
 */

const {
    assertXaiTranscribeEnabled,
    getConfiguredTranscribeModelOption,
    getTranscribeAlternateModelOption,
    getTranscribeDefaultModelOption,
    isXaiTranscribeDefaultEnabled,
    isXaiTranscribeEnabled,
    isXaiTranscribeModelOption,
} = require("../transcribe-model-options.js");

describe("transcribe model option flags", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.ENABLE_XAI_TRANSCRIBE;
        delete process.env.ENABLE_XAI_TRANSCRIBE_DEFAULT;
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

        process.env.ENABLE_XAI_TRANSCRIBE = "true";
        expect(getConfiguredTranscribeModelOption("xai+gemini")).toBe(
            "xAI + Gemini",
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
        process.env.TRANSCRIBE_ALTERNATE_MODEL_OPTION = "xAI";
        expect(getTranscribeDefaultModelOption()).toBe("Gemini");
        expect(getTranscribeAlternateModelOption()).toBe("xAI");
    });
});
