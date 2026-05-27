/**
 * @jest-environment node
 */

import { deleteCanvasAppletArtifacts } from "../canvas-applets/delete";

jest.mock("../models/applet-data", () => ({
    __esModule: true,
    default: {
        deleteMany: jest.fn(),
    },
}));

jest.mock("../models/applet-file", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        deleteMany: jest.fn(),
    },
}));

jest.mock("../models/applet-shared-data", () => ({
    __esModule: true,
    default: {
        deleteMany: jest.fn(),
    },
}));

jest.mock("../models/applet-shared-data-revision", () => ({
    __esModule: true,
    default: {
        deleteMany: jest.fn(),
    },
}));

jest.mock("../models/applet-shared-file", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        deleteMany: jest.fn(),
    },
}));

jest.mock("../models/file", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        deleteMany: jest.fn(),
    },
}));

jest.mock("../utils/media-service-utils", () => ({
    deleteMediaFile: jest.fn(),
}));

jest.mock("../../../src/utils/storageTargets", () => ({
    createAppletGlobalStorageTarget: jest.fn((userContextId) => ({
        kind: "applet-global",
        userContextId,
    })),
    createAppletPublishedStorageTarget: jest.fn(() => ({
        kind: "applet-published",
    })),
    createAppletSharedStorageTarget: jest.fn((appletId) => ({
        kind: "applet-shared",
        appletId,
    })),
    createAppletUserStorageTarget: jest.fn((userContextId, appletId) => ({
        kind: "applet-user",
        userContextId,
        appletId,
    })),
    createUserGlobalStorageTarget: jest.fn((userContextId) => ({
        kind: "user-global",
        userContextId,
    })),
}));

describe("deleteCanvasAppletArtifacts", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("deletes owner-scoped applet data, linked files, and the primary html file", async () => {
        const AppletData = require("../models/applet-data").default;
        const AppletFile = require("../models/applet-file").default;
        const AppletSharedData =
            require("../models/applet-shared-data").default;
        const AppletSharedDataRevision =
            require("../models/applet-shared-data-revision").default;
        const AppletSharedFile =
            require("../models/applet-shared-file").default;
        const File = require("../models/file").default;
        const { deleteMediaFile } = require("../utils/media-service-utils");
        const {
            createAppletGlobalStorageTarget,
            createAppletUserStorageTarget,
            createUserGlobalStorageTarget,
        } = require("../../../src/utils/storageTargets");

        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [
                    { _id: "file-1", blobPath: "applets/asset-1.png" },
                    {
                        _id: "file-2",
                        hash: "hash-2",
                    },
                ],
            }),
        });
        AppletSharedFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [],
            }),
        });
        File.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: "file-main",
                blobPath: "applets/main.html",
                hash: "main-hash",
            }),
        });
        AppletData.deleteMany.mockResolvedValue({ acknowledged: true });
        AppletFile.deleteMany.mockResolvedValue({ acknowledged: true });
        File.deleteMany.mockResolvedValue({ acknowledged: true });
        deleteMediaFile.mockResolvedValue({});

        const result = await deleteCanvasAppletArtifacts(
            {
                _id: "applet123",
                filePath:
                    "https://example.blob.core.windows.net/container/applets/main.html",
            },
            {
                _id: "user123",
                contextId: "ctx123",
            },
        );

        expect(result.deletedFileCount).toBe(3);
        expect(deleteMediaFile).toHaveBeenCalledTimes(5);
        expect(createAppletGlobalStorageTarget).toHaveBeenCalledWith("ctx123");
        expect(createUserGlobalStorageTarget).toHaveBeenCalledWith("ctx123");
        expect(createAppletUserStorageTarget).toHaveBeenCalledWith(
            "ctx123",
            "applet123",
        );
        expect(AppletData.deleteMany).toHaveBeenCalledWith({
            appletId: "applet123",
            userId: "user123",
        });
        expect(AppletFile.deleteMany).toHaveBeenCalledWith({
            appletId: "applet123",
            userId: "user123",
        });
        expect(AppletSharedData.deleteMany).toHaveBeenCalledWith({
            appletId: "applet123",
        });
        expect(AppletSharedDataRevision.deleteMany).toHaveBeenCalledWith({
            appletId: "applet123",
        });
        expect(File.deleteMany).toHaveBeenCalledWith({
            _id: {
                $in: ["file-1", "file-2", "file-main"],
            },
        });
    });

    test("dedupes the primary file when it is already linked on the applet", async () => {
        const AppletData = require("../models/applet-data").default;
        const AppletFile = require("../models/applet-file").default;
        const AppletSharedFile =
            require("../models/applet-shared-file").default;
        const File = require("../models/file").default;
        const { deleteMediaFile } = require("../utils/media-service-utils");

        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [
                    {
                        _id: "file-main",
                        blobPath: "applets/main.html",
                    },
                ],
            }),
        });
        AppletSharedFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [],
            }),
        });
        File.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: "file-main",
                blobPath: "applets/main.html",
            }),
        });
        AppletData.deleteMany.mockResolvedValue({ acknowledged: true });
        AppletFile.deleteMany.mockResolvedValue({ acknowledged: true });
        File.deleteMany.mockResolvedValue({ acknowledged: true });
        deleteMediaFile.mockResolvedValue({});

        const result = await deleteCanvasAppletArtifacts(
            {
                _id: "applet123",
                filePath:
                    "https://example.blob.core.windows.net/container/applets/main.html",
            },
            {
                _id: "user123",
                contextId: "ctx123",
            },
        );

        expect(result.deletedFileCount).toBe(1);
        expect(deleteMediaFile).toHaveBeenCalledTimes(3);
        expect(File.deleteMany).toHaveBeenCalledWith({
            _id: {
                $in: ["file-main"],
            },
        });
    });

    test("does not run legacy primary-file deletes for v2 applets", async () => {
        const AppletData = require("../models/applet-data").default;
        const AppletFile = require("../models/applet-file").default;
        const AppletSharedFile =
            require("../models/applet-shared-file").default;
        const File = require("../models/file").default;
        const { deleteMediaFile } = require("../utils/media-service-utils");
        const {
            createAppletGlobalStorageTarget,
            createUserGlobalStorageTarget,
        } = require("../../../src/utils/storageTargets");

        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({ files: [] }),
        });
        AppletSharedFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({ files: [] }),
        });
        File.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: "file-main",
                blobPath: "applets/main.html",
                hash: "main-hash",
            }),
        });
        AppletData.deleteMany.mockResolvedValue({ acknowledged: true });
        AppletFile.deleteMany.mockResolvedValue({ acknowledged: true });
        AppletSharedFile.deleteMany.mockResolvedValue({ acknowledged: true });
        File.deleteMany.mockResolvedValue({ acknowledged: true });
        deleteMediaFile.mockResolvedValue({});

        const result = await deleteCanvasAppletArtifacts(
            {
                _id: "applet123",
                version: 2,
                filePath:
                    "https://example.blob.core.windows.net/container/applets/main.html",
            },
            {
                _id: "user123",
                contextId: "ctx123",
            },
        );

        expect(result.deletedFileCount).toBe(1);
        expect(deleteMediaFile).toHaveBeenCalledTimes(1);
        expect(deleteMediaFile).toHaveBeenCalledWith({
            blobPath: "applets/main.html",
            hash: "main-hash",
            fallbackToHash: false,
            storageTarget: {
                kind: "applet-global",
                userContextId: "ctx123",
            },
        });
        expect(createAppletGlobalStorageTarget).toHaveBeenCalledWith("ctx123");
        expect(createUserGlobalStorageTarget).not.toHaveBeenCalled();
    });

    test("deletes external applet version snapshots", async () => {
        const AppletData = require("../models/applet-data").default;
        const AppletFile = require("../models/applet-file").default;
        const AppletSharedFile =
            require("../models/applet-shared-file").default;
        const File = require("../models/file").default;
        const { deleteMediaFile } = require("../utils/media-service-utils");

        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({ files: [] }),
        });
        AppletSharedFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({ files: [] }),
        });
        File.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        AppletData.deleteMany.mockResolvedValue({ acknowledged: true });
        AppletFile.deleteMany.mockResolvedValue({ acknowledged: true });
        AppletSharedFile.deleteMany.mockResolvedValue({ acknowledged: true });
        File.deleteMany.mockResolvedValue({ acknowledged: true });
        deleteMediaFile.mockResolvedValue({});

        await deleteCanvasAppletArtifacts(
            {
                _id: "applet123",
                htmlVersions: [
                    {
                        content: "<html>inline</html>",
                    },
                    {
                        content: "",
                        contentBlobPath:
                            "applets/versions/applet123/v000002.html",
                        contentHash: "hash-v2",
                        contentContextId: "ctx123",
                    },
                ],
            },
            {
                _id: "user123",
                contextId: "ctx123",
            },
        );

        expect(deleteMediaFile).toHaveBeenCalledWith({
            blobPath: "applets/versions/applet123/v000002.html",
            hash: "hash-v2",
            fallbackToHash: false,
            storageTarget: {
                kind: "applet-global",
                userContextId: "ctx123",
            },
        });
    });

    test("deletes the current canonical published applet artifact", async () => {
        const AppletData = require("../models/applet-data").default;
        const AppletFile = require("../models/applet-file").default;
        const AppletSharedFile =
            require("../models/applet-shared-file").default;
        const File = require("../models/file").default;
        const { deleteMediaFile } = require("../utils/media-service-utils");

        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({ files: [] }),
        });
        AppletSharedFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({ files: [] }),
        });
        File.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        AppletData.deleteMany.mockResolvedValue({ acknowledged: true });
        AppletFile.deleteMany.mockResolvedValue({ acknowledged: true });
        AppletSharedFile.deleteMany.mockResolvedValue({ acknowledged: true });
        File.deleteMany.mockResolvedValue({ acknowledged: true });
        deleteMediaFile.mockResolvedValue({});

        await deleteCanvasAppletArtifacts(
            {
                _id: "applet123",
                publishedContentBlobPath:
                    "applets/published/applet123/current.html",
                publishedContentHash: "published-hash",
                publishedContentContextId: "concierge-published-applets",
            },
            {
                _id: "user123",
                contextId: "ctx123",
            },
        );

        expect(deleteMediaFile).toHaveBeenCalledWith({
            blobPath: "applets/published/applet123/current.html",
            hash: "published-hash",
            storageTarget: { kind: "applet-published" },
        });
    });
});
