/**
 * @jest-environment node
 */

import { POST } from "../canvas-applets/route";
import { PUT } from "../canvas-applets/[id]/route";

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
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

jest.mock("../models/app", () => ({
    __esModule: true,
    APP_TYPES: { APPLET: "applet" },
    APP_STATUS: { ACTIVE: "active", INACTIVE: "inactive" },
    default: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
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
        resolveAppletVersionContent: jest.fn(),
    };
});

jest.mock("../utils/media-service-utils", () => ({
    uploadBufferToMediaService: jest.fn(),
}));

jest.mock("../../../src/utils/storageTargets", () => ({
    createAppletGlobalStorageTarget: jest.fn((userContextId) => ({
        kind: "applet-global",
        userContextId,
    })),
}));

describe("canvas applets route", () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
            applet,
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
        Applet.findOne.mockResolvedValue(applet);
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
        Applet.findOne.mockResolvedValue(applet);
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
        Applet.findOne.mockResolvedValue(applet);
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
        Applet.findOne.mockResolvedValue(applet);
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
                publishedVersionIndex: null,
                publishedContentBlobPath: undefined,
            }),
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
        Applet.findOne.mockResolvedValue(applet);
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
        Applet.findOne.mockResolvedValue({
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
        Applet.findOne.mockResolvedValue(applet);
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
        Applet.findOne.mockResolvedValue(applet);
        App.findOne
            .mockResolvedValueOnce({
                _id: "existing-app",
                slug: "weather",
            })
            .mockResolvedValueOnce(null);
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

    test("does not create an orphan external snapshot for large draft-only html updates", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;

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
        Applet.findOne.mockResolvedValue(applet);
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
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
        expect(Applet.findByIdAndUpdate).toHaveBeenCalledWith(
            appletId,
            expect.objectContaining({ html: "" }),
            expect.objectContaining({ new: true }),
        );
    });

    test("saves new v2 versions externally regardless of HTML size", async () => {
        const { getCurrentUser } = require("../utils/auth");
        const Applet = require("../models/applet").default;
        const {
            createAppletVersionEntry,
            resolveAppletVersionContent,
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
        Applet.findOne.mockResolvedValue(applet);
        resolveAppletVersionContent.mockResolvedValue("");
        createAppletVersionEntry.mockResolvedValueOnce(versionEntry);
        Applet.findByIdAndUpdate.mockResolvedValue({
            toObject: () => ({
                ...applet,
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
            applet,
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
        Applet.findOne.mockResolvedValue(applet);
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
        Applet.findOne.mockResolvedValue(applet);
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
        Applet.findOne.mockResolvedValue(applet);
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
        Applet.findOne.mockResolvedValue({
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
});
