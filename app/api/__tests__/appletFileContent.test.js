/**
 * @jest-environment node
 */

import { GET as appletFileContentGet } from "../workspaces/[id]/applet/files/[fileId]/content/route";

// Mock NextResponse BEFORE importing the routes
jest.mock("next/server", () => {
    // Create a class that can be instantiated and also used as static method
    class MockNextResponse {
        constructor(body, init = {}) {
            this.body = body;
            this.status = init.status || 200;
            this.headers = {};

            // Convert headers object to simple object for easier testing
            if (init.headers) {
                Object.keys(init.headers).forEach((key) => {
                    this.headers[key] = init.headers[key];
                });
            }

            // Make headers accessible via bracket notation
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

    return {
        NextResponse: MockNextResponse,
    };
});

// Mock all other dependencies
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

jest.mock("../models/applet-file", () => {
    const mockFindOne = jest.fn().mockReturnValue({
        populate: jest.fn(),
    });
    return {
        __esModule: true,
        default: {
            findOne: mockFindOne,
        },
        findOne: mockFindOne, // Also export directly for require() compatibility
    };
});

jest.mock("../workspaces/[id]/db", () => ({
    getWorkspace: jest.fn(),
}));

// Mock fetch for Azure storage
global.fetch = jest.fn();

// Helper to create a mock readable stream
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

describe("Applet File Content Endpoint", () => {
    let mockUser;
    let mockWorkspace;
    let mockFile;
    let mockAppletFile;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = {
            _id: "user123",
            toString: () => "user123",
        };

        mockWorkspace = {
            _id: "workspace123",
            applet: "applet123",
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

        // Setup mocks
        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue(mockUser);

        const { getWorkspace } = require("../workspaces/[id]/db");
        getWorkspace.mockResolvedValue(mockWorkspace);

        const AppletFile = require("../models/applet-file");
        // Handle both ES6 default export and CommonJS require
        const mockAppletFileModel = AppletFile.default || AppletFile;
        mockAppletFileModel.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockAppletFile),
        });

        // Default mock fetch response (successful Azure fetch)
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
            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            // Verify fetch was called with the Azure URL
            expect(global.fetch).toHaveBeenCalledWith(mockFile.url, {
                redirect: "follow",
            });

            // Verify response is a streaming response
            expect(response).toBeDefined();
            expect(response.status).toBe(200);
            expect(response.body).toBeDefined();
        });

        test("should set correct headers", async () => {
            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            expect(response.headers).toBeDefined();
            // Headers are set on the response object
            const headers = response.headers;
            expect(headers["Content-Type"]).toBe("image/jpeg");
            expect(headers["Access-Control-Allow-Origin"]).toBe("*");
            expect(headers["Access-Control-Allow-Methods"]).toBe("GET");
            expect(headers["Content-Disposition"]).toContain("test-file.jpg");
            expect(headers["Cache-Control"]).toBe("public, max-age=3600");
        });

        test("should use mimeType from file when Azure doesn't provide content-type", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: {
                    get: () => null, // No content-type header
                },
                body: createMockStream("data"),
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            const headers = response.headers;
            expect(headers["Content-Type"]).toBe("image/jpeg");
        });

        test("should handle files without content-length header", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: {
                    get: (name) =>
                        name.toLowerCase() === "content-type"
                            ? "image/png"
                            : null,
                },
                body: createMockStream("data"),
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            const headers = response.headers;
            expect(headers["Content-Type"]).toBe("image/png");
            // Content-Length should not be set if not provided
            expect(headers["Content-Length"]).toBeUndefined();
        });
    });

    describe("Security Validation", () => {
        test("should return 401 if user is not authenticated", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValueOnce(null);

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            expect(response.status).toBe(401);
            expect(response.error).toBe("Authentication required");
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test("should return 404 if workspace not found", async () => {
            const { getWorkspace } = require("../workspaces/[id]/db");
            getWorkspace.mockResolvedValueOnce(null);

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            expect(response.status).toBe(404);
            expect(response.error).toBe("Workspace not found");
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test("should return 404 if applet file not found", async () => {
            const AppletFile = require("../models/applet-file");
            const mockAppletFileModel = AppletFile.default || AppletFile;
            mockAppletFileModel.findOne.mockReturnValueOnce({
                populate: jest.fn().mockResolvedValue(null),
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            expect(response.status).toBe(404);
            expect(response.error).toBe("File not found");
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test("should return 404 if file ID doesn't match", async () => {
            const AppletFile = require("../models/applet-file");
            const mockAppletFileModel = AppletFile.default || AppletFile;
            mockAppletFileModel.findOne.mockReturnValueOnce({
                populate: jest.fn().mockResolvedValue({
                    files: [
                        {
                            _id: "differentFileId",
                            toString: () => "differentFileId",
                        },
                    ],
                }),
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            expect(response.status).toBe(404);
            expect(response.error).toBe("File not found");
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test("should validate file belongs to correct user", async () => {
            const AppletFile = require("../models/applet-file");
            const mockAppletFileModel = AppletFile.default || AppletFile;
            // Mock different user's files
            mockAppletFileModel.findOne.mockReturnValueOnce({
                populate: jest.fn().mockResolvedValue({
                    files: [], // Empty - file doesn't belong to this user
                }),
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            expect(response.status).toBe(404);
            expect(response.error).toBe("File not found");
        });
    });

    describe("Azure Storage Error Handling", () => {
        test("should handle Azure fetch failure", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            expect(response.status).toBe(404);
            expect(response.error).toBe("Failed to fetch file from storage");
        });

        test("should handle Azure fetch server error", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            expect(response.status).toBe(500);
            expect(response.error).toBe("Failed to fetch file from storage");
        });

        test("should handle fetch network error", async () => {
            global.fetch.mockRejectedValueOnce(new Error("Network error"));

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            expect(response.status).toBe(500);
            expect(response.error).toBe("Failed to stream file");
        });
    });

    describe("Content Type Handling", () => {
        test("should handle PDF files", async () => {
            const pdfFile = {
                ...mockFile,
                _id: "pdf123",
                toString: () => "pdf123",
                filename: "document.pdf",
                originalName: "document.pdf",
                mimeType: "application/pdf",
            };

            const AppletFile = require("../models/applet-file");
            const mockAppletFileModel = AppletFile.default || AppletFile;
            mockAppletFileModel.findOne.mockReturnValueOnce({
                populate: jest.fn().mockResolvedValue({
                    files: [pdfFile],
                }),
            });

            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: {
                    get: (name) =>
                        name.toLowerCase() === "content-type"
                            ? "application/pdf"
                            : null,
                },
                body: createMockStream("pdf-content"),
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "pdf123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            const headers = response.headers;
            expect(headers["Content-Type"]).toBe("application/pdf");
            expect(headers["Content-Disposition"]).toContain("document.pdf");
        });

        test("should handle text files", async () => {
            const textFile = {
                ...mockFile,
                _id: "text123",
                toString: () => "text123",
                filename: "readme.txt",
                originalName: "readme.txt",
                mimeType: "text/plain",
            };

            const AppletFile = require("../models/applet-file");
            const mockAppletFileModel = AppletFile.default || AppletFile;
            mockAppletFileModel.findOne.mockReturnValueOnce({
                populate: jest.fn().mockResolvedValue({
                    files: [textFile],
                }),
            });

            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: {
                    get: (name) =>
                        name.toLowerCase() === "content-type"
                            ? "text/plain"
                            : null,
                },
                body: createMockStream("text content"),
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "text123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            const headers = response.headers;
            expect(headers["Content-Type"]).toBe("text/plain");
        });

        test("should default to octet-stream for unknown types", async () => {
            const unknownFile = {
                ...mockFile,
                _id: "unknown123",
                toString: () => "unknown123",
                filename: "file.xyz",
                originalName: "file.xyz",
                mimeType: undefined,
            };

            const AppletFile = require("../models/applet-file");
            const mockAppletFileModel = AppletFile.default || AppletFile;
            mockAppletFileModel.findOne.mockReturnValueOnce({
                populate: jest.fn().mockResolvedValue({
                    files: [unknownFile],
                }),
            });

            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: new Map(), // No content-type
                body: createMockStream("data"),
            });

            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "unknown123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            const headers = response.headers;
            expect(headers["Content-Type"]).toBe("application/octet-stream");
        });
    });

    describe("CORS Headers", () => {
        test("should include CORS headers for browser access", async () => {
            const mockRequest = {
                url: "https://example.com",
            };
            const params = {
                id: "workspace123",
                fileId: "file123",
            };

            const response = await appletFileContentGet(mockRequest, {
                params,
            });

            const headers = response.headers;
            expect(headers["Access-Control-Allow-Origin"]).toBe("*");
            expect(headers["Access-Control-Allow-Methods"]).toBe("GET");
            expect(headers["Access-Control-Expose-Headers"]).toContain(
                "Content-Type",
            );
            expect(headers["Access-Control-Expose-Headers"]).toContain(
                "Content-Length",
            );
        });
    });
});
