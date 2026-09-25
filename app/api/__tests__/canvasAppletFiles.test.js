/**
 * @jest-environment node
 */

import { GET, DELETE } from "../canvas-applets/[id]/files/route";

jest.mock("next/server", () => ({
    NextResponse: {
        json: (data, options) => ({
            ...data,
            status: (options && options.status) || 200,
        }),
    },
}));

jest.mock("next/headers", () => ({
    headers: jest.fn(
        () =>
            new Map([
                ["host", "localhost:3000"],
                ["x-forwarded-proto", "http"],
            ]),
    ),
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../utils/upload-utils", () => ({
    handleStreamingFileUpload: jest.fn(),
}));

jest.mock("../utils/media-service-utils", () => ({
    deleteMediaFile: jest.fn(),
}));

jest.mock("../../../src/utils/storageTargets", () => ({
    createAppletUserStorageTarget: jest.fn((userContextId, appletId) => ({
        kind: "applet-user",
        userContextId,
        appletId,
    })),
    createAppletSharedStorageTarget: jest.fn((appletId) => ({
        kind: "applet-shared",
        appletId,
    })),
}));

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findById: jest.fn(),
        updateOne: jest.fn(),
    },
}));

jest.mock("../models/app", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
    APP_STATUS: {
        ACTIVE: "active",
    },
}));

jest.mock("../models/share.js", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
    SHARE_ENTITY_TYPES: [
        "chat",
        "workspace",
        "applet",
        "published_applet",
        "automation",
    ],
    SHARE_ROLES: ["viewer", "editor"],
}));

jest.mock("../models/chat.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("../models/workspace", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("../models/automation", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("../models/article", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("../models/applet-file", () => {
    const mockFindOne = jest.fn();
    const mockFindOneAndUpdate = jest.fn();
    return {
        __esModule: true,
        default: {
            findOne: mockFindOne,
            findOneAndUpdate: mockFindOneAndUpdate,
        },
    };
});

jest.mock("../models/applet-shared-file", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
}));

jest.mock("../models/file", () => ({
    __esModule: true,
    default: {
        findByIdAndDelete: jest.fn(),
    },
}));

jest.mock("mongoose", () => {
    const Types = {
        ObjectId: {
            isValid: jest.fn(),
        },
    };

    return {
        __esModule: true,
        default: {
            Types,
        },
        Types,
    };
});

describe("Canvas Applet Files Routes", () => {
    let mockUser;
    let mockApplet;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = {
            _id: "user123",
            contextId: "ctx123",
            toString: () => "user123",
        };

        mockApplet = {
            _id: "applet123",
            owner: { toString: () => "user123" },
            version: 2,
            publishedVersionIndex: null,
        };

        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue(mockUser);

        const mongoose = require("mongoose").default;
        mongoose.Types.ObjectId.isValid.mockReturnValue(true);

        const Applet = require("../models/applet").default;
        Applet.findOne.mockResolvedValue(mockApplet);
        Applet.findById.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            }),
        });
        Applet.updateOne.mockResolvedValue({});

        const App = require("../models/app").default;
        App.findOne.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            }),
        });

        const Share = require("../models/share.js").default;
        Share.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
    });

    describe("GET", () => {
        test("should return empty files array initially", async () => {
            const AppletFile = require("../models/applet-file").default;
            AppletFile.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue(null),
            });

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(200);
            expect(response.files).toEqual([]);
        });

        test("should return existing files", async () => {
            const mockFiles = [
                {
                    _id: "file1",
                    filename: "photo.jpg",
                    originalName: "photo.jpg",
                    size: 1024,
                },
                {
                    _id: "file2",
                    filename: "doc.pdf",
                    originalName: "doc.pdf",
                    size: 2048,
                },
            ];

            const AppletFile = require("../models/applet-file").default;
            AppletFile.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ files: mockFiles }),
            });

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(200);
            expect(response.files).toEqual(mockFiles);
        });

        test("should return 401 for unauthenticated user", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue(null);

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(401);
        });

        test("should return 403 for non-owner on unpublished applet", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue({
                ...mockApplet,
                owner: { toString: () => "otherUser" },
                publishedVersionIndex: null,
            });

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(403);
        });

        test("should allow non-owner on listed public published applet", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue({
                ...mockApplet,
                owner: { toString: () => "otherUser" },
                publishedVersionIndex: 0,
            });
            const App = require("../models/app").default;
            App.findOne.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({ _id: "app-record" }),
                }),
            });

            const AppletFile = require("../models/applet-file").default;
            AppletFile.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue(null),
            });

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(200);
            expect(response.files).toEqual([]);
        });

        test("should deny non-owner on unlisted published applet without share access", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue({
                ...mockApplet,
                owner: { toString: () => "otherUser" },
                publishedVersionIndex: 0,
            });

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(403);
        });

        test("should allow non-owner with explicit share access on unpublished applet", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue({
                ...mockApplet,
                owner: { toString: () => "otherUser" },
                publishedVersionIndex: null,
            });
            const Share = require("../models/share.js").default;
            Share.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    recipients: [{ userId: "user123", role: "viewer" }],
                    link: { enabled: false, role: "viewer" },
                }),
            });

            const AppletFile = require("../models/applet-file").default;
            AppletFile.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue(null),
            });

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(200);
            expect(response.files).toEqual([]);
        });
    });

    describe("DELETE", () => {
        test("should delete a file by filename", async () => {
            const mockFile = {
                _id: "file1",
                filename: "photo.jpg",
                blobPath: "applets/photo.jpg",
                hash: "abc123",
            };

            const AppletFile = require("../models/applet-file").default;
            AppletFile.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ files: [mockFile] }),
            });
            AppletFile.findOneAndUpdate.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ files: [] }),
            });

            const File = require("../models/file").default;
            File.findByIdAndDelete.mockResolvedValue(null);

            const response = await DELETE(
                {
                    url: "https://example.com/api/canvas-applets/applet123/files?filename=photo.jpg",
                },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(200);
            expect(response.success).toBe(true);
            expect(response.files).toEqual([]);
            expect(File.findByIdAndDelete).toHaveBeenCalledWith("file1");
        });

        test("should return 400 when filename is missing", async () => {
            const response = await DELETE(
                {
                    url: "https://example.com/api/canvas-applets/applet123/files",
                },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(400);
            expect(response.error).toBe("Filename is required");
        });

        test("should return 404 when file not found", async () => {
            const AppletFile = require("../models/applet-file").default;
            AppletFile.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue({
                    files: [{ _id: "file1", filename: "other.jpg" }],
                }),
            });

            const response = await DELETE(
                {
                    url: "https://example.com/api/canvas-applets/applet123/files?filename=missing.jpg",
                },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(404);
            expect(response.error).toBe("File not found");
        });

        test("should return success with empty array when no applet file record", async () => {
            const AppletFile = require("../models/applet-file").default;
            AppletFile.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue(null),
            });

            const response = await DELETE(
                {
                    url: "https://example.com/api/canvas-applets/applet123/files?filename=photo.jpg",
                },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(200);
            expect(response.success).toBe(true);
            expect(response.files).toEqual([]);
        });
    });
});
