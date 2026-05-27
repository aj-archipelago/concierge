import { sanitizeMediaSettings } from "../mediaGenerationSettings";

describe("sanitizeMediaSettings", () => {
    test("removes obsolete audio model prompt fragments", () => {
        const settings = {
            models: {
                "google-lyria-3-music": {
                    type: "audio",
                    duration: 30,
                    audioUseCase: "music",
                    audioStyle: "cinematic",
                    audioMood: "focused",
                    negativePrompt: "vocals",
                    negative_prompt: "drums",
                },
                "replicate-seedance-1-pro": {
                    type: "video",
                    duration: 5,
                },
            },
        };

        expect(sanitizeMediaSettings(settings)).toEqual({
            models: {
                "google-lyria-3-music": {
                    type: "audio",
                },
                "replicate-seedance-1-pro": {
                    type: "video",
                    duration: 5,
                },
            },
        });
    });

    test("removes obsolete legacy audio defaults", () => {
        expect(
            sanitizeMediaSettings({
                audio: {
                    defaultModel: "google-lyria-3-music",
                    defaultDuration: 30,
                    defaultUseCase: "music",
                    defaultStyle: "cinematic",
                    defaultMood: "focused",
                },
            }),
        ).toEqual({
            audio: {
                defaultModel: "google-lyria-3-music",
            },
        });
    });

    test("removes obsolete Lyria model settings even without a saved type", () => {
        expect(
            sanitizeMediaSettings({
                models: {
                    "google-lyria-3-music": {
                        duration: 30,
                        audioUseCase: "music",
                        audioStyle: "ambient",
                        audioMood: "warm",
                    },
                },
            }),
        ).toEqual({
            models: {
                "google-lyria-3-music": {},
            },
        });
    });

    test("removes unsupported output controls from MiniMax Music Cover", () => {
        expect(
            sanitizeMediaSettings({
                models: {
                    "replicate-minimax-music-cover": {
                        type: "audio",
                        audioFormat: "wav",
                        sampleRate: 44100,
                        bitrate: 256000,
                    },
                },
            }),
        ).toEqual({
            models: {
                "replicate-minimax-music-cover": {
                    type: "audio",
                },
            },
        });
    });
});
