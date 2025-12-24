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

jest.mock("../models/llm", () => ({
    default: {
        findById: jest.fn(),
        findOne: jest.fn(),
    },
    __esModule: true,
}));

jest.mock("../pathways/[id]/db", () => ({
    putPathway: jest.fn(),
    deletePathway: jest.fn(),
}));

jest.mock("../utils/llm-file-utils", () => ({
    getLLMWithFallback: jest.fn(),
}));

// Import mocked modules to access their mock functions
import {
    publishWorkspace,
    republishWorkspace,
} from "../workspaces/[id]/publish/utils";
import Pathway from "../models/pathway";
import Prompt from "../models/prompt";
import User from "../models/user.mjs";
import LLM from "../models/llm";
import { putPathway } from "../pathways/[id]/db";
import { getLLMWithFallback } from "../utils/llm-file-utils";

// Get mock function references
const mockPathwayFindById = Pathway.findById;
const mockPromptFind = Prompt.find;
const mockPromptPopulate = Prompt.find().populate;
const mockUserFindById = User.findById;
const mockGetLLMWithFallback = getLLMWithFallback;

describe("Workspace Publishing with cortexPathwayName", () => {
    let mockWorkspace;
    let mockUser;
    let mockPrompts;
    let mockLLMs;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = {
            _id: "user123",
        };

        mockLLMs = {
            llm1: {
                _id: "llm1",
                identifier: "gpt4o",
                name: "GPT 4o",
                cortexPathwayName: "run_workspace_agent",
                cortexModelName: "oai-gpt4o",
            },
            llm2: {
                _id: "llm2",
                identifier: "gpt4omini",
                name: "GPT 4o Mini",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt4o-mini",
            },
            llm3: {
                _id: "llm3",
                identifier: "labeebagent",
                name: "Labeeb Agent",
                cortexPathwayName: "run_workspace_agent",
                cortexModelName: "labeeb-agent",
            },
        };

        mockPrompts = [
            {
                _id: "prompt1",
                title: "First Prompt",
                text: "This is the first prompt text",
                llm: "llm1", // Uses run_workspace_agent
                files: [],
            },
            {
                _id: "prompt2",
                title: "Second Prompt",
                text: "This is the second prompt text",
                llm: "llm2", // Uses run_workspace_prompt
                files: [],
            },
            {
                _id: "prompt3",
                title: "Third Prompt",
                text: "This is the third prompt text",
                llm: "llm3", // Uses run_workspace_agent (labeeb agent)
                files: [],
            },
        ];

        mockWorkspace = {
            _id: "workspace123",
            prompts: ["prompt1", "prompt2", "prompt3"],
            systemPrompt: "You are a helpful assistant",
            pathway: null,
            save: jest.fn(),
        };

        // Mock Prompt.find with populate to return prompts
        mockPromptPopulate.mockResolvedValue(mockPrompts);

        // Mock getLLMWithFallback to return the appropriate LLM for each prompt
        mockGetLLMWithFallback.mockImplementation((LLMModel, llmId) => {
            return Promise.resolve(mockLLMs[llmId] || mockLLMs.llm1);
        });

        // Mock putPathway
        putPathway.mockResolvedValue({
            _id: "pathway123",
            name: "Test Pathway",
        });
    });

    describe("publishWorkspace with cortexPathwayName", () => {
        test("should include cortexPathwayName for each prompt based on their LLM", async () => {
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
                _id: { $in: ["prompt1", "prompt2", "prompt3"] },
            });
            expect(mockPromptPopulate).toHaveBeenCalledWith("files");

            // Verify getLLMWithFallback was called for each prompt
            expect(mockGetLLMWithFallback).toHaveBeenCalledTimes(3);
            expect(mockGetLLMWithFallback).toHaveBeenCalledWith(LLM, "llm1");
            expect(mockGetLLMWithFallback).toHaveBeenCalledWith(LLM, "llm2");
            expect(mockGetLLMWithFallback).toHaveBeenCalledWith(LLM, "llm3");

            // Verify putPathway was called with correct data structure including cortexPathwayName
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
                            cortexPathwayName: "run_workspace_agent",
                        },
                        {
                            name: "Second Prompt",
                            prompt: "This is the second prompt text",
                            files: [],
                            cortexPathwayName: "run_workspace_prompt",
                        },
                        {
                            name: "Third Prompt",
                            prompt: "This is the third prompt text",
                            files: [],
                            cortexPathwayName: "run_workspace_agent",
                        },
                    ],
                    inputParameters: {},
                    model: model,
                    owner: "user123",
                },
                mockUser,
            );

            // Verify workspace was updated with the pathway
            expect(mockWorkspace.save).toHaveBeenCalled();
            expect(result).toEqual({
                _id: "pathway123",
                name: "Test Pathway",
            });
        });

        test("should handle prompts with file attachments", async () => {
            // Update one prompt to have files
            mockPrompts[0].files = [
                { hash: "file1hash" },
                { hash: "file2hash" },
            ];
            mockPromptPopulate.mockResolvedValue(mockPrompts);

            const pathwayName = "Test Pathway with Files";
            const model = "gpt-4";

            await publishWorkspace(mockWorkspace, mockUser, pathwayName, model);

            // Verify the prompt with files includes the file hashes
            expect(putPathway).toHaveBeenCalledWith(
                null,
                expect.objectContaining({
                    prompts: expect.arrayContaining([
                        expect.objectContaining({
                            name: "First Prompt",
                            prompt: "This is the first prompt text",
                            files: ["file1hash", "file2hash"],
                            cortexPathwayName: "run_workspace_agent",
                        }),
                    ]),
                }),
                mockUser,
            );
        });
    });

    describe("republishWorkspace with cortexPathwayName", () => {
        test("should include cortexPathwayName when republishing", async () => {
            // Set up workspace as already published
            const mockPathway = {
                _id: "pathway123",
                name: "Existing Pathway",
                model: "gpt-4",
                owner: "user123",
            };

            mockWorkspace.pathway = "pathway123";
            mockPathwayFindById.mockResolvedValue(mockPathway);
            mockUserFindById.mockResolvedValue(mockUser);

            await republishWorkspace(mockWorkspace);

            // Verify getLLMWithFallback was called for each prompt during republish
            expect(mockGetLLMWithFallback).toHaveBeenCalledTimes(3);

            // Verify putPathway was called with cortexPathwayName included
            expect(putPathway).toHaveBeenCalledWith(
                "pathway123",
                expect.objectContaining({
                    prompts: expect.arrayContaining([
                        expect.objectContaining({
                            cortexPathwayName: "run_workspace_agent",
                        }),
                        expect.objectContaining({
                            cortexPathwayName: "run_workspace_prompt",
                        }),
                        expect.objectContaining({
                            cortexPathwayName: "run_workspace_agent",
                        }),
                    ]),
                }),
                mockUser,
            );
        });
    });
});
