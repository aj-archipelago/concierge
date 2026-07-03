import {
    getAlternateTranscribeModelOption,
    getDefaultTranscribeModelOption,
    getTranscribeQuery,
    getTranscribeResult,
    isMaiTranscribeModelOption,
    isXaiTranscribeModelOption,
    supportsSubtitleLayoutTranscribeOption,
    supportsWordTimestampedTranscribeOption,
} from "../transcribeQueries";
import { QUERIES } from "../../../graphql";

describe("transcribeQueries", () => {
    test.each([
        ["Whisper", QUERIES.TRANSCRIBE],
        ["NeuralSpace", QUERIES.TRANSCRIBE_NEURALSPACE],
        ["Gemini", QUERIES.TRANSCRIBE_GEMINI],
        ["MAI-Transcribe-1.5", QUERIES.TRANSCRIBE_MAI_15],
        ["mai-1.5", QUERIES.TRANSCRIBE_MAI_15],
        ["MAI Transcribe 1.5", QUERIES.TRANSCRIBE_MAI_15],
        ["xAI", QUERIES.TRANSCRIBE_XAI],
        ["xAI + Gemini", QUERIES.TRANSCRIBE_XAI_GEMINI],
        ["xai+gemini", QUERIES.TRANSCRIBE_XAI_GEMINI],
        [" XAI+Gemini ", QUERIES.TRANSCRIBE_XAI_GEMINI],
    ])("maps %s to the expected query", (modelOption, query) => {
        expect(getTranscribeQuery(modelOption)).toBe(query);
    });

    test("extracts results from all transcribe response shapes", () => {
        expect(getTranscribeResult({ transcribe: { result: "whisper" } })).toBe(
            "whisper",
        );
        expect(
            getTranscribeResult({
                transcribe_xai_gemini: { result: "hybrid" },
            }),
        ).toBe("hybrid");
        expect(
            getTranscribeResult({
                transcribe_mai_15: { result: "mai" },
            }),
        ).toBe("mai");
    });

    test("defaults YouTube to Gemini and regular media to xAI hybrid when xAI is enabled", () => {
        expect(
            getDefaultTranscribeModelOption(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                true,
                true,
            ),
        ).toBe("Gemini");
        expect(
            getDefaultTranscribeModelOption(
                "https://example.com/audio.wav",
                true,
                true,
            ),
        ).toBe("xAI + Gemini");
        expect(
            getDefaultTranscribeModelOption(
                "https://example.com/audio.wav",
                false,
                true,
            ),
        ).toBe("Whisper");
        expect(
            getDefaultTranscribeModelOption(
                "https://example.com/audio.wav",
                true,
                false,
            ),
        ).toBe("Whisper");
    });

    test("uses configured default and alternate model options for regular media", () => {
        expect(
            getDefaultTranscribeModelOption(
                "https://example.com/audio.wav",
                true,
                false,
                "xAI + Gemini",
            ),
        ).toBe("xAI + Gemini");
        expect(
            getAlternateTranscribeModelOption(
                "https://example.com/audio.wav",
                "Gemini",
            ),
        ).toBe("Gemini");
    });

    test("keeps YouTube on Gemini even when model options are configured", () => {
        const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

        expect(
            getDefaultTranscribeModelOption(youtubeUrl, true, true, "Whisper"),
        ).toBe("Gemini");
        expect(getAlternateTranscribeModelOption(youtubeUrl, "Whisper")).toBe(
            "Gemini",
        );
    });

    test("uses Whisper as the regular-media alternate model", () => {
        expect(
            getAlternateTranscribeModelOption("https://example.com/audio.wav"),
        ).toBe("Whisper");
        expect(
            getAlternateTranscribeModelOption(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            ),
        ).toBe("Gemini");
    });

    test.each(["xAI", "xai", "xAI + Gemini", "xai+gemini"])(
        "identifies %s as an xAI model",
        (modelOption) => {
            expect(isXaiTranscribeModelOption(modelOption)).toBe(true);
        },
    );

    test.each(["MAI-Transcribe-1.5", "mai-1.5", "MAI Transcribe 1.5"])(
        "identifies %s as a MAI model",
        (modelOption) => {
            expect(isMaiTranscribeModelOption(modelOption)).toBe(true);
        },
    );

    test("does not treat malformed mai-prefixed values as MAI", () => {
        expect(isMaiTranscribeModelOption("mai-fast")).toBe(false);
    });

    test("disables word-timestamped UI modes for phrase-timed models", () => {
        expect(supportsWordTimestampedTranscribeOption("Gemini")).toBe(false);
        expect(
            supportsWordTimestampedTranscribeOption("MAI-Transcribe-1.5"),
        ).toBe(false);
        expect(supportsWordTimestampedTranscribeOption("xAI + Gemini")).toBe(
            true,
        );
        expect(supportsWordTimestampedTranscribeOption("Whisper")).toBe(true);
    });

    test("disables subtitle layout modes only for MAI", () => {
        expect(supportsSubtitleLayoutTranscribeOption("Gemini")).toBe(true);
        expect(supportsSubtitleLayoutTranscribeOption("Whisper")).toBe(true);
        expect(
            supportsSubtitleLayoutTranscribeOption("MAI-Transcribe-1.5"),
        ).toBe(false);
    });
});
