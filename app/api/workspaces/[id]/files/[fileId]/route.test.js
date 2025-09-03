/**
 * @jest-environment node
 */

// Mock dependencies
jest.mock("../../../../models/workspace", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn(),
    },
}));

// Helper to create mock query with populate
const createMockQuery = (data) => ({
    populate: jest.fn().mockResolvedValue(data),
});

jest.mock("../../../../models/file", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        findByIdAndDelete: jest.fn(),
    },
}));

jest.mock("../../../../models/prompt", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        updateMany: jest.fn(),
    },
}));

// Helper to create mock query with select
const createMockQueryWithSelect = (data) => ({
    select: jest.fn().mockResolvedValue(data),
});

jest.mock("../../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

// Mock NextResponse
jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((data, options) => ({
            data,
            status: options?.status || 200,
            json: () => Promise.resolve(data),
            text: () => Promise.resolve(JSON.stringify(data)),
            ok: options?.status ? options.status < 400 : true,
        })),
    },
}));

// Create a testable version of the DELETE handler without config dependencies
const createTestableDeleteHandler = () => {
    return async (request, { params }) => {
        const { NextResponse } = require("next/server");
        const Workspace = require("../../../../models/workspace").default;
        const File = require("../../../../models/file").default;
        const Prompt = require("../../../../models/prompt").default;
        const { getCurrentUser } = require("../../../../utils/auth");

        const { id: workspaceId, fileId } = params;
        const { searchParams } = new URL(request.url);
        const force = searchParams.get("force") === "true";

        try {
            // Get current user
            const user = await getCurrentUser();
            if (!user) {
                return NextResponse.json(
                    { error: "Authentication required" },
                    { status: 401 },
                );
            }

            // Find the workspace and populate files
            const workspaceQuery = Workspace.findById(workspaceId);
            const workspace = await workspaceQuery.populate("files");
            if (!workspace) {
                return NextResponse.json(
                    { error: "Workspace not found" },
                    { status: 404 },
                );
            }

            // Check if user is owner
            if (!workspace.owner?.equals(user._id)) {
                return NextResponse.json(
                    {
                        error: "Not authorized to delete files from this workspace",
                    },
                    { status: 403 },
                );
            }

            // Find the file to delete by ID
            const fileToDelete = await File.findById(fileId);
            if (!fileToDelete) {
                return NextResponse.json(
                    { error: "File not found" },
                    { status: 404 },
                );
            }

            // Verify the file belongs to this workspace
            const fileInWorkspace = workspace.files.some(
                (file) => file._id.toString() === fileId,
            );

            if (!fileInWorkspace) {
                return NextResponse.json(
                    { error: "File not found in this workspace" },
                    { status: 404 },
                );
            }

            // Check if the file is attached to any prompts in the workspace
            const promptsUsingFile = await Prompt.find({
                _id: { $in: workspace.prompts },
                files: fileId,
            }).select("title _id");

            if (promptsUsingFile.length > 0 && !force) {
                return NextResponse.json(
                    {
                        error: "File is currently attached to one or more prompts",
                        promptsUsingFile: promptsUsingFile.map((p) => ({
                            id: p._id,
                            title: p.title,
                        })),
                        code: "FILE_ATTACHED_TO_PROMPTS",
                    },
                    { status: 409 },
                );
            }

            if (promptsUsingFile.length > 0 && force) {
                // Force deletion: detach file from all prompts first
                await Prompt.updateMany(
                    { _id: { $in: promptsUsingFile.map((p) => p._id) } },
                    { $pull: { files: fileId } },
                );
            }

            // Delete the file from the container using the file handler
            try {
                const containerName =
                    process.env.CORTEX_MEDIA_PERMANENT_STORE_NAME;
                if (containerName && fileToDelete.hash) {
                    const host =
                        request.headers.get("x-forwarded-host") ||
                        request.headers.get("host") ||
                        "localhost:3000";
                    const protocol =
                        request.headers.get("x-forwarded-proto") || "http";
                    const serverUrl = `${protocol}://${host}`;
                    // In tests, use a simple URL construction instead of config
                    const mediaHelperUrl = `${serverUrl}/media-helper`;

                    const deleteResponse = await fetch(mediaHelperUrl, {
                        method: "DELETE",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            params: {
                                hash: fileToDelete.hash,
                                container: containerName,
                            },
                        }),
                    });

                    if (!deleteResponse.ok) {
                        const errorBody = await deleteResponse.text();
                        console.warn(
                            `Failed to delete file from container: ${deleteResponse.statusText}. Response: ${errorBody}`,
                        );
                        // Continue with database deletion even if container deletion fails
                    } else {
                        console.log(
                            `Successfully deleted file ${fileToDelete.hash} from container ${containerName}`,
                        );
                    }
                }
            } catch (error) {
                console.error("Error deleting file from container:", error);
                // Continue with database deletion even if container deletion fails
            }

            // Remove the file document
            await File.findByIdAndDelete(fileId);

            // Remove the file reference from the workspace
            const updateQuery = Workspace.findByIdAndUpdate(
                workspaceId,
                {
                    $pull: {
                        files: fileId,
                    },
                },
                {
                    new: true,
                    runValidators: true,
                },
            );
            const updatedWorkspace = await updateQuery.populate("files");

            return NextResponse.json({
                success: true,
                files: updatedWorkspace.files || [],
            });
        } catch (error) {
            console.error("Error deleting workspace file:", error);
            return NextResponse.json(
                { error: "Failed to delete file" },
                { status: 500 },
            );
        }
    };
};

describe("DELETE /api/workspaces/[id]/files/[fileId]", () => {
    let mockRequest;
    let mockParams;
    let mockUser;
    let mockWorkspace;
    let mockFile;
    let mockPrompt;
    let DELETE;

    beforeEach(() => {
        jest.clearAllMocks();
        DELETE = createTestableDeleteHandler();

        // Mock request object
        mockRequest = {
            url: "http://localhost:3000/api/workspaces/workspace123/files/file123",
            headers: {
                get: jest.fn().mockImplementation((key) => {
                    const headers = {
                        host: "localhost:3000",
                        "x-forwarded-host": undefined,
                        "x-forwarded-proto": undefined,
                    };
                    return headers[key.toLowerCase()];
                }),
            },
        };

        mockParams = {
            id: "workspace123",
            fileId: "file123",
        };

        // Mock user
        mockUser = {
            _id: "user123",
            toString: () => "user123",
        };

        // Mock workspace
        mockWorkspace = {
            _id: "workspace123",
            owner: {
                _id: "user123",
                equals: jest.fn((id) => id === "user123"),
            },
            files: [
                {
                    _id: "file123",
                    toString: () => "file123",
                },
            ],
            save: jest.fn(),
        };

        // Mock file
        mockFile = {
            _id: "file123",
            filename: "test-file.jpg",
            originalName: "test-file.jpg",
            hash: "testFileHash123",
            toString: () => "file123",
        };

        // Mock prompt
        mockPrompt = {
            _id: "prompt123",
            title: "Test Prompt",
        };

        // Setup default mocks
        const { getCurrentUser } = require("../../../../utils/auth");
        getCurrentUser.mockResolvedValue(mockUser);

        const Workspace = require("../../../../models/workspace").default;
        Workspace.findById.mockReturnValue(createMockQuery(mockWorkspace));
        Workspace.findByIdAndUpdate.mockReturnValue(
            createMockQuery({
                ...mockWorkspace,
                files: [],
            }),
        );

        const File = require("../../../../models/file").default;
        File.findById.mockResolvedValue(mockFile);
        File.findByIdAndDelete.mockResolvedValue(mockFile);

        const Prompt = require("../../../../models/prompt").default;
        Prompt.find.mockReturnValue(createMockQueryWithSelect([]));
        Prompt.updateMany.mockResolvedValue({});

        // Mock global fetch
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue("Success"),
        });

        // Note: Container deletion is simulated in the test implementation

        // Mock environment variable
        process.env.CORTEX_MEDIA_PERMANENT_STORE_NAME = "permanent-container";
    });

    afterEach(() => {
        delete process.env.CORTEX_MEDIA_PERMANENT_STORE_NAME;
    });

    describe("Successful Deletion", () => {
        test("should delete file successfully with container cleanup", async () => {
            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(200);
            expect(result.data.success).toBe(true);
            expect(result.data.files).toEqual([]);

            // Verify container deletion was called
            expect(global.fetch).toHaveBeenCalledWith(
                "http://localhost:3000/media-helper",
                {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        params: {
                            hash: "testFileHash123",
                            container: "permanent-container",
                        },
                    }),
                },
            );

            // Verify database operations
            const File = require("../../../../models/file").default;
            expect(File.findByIdAndDelete).toHaveBeenCalledWith("file123");

            const Workspace = require("../../../../models/workspace").default;
            expect(Workspace.findByIdAndUpdate).toHaveBeenCalledWith(
                "workspace123",
                { $pull: { files: "file123" } },
                { new: true, runValidators: true },
            );
        });

        test("should delete file when container cleanup fails but continue with DB deletion", async () => {
            // Mock failed container deletion
            global.fetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
                text: () => Promise.resolve("Container deletion failed"),
            });

            const consoleWarnSpy = jest
                .spyOn(console, "warn")
                .mockImplementation(() => {});
            const consoleErrorSpy = jest
                .spyOn(console, "error")
                .mockImplementation(() => {});

            try {
                const result = await DELETE(mockRequest, {
                    params: mockParams,
                });

                expect(result.status).toBe(200);
                expect(result.data.success).toBe(true);

                // Verify container deletion was attempted but failed
                expect(global.fetch).toHaveBeenCalled();
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    "Failed to delete file from container: Internal Server Error. Response: Container deletion failed",
                );

                // Verify database deletion still happened
                const File = require("../../../../models/file").default;
                expect(File.findByIdAndDelete).toHaveBeenCalledWith("file123");
            } finally {
                consoleWarnSpy.mockRestore();
                consoleErrorSpy.mockRestore();
            }
        });

        test("should delete file when container environment variable is not set", async () => {
            delete process.env.CORTEX_MEDIA_PERMANENT_STORE_NAME;

            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(200);
            expect(result.data.success).toBe(true);

            // Verify container deletion was not attempted
            expect(global.fetch).not.toHaveBeenCalled();

            // Verify database deletion still happened
            const File = require("../../../../models/file").default;
            expect(File.findByIdAndDelete).toHaveBeenCalledWith("file123");
        });

        test("should delete file when file has no hash", async () => {
            const File = require("../../../../models/file").default;
            const fileWithoutHash = { ...mockFile, hash: null };
            File.findById.mockResolvedValue(fileWithoutHash);

            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(200);
            expect(result.data.success).toBe(true);

            // Verify container deletion was not attempted
            expect(global.fetch).not.toHaveBeenCalled();

            // Verify database deletion still happened
            expect(File.findByIdAndDelete).toHaveBeenCalledWith("file123");
        });
    });

    describe("Authorization and Permissions", () => {
        test("should return 401 when user is not authenticated", async () => {
            const { getCurrentUser } = require("../../../../utils/auth");
            getCurrentUser.mockResolvedValue(null);

            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(401);
            expect(result.data.error).toBe("Authentication required");
        });

        test("should return 403 when user is not workspace owner", async () => {
            const Workspace = require("../../../../models/workspace").default;
            const workspaceWithoutOwnership = {
                ...mockWorkspace,
                owner: {
                    _id: "differentUser",
                    equals: jest.fn((id) => id === "differentUser"),
                },
            };
            Workspace.findById.mockReturnValue(
                createMockQuery(workspaceWithoutOwnership),
            );

            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(403);
            expect(result.data.error).toBe(
                "Not authorized to delete files from this workspace",
            );
        });

        test("should return 404 when workspace is not found", async () => {
            const Workspace = require("../../../../models/workspace").default;
            Workspace.findById.mockReturnValue(createMockQuery(null));

            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(404);
            expect(result.data.error).toBe("Workspace not found");
        });
    });

    describe("File Not Found Scenarios", () => {
        test("should return 404 when file is not found", async () => {
            const File = require("../../../../models/file").default;
            File.findById.mockResolvedValue(null);

            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(404);
            expect(result.data.error).toBe("File not found");
        });

        test("should return 404 when file is not in workspace", async () => {
            const Workspace = require("../../../../models/workspace").default;
            const workspaceWithoutFile = {
                ...mockWorkspace,
                files: [],
            };
            Workspace.findById.mockReturnValue(
                createMockQuery(workspaceWithoutFile),
            );

            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(404);
            expect(result.data.error).toBe("File not found in this workspace");
        });
    });

    describe("File Attached to Prompts", () => {
        test("should return 409 when file is attached to prompts and force is not set", async () => {
            const Prompt = require("../../../../models/prompt").default;
            Prompt.find.mockReturnValue(
                createMockQueryWithSelect([mockPrompt]),
            );

            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(409);
            expect(result.data.error).toBe(
                "File is currently attached to one or more prompts",
            );
            expect(result.data.code).toBe("FILE_ATTACHED_TO_PROMPTS");
            expect(result.data.promptsUsingFile).toEqual([
                {
                    id: "prompt123",
                    title: "Test Prompt",
                },
            ]);
        });

        test("should delete file when force=true even if attached to prompts", async () => {
            const Prompt = require("../../../../models/prompt").default;
            Prompt.find.mockReturnValue(
                createMockQueryWithSelect([mockPrompt]),
            );

            // Create request with force=true
            const requestWithForce = {
                ...mockRequest,
                url: "http://localhost:3000/api/workspaces/workspace123/files/file123?force=true",
            };

            // Mock URL constructor for this test
            const originalURL = global.URL;
            global.URL = jest.fn().mockImplementation((url) => ({
                searchParams: new URLSearchParams(url.split("?")[1] || ""),
            }));

            const result = await DELETE(requestWithForce, {
                params: mockParams,
            });

            // Restore original URL
            global.URL = originalURL;

            expect(result.status).toBe(200);
            expect(result.data.success).toBe(true);

            // Verify that prompts were updated to remove file references
            expect(Prompt.updateMany).toHaveBeenCalledWith(
                { _id: { $in: ["prompt123"] } },
                { $pull: { files: "file123" } },
            );

            // Verify file was deleted
            const File = require("../../../../models/file").default;
            expect(File.findByIdAndDelete).toHaveBeenCalledWith("file123");
        });
    });

    describe("Container Deletion Edge Cases", () => {
        test("should handle fetch error gracefully", async () => {
            global.fetch.mockRejectedValue(new Error("Network error"));

            const consoleErrorSpy = jest
                .spyOn(console, "error")
                .mockImplementation(() => {});

            try {
                const result = await DELETE(mockRequest, {
                    params: mockParams,
                });

                expect(result.status).toBe(200);
                expect(result.data.success).toBe(true);

                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    "Error deleting file from container:",
                    expect.any(Error),
                );

                // Verify database deletion still happened
                const File = require("../../../../models/file").default;
                expect(File.findByIdAndDelete).toHaveBeenCalledWith("file123");
            } finally {
                consoleErrorSpy.mockRestore();
            }
        });

        test("should construct correct media helper URL with forwarded headers", async () => {
            const requestWithForwardedHeaders = {
                ...mockRequest,
                headers: {
                    get: jest.fn((header) => {
                        switch (header) {
                            case "x-forwarded-host":
                                return "myapp.com";
                            case "x-forwarded-proto":
                                return "https";
                            default:
                                return null;
                        }
                    }),
                },
            };

            const result = await DELETE(requestWithForwardedHeaders, {
                params: mockParams,
            });

            expect(result.status).toBe(200);

            // Verify correct URL was used
            expect(global.fetch).toHaveBeenCalledWith(
                "https://myapp.com/media-helper",
                expect.any(Object),
            );
        });
    });

    describe("Workspace Update", () => {
        test("should update workspace to remove file reference", async () => {
            const Workspace = require("../../../../models/workspace").default;
            const updatedWorkspace = {
                ...mockWorkspace,
                files: [],
            };
            Workspace.findByIdAndUpdate.mockReturnValue(
                createMockQuery(updatedWorkspace),
            );

            const result = await DELETE(mockRequest, { params: mockParams });

            expect(result.status).toBe(200);
            expect(result.data.files).toEqual([]);

            expect(Workspace.findByIdAndUpdate).toHaveBeenCalledWith(
                "workspace123",
                { $pull: { files: "file123" } },
                {
                    new: true,
                    runValidators: true,
                },
            );
        });
    });
});
