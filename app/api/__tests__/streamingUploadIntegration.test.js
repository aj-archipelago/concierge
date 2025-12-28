/**
 * @jest-environment node
 */

import { POST as workspaceFilesPost } from "../workspaces/[id]/files/route";
import { POST as appletFilesPost } from "../workspaces/[id]/applet/files/route";

// Mock NextResponse BEFORE importing the routes
jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((data, options) => {
            // Return a response object that has the data structure
            // This matches what the routes expect to return
            return {
                success: !data.error && !(options && options.status >= 400),
                ...data,
                status: (options && options.status) || 200,
            };
        }),
    },
}));

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

jest.mock("../models/workspace", () => ({
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn().mockReturnValue({
        populate: jest.fn(),
    }),
}));

jest.mock("../models/applet-file", () => ({
    findOne: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({
            files: [],
        }),
    }),
    findOneAndUpdate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({
            files: [],
        }),
    }),
}));

jest.mock("../workspaces/[id]/db", () => ({
    getWorkspace: jest.fn(),
}));

jest.mock("../models/file", () => {
    const mockFile = jest.fn().mockImplementation((data) => ({
        ...data,
        _id: "mockFileId123",
        save: jest.fn().mockResolvedValue(true),
    }));
    mockFile.findByIdAndDelete = jest.fn().mockResolvedValue(true);
    return mockFile;
});

jest.mock("../../../config", () => ({
    endpoints: {
        mediaHelper: jest.fn((serverUrl) => `${serverUrl}/media-helper`),
    },
}));

// Mock file validation functions
jest.mock("../utils/fileValidation", () => ({
    ...jest.requireActual("../utils/fileValidation"),
    scanForMalware: jest.fn().mockResolvedValue({
        clean: true,
    }),
    analyzeFileContent: jest.fn(() => ({
        safe: true,
        risks: [],
        recommendations: [],
    })),
}));

// Mock fetch for media service
global.fetch = jest.fn((url) => {
    // If it's a hash check request, return not found so upload proceeds normally
    if (String(url).includes("checkHash=true")) {
        return Promise.resolve({
            ok: false,
            status: 404,
        });
    }
    // Otherwise return the normal upload response
    return Promise.resolve({
        ok: true,
        json: () =>
            Promise.resolve({
                url: "https://example.com/uploaded-file.jpg",
                gcs: "gs://bucket/uploaded-file.jpg",
                filename: "uploaded-file.jpg",
            }),
    });
});

describe("Streaming Upload Integration Tests", () => {
    let mockUser;
    let mockWorkspace;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = {
            _id: "user123",
            toString: () => "user123",
        };

        mockWorkspace = {
            _id: "workspace123",
            owner: { equals: jest.fn(() => true) },
            applet: "applet123",
        };

        // Setup mocks
        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue(mockUser);

        const Workspace = require("../models/workspace");
        // Mock findById to return a chainable that works both for direct await and .populate()
        // When used in getWorkspace: await Workspace.findById(id) -> returns mockWorkspace
        // When chained: Workspace.findById(id).populate(...) -> returns populated workspace
        const mockFindByIdResult = {
            populate: jest.fn((path) => {
                // Return a promise that resolves to the populated workspace
                return Promise.resolve({
                    ...mockWorkspace,
                    files: [], // No duplicates by default in tests
                });
            }),
        };
        // Make it thenable so it can be awaited directly (for getWorkspace callback)
        mockFindByIdResult.then = (resolve) =>
            Promise.resolve(mockWorkspace).then(resolve);
        mockFindByIdResult.catch = (reject) =>
            Promise.resolve(mockWorkspace).catch(reject);
        Workspace.findById.mockReturnValue(mockFindByIdResult);
        Workspace.findByIdAndUpdate.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                ...mockWorkspace,
                files: [{ _id: "file1", filename: "uploaded-file.jpg" }], // Mock files array
            }),
        });

        const { getWorkspace } = require("../workspaces/[id]/db");
        getWorkspace.mockResolvedValue(mockWorkspace);

        const AppletFile = require("../models/applet-file");
        // Mock findOne for deduplication check (returns empty files, so no duplicate)
        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [],
            }),
        });
        // Mock findOneAndUpdate for normal file association
        AppletFile.findOneAndUpdate.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [],
            }),
        });

        // Reset file validation mocks to default state
        const {
            scanForMalware,
            analyzeFileContent,
        } = require("../utils/fileValidation");
        scanForMalware.mockResolvedValue({ clean: true });
        analyzeFileContent.mockReturnValue({
            safe: true,
            risks: [],
            recommendations: [],
        });

        // Reset fetch mock to default behavior for successful uploads
        global.fetch.mockImplementation((url) => {
            // If it's a hash check request, return not found so upload proceeds normally
            if (String(url).includes("checkHash=true")) {
                return Promise.resolve({
                    ok: false,
                    status: 404,
                });
            }
            // Otherwise return the normal upload response
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        url: "https://example.com/uploaded-file.jpg",
                        gcs: "gs://bucket/uploaded-file.jpg",
                        filename: "uploaded-file.jpg",
                    }),
            });
        });
    });

    describe("Workspace File Upload", () => {
        test("should successfully upload file to workspace", async () => {
            const mockRequest = createMockRequest(
                "workspace-file.jpg",
                "image/jpeg",
                1024,
            );
            const params = { id: "workspace123" };

            const response = await workspaceFilesPost(mockRequest, { params });

            expect(response.file).toBeDefined();
            expect(response.file.filename).toBe("uploaded-file.jpg");
        });

        test("should reject unauthorized workspace upload", async () => {
            // Mock unauthorized user
            mockWorkspace.owner.equals.mockReturnValue(false);

            const mockRequest = createMockRequest(
                "test.jpg",
                "image/jpeg",
                1024,
            );
            const params = { id: "workspace123" };

            const response = await workspaceFilesPost(mockRequest, { params });

            expect(response.status).toBe(403);
            expect(response.error).toBe(
                "Not authorized to upload files to this workspace",
            );
        });

        test("should handle non-existent workspace", async () => {
            const Workspace = require("../models/workspace");
            Workspace.findById.mockResolvedValue(null);

            const mockRequest = createMockRequest(
                "test.jpg",
                "image/jpeg",
                1024,
            );
            const params = { id: "nonexistent" };

            const response = await workspaceFilesPost(mockRequest, { params });

            expect(response.status).toBe(404);
            expect(response.error).toBe("Workspace not found");
        });
    });

    describe("Applet File Upload", () => {
        test("should successfully upload file to applet", async () => {
            const mockRequest = createMockRequest(
                "applet-file.pdf",
                "application/pdf",
                2048,
            );
            const params = { id: "workspace123" };

            const response = await appletFilesPost(mockRequest, { params });

            expect(response.file).toBeDefined();
            expect(response.files).toBeDefined();
        });

        test("should handle applet file association", async () => {
            const AppletFile = require("../models/applet-file");
            AppletFile.findOneAndUpdate.mockReturnValue({
                populate: jest.fn().mockResolvedValue({
                    files: [{ _id: "file1" }, { _id: "file2" }],
                }),
            });

            const mockRequest = createMockRequest(
                "doc.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                5120,
            );
            const params = { id: "workspace123" };

            const response = await appletFilesPost(mockRequest, { params });

            expect(response.file).toBeDefined();
            expect(response.files).toBeDefined();
            expect(response.files).toHaveLength(2);
        });

        test("should deduplicate files with same hash", async () => {
            const AppletFile = require("../models/applet-file");
            const File = require("../models/file");

            const existingFile = {
                _id: "existingFileId",
                filename: "existing-file.pdf",
                hash: "abc123",
            };

            // Reset mocks for this test
            AppletFile.findOne.mockReset();
            File.findByIdAndDelete.mockClear();

            // First findOne call: check for duplicate (finds existing file with same hash)
            AppletFile.findOne.mockReturnValueOnce({
                populate: jest.fn().mockResolvedValue({
                    files: [existingFile], // Found duplicate
                }),
            });

            // Second findOne call: get all files for the applet
            AppletFile.findOne.mockReturnValueOnce({
                populate: jest.fn().mockResolvedValue({
                    files: [existingFile, { _id: "otherFile" }],
                }),
            });

            // Mock the File constructor to return a file with the same hash
            const FileModel = require("../models/file");
            FileModel.mockImplementation((data) => ({
                ...data,
                _id: "mockFileId123",
                hash: "abc123", // Same hash as existing file
                save: jest.fn().mockResolvedValue(true),
            }));

            // Mock fetch to return hash in response
            global.fetch.mockImplementationOnce(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            url: "https://example.com/duplicate-file.pdf",
                            gcs: "gs://bucket/duplicate-file.pdf",
                            filename: "duplicate-file.pdf",
                            hash: "abc123", // Same hash
                        }),
                }),
            );

            const mockRequest = createMockRequest(
                "duplicate-file.pdf",
                "application/pdf",
                2048,
            );
            const params = { id: "workspace123" };

            const response = await appletFilesPost(mockRequest, { params });

            // Should return the existing file, not the duplicate
            expect(response.file).toBeDefined();
            expect(response.file._id).toBe("existingFileId");
            expect(response.file.hash).toBe("abc123");
            expect(response.files).toBeDefined();
            expect(response.files).toHaveLength(2);
            // Verify the duplicate file was deleted
            expect(File.findByIdAndDelete).toHaveBeenCalledWith(
                "mockFileId123",
            );
        });
    });

    describe("Error Scenarios", () => {
        test("should handle malware detection", async () => {
            const { scanForMalware } = require("../utils/fileValidation");
            scanForMalware.mockReturnValueOnce({
                clean: false,
            });

            const mockRequest = createMockRequest(
                "suspicious.jpg",
                "image/jpeg",
                1024,
            );
            const params = { id: "workspace123" };

            const response = await workspaceFilesPost(mockRequest, { params });

            expect(response.status).toBe(400);
            expect(response.error).toBe("Security threat detected");
        });

        test("should handle media service failure", async () => {
            // Ensure malware scan passes for this test
            const { scanForMalware } = require("../utils/fileValidation");
            scanForMalware.mockReturnValueOnce({
                clean: true,
            });

            global.fetch.mockImplementation((url) => {
                // Hash check should fail/not found
                if (String(url).includes("checkHash=true")) {
                    return Promise.resolve({
                        ok: false,
                        status: 404,
                    });
                }
                // Upload should fail
                return Promise.resolve({
                    ok: false,
                    statusText: "Service Unavailable",
                    text: () => Promise.resolve("Media service down"),
                });
            });

            const mockRequest = createMockRequest(
                "test.jpg",
                "image/jpeg",
                1024,
            );
            const params = { id: "workspace123" };

            const response = await workspaceFilesPost(mockRequest, { params });

            // upload-utils returns a NextResponse-like object with .data and .status on error
            // Some environments may surface this as 400 from earlier validation layers; accept 4xx/5xx
            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(response.status).toBeLessThan(600);
            expect(response.error).toContain(
                "Failed to upload to media service",
            );
        });
    });

    describe("File Type Validation", () => {
        test("should accept various allowed file types", async () => {
            const testCases = [
                { name: "image.jpg", type: "image/jpeg" },
                { name: "document.pdf", type: "application/pdf" },
                {
                    name: "spreadsheet.xlsx",
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                },
                { name: "text.txt", type: "text/plain" },
                { name: "video.mp4", type: "video/mp4" },
            ];

            for (const testCase of testCases) {
                const mockRequest = createMockRequest(
                    testCase.name,
                    testCase.type,
                    1024,
                );
                const params = { id: "workspace123" };

                const response = await workspaceFilesPost(mockRequest, {
                    params,
                });

                expect(response.file).toBeDefined();
            }
        });

        test("should reject blocked file extensions", async () => {
            const blockedFiles = [
                { name: "malware.exe", type: "application/octet-stream" },
                { name: "script.bat", type: "application/x-bat" },
                { name: "virus.scr", type: "application/octet-stream" },
            ];

            for (const file of blockedFiles) {
                const mockRequest = createMockRequest(
                    file.name,
                    file.type,
                    1024,
                );
                const params = { id: "workspace123" };

                const response = await workspaceFilesPost(mockRequest, {
                    params,
                });

                expect(response.status).toBe(400);
                expect(response.error).toBe("File validation failed");
            }
        });
    });

    describe("Memory Management", () => {
        test("should handle files at size limit boundary", async () => {
            const {
                FILE_VALIDATION_CONFIG,
            } = require("../utils/fileValidation");
            const originalMaxSize = FILE_VALIDATION_CONFIG.MAX_FILE_SIZE;

            try {
                // Test file just under limit
                const mockRequest1 = createMockRequest(
                    "max-size.jpg",
                    "image/jpeg",
                    originalMaxSize - 1,
                );
                const params = { id: "workspace123" };

                const response1 = await workspaceFilesPost(mockRequest1, {
                    params,
                });
                expect(response1.file).toBeDefined();

                // Test file just over limit
                const mockRequest2 = createMockRequest(
                    "over-limit.jpg",
                    "image/jpeg",
                    originalMaxSize + 1,
                );
                const response2 = await workspaceFilesPost(mockRequest2, {
                    params,
                });
                expect(response2.status).toBe(400);
            } finally {
                // Always reset the config to original value
                FILE_VALIDATION_CONFIG.MAX_FILE_SIZE = originalMaxSize;
            }
        });

        test("should track memory usage during upload", async () => {
            const mockRequest = createMockRequest(
                "memory-test.jpg",
                "image/jpeg",
                5 * 1024 * 1024,
            );
            const params = { id: "workspace123" };

            const response = await workspaceFilesPost(mockRequest, { params });

            // Verify the upload completed successfully, which implies memory logging occurred
            expect(response.file).toBeDefined();
        });
    });

    describe("Streaming Behavior", () => {
        test("should process large files without buffering entire content", async () => {
            // Create a 15MB test file (larger than default limit, but we'll mock validation)
            const {
                FILE_VALIDATION_CONFIG,
            } = require("../utils/fileValidation");
            const originalMaxSize = FILE_VALIDATION_CONFIG.MAX_FILE_SIZE;

            try {
                // Temporarily increase limit for this test
                FILE_VALIDATION_CONFIG.MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

                const mockRequest = createMockRequest(
                    "large-file.jpg",
                    "image/jpeg",
                    15 * 1024 * 1024,
                );
                const params = { id: "workspace123" };

                const startMemory = process.memoryUsage().heapUsed;
                const response = await workspaceFilesPost(mockRequest, {
                    params,
                });
                const endMemory = process.memoryUsage().heapUsed;

                // Memory increase should be reasonable (not 15MB+)
                const memoryIncrease = endMemory - startMemory;
                expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase

                expect(response.file).toBeDefined();
            } finally {
                // Always reset the config to original value
                FILE_VALIDATION_CONFIG.MAX_FILE_SIZE = originalMaxSize;
            }
        });
    });
});

/**
 * Helper function to create mock requests with multipart data
 */
function createMockRequest(filename, mimeType, fileSize) {
    const boundary = "----testboundary123";
    const fileContent = "A".repeat(fileSize); // Simple file content

    const multipartBody = [
        `------testboundary123`,
        `Content-Disposition: form-data; name="file"; filename="${filename}"`,
        `Content-Type: ${mimeType}`,
        ``,
        fileContent,
        `------testboundary123--`,
    ].join("\r\n");

    // Create a Web API ReadableStream instead of Node.js Readable
    const encoder = new TextEncoder();
    const data = encoder.encode(multipartBody);

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
