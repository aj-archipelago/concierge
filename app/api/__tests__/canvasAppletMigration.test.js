/**
 * @jest-environment node
 */

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        updateOne: jest.fn(),
    },
}));

jest.mock("../models/workspace", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        findOne: jest.fn(),
    },
}));

jest.mock("../models/app", () => ({
    __esModule: true,
    APP_TYPES: { APPLET: "applet" },
    APP_STATUS: { ACTIVE: "active", INACTIVE: "inactive" },
    default: {
        find: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn(),
    },
}));

jest.mock("../models/user.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

const mockFileSave = jest.fn();
jest.mock("../models/file", () => {
    function FakeFile(doc) {
        Object.assign(this, doc);
        this.save = mockFileSave;
    }
    return { __esModule: true, default: FakeFile };
});

jest.mock("../utils/media-service-utils", () => ({
    hashBuffer: jest.fn(async () => "hash-html"),
    uploadBufferToMediaService: jest.fn(),
}));

jest.mock("../../../src/utils/storageTargets", () => ({
    createAppletGlobalStorageTarget: jest.fn((userContextId) => ({
        kind: "applet-global",
        userContextId,
    })),
}));

jest.mock("../canvas-applets/files", () => ({
    getCanvasAppletEditableFileInfo: jest.fn(async () => ({
        workspacePath: "/workspace/files/applets/legacy.html",
        fileHash: "hash-html",
        fileBlobPath: "applets/legacy.html",
    })),
}));

jest.mock("../canvas-applets/versioning", () => ({
    applyPublishedAppletSnapshot: jest.fn(async (applet, _html, options) => {
        Object.assign(applet, {
            publishedContentUrl: "https://published.example/v1.html",
            publishedContentBlobPath: "applets/published/applet/v1.html",
            publishedContentHash: "published-hash",
            publishedContentSize: 42,
            publishedContentContextId: "concierge-published-applets",
            publishedContentVersionIndex: options.versionIndex,
            publishedContentTimestamp: new Date("2026-05-29T00:00:00Z"),
        });
    }),
    createAppletVersionEntry: jest.fn(async (_applet, _user, html) => ({
        content: "",
        contentUrl: "https://versions.example/v1.html",
        contentBlobPath: "applets/versions/applet/v1.html",
        contentHash: "version-hash",
        contentSize: html.length,
        contentContextId: "ctx-user",
        timestamp: new Date("2026-05-28T00:00:00Z"),
    })),
    resolveAppletVersionContent: jest.fn(
        async (version) => version?.content || "",
    ),
}));

const Applet = require("../models/applet").default;
const Workspace = require("../models/workspace").default;
const App = require("../models/app").default;
const User = require("../models/user.mjs").default;
const { uploadBufferToMediaService } = require("../utils/media-service-utils");
const { migrateWorkspaceAppletToV2 } = require("../canvas-applets/migration");

describe("migrateWorkspaceAppletToV2", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFileSave.mockReset().mockResolvedValue();
        App.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
        App.findByIdAndUpdate.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        App.updateMany.mockResolvedValue({});
        User.find.mockReturnValue({
            select: jest.fn().mockResolvedValue([]),
        });
    });

    test("promotes a legacy workspace applet to v2 and backfills app-store identity", async () => {
        const applet = {
            _id: "applet-123",
            owner: "user-123",
            name: "Legacy Applet",
            version: 1,
            html: "<html><head></head><body>Legacy</body></html>",
            htmlVersions: [{ content: "<html>v1</html>" }],
            publishedVersionIndex: 0,
        };
        const workspace = {
            _id: "workspace-123",
            owner: "user-123",
            name: "Legacy Workspace",
            applet,
        };
        const app = {
            _id: "app-123",
            workspaceId: "workspace-123",
            name: "Published Applet Name",
            slug: "legacy",
            type: "applet",
            status: "active",
        };
        const savedApplet = {
            ...applet,
            name: "Published Applet Name",
            version: 2,
            html: "",
            filePath: "https://draft.example/legacy.html",
            migratedFromWorkspaceId: "workspace-123",
            migrationStatus: "migrated",
            htmlVersions: [
                {
                    content: "",
                    contentBlobPath: "applets/versions/applet/v1.html",
                },
            ],
        };

        Workspace.findById.mockReturnValue({
            populate: jest.fn().mockResolvedValue(workspace),
        });
        Workspace.findOne.mockResolvedValue(workspace);
        App.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(app),
        });
        App.findOneAndUpdate.mockReturnValue({
            lean: jest
                .fn()
                .mockResolvedValue({ ...app, appletId: "applet-123" }),
        });
        Applet.findByIdAndUpdate.mockReturnValue({
            lean: jest.fn().mockResolvedValue(savedApplet),
        });
        Applet.updateOne.mockResolvedValue({});
        uploadBufferToMediaService.mockResolvedValue({
            success: true,
            data: {
                url: "https://draft.example/legacy.html",
                blobPath: "applets/legacy.html",
                hash: "hash-html",
                filename: "legacy.html",
            },
        });

        const result = await migrateWorkspaceAppletToV2({
            workspaceId: "workspace-123",
            user: { _id: "user-123", contextId: "ctx-user" },
        });

        expect(result).toMatchObject({
            appletId: "applet-123",
            version: 2,
            alreadyMigrated: false,
            workspaceId: "workspace-123",
            workspacePath: "/workspace/files/applets/legacy.html",
        });
        expect(uploadBufferToMediaService).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.objectContaining({
                filename: expect.stringContaining("published-applet-name"),
                mimeType: "text/html",
            }),
            expect.objectContaining({
                storageTarget: expect.objectContaining({
                    kind: "applet-global",
                    userContextId: "ctx-user",
                }),
            }),
        );
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            "applet-123",
            expect.objectContaining({
                $set: expect.objectContaining({
                    name: "Published Applet Name",
                    version: 2,
                    html: "",
                    filePath: "https://draft.example/legacy.html",
                    migrationStatus: "migrated",
                }),
            }),
            { new: true },
        );
        expect(App.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: "app-123" },
            {
                $set: {
                    appletId: "applet-123",
                    workspaceId: "workspace-123",
                },
            },
            { new: true },
        );
    });

    test("renames already migrated applets from their app-store name", async () => {
        const applet = {
            _id: "applet-123",
            owner: "user-123",
            name: "Legacy Workspace",
            version: 2,
            filePath: "https://draft.example/legacy.html",
            migrationStatus: "migrated",
        };
        const workspace = {
            _id: "workspace-123",
            owner: "user-123",
            name: "Legacy Workspace",
            applet,
        };
        const app = {
            _id: "app-123",
            workspaceId: "workspace-123",
            name: "Published Applet Name",
            slug: "legacy",
            type: "applet",
            status: "active",
        };

        Workspace.findById.mockReturnValue({
            populate: jest.fn().mockResolvedValue(workspace),
        });
        Workspace.findOne.mockResolvedValue(workspace);
        App.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(app),
        });
        Applet.findByIdAndUpdate.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                ...applet,
                name: "Published Applet Name",
            }),
        });

        const result = await migrateWorkspaceAppletToV2({
            workspaceId: "workspace-123",
            user: { _id: "user-123", contextId: "ctx-user" },
        });

        expect(result).toMatchObject({
            appletId: "applet-123",
            alreadyMigrated: true,
            applet: {
                name: "Published Applet Name",
            },
        });
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            "applet-123",
            { $set: { name: "Published Applet Name" } },
            { new: true },
        );
    });

    test("resolves legacy workspace applet migration by workspace slug", async () => {
        const applet = {
            _id: "applet-123",
            owner: "user-123",
            name: "Legacy Applet",
            version: 1,
            html: "<html><head></head><body>Legacy</body></html>",
            htmlVersions: [{ content: "<html>v1</html>" }],
            publishedVersionIndex: 0,
        };
        const workspace = {
            _id: "workspace-123",
            owner: "user-123",
            name: "Legacy Workspace",
            slug: "legacy-workspace",
            applet,
        };
        const savedApplet = {
            ...applet,
            version: 2,
            html: "",
            filePath: "https://draft.example/legacy.html",
            migratedFromWorkspaceId: "workspace-123",
            migrationStatus: "migrated",
            htmlVersions: [
                {
                    content: "",
                    contentBlobPath: "applets/versions/applet/v1.html",
                },
            ],
        };
        const castError = new Error(
            'Cast to ObjectId failed for value "legacy-workspace"',
        );
        castError.name = "CastError";

        Workspace.findById.mockReturnValue({
            populate: jest.fn().mockRejectedValue(castError),
        });
        Workspace.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(workspace),
        });
        App.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        App.findOneAndUpdate.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        Applet.findByIdAndUpdate.mockReturnValue({
            lean: jest.fn().mockResolvedValue(savedApplet),
        });
        Applet.updateOne.mockResolvedValue({});
        uploadBufferToMediaService.mockResolvedValue({
            success: true,
            data: {
                url: "https://draft.example/legacy.html",
                blobPath: "applets/legacy.html",
                hash: "hash-html",
                filename: "legacy.html",
            },
        });

        const result = await migrateWorkspaceAppletToV2({
            workspaceId: "legacy-workspace",
            user: { _id: "user-123", contextId: "ctx-user" },
        });

        expect(result).toMatchObject({
            appletId: "applet-123",
            version: 2,
            alreadyMigrated: false,
            workspaceId: "workspace-123",
        });
        expect(Workspace.findOne).toHaveBeenCalledWith({
            slug: "legacy-workspace",
        });
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            "applet-123",
            expect.objectContaining({
                $set: expect.objectContaining({
                    migratedFromWorkspaceId: "workspace-123",
                    migrationStatus: "migrated",
                }),
            }),
            { new: true },
        );
    });

    test("returns a conflict when another fresh migration is already pending", async () => {
        const applet = {
            _id: "applet-123",
            owner: "user-123",
            name: "Legacy Applet",
            version: 1,
            html: "<html><head></head><body>Legacy</body></html>",
            migrationStatus: "pending",
        };
        const workspace = {
            _id: "workspace-123",
            owner: "user-123",
            name: "Legacy Workspace",
            applet,
        };

        Workspace.findById.mockReturnValue({
            populate: jest.fn().mockResolvedValue(workspace),
        });
        Workspace.findOne.mockResolvedValue(workspace);
        App.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        Applet.updateOne.mockResolvedValue({ matchedCount: 0 });
        Applet.findById.mockReturnValue({
            lean: jest.fn().mockResolvedValue(applet),
        });

        await expect(
            migrateWorkspaceAppletToV2({
                workspaceId: "workspace-123",
                user: { _id: "user-123", contextId: "ctx-user" },
            }),
        ).rejects.toMatchObject({
            message: "Applet migration is already in progress",
            status: 409,
        });
        expect(uploadBufferToMediaService).not.toHaveBeenCalled();
        expect(Applet.findByIdAndUpdate).not.toHaveBeenCalled();
    });
});
