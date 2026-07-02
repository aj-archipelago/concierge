/**
 * @jest-environment node
 */

import { POST } from "../canvas-applets/route";
import { PUT } from "../canvas-applets/[id]/route";
import { POST as GENERATE_METADATA } from "../canvas-applets/[id]/metadata/generate/route";
import { POST as GENERATE_IMAGE } from "../canvas-applets/[id]/image/generate/route";
import { resolveInstalledAppletRuntime } from "../canvas-applets/registry";

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../utils/shareAccess", () => ({
    resolveShareAccess: jest.fn(async ({ ownerId, userId }) => {
        const isOwner = !ownerId || String(ownerId) === String(userId);
        return {
            canAccess: true,
            isOwner,
            role: isOwner ? "editor" : "viewer",
        };
    }),
}));

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        create: jest.fn(),
        find: jest.fn(),
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn(),
    },
}));

jest.mock("../models/share.js", () => ({
    __esModule: true,
    default: {
        find: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        })),
    },
    SHARE_ENTITY_TYPES: ["chat", "workspace", "applet", "automation"],
    SHARE_ROLES: ["viewer", "editor"],
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

jest.mock("../canvas-applets/files", () => ({
    buildAppletFilenameFromWorkspacePath: jest.fn(() => "weather.html"),
    getAppletWorkspaceUploadSubPath: jest.fn(() => null),
    getCanvasAppletEditableFileInfo: jest.fn(),
    isCanvasAppletHtmlFile: jest.fn(() => true),
    resolveCanvasAppletFileByWorkspacePath: jest.fn(),
}));

jest.mock("../canvas-applets/versioning", () => {
    const createPublishedAppletUpdate = jest.fn(async () => ({
        publishedContentBlobPath: "applets/published/applet/v1.html",
        publishedContentHash: "hash-v1",
        publishedContentContextId: "concierge-published-applets",
        publishedContentVersionIndex: 0,
        publishedContentTimestamp: new Date("2026-05-10T00:00:00Z"),
    }));
    return {
        applyPublishedAppletSnapshot: jest.fn(async (applet, html, options) => {
            const previousPublishedSnapshot = {
                publishedContentBlobPath: applet?.publishedContentBlobPath,
                publishedContentHash: applet?.publishedContentHash,
                publishedContentContextId: applet?.publishedContentContextId,
            };
            Object.assign(
                applet,
                await createPublishedAppletUpdate(applet, html, options),
            );
            return {
                previousPublishedSnapshot,
                nextPublishedSnapshot: {
                    publishedContentBlobPath: applet.publishedContentBlobPath,
                    publishedContentHash: applet.publishedContentHash,
                    publishedContentContextId: applet.publishedContentContextId,
                },
            };
        }),
        clearPublishedContentFields: jest.fn((applet) => {
            delete applet.publishedContentUrl;
            delete applet.publishedContentBlobPath;
            delete applet.publishedContentHash;
            delete applet.publishedContentSize;
            delete applet.publishedContentContextId;
            delete applet.publishedContentVersionIndex;
            delete applet.publishedContentTimestamp;
        }),
        createAppletVersionEntry: jest.fn(async (_applet, _user, html) => ({
            content: html,
            timestamp: new Date("2026-05-10T00:00:00Z"),
        })),
        createPublishedAppletUpdate,
        deleteAppletVersionSnapshots: jest.fn(),
        deletePublishedAppletSnapshot: jest.fn(),
        deleteReplacedPublishedAppletSnapshot: jest.fn(),
        getPublishedAppletSnapshot: jest.fn((applet) => ({
            publishedContentBlobPath: applet?.publishedContentBlobPath,
            publishedContentHash: applet?.publishedContentHash,
            publishedContentContextId: applet?.publishedContentContextId,
        })),
        hydrateAppletVersionContents: jest.fn(async (applet) => applet),
        resolvePublishedAppletContent: jest.fn(),
        resolveAppletVersionContent: jest.fn(),
    };
});

jest.mock("../utils/media-service-utils", () => ({
    deleteMediaFile: jest.fn(),
    listMediaFiles: jest.fn().mockResolvedValue([]),
    uploadBufferToMediaService: jest.fn(),
}));

jest.mock("../utils/tasks", () => ({
    createBackgroundTask: jest.fn(),
}));

jest.mock("../utils/shareHelpers.js", () => {
    const actual = jest.requireActual("../utils/shareHelpers.js");
    return {
        ...actual,
        upsertEntityShare: jest.fn(async (args) => args),
    };
});

jest.mock("../models/media-item.mjs", () => ({
    __esModule: true,
    default: {
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
        find: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        })),
    },
}));

jest.mock("../../../src/graphql", () => ({
    getClient: jest.fn(),
    QUERIES: {
        MEDIA_PROMPT_ASSISTANT: "MEDIA_PROMPT_ASSISTANT",
    },
}));

jest.mock("../../../src/utils/storageTargets", () => ({
    buildAppletUserContextId: jest.fn(
        (userContextId, appletId) => `applet-user:${appletId}:${userContextId}`,
    ),
    buildAppletSharedContextId: jest.fn(
        (appletId) => `applet-shared:${appletId}`,
    ),
    createAppletSharedStorageTarget: jest.fn((appletId) => ({
        kind: "applet-shared",
        appletId,
    })),
    createAppletGlobalStorageTarget: jest.fn((userContextId) => ({
        kind: "applet-global",
        userContextId,
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
    createWorkspacePrivateStorageTarget: jest.fn(
        (userContextId, workspaceId) => ({
            kind: "workspace-private",
            userContextId,
            workspaceId,
        }),
    ),
    createWorkspaceSharedStorageTarget: jest.fn((workspaceId) => ({
        kind: "workspace-shared",
        workspaceId,
    })),
}));

describe("canvas applets route", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const App = require("../models/app").default;
        App.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
        });
        App.findByIdAndUpdate.mockResolvedValue(null);
        App.updateMany.mockResolvedValue({});
        const MediaItem = require("../models/media-item.mjs").default;
        MediaItem.find.mockImplementation(() => ({
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        }));
        MediaItem.deleteMany.mockResolvedValue({ deletedCount: 0 });
        const {
            deleteMediaFile,
            listMediaFiles,
        } = require("../utils/media-service-utils");
        deleteMediaFile.mockResolvedValue(null);
        listMediaFiles.mockResolvedValue([]);
    });

    test("rejects a duplicate workspace-backed applet on create", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            resolveCanvasAppletFileByWorkspacePath,
        } = require("../canvas-applets/files");

        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        resolveCanvasAppletFileByWorkspacePath.mockResolvedValue({
            url: "https://files.example/applets/weather.html",
            gcsUrl: "gs://bucket/applets/weather.html",
        });
        Applet.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ _id: "applet-123" }),
        });

        const response = await POST({
            json: async () => ({
                name: "Weather",
                workspacePath: "/workspace/files/applets/weather.html",
                html: "<html></html>",
            }),
        });
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body).toMatchObject({
            error: "An applet already references this workspace file",
            appletId: "applet-123",
        });
        expect(Applet.create).not.toHaveBeenCalled();
    });

    test("creates v2 applets with external saved version metadata", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            getCanvasAppletEditableFileInfo,
        } = require("../canvas-applets/files");
        const {
            createAppletVersionEntry,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const versionEntry = {
            content: "",
            contentBlobPath: "versions/applet/v000001.html",
            contentContextId: "ctx",
            contentHash: "hash-v1",
            contentSize: 15,
            timestamp: new Date("2026-05-10T00:00:00Z"),
        };
        const applet = {
            _id: appletId,
            owner: "user-123",
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            html: "",
            version: 2,
            htmlVersions: [],
        };

        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        Applet.create.mockResolvedValue(applet);
        createAppletVersionEntry.mockResolvedValueOnce(versionEntry);
        getCanvasAppletEditableFileInfo.mockResolvedValue({});
        Applet.findByIdAndUpdate.mockResolvedValue(applet);

        const response = await POST({
            json: async () => ({
                name: "Weather",
                filePath: "https://draft.example/weather.html",
                html: "<html>v1</html>",
            }),
        });
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(Applet.create).toHaveBeenCalledWith(
            expect.objectContaining({
                html: "",
                version: 2,
                htmlVersions: [],
            }),
        );
        expect(createAppletVersionEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                _id: appletId,
                filePath: "https://draft.example/weather.html",
            }),
            expect.objectContaining({ contextId: "ctx" }),
            "<html>v1</html>",
            { versionIndex: 0, external: true },
        );
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                html: "",
                htmlVersions: [versionEntry],
            }),
            expect.objectContaining({ new: true }),
        );
        expect(body).toMatchObject({
            html: "",
            version: 2,
            htmlVersions: [
                expect.objectContaining({
                    content: "",
                    contentBlobPath: "versions/applet/v000001.html",
                    contentContextId: "ctx",
                }),
            ],
            versionSaved: true,
            latestVersionIndex: 0,
        });
    });

    test("copies a saved applet version into Draft server-side and writes the workspace blob", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            getCanvasAppletEditableFileInfo,
        } = require("../canvas-applets/files");
        const {
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://old.example/weather.html",
            htmlVersions: [{ content: "<html>v1</html>" }],
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        getCanvasAppletEditableFileInfo.mockResolvedValue({
            workspacePath: "/workspace/files/applets/weather.html",
        });
        resolveAppletVersionContent.mockResolvedValue("<html>v1</html>");
        uploadBufferToMediaService.mockResolvedValue({
            data: { url: "https://new.example/weather.html" },
        });
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                filePath: "https://new.example/weather.html",
                html: "<html>v1</html>",
            }),
        });

        const response = await PUT(
            {
                json: async () => ({ restoreVersion: 1 }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(resolveAppletVersionContent).toHaveBeenCalledWith(
            applet.htmlVersions[0],
        );
        expect(uploadBufferToMediaService).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.objectContaining({
                filename: "weather.html",
                mimeType: "text/html",
            }),
            expect.objectContaining({
                storageTarget: {
                    kind: "applet-global",
                    userContextId: "ctx",
                },
            }),
        );
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                filePath: "https://new.example/weather.html",
                html: "<html>v1</html>",
            }),
            expect.objectContaining({ new: true }),
        );
        expect(body).toMatchObject({
            filePath: "https://new.example/weather.html",
            html: "<html>v1</html>",
            versionSaved: false,
            latestVersionIndex: 0,
        });
    });

    test("clears Draft by restoring the latest saved version to the workspace file", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            getCanvasAppletEditableFileInfo,
        } = require("../canvas-applets/files");
        const {
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://old.example/weather.html",
            version: 2,
            htmlVersions: [
                { content: "<html>v1</html>" },
                { content: "<html>v2</html>" },
            ],
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        getCanvasAppletEditableFileInfo.mockResolvedValue({
            workspacePath: "/workspace/files/applets/weather.html",
        });
        resolveAppletVersionContent.mockResolvedValue("<html>v2</html>");
        uploadBufferToMediaService.mockResolvedValue({
            data: { url: "https://new.example/weather.html" },
        });
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                filePath: "https://new.example/weather.html",
            }),
        });

        const response = await PUT(
            {
                json: async () => ({ clearDraft: true }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(resolveAppletVersionContent).toHaveBeenCalledWith(
            applet.htmlVersions[1],
        );
        expect(uploadBufferToMediaService).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.objectContaining({
                filename: "weather.html",
                mimeType: "text/html",
                size: "<html>v2</html>".length,
            }),
            expect.objectContaining({
                storageTarget: {
                    kind: "applet-global",
                    userContextId: "ctx",
                },
            }),
        );
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                filePath: "https://new.example/weather.html",
            }),
            expect.objectContaining({ new: true }),
        );
        expect(body).toMatchObject({
            filePath: "https://new.example/weather.html",
            versionSaved: false,
            latestVersionIndex: 1,
        });
    });

    test("publishes an existing immutable version without rewriting Draft html", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            createPublishedAppletUpdate,
            deleteReplacedPublishedAppletSnapshot,
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            html: "<html>draft</html>",
            version: 2,
            htmlVersions: [
                { content: "<html>v1</html>" },
                { content: "<html>v2</html>" },
            ],
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        resolveAppletVersionContent.mockResolvedValue("<html>v2</html>");
        createPublishedAppletUpdate.mockResolvedValue({
            publishedContentBlobPath: "applets/published/applet/v2.html",
            publishedContentHash: "hash-v2",
            publishedContentContextId: "concierge-published-applets",
            publishedContentVersionIndex: 1,
            publishedContentTimestamp: new Date("2026-05-10T00:00:00Z"),
        });
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                publishedVersionIndex: 1,
            }),
        });

        const response = await PUT(
            {
                json: async () => ({ publishVersion: 2 }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                publishedVersionIndex: 1,
                publishedContentBlobPath: "applets/published/applet/v2.html",
                publishedContentVersionIndex: 1,
            }),
            expect.objectContaining({ new: true }),
        );
        expect(resolveAppletVersionContent).toHaveBeenCalledWith(
            applet.htmlVersions[1],
        );
        expect(createPublishedAppletUpdate).toHaveBeenCalledWith(
            applet,
            "<html>v2</html>",
            { versionIndex: 1 },
        );
        expect(deleteReplacedPublishedAppletSnapshot).toHaveBeenCalledWith(
            expect.objectContaining({}),
            expect.objectContaining({
                publishedContentBlobPath: "applets/published/applet/v2.html",
                publishedContentHash: "hash-v2",
            }),
        );
        expect(
            deleteReplacedPublishedAppletSnapshot.mock.invocationCallOrder[0],
        ).toBeGreaterThan(Applet.findByIdAndUpdate.mock.invocationCallOrder[0]);
        expect(uploadBufferToMediaService).not.toHaveBeenCalled();
        expect(body).toMatchObject({
            publishedVersionIndex: 1,
            versionSaved: false,
            latestVersionIndex: 1,
        });
    });

    test("clears canonical published artifact fields when unpublishing", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;
        const {
            clearPublishedContentFields,
            deletePublishedAppletSnapshot,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [{ content: "<html>v1</html>" }],
            publishedVersionIndex: 0,
            publishedContentBlobPath: "applets/published/applet/v1.html",
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                publishedVersionIndex: null,
                publishedContentBlobPath: undefined,
            }),
        });
        App.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                {
                    _id: "app-1",
                    appletId,
                    type: "applet",
                    status: "active",
                    listedInStore: true,
                    slug: "weather",
                },
            ]),
        });

        const response = await PUT(
            {
                json: async () => ({ unpublish: true }),
            },
            { params: { id: appletId } },
        );

        expect(response.status).toBe(200);
        expect(clearPublishedContentFields).toHaveBeenCalledWith(applet);
        expect(deletePublishedAppletSnapshot).toHaveBeenCalledWith(
            expect.objectContaining({
                publishedContentBlobPath: "applets/published/applet/v1.html",
            }),
        );
        expect(
            deletePublishedAppletSnapshot.mock.invocationCallOrder[0],
        ).toBeGreaterThan(Applet.findByIdAndUpdate.mock.invocationCallOrder[0]);
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                publishedVersionIndex: null,
            }),
            expect.objectContaining({ new: true }),
        );
        expect(App.findByIdAndUpdate).toHaveBeenCalledWith(
            "app-1",
            { $set: { listedInStore: false } },
            expect.objectContaining({ new: true, runValidators: true }),
        );
    });

    test("clears a temporary applet SDK suspension through metadata update", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            owner: "user-123",
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [],
            publishedVersionIndex: null,
            sdkSuspendedAt: new Date("2026-05-12T12:00:00Z"),
            sdkSuspendedUntil: new Date("2026-05-12T12:15:00Z"),
            sdkSuspendedReason: "Auto-suspended after repeated SDK limits.",
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                sdkSuspendedAt: undefined,
                sdkSuspendedUntil: undefined,
                sdkSuspendedReason: undefined,
            }),
        });
        App.findOne.mockResolvedValue(null);

        const response = await PUT(
            {
                json: async () => ({ clearSdkSuspension: true }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(Applet.updateOne).toHaveBeenCalledWith(
            { _id: appletId },
            {
                $unset: {
                    sdkSuspendedAt: "",
                    sdkSuspendedUntil: "",
                    sdkSuspendedReason: "",
                },
            },
        );
        expect(body.sdkSuspendedAt).toBeUndefined();
        expect(body.sdkSuspendedUntil).toBeUndefined();
        expect(body.sdkSuspendedReason).toBeUndefined();
    });

    test("does not delete canonical published artifact when unpublish save fails", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            deletePublishedAppletSnapshot,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue({
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [{ content: "<html>v1</html>" }],
            publishedVersionIndex: 0,
            publishedContentBlobPath: "applets/published/applet/v1.html",
        });
        Applet.findByIdAndUpdate.mockRejectedValue(new Error("save failed"));

        const response = await PUT(
            {
                json: async () => ({ unpublish: true }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe("save failed");
        expect(deletePublishedAppletSnapshot).not.toHaveBeenCalled();
    });

    test("rejects app store slug collisions before publishing or snapshotting", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;
        const {
            createPublishedAppletUpdate,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [{ content: "<html>v1</html>" }],
            publishedVersionIndex: null,
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        App.findOne.mockResolvedValue({ _id: "other-app" });

        const response = await PUT(
            {
                json: async () => ({
                    publish: true,
                    html: "<html>v2</html>",
                    publishToAppStore: true,
                    appName: "Weather",
                    appSlug: "used-slug",
                    appDescription: "Weather app",
                }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe(
            'The slug "used-slug" is already in use. Please choose a different slug.',
        );
        expect(createPublishedAppletUpdate).not.toHaveBeenCalled();
        expect(Applet.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("enables link sharing when publishing via public link", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;
        const { upsertEntityShare } = require("../utils/shareHelpers.js");
        const {
            getCanvasAppletEditableFileInfo,
        } = require("../canvas-applets/files");
        const {
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            owner: "user-123",
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [{ content: "<html>v1</html>" }],
            publishedVersionIndex: null,
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        Applet.findByIdAndUpdate.mockResolvedValue({
            ...applet,
            publishedVersionIndex: 0,
        });
        App.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
        });
        App.findOne.mockResolvedValue(null);
        App.findOneAndUpdate.mockResolvedValue({});
        getCanvasAppletEditableFileInfo.mockResolvedValue({
            workspacePath: "/workspace/files/applets/weather.html",
        });
        resolveAppletVersionContent.mockResolvedValue("<html>v1</html>");

        const response = await PUT(
            {
                json: async () => ({
                    publishVersion: 1,
                    publishToAppStore: false,
                    publishViaLink: true,
                }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.publishedVersionIndex).toBe(0);
        expect(upsertEntityShare).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: "applet",
                entityId: appletId,
                ownerId: "user-123",
                recipients: [],
                link: { enabled: true, role: "viewer" },
            }),
        );
    });

    test("defaults direct non-store publishes to link sharing", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;
        const { upsertEntityShare } = require("../utils/shareHelpers.js");
        const {
            getCanvasAppletEditableFileInfo,
        } = require("../canvas-applets/files");
        const {
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            owner: "user-123",
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [{ content: "<html>v1</html>" }],
            publishedVersionIndex: null,
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        Applet.findByIdAndUpdate.mockResolvedValue({
            ...applet,
            publishedVersionIndex: 0,
        });
        App.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
        });
        App.findOne.mockResolvedValue(null);
        App.findOneAndUpdate.mockResolvedValue({});
        getCanvasAppletEditableFileInfo.mockResolvedValue({
            workspacePath: "/workspace/files/applets/weather.html",
        });
        resolveAppletVersionContent.mockResolvedValue("<html>v1</html>");

        const response = await PUT(
            {
                json: async () => ({
                    publishVersion: 1,
                }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.publishedVersionIndex).toBe(0);
        expect(upsertEntityShare).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: "applet",
                entityId: appletId,
                ownerId: "user-123",
                recipients: [],
                link: { enabled: true, role: "viewer" },
            }),
        );
    });

    test("backfills canonical published content when updating app-store metadata for a v2 applet", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;
        const {
            createPublishedAppletUpdate,
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [{ content: "<html>v1</html>" }],
            publishedVersionIndex: 0,
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        App.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                {
                    _id: "existing-app",
                    appletId,
                    type: "applet",
                    status: "active",
                    listedInStore: true,
                    slug: "weather",
                },
            ]),
        });
        App.findOne.mockResolvedValueOnce(null);
        App.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                _id: "existing-app",
                appletId,
                type: "applet",
                status: "active",
                listedInStore: true,
                slug: "weather",
            }),
        });
        resolveAppletVersionContent.mockResolvedValue("<html>v1</html>");
        createPublishedAppletUpdate.mockResolvedValue({
            publishedContentBlobPath: "applets/published/applet/v1.html",
            publishedContentHash: "hash-v1",
            publishedContentContextId: "concierge-published-applets",
            publishedContentVersionIndex: 0,
            publishedContentTimestamp: new Date("2026-05-10T00:00:00Z"),
        });
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                publishedContentBlobPath: "applets/published/applet/v1.html",
            }),
        });
        App.findOneAndUpdate.mockResolvedValue({});

        const response = await PUT(
            {
                json: async () => ({
                    publishToAppStore: true,
                    appName: "Weather",
                    appDescription: "Weather app",
                }),
            },
            { params: { id: appletId } },
        );

        expect(response.status).toBe(200);
        expect(resolveAppletVersionContent).toHaveBeenCalledWith(
            applet.htmlVersions[0],
        );
        expect(createPublishedAppletUpdate).toHaveBeenCalledWith(
            applet,
            "<html>v1</html>",
            { versionIndex: 0 },
        );
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                publishedContentBlobPath: "applets/published/applet/v1.html",
                publishedContentVersionIndex: 0,
            }),
            expect.objectContaining({ new: true }),
        );
    });

    test("updates applet card metadata without listing it in the app store", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;
        const {
            getCanvasAppletEditableFileInfo,
        } = require("../canvas-applets/files");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [],
            publishedVersionIndex: null,
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => applet,
        });
        App.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                _id: "app-1",
                appletId,
                name: "Storm Desk",
                slug: "storm-desk",
                listedInStore: false,
            });
        App.findOneAndUpdate.mockResolvedValue({});
        getCanvasAppletEditableFileInfo.mockResolvedValue({
            workspacePath: "/workspace/files/applets/weather.html",
        });

        const response = await PUT(
            {
                json: async () => ({
                    appMetadata: {
                        name: "Storm Desk",
                        slug: "storm-desk",
                        description: "Track storm coverage",
                        icon: "CloudSun",
                        imageUrl: "https://images.example/storm.webp",
                        imageLightUrl:
                            "https://images.example/storm-light.webp",
                        imageDarkUrl: "https://images.example/storm-dark.webp",
                        imageAlt: "Storm dashboard",
                        badgeLabel: "Weather desk",
                        category: "weather",
                        tags: ["Weather", "Newsroom", "Weather"],
                    },
                }),
            },
            { params: { id: appletId } },
        );

        expect(response.status).toBe(200);
        expect(App.findOneAndUpdate).toHaveBeenCalledWith(
            { appletId },
            {
                $set: expect.objectContaining({
                    name: "Storm Desk",
                    slug: "storm-desk",
                    description: "Track storm coverage",
                    icon: "CloudSun",
                    imageUrl: "https://images.example/storm.webp",
                    imageLightUrl: "https://images.example/storm-light.webp",
                    imageDarkUrl: "https://images.example/storm-dark.webp",
                    imageAlt: "Storm dashboard",
                    badgeLabel: "Weather desk",
                    category: "weather",
                    tags: ["weather", "newsroom"],
                }),
                $setOnInsert: { listedInStore: false },
            },
            expect.objectContaining({ upsert: true }),
        );
    });

    test("generates applet metadata from current HTML", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;

        const appletId = "69f68d347999b2bbd8ffb91a";
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue({
            _id: appletId,
            owner: "user-123",
            name: "Untitled",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [],
            publishedVersionIndex: null,
        });
        App.findOne.mockResolvedValue(null);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => `
                <html>
                    <head>
                        <title>Storm Desk</title>
                        <meta name="description" content="A newsroom weather tracker for active storm coverage.">
                        <meta property="og:image" content="https://images.example/storm.webp">
                    </head>
                    <body><h1>Storm Desk</h1><p>Storm coverage coverage radar alerts newsroom map.</p></body>
                </html>
            `,
        });

        const response = await GENERATE_METADATA(
            {},
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.metadata).toMatchObject({
            name: "Storm Desk",
            slug: "storm-desk",
            description:
                "A newsroom weather tracker for active storm coverage.",
            imageUrl: "https://images.example/storm.webp",
            imageAlt: "Storm Desk",
        });
        expect(body.metadata.tags).toEqual(
            expect.arrayContaining(["storm", "coverage", "newsroom"]),
        );
    });

    test("generates applet metadata from sanitized HTML text", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;

        const appletId = "69f68d347999b2bbd8ffb91a";
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue({
            _id: appletId,
            owner: "user-123",
            name: "Untitled",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [],
            publishedVersionIndex: null,
        });
        App.findOne.mockResolvedValue(null);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => `
                <html>
                    <head><title>Storm Desk</title></head>
                    <body>
                        <script>alert("xss")</script >
                        &lt;script&gt;alert("encoded")&lt;/script&gt;
                        <p>Safe storm desk tracks verified field updates for newsroom coordination.</p>
                    </body>
                </html>
            `,
        });

        const response = await GENERATE_METADATA(
            {},
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.metadata.description).toContain("Safe storm desk");
        expect(body.metadata.description).not.toContain("alert");
        expect(body.metadata.description).not.toContain("script");
    });

    test("uses the Cortex prompt pathway for generated applet metadata when available", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;
        const { getClient } = require("../../../src/graphql");
        const query = jest.fn().mockResolvedValue({
            data: {
                run_workspace_prompt: {
                    result: JSON.stringify({
                        name: "Storm Ops",
                        slug: "storm-ops",
                        description:
                            "A polished command center for storm desk coverage.",
                        icon: "CloudSun",
                        badgeLabel: "Weather desk",
                        category: "weather",
                        tags: ["weather", "newsroom"],
                        imageAlt: "Storm desk command center",
                        imagePrompt:
                            "A premium storm desk command center thumbnail.",
                    }),
                },
            },
        });

        const appletId = "69f68d347999b2bbd8ffb91a";
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue({
            _id: appletId,
            owner: "user-123",
            name: "Untitled",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [],
            publishedVersionIndex: null,
        });
        App.findOne.mockResolvedValue(null);
        getClient.mockReturnValue({ query });
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () =>
                "<html><head><title>Storm Desk</title></head><body>Radar alerts map newsroom storm desk.</body></html>",
        });

        const response = await GENERATE_METADATA(
            {},
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.source).toBe("cortex");
        expect(body.metadata).toMatchObject({
            name: "Storm Ops",
            slug: "storm-ops",
            imagePrompt: "A premium storm desk command center thumbnail.",
        });
        expect(query).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({
                    contextId: `applet-user:${appletId}:ctx`,
                    fileAccessPlan: expect.arrayContaining([
                        expect.objectContaining({
                            appletId,
                            kind: "app-private",
                            userContextId: "ctx",
                        }),
                    ]),
                }),
                fetchPolicy: "no-cache",
            }),
        );
    });

    test("generates dark applet card image first through the Cortex media pipeline with directory style cues", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;
        const { createBackgroundTask } = require("../utils/tasks");
        const {
            deleteMediaFile,
            listMediaFiles,
        } = require("../utils/media-service-utils");
        const MediaItem = require("../models/media-item.mjs").default;

        const appletId = "69f68d347999b2bbd8ffb91a";
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue({
            _id: appletId,
            owner: "user-123",
            name: "Storm Desk",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [],
            publishedVersionIndex: null,
        });
        App.findOne.mockResolvedValue(null);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => `
                <html>
                    <head><title>Storm Desk</title></head>
                    <body><h1>Storm Desk</h1><p>Radar alerts map newsroom storm desk.</p></body>
                </html>
            `,
        });
        MediaItem.find.mockImplementation((query) => ({
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(
                query?.tags === "applet-card"
                    ? [
                          {
                              blobPath: `applets/assets/${appletId}/old-light.webp`,
                              hash: "old-light-hash",
                          },
                      ]
                    : [],
            ),
        }));
        listMediaFiles.mockResolvedValue([
            {
                name: `applets/assets/${appletId}/orphan-dark.webp`,
                hash: "orphan-dark-hash",
            },
        ]);
        MediaItem.deleteMany.mockResolvedValue({ deletedCount: 2 });
        createBackgroundTask.mockResolvedValueOnce({
            taskId: "task-dark",
            job: { id: "job-dark" },
        });
        MediaItem.create.mockResolvedValueOnce({
            _id: "media-dark",
            taskId: "task-dark",
            status: "pending",
        });

        const response = await GENERATE_IMAGE(
            {
                json: async () => ({
                    model: "oai-gpt55",
                    settings: {
                        models: {
                            "oai-gpt55": {
                                quality: "ultra",
                                aspectRatio: "1:1",
                                imageSize: "2048",
                            },
                        },
                    },
                    metadata: {
                        name: "Storm Desk",
                        slug: "storm-desk",
                        description: "Track active storm coverage.",
                        tags: ["weather"],
                    },
                    styleCues: "etched glass, storm radar glow",
                }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            taskId: "task-dark",
            jobId: "job-dark",
            styleCues: "etched glass, storm radar glow",
            model: "gemini-flash-31-image",
            outputFolder: `assets/${appletId}`,
            variants: {
                dark: { taskId: "task-dark", jobId: "job-dark" },
            },
        });
        expect(createBackgroundTask).toHaveBeenCalledTimes(1);
        expect(listMediaFiles).toHaveBeenCalledWith({
            storageTarget: {
                kind: "applet-global",
                userContextId: "ctx",
            },
            subPath: `assets/${appletId}`,
        });
        expect(deleteMediaFile).toHaveBeenCalledWith({
            blobPath: `applets/assets/${appletId}/old-light.webp`,
            hash: "old-light-hash",
            fallbackToHash: false,
            storageTarget: {
                kind: "applet-global",
                userContextId: "ctx",
            },
        });
        expect(deleteMediaFile).toHaveBeenCalledWith({
            blobPath: `applets/assets/${appletId}/orphan-dark.webp`,
            hash: "orphan-dark-hash",
            fallbackToHash: false,
            storageTarget: {
                kind: "applet-global",
                userContextId: "ctx",
            },
        });
        expect(MediaItem.deleteMany).toHaveBeenCalledWith({
            user: "user-123",
            outputFolder: {
                $in: [`assets/${appletId}`, `applets/assets/${appletId}`],
            },
            tags: "applet-card",
        });
        expect(MediaItem.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
            createBackgroundTask.mock.invocationCallOrder[0],
        );
        expect(createBackgroundTask).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                type: "media-generation",
                invokedFrom: {
                    source: "applet_metadata",
                    themeVariant: "dark",
                },
                metadata: expect.objectContaining({
                    outputType: "image",
                    model: "gemini-flash-31-image",
                    source: "applet_metadata",
                    appletId,
                    appletAssetType: "card-image",
                    themeVariant: "dark",
                    storageTarget: {
                        kind: "applet-global",
                        userContextId: "ctx",
                    },
                    outputFolder: `assets/${appletId}`,
                }),
            }),
        );
        const taskMetadata = createBackgroundTask.mock.calls[0][0].metadata;
        expect(taskMetadata.settings.models).not.toHaveProperty("oai-gpt55");
        expect(taskMetadata.settings).toMatchObject({
            models: {
                "gemini-flash-31-image": {
                    type: "image",
                    quality: "draft",
                    aspectRatio: "16:9",
                    numberResults: 1,
                    optimizePrompt: false,
                    imageSize: "512",
                },
            },
        });
        expect(taskMetadata.prompt).toContain(
            "Visual concept to imply through objects, scenery, lighting, and mood only",
        );
        expect(taskMetadata.prompt).toContain(
            "Storm Desk; Track active storm coverage.; weather",
        );
        expect(taskMetadata.prompt).toContain(
            "Additional visual style cues from the applet builder",
        );
        expect(taskMetadata.prompt).toContain("etched glass, storm radar glow");
        expect(taskMetadata.prompt).not.toContain("Applet name:");
        expect(taskMetadata.prompt).not.toContain("Card badge:");
        expect(taskMetadata.prompt).not.toContain("Purpose:");
        expect(taskMetadata.prompt).not.toContain("Search tags:");
        expect(taskMetadata.prompt).not.toContain("app card artwork");
        expect(taskMetadata.prompt).toContain(
            "Do not include any readable text, pseudo-text, labels",
        );
        expect(taskMetadata.displayPrompt).toBe("card-art-dark");
        expect(taskMetadata.prompt).toContain(
            "16:9 background artwork asset for an applet directory card",
        );
        expect(taskMetadata.prompt).toContain(
            "Do not render a completed card, frame, border",
        );
        expect(taskMetadata.prompt).toContain("dark mode background art asset");
        expect(taskMetadata.prompt).toContain(
            "sign-in control, tag pill, badge",
        );
        expect(MediaItem.create).toHaveBeenCalledTimes(1);
        expect(MediaItem.create).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                user: "user-123",
                taskId: "task-dark",
                status: "pending",
                settings: expect.objectContaining({
                    models: {
                        "gemini-flash-31-image": expect.objectContaining({
                            aspectRatio: "16:9",
                            imageSize: "512",
                            quality: "draft",
                        }),
                    },
                }),
                outputFolder: `assets/${appletId}`,
                tags: expect.arrayContaining([
                    "applet",
                    "applet-card",
                    "theme-dark",
                ]),
            }),
        );
    });

    test("generates light applet card image from the dark reference without deleting existing assets", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const App = require("../models/app").default;
        const { createBackgroundTask } = require("../utils/tasks");
        const {
            deleteMediaFile,
            listMediaFiles,
        } = require("../utils/media-service-utils");
        const MediaItem = require("../models/media-item.mjs").default;

        const appletId = "69f68d347999b2bbd8ffb91a";
        const darkReferenceUrl = "https://images.example/storm-dark.webp";
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue({
            _id: appletId,
            owner: "user-123",
            name: "Storm Desk",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [],
            publishedVersionIndex: null,
        });
        App.findOne.mockResolvedValue(null);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => "<html><body>Storm Desk</body></html>",
        });
        createBackgroundTask.mockResolvedValueOnce({
            taskId: "task-light",
            job: { id: "job-light" },
        });
        MediaItem.create.mockResolvedValueOnce({
            _id: "media-light",
            taskId: "task-light",
            status: "pending",
        });

        const response = await GENERATE_IMAGE(
            {
                json: async () => ({
                    variant: "light",
                    referenceImageUrl: darkReferenceUrl,
                    cleanupExisting: false,
                    metadata: {
                        name: "Storm Desk",
                        description: "Track active storm coverage.",
                    },
                }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            taskId: "task-light",
            jobId: "job-light",
            variants: {
                light: { taskId: "task-light", jobId: "job-light" },
            },
        });
        expect(listMediaFiles).not.toHaveBeenCalled();
        expect(deleteMediaFile).not.toHaveBeenCalled();
        const taskMetadata = createBackgroundTask.mock.calls[0][0].metadata;
        expect(taskMetadata).toMatchObject({
            themeVariant: "light",
            inputImageUrl: darkReferenceUrl,
            inputImageRole: "",
            referenceThemeVariant: "dark",
            displayPrompt: "card-art-light",
        });
        expect(taskMetadata.prompt).toContain(
            "Use the provided dark-mode artwork as the composition and subject reference",
        );
        expect(MediaItem.create).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId: "task-light",
                inputImageUrl: darkReferenceUrl,
                tags: expect.arrayContaining(["theme-light"]),
            }),
        );
    });

    test("does not create an orphan external snapshot for large draft-only html updates", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            getCanvasAppletEditableFileInfo,
        } = require("../canvas-applets/files");
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const largeHtml = "<html>" + "x".repeat(700000) + "</html>";
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            html: "",
            version: 2,
            htmlVersions: [{ content: "<html>v1</html>" }],
            publishedVersionIndex: null,
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        getCanvasAppletEditableFileInfo.mockResolvedValue({
            workspacePath: "/workspace/files/applets/weather.html",
        });
        uploadBufferToMediaService.mockResolvedValue({
            data: { url: "https://new.example/weather.html" },
        });
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                filePath: "https://new.example/weather.html",
                html: "",
            }),
        });

        const response = await PUT(
            {
                json: async () => ({ html: largeHtml }),
            },
            { params: { id: appletId } },
        );

        expect(response.status).toBe(200);
        expect(uploadBufferToMediaService).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.objectContaining({
                filename: "weather.html",
                mimeType: "text/html",
            }),
            expect.objectContaining({
                storageTarget: {
                    kind: "applet-global",
                    userContextId: "ctx",
                },
            }),
        );
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                filePath: "https://new.example/weather.html",
                html: "",
            }),
            expect.objectContaining({ new: true }),
        );
    });

    test("saves new v2 versions externally regardless of HTML size", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            getCanvasAppletEditableFileInfo,
        } = require("../canvas-applets/files");
        const {
            createAppletVersionEntry,
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");
        const {
            uploadBufferToMediaService,
        } = require("../utils/media-service-utils");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const versionEntry = {
            content: "",
            contentBlobPath: "versions/applet/v000001.html",
            contentContextId: "ctx",
            contentHash: "hash-v1",
            contentSize: 15,
            timestamp: new Date("2026-05-10T00:00:00Z"),
        };
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            html: "",
            version: 2,
            htmlVersions: [],
            publishedVersionIndex: null,
        };

        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        getCanvasAppletEditableFileInfo.mockResolvedValue({
            workspacePath: "/workspace/files/applets/weather.html",
        });
        uploadBufferToMediaService.mockResolvedValue({
            data: { url: "https://new.example/weather.html" },
        });
        resolveAppletVersionContent.mockResolvedValue("");
        createAppletVersionEntry.mockResolvedValueOnce(versionEntry);
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                filePath: "https://new.example/weather.html",
                htmlVersions: [versionEntry],
            }),
        });

        const response = await PUT(
            {
                json: async () => ({
                    html: "<html>v1</html>",
                    saveVersion: true,
                }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(createAppletVersionEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                _id: appletId,
                filePath: "https://new.example/weather.html",
            }),
            expect.objectContaining({ contextId: "ctx" }),
            "<html>v1</html>",
            { versionIndex: 0, external: true },
        );
        expect(uploadBufferToMediaService).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.objectContaining({
                filename: "weather.html",
                mimeType: "text/html",
            }),
            expect.objectContaining({
                storageTarget: {
                    kind: "applet-global",
                    userContextId: "ctx",
                },
            }),
        );
        expect(
            uploadBufferToMediaService.mock.invocationCallOrder[0],
        ).toBeLessThan(createAppletVersionEntry.mock.invocationCallOrder[0]);
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                filePath: "https://new.example/weather.html",
                html: "",
                htmlVersions: [versionEntry],
            }),
            expect.objectContaining({ new: true }),
        );
        expect(body).toMatchObject({
            htmlVersions: [
                expect.objectContaining({
                    content: "",
                    contentBlobPath: "versions/applet/v000001.html",
                    contentContextId: "ctx",
                }),
            ],
            versionSaved: true,
            latestVersionIndex: 0,
        });
    });

    test("serializes concurrent mutations for the same applet", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            createAppletVersionEntry,
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91b";
        const oldVersion = {
            content: "<html>old</html>",
            timestamp: new Date("2026-05-09T00:00:00Z"),
        };
        const newVersion = {
            content: "<html>new</html>",
            timestamp: new Date("2026-05-10T00:00:00Z"),
        };
        const makeApplet = () => ({
            _id: appletId,
            owner: "user-123",
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            html: "<html>old</html>",
            version: 1,
            htmlVersions: [oldVersion],
            publishedVersionIndex: null,
        });

        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockImplementation(async () => makeApplet());
        resolveAppletVersionContent.mockImplementation(
            async (version) => version.content,
        );
        createAppletVersionEntry.mockResolvedValue(newVersion);

        let releaseFirstSave;
        Applet.findByIdAndUpdate
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        releaseFirstSave = () =>
                            resolve({
                                ...makeApplet(),
                                html: "<html>new</html>",
                                htmlVersions: [oldVersion, newVersion],
                            });
                    }),
            )
            .mockResolvedValueOnce({
                ...makeApplet(),
                html: "<html>new</html>",
                htmlVersions: [oldVersion, newVersion],
                publishedVersionIndex: 1,
            });

        const first = PUT(
            {
                json: async () => ({
                    html: "<html>new</html>",
                    saveVersion: true,
                }),
            },
            { params: { id: appletId } },
        );

        const flushTasks = () =>
            new Promise((resolve) => {
                setImmediate(resolve);
            });
        for (let i = 0; i < 10 && !releaseFirstSave; i += 1) {
            await flushTasks();
        }
        expect(releaseFirstSave).toEqual(expect.any(Function));

        const second = PUT(
            {
                json: async () => ({
                    html: "<html>new</html>",
                    publish: true,
                }),
            },
            { params: { id: appletId } },
        );

        for (let i = 0; i < 10; i += 1) {
            await flushTasks();
        }
        expect(Applet.findById).toHaveBeenCalledTimes(1);

        releaseFirstSave();
        const [firstResponse, secondResponse] = await Promise.all([
            first,
            second,
        ]);

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        expect(Applet.findById).toHaveBeenCalledTimes(2);
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    });

    test("deletes one saved applet version and shifts a later published version", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            deleteAppletVersionSnapshots,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const versions = [
            { content: "<html>v1</html>" },
            { content: "<html>v2</html>", contentBlobPath: "versions/v2" },
            { content: "<html>v3</html>" },
        ];
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            html: "<html>draft</html>",
            version: 2,
            htmlVersions: versions,
            publishedVersionIndex: 2,
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                htmlVersions: [versions[0], versions[2]],
                publishedVersionIndex: 1,
            }),
        });

        const response = await PUT(
            {
                json: async () => ({ deleteVersion: 2 }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(deleteAppletVersionSnapshots).toHaveBeenCalledWith(
            [versions[1]],
            expect.objectContaining({ contextId: "ctx" }),
        );
        expect(
            deleteAppletVersionSnapshots.mock.invocationCallOrder[0],
        ).toBeGreaterThan(Applet.findByIdAndUpdate.mock.invocationCallOrder[0]);
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                htmlVersions: [versions[0], versions[2]],
                publishedVersionIndex: 1,
            }),
            expect.objectContaining({ new: true }),
        );
        expect(body).toMatchObject({
            versionDeleted: true,
            deletedVersion: 2,
            latestVersionIndex: 1,
            publishedVersionIndex: 1,
        });
    });

    test("deleting the published applet version clears the published pointer", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            deletePublishedAppletSnapshot,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const versions = [
            { content: "<html>v1</html>" },
            { content: "<html>v2</html>" },
        ];
        const applet = {
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: versions,
            publishedVersionIndex: 1,
            publishedContentBlobPath: "applets/published/applet/v2.html",
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                htmlVersions: [versions[0]],
                publishedVersionIndex: null,
            }),
        });

        const response = await PUT(
            {
                json: async () => ({ deleteVersion: 2 }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({
                htmlVersions: [versions[0]],
                publishedVersionIndex: null,
            }),
            expect.objectContaining({ new: true }),
        );
        expect(deletePublishedAppletSnapshot).toHaveBeenCalledWith(
            expect.objectContaining({
                publishedContentBlobPath: "applets/published/applet/v2.html",
            }),
        );
        expect(body).toMatchObject({
            versionDeleted: true,
            deletedVersion: 2,
            latestVersionIndex: 0,
            publishedVersionIndex: null,
        });
    });

    test("does not create a canonical published artifact for legacy v1 applets", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            createPublishedAppletUpdate,
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        const applet = {
            _id: appletId,
            name: "Legacy Weather",
            version: 1,
            filePath: "https://draft.example/weather.html",
            htmlVersions: [{ content: "<html>v1</html>" }],
        };
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue(applet);
        resolveAppletVersionContent.mockResolvedValue("<html>v1</html>");
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                publishedVersionIndex: 0,
            }),
        });

        const response = await PUT(
            {
                json: async () => ({ publishVersion: 1 }),
            },
            { params: { id: appletId } },
        );

        expect(response.status).toBe(200);
        expect(createPublishedAppletUpdate).not.toHaveBeenCalled();
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({ publishedVersionIndex: 0 }),
            expect.objectContaining({ new: true }),
        );
    });

    test("returns 404 when deleting a missing applet version", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            deleteAppletVersionSnapshots,
        } = require("../canvas-applets/versioning");

        const appletId = "69f68d347999b2bbd8ffb91a";
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx",
        });
        Applet.findById.mockResolvedValue({
            _id: appletId,
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            htmlVersions: [{ content: "<html>v1</html>" }],
        });

        const response = await PUT(
            {
                json: async () => ({ deleteVersion: 3 }),
            },
            { params: { id: appletId } },
        );
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body.error).toBe(
            "Version 3 not found. Applet has 1 saved version(s).",
        );
        expect(deleteAppletVersionSnapshots).not.toHaveBeenCalled();
        expect(Applet.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("installed applet runtime prefers published content over saved and draft content", async () => {
        const Applet = require("../models/applet").default;
        const {
            resolvePublishedAppletContent,
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");

        Applet.findById.mockResolvedValue({
            _id: "69f68d347999b2bbd8ffb91a",
            owner: "user-123",
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [{ content: "<html>saved</html>" }],
            publishedVersionIndex: 0,
        });
        resolvePublishedAppletContent.mockResolvedValue(
            "<html>published</html>",
        );
        resolveAppletVersionContent.mockResolvedValue("<html>saved</html>");
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => "<html>draft</html>",
        });

        const result = await resolveInstalledAppletRuntime(
            { _id: "user-123", contextId: "ctx" },
            "69f68d347999b2bbd8ffb91a",
        );

        expect(result.runtimeSource).toBe("published");
        expect(result.html).toContain("<html>published</html>");
        expect(resolveAppletVersionContent).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test("installed applet runtime falls back to latest saved version before draft content", async () => {
        const Applet = require("../models/applet").default;
        const {
            resolvePublishedAppletContent,
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");

        Applet.findById.mockResolvedValue({
            _id: "69f68d347999b2bbd8ffb91a",
            owner: "user-123",
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [
                { content: "<html>old saved</html>" },
                { content: "<html>latest saved</html>" },
            ],
            publishedVersionIndex: null,
        });
        resolvePublishedAppletContent.mockResolvedValue(null);
        resolveAppletVersionContent.mockResolvedValue(
            "<html>latest saved</html>",
        );
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => "<html>draft</html>",
        });

        const result = await resolveInstalledAppletRuntime(
            { _id: "user-123", contextId: "ctx" },
            "69f68d347999b2bbd8ffb91a",
        );

        expect(result.runtimeSource).toBe("latest-saved");
        expect(result.html).toContain("<html>latest saved</html>");
        expect(resolveAppletVersionContent).toHaveBeenCalledWith({
            content: "<html>latest saved</html>",
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test("installed applet runtime falls back to draft when no published or saved version exists", async () => {
        const Applet = require("../models/applet").default;
        const {
            resolvePublishedAppletContent,
            resolveAppletVersionContent,
        } = require("../canvas-applets/versioning");

        Applet.findById.mockResolvedValue({
            _id: "69f68d347999b2bbd8ffb91a",
            owner: "user-123",
            name: "Weather",
            filePath: "https://draft.example/weather.html",
            version: 2,
            htmlVersions: [],
            publishedVersionIndex: null,
        });
        resolvePublishedAppletContent.mockResolvedValue(null);
        resolveAppletVersionContent.mockResolvedValue("");
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => "<html>draft</html>",
        });

        const result = await resolveInstalledAppletRuntime(
            { _id: "user-123", contextId: "ctx" },
            "69f68d347999b2bbd8ffb91a",
        );

        expect(result.runtimeSource).toBe("draft");
        expect(result.html).toContain("<html>draft</html>");
        expect(global.fetch).toHaveBeenCalledWith(
            "https://draft.example/weather.html",
            { cache: "no-store" },
        );
    });
});
