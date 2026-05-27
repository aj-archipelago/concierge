import {
    getVideoFrameReferenceTarget,
    getVideoFrameReferenceTargets,
} from "../mediaVideoFrameReferences";

describe("media video frame references", () => {
    test("derives frame reference paths from a source media blob path", () => {
        expect(
            getVideoFrameReferenceTarget(
                "media/projects/clip.mp4",
                "start_frame",
            ),
        ).toEqual({
            blobPath:
                "media/video-frame-references/projects/clip.start_frame.jpg",
            filename: "clip.start_frame.jpg",
            subPath: "video-frame-references/projects",
        });
    });

    test("derives both start and end frame targets", () => {
        expect(getVideoFrameReferenceTargets("media/clip.mp4")).toEqual([
            {
                blobPath: "media/video-frame-references/clip.start_frame.jpg",
                filename: "clip.start_frame.jpg",
                subPath: "video-frame-references",
            },
            {
                blobPath: "media/video-frame-references/clip.end_frame.jpg",
                filename: "clip.end_frame.jpg",
                subPath: "video-frame-references",
            },
        ]);
    });

    test("does not derive targets for unsupported roles or missing paths", () => {
        expect(
            getVideoFrameReferenceTarget("media/clip.mp4", "reference"),
        ).toBe(null);
        expect(getVideoFrameReferenceTarget("", "start_frame")).toBe(null);
    });
});
