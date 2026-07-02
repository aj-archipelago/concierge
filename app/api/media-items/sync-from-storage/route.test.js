/**
 * @jest-environment node
 */

jest.mock("../../utils/auth.js", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../models/media-item.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        updateOne: jest.fn(),
        deleteMany: jest.fn(),
    },
}));

jest.mock("../../../../config/index.js", () => ({
    __esModule: true,
    default: {
        endpoints: {
            mediaHelperDirect: jest.fn(
                () => "https://media-helper.test/media-helper",
            ),
        },
    },
}));

jest.mock("../../../../src/utils/storageTargets.js", () => ({
    buildMediaHelperListParams: jest.fn(() => ({ contextId: "ctx-1" })),
    createMediaStorageTarget: jest.fn((contextId) => ({
        contextId,
        fileScope: "media",
    })),
}));

const { POST } = require("./route");
const { getCurrentUser } = require("../../utils/auth.js");
const MediaItem = require("../../models/media-item.mjs").default;

describe("media storage sync route", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            contextId: "ctx-1",
        });
        MediaItem.updateOne.mockResolvedValue({ modifiedCount: 1 });
        MediaItem.deleteMany.mockResolvedValue({ deletedCount: 1 });
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                folderPath: "media",
                files: [
                    {
                        filename: "a-jet-plane-16412dc90caa.jpg",
                        blobPath:
                            "media/Jet Planes/a-jet-plane-16412dc90caa.jpg",
                        url: "https://storage.test/container/media/Jet%20Planes/a-jet-plane-16412dc90caa.jpg",
                        contentType: "image/jpeg",
                        hash: "moved-hash",
                        lastModified: "2026-06-18T17:59:02.000Z",
                    },
                ],
            }),
        }));
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it("heals a moved generated media row instead of inserting a storage-sync duplicate", async () => {
        const existingItems = [
            {
                _id: "generated-row",
                user: "user-1",
                taskId: "6a342ee3d1ed16412dc90caa",
                cortexRequestId: "6a342ee3d1ed16412dc90caa",
                prompt: "A jet plane",
                type: "image",
                model: "replicate-seedream-4",
                status: "completed",
                blobPath: "media/a-jet-plane-16412dc90caa.jpg",
                url: "https://storage.test/container/media/a-jet-plane-16412dc90caa.jpg",
                azureUrl:
                    "https://storage.test/container/media/a-jet-plane-16412dc90caa.jpg",
                created: 1781804771,
            },
            {
                _id: "storage-row",
                user: "user-1",
                taskId: "storage-sync-existing",
                cortexRequestId: "storage-sync-existing",
                prompt: "a-jet-plane-16412dc90caa.jpg",
                type: "image",
                model: "storage-sync",
                status: "completed",
                blobPath: "media/Jet Planes/a-jet-plane-16412dc90caa.jpg",
                url: "https://storage.test/container/media/Jet%20Planes/a-jet-plane-16412dc90caa.jpg",
                azureUrl:
                    "https://storage.test/container/media/Jet%20Planes/a-jet-plane-16412dc90caa.jpg",
            },
        ];
        MediaItem.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue(existingItems),
        });

        const response = await POST();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            success: true,
            inspectedCount: 1,
            syncedCount: 0,
            healedCount: 1,
            skippedCount: 1,
        });
        expect(MediaItem.updateOne).toHaveBeenCalledTimes(1);
        expect(MediaItem.updateOne).toHaveBeenCalledWith(
            {
                user: "user-1",
                taskId: "6a342ee3d1ed16412dc90caa",
            },
            {
                $set: {
                    url: "https://storage.test/container/media/Jet%20Planes/a-jet-plane-16412dc90caa.jpg",
                    azureUrl:
                        "https://storage.test/container/media/Jet%20Planes/a-jet-plane-16412dc90caa.jpg",
                    hash: "moved-hash",
                    blobPath: "media/Jet Planes/a-jet-plane-16412dc90caa.jpg",
                    outputFolder: "Jet Planes",
                },
            },
        );
        expect(MediaItem.deleteMany).toHaveBeenCalledWith({
            _id: { $in: ["storage-row"] },
        });
    });
});
