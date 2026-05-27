/**
 * @jest-environment node
 */

import { GET as canvasAppletFileContentGet } from "../canvas-applets/[id]/files/[fileId]/content/route";

jest.mock("next/server", () => {
    class MockNextResponse {
        constructor(body, init = {}) {
            this.body = body;
            this.status = init.status || 200;
            this.headers = {};
            if (init.headers) {
                Object.keys(init.headers).forEach((key) => {
                    this.headers[key] = init.headers[key];
                });
            }
            this.headers = new Proxy(this.headers, {
                get: (target, prop) => {
                    if (typeof prop === "string") {
                        return target[prop];
                    }
                    return undefined;
                },
            });
        }

        static json(data, options) {
            return {
                ...data,
                status: (options && options.status) || 200,
            };
        }
    }

    return { NextResponse: MockNextResponse };
});

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

jest.mock("../utils/file-resolution-utils", () => ({
    resolveAndHealFile: jest.fn(),
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

jest.mock("../models/applet-file", () => {
    const mockFindOne = jest.fn().mockReturnValue({
        populate: jest.fn(),
    });
    return {
        __esModule: true,
        default: {
            findOne: mockFindOne,
        },
    };
});

jest.mock("../models/applet-shared-file", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn().mockReturnValue({
            populate: jest.fn(),
        }),
    },
}));

jest.mock("../models/file", () => ({
    __esModule: true,
    default: {
        findByIdAndUpdate: jest.fn(),
    },
}));

jest.mock("mongoose", () => ({
    __esModule: true,
    default: {
        Types: {
            ObjectId: {
                isValid: jest.fn(),
            },
        },
    },
}));

global.fetch = jest.fn();

function createMockStream(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    return new ReadableStream({
        start(controller) {
            controller.enqueue(data);
            controller.close();
        },
    });
}

describe("Canvas Applet File Content Endpoint", () => {
    let mockUser;
    let mockApplet;
    let mockFile;
    let mockAppletFile;

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

        mockFile = {
            _id: "file123",
            toString: () => "file123",
            filename: "test-file.jpg",
            originalName: "test-file.jpg",
            mimeType: "image/jpeg",
            size: 1024,
            url: "https://storage.azure.com/container/test-file.jpg?sas=token",
            hash: "abc123",
        };

        mockAppletFile = {
            files: [mockFile],
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

        const {
            resolveAndHealFile,
        } = require("../utils/file-resolution-utils");
        resolveAndHealFile.mockResolvedValue({
            file: mockFile,
            accessUrl: mockFile.url,
            status: "resolved",
        });

        const AppletFile = require("../models/applet-file").default;
        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockAppletFile),
        });

        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            statusText: "OK",
            headers: {
                get: (name) => {
                    const map = {
                        "content-type": "image/jpeg",
                        "content-length": "1024",
                    };
                    return map[name.toLowerCase()];
                },
            },
            body: createMockStream("fake-image-data"),
        });
    });

    describe("Successful File Streaming", () => {
        test("should stream file content successfully", async () => {
            const response = await canvasAppletFileContentGet(
                { url: "https://example.com" },
                { params: { id: "applet123", fileId: "file123" } },
            );

            expect(global.fetch).toHaveBeenCalledWith(mockFile.url, {
                redirect: "follow",
            });
            expect(response.status).toBe(200);
            expect(response.body).toBeDefined();
        });

        test("should set correct headers", async () => {
            const response = await canvasAppletFileContentGet(
                { url: "https://example.com" },
                { params: { id: "applet123", fileId: "file123" } },
            );

            const headers = response.headers;
            expect(headers["Content-Type"]).toBe("image/jpeg");
            expect(headers["Access-Control-Allow-Origin"]).toBe("*");
            expect(headers["Access-Control-Allow-Methods"]).toBe("GET");
            expect(headers["Content-Disposition"]).toContain("test-file.jpg");
            expect(headers["Cache-Control"]).toBe("public, max-age=3600");
        });

        test("should use applet storage target", async () => {
            const {
                createAppletUserStorageTarget,
            } = require("../../../src/utils/storageTargets");

            await canvasAppletFileContentGet(
                { url: "https://example.com" },
                { params: { id: "applet123", fileId: "file123" } },
            );

            expect(createAppletUserStorageTarget).toHaveBeenCalledWith(
                "ctx123",
                "applet123",
            );
        });
    });

    describe("Security Validation", () => {
        test("should return 401 if user is not authenticated", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue(null);

            const response = await canvasAppletFileContentGet(
                { url: "https://example.com" },
                { params: { id: "applet123", fileId: "file123" } },
            );

            expect(response.status).toBe(401);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test("should return 404 if applet not found", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue(null);

            const response = await canvasAppletFileContentGet(
                { url: "https://example.com" },
                { params: { id: "applet123", fileId: "file123" } },
            );

            expect(response.status).toBe(404);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test("should return 403 for non-owner on unpublished applet", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue({
                ...mockApplet,
                owner: { toString: () => "otherUser" },
                publishedVersionIndex: null,
            });

            const response = await canvasAppletFileContentGet(
                { url: "https://example.com" },
                { params: { id: "applet123", fileId: "file123" } },
            );

            expect(response.status).toBe(403);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test("should return 404 if file not found", async () => {
            const AppletFile = require("../models/applet-file").default;
            AppletFile.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue({
                    files: [
                        {
                            _id: "differentFile",
                            toString: () => "differentFile",
                        },
                    ],
                }),
            });

            const response = await canvasAppletFileContentGet(
                { url: "https://example.com" },
                { params: { id: "applet123", fileId: "file123" } },
            );

            expect(response.status).toBe(404);
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe("Storage Error Handling", () => {
        test("should handle storage fetch failure", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            const response = await canvasAppletFileContentGet(
                { url: "https://example.com" },
                { params: { id: "applet123", fileId: "file123" } },
            );

            expect(response.status).toBe(404);
        });

        test("should return 404 when resolver cannot recover the file", async () => {
            const {
                resolveAndHealFile,
            } = require("../utils/file-resolution-utils");
            resolveAndHealFile.mockResolvedValueOnce({
                file: mockFile,
                accessUrl: null,
                status: "unresolved",
            });

            const response = await canvasAppletFileContentGet(
                { url: "https://example.com" },
                { params: { id: "applet123", fileId: "file123" } },
            );

            expect(response.status).toBe(404);
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });
});
