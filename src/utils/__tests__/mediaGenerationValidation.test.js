import {
    assertMediaGenerationInputs,
    requiresReferenceVideo,
} from "../mediaGenerationValidation.js";

const task = (mode, input = {}) => ({
    model: "replicate-seedance-2.5",
    settings: {
        models: { "replicate-seedance-2.5": { generationMode: mode } },
    },
    ...input,
});

test.each(["edit", "extend"])(
    "%s rejects missing, image-only, and empty videos before enqueue",
    (mode) => {
        expect(
            requiresReferenceVideo(task(mode).model, { generationMode: mode }),
        ).toBe(true);
        for (const input of [
            {},
            { inputImageUrl: "https://example.com/photo.png" },
            { inputVideoUrl: " " },
        ]) {
            expect(() =>
                assertMediaGenerationInputs(task(mode, input)),
            ).toThrow("Attach a reference video");
        }
        expect(() =>
            assertMediaGenerationInputs(
                task(mode, { inputVideoUrl: "https://example.com/video.mp4" }),
            ),
        ).not.toThrow();
    },
);

test("text-only generation and unrelated models remain valid", () => {
    expect(() => assertMediaGenerationInputs(task("generate"))).not.toThrow();
    expect(() =>
        assertMediaGenerationInputs({ ...task("edit"), model: "other" }),
    ).not.toThrow();
});
