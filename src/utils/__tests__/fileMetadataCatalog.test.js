import {
    applyFileMetadata,
    buildFileMetadataRequest,
    buildFolderTitleMap,
    normalizeFileMetadataPath,
} from "../fileMetadataCatalog";

describe("fileMetadataCatalog", () => {
    test("normalizes storage paths from user-prefixed and workspace paths", () => {
        expect(
            normalizeFileMetadataPath("users/u-1/chats/chat-1/report.pdf"),
        ).toBe("chats/chat-1/report.pdf");
        expect(
            normalizeFileMetadataPath("/workspace/files/applets/timer.html"),
        ).toBe("applets/timer.html");
    });

    test("builds compact batch metadata requests", () => {
        expect(
            buildFileMetadataRequest({
                folderPaths: ["chats/chat-1", "chats/chat-1"],
                files: [
                    { blobPath: "media/video.mp4" },
                    { name: "users/u-1/media/video.mp4" },
                ],
            }),
        ).toEqual({
            folderPaths: ["chats/chat-1"],
            blobPaths: ["media/video.mp4"],
        });
    });

    test("applies folder labels and file thumbnails from catalog metadata", () => {
        expect(
            buildFolderTitleMap(
                {},
                {
                    "chats/chat-1": {
                        displayName: "Launch Plan",
                    },
                },
            ),
        ).toEqual({ "chat-1": "Launch Plan" });

        expect(
            applyFileMetadata(
                { blobPath: "media/video.mp4", filename: "video.mp4" },
                {
                    "media/video.mp4": {
                        displayName: "Launch Video",
                        thumbnailUrl: "https://example.test/thumb.jpg",
                        _mediaItem: {
                            type: "video",
                            thumbnailUrl: "https://example.test/thumb.jpg",
                        },
                    },
                },
            ),
        ).toMatchObject({
            displayFilename: "Launch Video",
            _mediaItem: {
                type: "video",
                thumbnailUrl: "https://example.test/thumb.jpg",
            },
        });
    });
});
