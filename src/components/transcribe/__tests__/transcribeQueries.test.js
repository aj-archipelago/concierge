import {
    getAlternateTranscribeModelOption,
    getDefaultTranscribeModelOption,
    getTranscribeQuery,
    getTranscribeResult,
    isXaiTranscribeModelOption,
    supportsWordTimestampedTranscribeOption,
} from "../transcribeQueries";
import { QUERIES } from "../../../graphql";

describe("transcribeQueries", () => {
    test.each([
        ["Whisper", QUERIES.TRANSCRIBE],
        ["NeuralSpace", QUERIES.TRANSCRIBE_NEURALSPACE],
        ["Gemini", QUERIES.TRANSCRIBE_GEMINI],
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

    test("disables word-timestamped UI modes only for Gemini alone", () => {
        expect(supportsWordTimestampedTranscribeOption("Gemini")).toBe(false);
        expect(supportsWordTimestampedTranscribeOption("xAI + Gemini")).toBe(
            true,
        );
        expect(supportsWordTimestampedTranscribeOption("Whisper")).toBe(true);
    });
});
