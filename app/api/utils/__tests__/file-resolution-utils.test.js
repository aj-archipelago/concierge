/**
 * @jest-environment node
 */

jest.mock("../media-service-utils.js", () => ({
    checkMediaFile: jest.fn(),
    hashBuffer: jest.fn(),
    uploadBufferToMediaService: jest.fn(),
}));

const {
    createAppletSharedStorageTarget,
    createWorkspaceSharedStorageTarget,
} = require("../../../../src/utils/storageTargets.js");
const { resolveAndHealFile } = require("../file-resolution-utils.js");
const {
    checkMediaFile,
    uploadBufferToMediaService,
} = require("../media-service-utils.js");

describe("resolveAndHealFile", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it("falls back to a legacy storage target when the primary target misses", async () => {
        checkMediaFile.mockResolvedValueOnce(null).mockResolvedValueOnce({
            url: "https://legacy.example.com/file.pdf",
            hash: "hash-123",
            blobPath: "workspace/file.pdf",
        });

        const persistResolvedFile = jest.fn();
        const result = await resolveAndHealFile(
            {
                hash: "hash-123",
                url: "https://stale.example.com/file.pdf",
                originalName: "file.pdf",
            },
            {
                storageTarget: createAppletSharedStorageTarget("applet-123"),
                fallbackStorageTargets: [
                    createWorkspaceSharedStorageTarget("workspace-123"),
                ],
                persistResolvedFile,
            },
        );

        expect(result.status).toBe("resolved");
        expect(result.accessUrl).toBe("https://legacy.example.com/file.pdf");
        expect(checkMediaFile).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                hash: "hash-123",
                storageTarget: expect.objectContaining({
                    kind: "applet-shared",
                    appletId: "applet-123",
                }),
            }),
        );
        expect(checkMediaFile).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                hash: "hash-123",
                storageTarget: expect.objectContaining({
                    kind: "workspace-shared",
                    workspaceId: "workspace-123",
                }),
            }),
        );
        expect(persistResolvedFile).toHaveBeenCalledWith(
            expect.objectContaining({
                url: "https://legacy.example.com/file.pdf",
            }),
            expect.objectContaining({
                url: "https://legacy.example.com/file.pdf",
            }),
        );
    });

    it("heals a legacy fallback hit into the primary target when refresh is enabled", async () => {
        checkMediaFile
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                url: "https://legacy.example.com/file.pdf",
                hash: "hash-123",
                blobPath: "workspace/file.pdf",
            })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                url: "https://primary.example.com/file.pdf",
                hash: "hash-123",
                blobPath: "applets/file.pdf",
            });

        global.fetch.mockResolvedValue({
            ok: true,
            arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
            headers: {
                get: (name) =>
                    name?.toLowerCase() === "content-type"
                        ? "application/pdf"
                        : null,
            },
        });

        uploadBufferToMediaService.mockResolvedValue({
            success: true,
            data: {
                url: "https://primary.example.com/file.pdf",
                hash: "hash-123",
                blobPath: "applets/file.pdf",
            },
        });

        const result = await resolveAndHealFile(
            {
                hash: "hash-123",
                url: "https://stale.example.com/file.pdf",
                originalName: "file.pdf",
            },
            {
                storageTarget: createAppletSharedStorageTarget("applet-123"),
                fallbackStorageTargets: [
                    createWorkspaceSharedStorageTarget("workspace-123"),
                ],
                allowUrlRefresh: true,
            },
        );

        expect(result.status).toBe("refreshed");
        expect(result.accessUrl).toBe("https://primary.example.com/file.pdf");
        expect(global.fetch).toHaveBeenCalledWith(
            "https://legacy.example.com/file.pdf",
            {
                redirect: "follow",
            },
        );
        expect(uploadBufferToMediaService).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.objectContaining({
                filename: "file.pdf",
                mimeType: "application/pdf",
                hash: "hash-123",
            }),
            expect.objectContaining({
                storageTarget: expect.objectContaining({
                    kind: "applet-shared",
                    appletId: "applet-123",
                }),
            }),
        );
    });

    it("drops stale gcs metadata when a fresh lookup no longer returns gcs", async () => {
        checkMediaFile.mockResolvedValueOnce({
            url: "https://primary.example.com/file.pdf",
            hash: "hash-123",
            blobPath: "workspace/file.pdf",
        });

        const persistResolvedFile = jest.fn();
        const result = await resolveAndHealFile(
            {
                hash: "hash-123",
                url: "https://stale.example.com/file.pdf",
                gcsUrl: "gs://stale-bucket/file.pdf",
                originalName: "file.pdf",
            },
            {
                storageTarget:
                    createWorkspaceSharedStorageTarget("workspace-123"),
                persistResolvedFile,
            },
        );

        expect(result.status).toBe("resolved");
        expect(result.file.gcsUrl).toBeNull();
        expect(persistResolvedFile).toHaveBeenCalledWith(
            expect.objectContaining({
                url: "https://primary.example.com/file.pdf",
                $unset: expect.objectContaining({
                    error: "",
                    gcsUrl: "",
                }),
            }),
            expect.objectContaining({
                url: "https://primary.example.com/file.pdf",
                gcsUrl: null,
            }),
        );
    });
});
