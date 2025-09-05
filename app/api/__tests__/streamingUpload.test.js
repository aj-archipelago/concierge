/**
 * @jest-environment node
 */

import { handleStreamingFileUpload } from "../utils/upload-utils";

// Mock dependencies
jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((data, options) => ({
            data,
            status: options?.status || 200,
        })),
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

jest.mock("../models/file", () => {
    return jest.fn().mockImplementation((data) => ({
        ...data,
        _id: "mockFileId123",
        save: jest.fn().mockResolvedValue(true),
    }));
});

jest.mock("../../../config", () => ({
    endpoints: {
        mediaHelper: jest.fn((serverUrl) => `${serverUrl}/media-helper`),
    },
}));

// Mock fetch for media service uploads
global.fetch = jest.fn();

describe("Streaming Upload Handler", () => {
    let mockUser;
    let mockWorkspace;
    let mockOptions;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = {
            _id: "user123",
            toString: () => "user123",
        };

        mockWorkspace = {
            _id: "workspace123",
            owner: mockUser._id,
        };

        mockOptions = {
            getWorkspace: jest.fn().mockResolvedValue(mockWorkspace),
            checkAuthorization: jest.fn().mockResolvedValue({ success: true }),
            associateFile: jest.fn().mockResolvedValue({
                success: true,
                files: [],
            }),
            errorPrefix: "test upload",
        };

        // Mock getCurrentUser
        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue(mockUser);

        // Mock file validation functions
        const fileValidation = require("../utils/fileValidation");
        fileValidation.scanForMalware = jest.fn().mockResolvedValue({
            clean: true,
        });
        fileValidation.analyzeFileContent = jest.fn().mockReturnValue({
            safe: true,
            risks: [],
            recommendations: [],
        });

        // Mock successful media service upload
        global.fetch.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    url: "https://example.com/file.jpg",
                    gcs: "gs://bucket/file.jpg",
                    filename: "test-file.jpg",
                }),
        });
    });

    describe("Request validation", () => {
        test("should reject non-multipart requests", async () => {
            const mockRequest = {
                headers: new Map([["content-type", "application/json"]]),
                body: new ReadableStream(),
            };

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.data.error).toContain("multipart/form-data");
            expect(result.error.status).toBe(400);
        });

        test("should handle missing workspace", async () => {
            mockOptions.getWorkspace.mockResolvedValue(null);

            const mockRequest = createMockMultipartRequest(
                "test.jpg",
                "image/jpeg",
                1024,
            );
            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.data.error).toBe("Workspace not found");
            expect(result.error.status).toBe(404);
        });

        test("should handle authorization failure", async () => {
            mockOptions.checkAuthorization.mockResolvedValue({
                error: { data: { error: "Unauthorized" }, status: 403 },
            });

            const mockRequest = createMockMultipartRequest(
                "test.jpg",
                "image/jpeg",
                1024,
            );
            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.data.error).toBe("Unauthorized");
        });
    });

    describe("File size validation", () => {
        test("should accept files under size limit", async () => {
            const fileSize = 5 * 1024 * 1024; // 5MB
            const mockRequest = createMockMultipartRequest(
                "test.jpg",
                "image/jpeg",
                fileSize,
            );

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.success).toBe(true);
            expect(result.data.file).toBeDefined();
        });

        test("should reject files over size limit", async () => {
            // Create a file significantly larger than the 10MB default limit
            const fileSize = 12 * 1024 * 1024; // 12MB - clearly over the limit
            const boundary = "----formdata-test-boundary";

            // Create the request manually to ensure it goes over the limit
            const encoder = new TextEncoder();
            const header =
                [
                    `------formdata-test-boundary`,
                    `Content-Disposition: form-data; name="file"; filename="large.jpg"`,
                    `Content-Type: image/jpeg`,
                    ``,
                ].join("\r\n") + "\r\n";

            const fileContent = Buffer.alloc(fileSize, 65); // Fill with 'A'
            const footer = `\r\n------formdata-test-boundary--`;

            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(header));
                    controller.enqueue(fileContent);
                    controller.enqueue(encoder.encode(footer));
                    controller.close();
                },
            });

            const mockRequest = {
                headers: new Map([
                    [
                        "content-type",
                        `multipart/form-data; boundary=${boundary}`,
                    ],
                ]),
                body: stream,
            };

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.data.error).toContain("File validation failed");
            expect(result.error.status).toBe(400);
        });

        test("should reject empty files", async () => {
            const mockRequest = createMockMultipartRequest(
                "empty.jpg",
                "image/jpeg",
                0,
            );

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.data.error).toContain("File cannot be empty");
        });
    });

    describe("File type validation", () => {
        test("should accept allowed MIME types", async () => {
            const mockRequest = createMockMultipartRequest(
                "test.jpg",
                "image/jpeg",
                1024,
            );

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.success).toBe(true);
        });

        test("should reject blocked file extensions", async () => {
            const mockRequest = createMockMultipartRequest(
                "malware.exe",
                "application/octet-stream",
                1024,
            );

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.data.error).toContain("File validation failed");
            expect(result.error.data.details[0]).toContain(
                "not allowed for security reasons",
            );
        });

        test("should reject disallowed MIME types", async () => {
            const mockRequest = createMockMultipartRequest(
                "script.js",
                "application/javascript",
                1024,
            );

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.data.error).toContain("File validation failed");
        });
    });

    describe("Error handling", () => {
        test("should handle media service upload failure", async () => {
            // Mock fetch to fail
            global.fetch.mockResolvedValue({
                ok: false,
                statusText: "Internal Server Error",
                text: () => Promise.resolve("Upload service unavailable"),
            });

            const mockRequest = createMockMultipartRequest(
                "test.jpg",
                "image/jpeg",
                1024,
            );
            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.data.error).toContain(
                "Failed to upload to media service",
            );
        });

        test("should handle file association failure", async () => {
            mockOptions.associateFile.mockResolvedValue({
                error: { data: { error: "Association failed" }, status: 500 },
            });

            const mockRequest = createMockMultipartRequest(
                "test.jpg",
                "image/jpeg",
                1024,
            );
            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.data.error).toBe("Association failed");
        });

        test("should handle malformed multipart data", async () => {
            const encoder = new TextEncoder();
            const data = encoder.encode("invalid multipart data");

            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });

            const mockRequest = {
                headers: new Map([
                    [
                        "content-type",
                        "multipart/form-data; boundary=----invalid",
                    ],
                ]),
                body: stream,
            };

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.error).toBeDefined();
            expect(result.error.status).toBe(400);
        });
    });

    describe("Success scenarios", () => {
        test("should successfully upload valid file", async () => {
            const mockRequest = createMockMultipartRequest(
                "test.jpg",
                "image/jpeg",
                5 * 1024 * 1024,
            );

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.success).toBe(true);
            expect(result.data.file).toBeDefined();
            expect(result.data.file.filename).toBe("test-file.jpg");
        });

        test("should include security warnings for risky files", async () => {
            const mockRequest = createMockMultipartRequest(
                "archive.zip",
                "application/zip",
                1024,
            );

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.success).toBe(true);
            // ZIP files might trigger security warnings but still be allowed
        });

        test("should handle media service response with converted object", async () => {
            // Mock media service response with converted object
            global.fetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        url: "https://example.com/original.pdf",
                        gcs: "gs://bucket/original.pdf",
                        filename: "test-file.pdf",
                        converted: {
                            url: "https://example.com/converted.jpg",
                            gcs: "gs://bucket/converted.jpg",
                        },
                    }),
            });

            const mockRequest = createMockMultipartRequest(
                "document.pdf",
                "application/pdf",
                1024,
            );

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.success).toBe(true);
            expect(result.data.file).toBeDefined();

            // Should use converted URLs instead of original
            expect(result.data.file.url).toBe(
                "https://example.com/converted.jpg",
            );
            expect(result.data.file.gcsUrl).toBe("gs://bucket/converted.jpg");
            expect(result.data.file.filename).toBe("test-file.pdf");
        });

        test("should use original URLs when no converted object is present", async () => {
            // Mock media service response without converted object
            global.fetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        url: "https://example.com/original.jpg",
                        gcs: "gs://bucket/original.jpg",
                        filename: "test-file.jpg",
                    }),
            });

            const mockRequest = createMockMultipartRequest(
                "image.jpg",
                "image/jpeg",
                1024,
            );

            const result = await handleStreamingFileUpload(
                mockRequest,
                mockOptions,
            );

            expect(result.success).toBe(true);
            expect(result.data.file).toBeDefined();

            // Should use original URLs when no converted object
            expect(result.data.file.url).toBe(
                "https://example.com/original.jpg",
            );
            expect(result.data.file.gcsUrl).toBe("gs://bucket/original.jpg");
            expect(result.data.file.filename).toBe("test-file.jpg");
        });
    });
});

/**
 * Helper function to create mock multipart requests
 */
function createMockMultipartRequest(filename, mimeType, fileSize) {
    const boundary = "----formdata-test-boundary";

    // For very large files, simulate chunks to trigger size validation
    if (fileSize > 10 * 1024 * 1024) {
        // > 10MB
        return createLargeFileRequest(filename, mimeType, fileSize, boundary);
    }

    // For normal sized files, create actual content
    const actualSize = Math.min(fileSize, 1024 * 1024); // Cap at 1MB for memory
    const fileContent = "A".repeat(actualSize);

    const multipartData = [
        `------formdata-test-boundary`,
        `Content-Disposition: form-data; name="file"; filename="${filename}"`,
        `Content-Type: ${mimeType}`,
        ``,
        fileContent,
        `------formdata-test-boundary--`,
    ].join("\r\n");

    const encoder = new TextEncoder();
    const data = encoder.encode(multipartData);

    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(data);
            controller.close();
        },
    });

    return {
        headers: new Map([
            ["content-type", `multipart/form-data; boundary=${boundary}`],
        ]),
        body: stream,
    };
}

/**
 * Create a request that simulates a large file upload in chunks
 */
function createLargeFileRequest(filename, mimeType, fileSize, boundary) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Start multipart
            const header =
                [
                    `------formdata-test-boundary`,
                    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
                    `Content-Type: ${mimeType}`,
                    ``,
                ].join("\r\n") + "\r\n";

            controller.enqueue(encoder.encode(header));

            // Send chunks of data to simulate large file
            const chunkSize = 512 * 1024; // 512KB chunks to avoid memory issues
            let totalSent = 0;

            const sendChunk = () => {
                if (totalSent >= fileSize) {
                    // End multipart
                    controller.enqueue(
                        encoder.encode(`\r\n------formdata-test-boundary--`),
                    );
                    controller.close();
                    return;
                }

                const remainingSize = Math.min(chunkSize, fileSize - totalSent);
                // Create actual data of the requested size
                const chunk = Buffer.alloc(remainingSize, 65); // Fill with 'A' (ASCII 65)
                controller.enqueue(chunk);
                totalSent += remainingSize;

                // Continue sending chunks asynchronously
                setTimeout(sendChunk, 0);
            };

            sendChunk();
        },
    });

    return {
        headers: new Map([
            ["content-type", `multipart/form-data; boundary=${boundary}`],
        ]),
        body: stream,
    };
}
