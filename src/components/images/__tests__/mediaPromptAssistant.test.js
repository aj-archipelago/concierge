import {
    buildMediaPromptAssistantVariables,
    getMediaPromptReferenceUrl,
} from "../mediaPromptAssistant";

describe("media prompt assistant helpers", () => {
    test("prefers display-safe reference URLs", () => {
        expect(
            getMediaPromptReferenceUrl({
                azureUrl: "https://storage.example/display.png",
                url: "gs://bucket/internal.png",
                gcsUrl: "gs://bucket/fallback.png",
            }),
        ).toBe("https://storage.example/display.png");
    });

    test("builds model-aware prompt assistant variables", () => {
        expect(
            buildMediaPromptAssistantVariables({
                prompt: "  make this cinematic  ",
                mediaType: "video",
                model: "veo-3.1-generate",
                references: [
                    {
                        azureUrl: "https://storage.example/start.jpg?sig=1",
                        inputImageRole: "start_frame",
                    },
                    {
                        url: "https://storage.example/clip.mp4",
                        inputVideoRole: "extend",
                    },
                    {
                        url: "",
                    },
                ],
            }),
        ).toEqual({
            prompt: "make this cinematic",
            mediaType: "video",
            model: "veo-3.1-generate",
            references: [
                "https://storage.example/start.jpg?sig=1",
                "https://storage.example/clip.mp4",
            ],
            referenceRoles: ["start_frame", "extend"],
            hasInputImages: true,
            referenceCount: 2,
        });
    });
});
