/**
 * @jest-environment node
 */

/* eslint-disable import/first */
// Mock the dependencies before importing
jest.mock("../models/pathway", () => ({
    default: {
        findById: jest.fn(),
    },
    __esModule: true,
}));

jest.mock("../models/prompt", () => ({
    default: {
        find: jest.fn().mockReturnValue({
            populate: jest.fn(),
        }),
    },
    __esModule: true,
}));

jest.mock("../models/user.mjs", () => ({
    default: {
        findById: jest.fn(),
    },
    __esModule: true,
}));

jest.mock("../pathways/[id]/db", () => ({
    putPathway: jest.fn(),
    deletePathway: jest.fn(),
}));

jest.mock("../models/llm", () => ({
    default: {
        findById: jest.fn(),
        findOne: jest.fn(),
    },
    __esModule: true,
}));

jest.mock("../utils/llm-file-utils", () => ({
    getLLMWithFallback: jest.fn(),
}));

// Import mocked modules to access their mock functions
import {
    publishWorkspace,
    republishWorkspace,
    unpublishWorkspace,
} from "../workspaces/[id]/publish/utils";
import Pathway from "../models/pathway";
import Prompt from "../models/prompt";
import User from "../models/user.mjs";
import { putPathway, deletePathway } from "../pathways/[id]/db";
import { getLLMWithFallback } from "../utils/llm-file-utils";

// Get mock function references
const mockPathwayFindById = Pathway.findById;
const mockPromptFind = Prompt.find;
const mockPromptPopulate = Prompt.find().populate;
const mockUserFindById = User.findById;
const mockGetLLMWithFallback = getLLMWithFallback;

describe("Workspace Publishing Utils", () => {
    let mockWorkspace;
    let mockUser;
    let mockPrompts;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = {
            _id: "user123",
        };

        mockPrompts = [
            {
                _id: "prompt1",
                title: "First Prompt",
                text: "This is the first prompt text",
            },
            {
                _id: "prompt2",
                title: "Second Prompt",
                text: "This is the second prompt text",
            },
        ];

        mockWorkspace = {
            _id: "workspace123",
            prompts: ["prompt1", "prompt2"],
            systemPrompt: "You are a helpful assistant",
            pathway: null,
            save: jest.fn(),
        };

        // Mock Prompt.find with populate to return prompts (ensuring backward compatibility)
        mockPromptPopulate.mockResolvedValue(
            mockPrompts.map((p) => ({ ...p, files: [] })),
        );

        // Mock getLLMWithFallback to return a default LLM
        mockGetLLMWithFallback.mockResolvedValue({
            _id: "defaultLLM",
            identifier: "gpt4o",
            name: "GPT 4o",
            cortexPathwayName: "run_workspace_prompt",
            cortexModelName: "oai-gpt4o",
        });

        // Mock putPathway
        putPathway.mockResolvedValue({
            _id: "pathway123",
            name: "Test Pathway",
        });
    });

    describe("publishWorkspace", () => {
        test("should publish workspace with prompt names and text", async () => {
            const pathwayName = "Test Pathway";
            const model = "gpt-4";

            const result = await publishWorkspace(
                mockWorkspace,
                mockUser,
                pathwayName,
                model,
            );

            // Verify Prompt.find was called with correct prompt IDs and populate was called
            expect(mockPromptFind).toHaveBeenCalledWith({
                _id: { $in: ["prompt1", "prompt2"] },
            });
            expect(mockPromptPopulate).toHaveBeenCalledWith("files");

            // Verify putPathway was called with correct data structure
            expect(putPathway).toHaveBeenCalledWith(
                null, // workspace.pathway is null initially
                {
                    name: pathwayName,
                    systemPrompt: "You are a helpful assistant",
                    prompts: [
                        {
                            name: "First Prompt",
                            prompt: "This is the first prompt text",
                            files: [],
                            cortexPathwayName: "run_workspace_prompt",
                        },
                        {
                            name: "Second Prompt",
                            prompt: "This is the second prompt text",
                            files: [],
                            cortexPathwayName: "run_workspace_prompt",
                        },
                    ],
                    inputParameters: {},
                    model: model,
                    owner: "user123",
                },
                mockUser,
            );

            // Verify workspace was updated
            expect(mockWorkspace.save).toHaveBeenCalled();
            expect(result._id).toBe("pathway123");
        });

        test("should handle empty prompts array", async () => {
            mockWorkspace.prompts = [];
            mockPromptPopulate.mockResolvedValue([]);

            await publishWorkspace(
                mockWorkspace,
                mockUser,
                "Test Pathway",
                "gpt-4",
            );

            expect(putPathway).toHaveBeenCalledWith(
                null,
                expect.objectContaining({
                    prompts: [],
                }),
                mockUser,
            );
        });
    });

    describe("republishWorkspace", () => {
        beforeEach(() => {
            mockWorkspace.pathway = "pathway123";

            // Mock Pathway.findById
            mockPathwayFindById.mockResolvedValue({
                _id: "pathway123",
                name: "Existing Pathway",
                model: "gpt-4",
                owner: "user123",
            });

            // Mock User.findById
            mockUserFindById.mockResolvedValue(mockUser);
        });

        test("should republish workspace with updated prompt format", async () => {
            await republishWorkspace(mockWorkspace);

            // Verify prompts were fetched with populate
            expect(mockPromptFind).toHaveBeenCalledWith({
                _id: { $in: ["prompt1", "prompt2"] },
            });
            expect(mockPromptPopulate).toHaveBeenCalledWith("files");

            // Verify putPathway was called with correct format
            expect(putPathway).toHaveBeenCalledWith(
                "pathway123",
                expect.objectContaining({
                    prompts: [
                        {
                            name: "First Prompt",
                            prompt: "This is the first prompt text",
                            files: [],
                            cortexPathwayName: "run_workspace_prompt",
                        },
                        {
                            name: "Second Prompt",
                            prompt: "This is the second prompt text",
                            files: [],
                            cortexPathwayName: "run_workspace_prompt",
                        },
                    ],
                }),
                mockUser,
            );

            expect(mockWorkspace.save).toHaveBeenCalled();
        });

        test("should throw error if pathway not found", async () => {
            mockPathwayFindById.mockResolvedValue(null);

            await expect(republishWorkspace(mockWorkspace)).rejects.toThrow(
                "Pathway not found",
            );
        });

        test("should return early if workspace has no pathway", async () => {
            mockWorkspace.pathway = null;

            const result = await republishWorkspace(mockWorkspace);

            expect(result).toBeUndefined();
            expect(mockPathwayFindById).not.toHaveBeenCalled();
        });
    });

    describe("unpublishWorkspace", () => {
        beforeEach(() => {
            mockWorkspace.pathway = "pathway123";
            mockWorkspace.published = true;
        });

        test("should unpublish workspace and clear pathway", async () => {
            await unpublishWorkspace(mockWorkspace, mockUser);

            expect(deletePathway).toHaveBeenCalledWith("pathway123", mockUser);
            expect(mockWorkspace.published).toBe(false);
            expect(mockWorkspace.pathway).toBeNull();
            expect(mockWorkspace.save).toHaveBeenCalled();
        });

        test("should handle workspace with no pathway", async () => {
            mockWorkspace.pathway = null;

            await unpublishWorkspace(mockWorkspace, mockUser);

            expect(deletePathway).not.toHaveBeenCalled();
            expect(mockWorkspace.published).toBe(false);
            expect(mockWorkspace.save).toHaveBeenCalled();
        });
    });
});
