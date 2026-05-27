import {
    getExpectedGeneratedMediaFilenameStem,
    getGeneratedMediaFilename,
    getGeneratedMediaTaskSuffix,
} from "../mediaGeneratedFilename";

describe("mediaGeneratedFilename", () => {
    test("uses the unique ObjectId tail for generated task suffixes", () => {
        expect(getGeneratedMediaTaskSuffix("6924c752e354c24a5d1da2c4")).toBe(
            "c24a5d1da2c4",
        );
        expect(getGeneratedMediaTaskSuffix("6924c752e354c24a5d1da2c5")).toBe(
            "c24a5d1da2c5",
        );
    });

    test("uses the same task suffix for upload filenames and expected pending stems", () => {
        const taskId = "6924c752e354c24a5d1da2c4";
        const prompt = "Image-only music generation";
        const suffix = getGeneratedMediaTaskSuffix(taskId);

        expect(
            getGeneratedMediaFilename(prompt, "wav", { uniqueSuffix: suffix }),
        ).toBe("image-only-music-generation-c24a5d1da2c4.wav");
        expect(
            getExpectedGeneratedMediaFilenameStem({
                taskId,
                prompt,
            }),
        ).toBe("image-only-music-generation-c24a5d1da2c4");
    });
});
