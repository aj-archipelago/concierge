/**
 * @jest-environment node
 */

jest.mock("../../utils/auth.js", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../models/media-item.mjs", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        deleteOne: jest.fn(),
    },
}));

jest.mock("../../utils/media-service-utils.js", () => ({
    checkMediaFile: jest.fn(),
    deleteMediaFile: jest.fn(),
}));

jest.mock("../../../../src/utils/storageTargets.js", () => ({
    createMediaStorageTarget: jest.fn((contextId) => ({
        contextId,
        fileScope: "media",
    })),
}));

const { DELETE } = require("./route");
const { getCurrentUser } = require("../../utils/auth.js");
const MediaItem = require("../../models/media-item.mjs").default;
const {
    checkMediaFile,
    deleteMediaFile,
} = require("../../utils/media-service-utils.js");
const {
    createMediaStorageTarget,
} = require("../../../../src/utils/storageTargets.js");

describe("media item delete route", () => {
    const originalWarn = console.warn;

    beforeEach(() => {
        jest.clearAllMocks();
        console.warn = jest.fn();
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            contextId: "ctx-1",
        });
        checkMediaFile.mockImplementation(({ blobPath, hash }) => {
            if (String(blobPath || "").includes("video-frame-references")) {
                return Promise.resolve({
                    blobPath,
                    hash: `${blobPath}-hash`,
                    url: `https://example.test/${blobPath}`,
                });
            }
            return Promise.resolve({
                blobPath: blobPath || "media/video.mp4",
                hash: hash || "video-hash",
                url: "https://example.test/video.mp4",
            });
        });
        deleteMediaFile.mockResolvedValue({ deleted: true });
        MediaItem.deleteOne.mockResolvedValue({ deletedCount: 1 });
    });

    afterAll(() => {
        console.warn = originalWarn;
    });

    it("deletes the linked video thumbnail when deleting the source media item", async () => {
        MediaItem.findOne.mockResolvedValue({
            _id: "media-1",
            user: "user-1",
            taskId: "task-1",
            type: "video",
            blobPath: "media/video.mp4",
            hash: "video-hash",
            thumbnailBlobPath: "media/video-thumbnails/thumbnail-task-1.jpg",
            thumbnailHash: "thumb-hash",
        });

        const response = await DELETE(
            {},
            {
                params: {
                    id: "task-1",
                },
            },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ success: true });
        expect(createMediaStorageTarget).toHaveBeenCalledWith("ctx-1");
        expect(deleteMediaFile).toHaveBeenCalledTimes(4);
        expect(deleteMediaFile).toHaveBeenNthCalledWith(1, {
            blobPath: "media/video.mp4",
            hash: "video-hash",
            storageTarget: {
                contextId: "ctx-1",
                fileScope: "media",
            },
        });
        expect(deleteMediaFile).toHaveBeenNthCalledWith(2, {
            blobPath: "media/video-thumbnails/thumbnail-task-1.jpg",
            hash: "thumb-hash",
            storageTarget: {
                contextId: "ctx-1",
                fileScope: "media",
            },
        });
        expect(deleteMediaFile).toHaveBeenNthCalledWith(3, {
            blobPath: "media/video-frame-references/video.start_frame.jpg",
            hash: "media/video-frame-references/video.start_frame.jpg-hash",
            storageTarget: {
                contextId: "ctx-1",
                fileScope: "media",
            },
            fallbackToHash: false,
        });
        expect(deleteMediaFile).toHaveBeenNthCalledWith(4, {
            blobPath: "media/video-frame-references/video.end_frame.jpg",
            hash: "media/video-frame-references/video.end_frame.jpg-hash",
            storageTarget: {
                contextId: "ctx-1",
                fileScope: "media",
            },
            fallbackToHash: false,
        });
        expect(MediaItem.deleteOne).toHaveBeenCalledWith({ _id: "media-1" });
    });

    it("does not block source deletion if thumbnail cleanup fails", async () => {
        MediaItem.findOne.mockResolvedValue({
            _id: "media-1",
            user: "user-1",
            taskId: "task-1",
            type: "video",
            blobPath: "media/video.mp4",
            hash: "video-hash",
            thumbnailBlobPath: "media/video-thumbnails/thumbnail-task-1.jpg",
            thumbnailHash: "thumb-hash",
        });
        deleteMediaFile
            .mockResolvedValueOnce({ deleted: true })
            .mockResolvedValueOnce(null);

        const response = await DELETE(
            {},
            {
                params: {
                    id: "task-1",
                },
            },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ success: true });
        expect(MediaItem.deleteOne).toHaveBeenCalledWith({ _id: "media-1" });
        expect(console.warn).toHaveBeenCalledWith(
            "Media thumbnail delete failed; removing DB row anyway.",
            {
                taskId: "task-1",
                thumbnailHash: "thumb-hash",
                thumbnailBlobPath:
                    "media/video-thumbnails/thumbnail-task-1.jpg",
            },
        );
    });
});
