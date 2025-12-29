/**
 * @jest-environment node
 */

import {
    buildAgentContext,
    buildWorkspacePromptVariables,
    createCompoundContextId,
    determineFileContextId,
    fetchShortLivedUrl,
    prepareFileContentForLLM,
} from "../llm-file-utils";

// Mock config
jest.mock("../../../../config", () => ({
    endpoints: {
        mediaHelperDirect: jest.fn(() => "http://media-helper.test"),
    },
}));

// Suppress console.error and console.warn for expected errors in file handling
const originalError = console.error;
const originalWarn = console.warn;
beforeAll(() => {
    console.error = jest.fn();
    console.warn = jest.fn();
});

afterAll(() => {
    console.error = originalError;
    console.warn = originalWarn;
});

describe("buildWorkspacePromptVariables", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Clear console.error mock calls
        if (console.error.mockClear) {
            console.error.mockClear();
        }
    });

    describe("without files", () => {
        it("should build chatHistory with system message and user message when all fields provided", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "You are a helpful assistant",
                prompt: "Analyze this data",
                text: "Here is the data: 123",
            });

            expect(result).toEqual({
                chatHistory: [
                    {
                        role: "system",
                        content: [
                            JSON.stringify({
                                type: "text",
                                text: "You are a helpful assistant",
                            }),
                        ],
                    },
                    {
                        role: "system",
                        content: [
                            JSON.stringify({
                                type: "text",
                                text: "Your output is being displayed in the user interface or used as an API response, not in an interactive chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
                            }),
                        ],
                    },
                    {
                        role: "user",
                        content: [
                            JSON.stringify({
                                type: "text",
                                text: "Analyze this data",
                            }),
                            JSON.stringify({
                                type: "text",
                                text: "\n\n--- USER INPUT ---\nHere is the data: 123\n--- END USER INPUT ---",
                            }),
                        ],
                    },
                ],
            });
        });

        it("should build chatHistory with only user message when no systemPrompt", async () => {
            const result = await buildWorkspacePromptVariables({
                prompt: "Analyze this data",
                text: "Here is the data: 123",
            });

            expect(result).toEqual({
                chatHistory: [
                    {
                        role: "system",
                        content: [
                            JSON.stringify({
                                type: "text",
                                text: "Your output is being displayed in the user interface or used as an API response, not in an interactive chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
                            }),
                        ],
                    },
                    {
                        role: "user",
                        content: [
                            JSON.stringify({
                                type: "text",
                                text: "Analyze this data",
                            }),
                            JSON.stringify({
                                type: "text",
                                text: "\n\n--- USER INPUT ---\nHere is the data: 123\n--- END USER INPUT ---",
                            }),
                        ],
                    },
                ],
            });
        });

        it("should build chatHistory with only system message when no prompt or text", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "You are a helpful assistant",
            });

            expect(result).toEqual({
                chatHistory: [
                    {
                        role: "system",
                        content: [
                            JSON.stringify({
                                type: "text",
                                text: "You are a helpful assistant",
                            }),
                        ],
                    },
                    {
                        role: "system",
                        content: [
                            JSON.stringify({
                                type: "text",
                                text: "Your output is being displayed in the user interface or used as an API response, not in an interactive chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
                            }),
                        ],
                    },
                ],
            });
        });

        it("should separate prompt and text correctly when both provided", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt text",
                text: "User input",
            });

            const userMessage = result.chatHistory.find(
                (m) => m.role === "user",
            );
            expect(userMessage.content[0]).toBe(
                JSON.stringify({
                    type: "text",
                    text: "Prompt text",
                }),
            );
            expect(userMessage.content[1]).toBe(
                JSON.stringify({
                    type: "text",
                    text: "\n\n--- USER INPUT ---\nUser input\n--- END USER INPUT ---",
                }),
            );
        });

        it("should handle only prompt (no text)", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Just a prompt",
            });

            const userMessage = result.chatHistory.find(
                (m) => m.role === "user",
            );
            expect(userMessage.content[0]).toBe(
                JSON.stringify({
                    type: "text",
                    text: "Just a prompt",
                }),
            );
        });

        it("should handle only text (no prompt)", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                text: "Just user input",
            });

            const userMessage = result.chatHistory.find(
                (m) => m.role === "user",
            );
            expect(userMessage.content[0]).toBe(
                JSON.stringify({
                    type: "text",
                    text: "Just user input",
                }),
            );
        });

        it("should return empty chatHistory when no inputs provided", async () => {
            const result = await buildWorkspacePromptVariables({});

            expect(result).toEqual({
                chatHistory: [
                    {
                        role: "system",
                        content: [
                            JSON.stringify({
                                type: "text",
                                text: "Your output is being displayed in the user interface or used as an API response, not in an interactive chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
                            }),
                        ],
                    },
                ],
            });
        });
    });

    describe("with files", () => {
        it("should include files in user message", async () => {
            const mockFiles = [
                { hash: "hash1", url: "url1", originalName: "file1.jpg" },
                { hash: "hash2", url: "url2", originalName: "file2.png" },
            ];

            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Analyze these images",
                text: "What do you see?",
                files: mockFiles,
            });

            const userMessage = result.chatHistory.find(
                (m) => m.role === "user",
            );
            expect(userMessage.content.length).toBe(4); // prompt + text + 2 files
            expect(userMessage.content[0]).toBe(
                JSON.stringify({
                    type: "text",
                    text: "Analyze these images",
                }),
            );
            expect(userMessage.content[1]).toBe(
                JSON.stringify({
                    type: "text",
                    text: "\n\n--- USER INPUT ---\nWhat do you see?\n--- END USER INPUT ---",
                }),
            );
            // Files will use fallback URLs when fetch fails (expected in tests)
            expect(userMessage.content[2]).toContain("image_url");
            expect(userMessage.content[3]).toContain("image_url");
        });

        it("should include files even when no text content", async () => {
            const mockFiles = [{ hash: "hash1", url: "url1" }];

            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                files: mockFiles,
            });

            const userMessage = result.chatHistory.find(
                (m) => m.role === "user",
            );
            expect(userMessage.content.length).toBe(1); // Just the file
            expect(userMessage.content[0]).toContain("image_url");
        });
    });

    describe("with provided chatHistory", () => {
        it("should use provided chatHistory and add files to last user message", async () => {
            const providedChatHistory = [
                {
                    role: "system",
                    content: [
                        JSON.stringify({
                            type: "text",
                            text: "Existing system message",
                        }),
                    ],
                },
                {
                    role: "user",
                    content: [
                        JSON.stringify({
                            type: "text",
                            text: "Previous message",
                        }),
                    ],
                },
                {
                    role: "assistant",
                    content: [
                        JSON.stringify({
                            type: "text",
                            text: "Previous response",
                        }),
                    ],
                },
                {
                    role: "user",
                    content: [
                        JSON.stringify({
                            type: "text",
                            text: "Latest message",
                        }),
                    ],
                },
            ];

            const mockFiles = [{ hash: "hash1", url: "url1" }];

            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Should be ignored",
                prompt: "Should be ignored",
                text: "Should be ignored",
                files: mockFiles,
                chatHistory: providedChatHistory,
            });

            // Should use provided chatHistory
            expect(result.chatHistory).toHaveLength(4);
            expect(result.chatHistory[0]).toEqual(providedChatHistory[0]);
            expect(result.chatHistory[1]).toEqual(providedChatHistory[1]);
            expect(result.chatHistory[2]).toEqual(providedChatHistory[2]);

            // Last user message should have files added
            const lastUserMessage = result.chatHistory[3];
            expect(lastUserMessage.role).toBe("user");
            expect(lastUserMessage.content.length).toBe(2); // original text + file
            expect(lastUserMessage.content[0]).toBe(
                JSON.stringify({
                    type: "text",
                    text: "Latest message",
                }),
            );
            expect(lastUserMessage.content[1]).toContain("image_url");
        });

        it("should handle provided chatHistory with string content (convert to array)", async () => {
            const providedChatHistory = [
                {
                    role: "user",
                    content: "Simple string content",
                },
            ];

            const mockFiles = [{ hash: "hash1", url: "url1" }];

            const result = await buildWorkspacePromptVariables({
                files: mockFiles,
                chatHistory: providedChatHistory,
            });

            const userMessage = result.chatHistory[0];
            expect(Array.isArray(userMessage.content)).toBe(true);
            expect(userMessage.content[0]).toBe(
                JSON.stringify({
                    type: "text",
                    text: "Simple string content",
                }),
            );
            expect(userMessage.content[1]).toContain("image_url");
        });

        it("should use provided chatHistory without modification when no files", async () => {
            const providedChatHistory = [
                {
                    role: "system",
                    content: [
                        JSON.stringify({
                            type: "text",
                            text: "System message",
                        }),
                    ],
                },
                {
                    role: "user",
                    content: [
                        JSON.stringify({
                            type: "text",
                            text: "User message",
                        }),
                    ],
                },
            ];

            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Should be ignored",
                prompt: "Should be ignored",
                text: "Should be ignored",
                chatHistory: providedChatHistory,
            });

            expect(result.chatHistory).toEqual(providedChatHistory);
        });

        it("should append new user message with files when chatHistory has no user messages", async () => {
            const providedChatHistory = [
                {
                    role: "system",
                    content: [
                        JSON.stringify({
                            type: "text",
                            text: "System message only",
                        }),
                    ],
                },
            ];

            const mockFiles = [{ hash: "hash1", url: "url1" }];

            const result = await buildWorkspacePromptVariables({
                files: mockFiles,
                chatHistory: providedChatHistory,
            });

            // Should preserve original chatHistory
            expect(result.chatHistory[0]).toEqual(providedChatHistory[0]);
            // Should append new user message with files
            expect(result.chatHistory).toHaveLength(2);
            const newUserMessage = result.chatHistory[1];
            expect(newUserMessage.role).toBe("user");
            expect(newUserMessage.content.length).toBe(1); // Just the file
            expect(newUserMessage.content[0]).toContain("image_url");
        });
    });

    describe("agentContext", () => {
        it("should return agentContext with workspace and compound contexts when both are provided", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                workspaceId: "workspace123",
                workspaceContextKey: "workspace-key",
                userContextId: "user456",
                userContextKey: "user-key",
                useCompoundContextId: true,
            });

            expect(result.agentContext).toHaveLength(2);
            // First context is workspace (default)
            expect(result.agentContext[0]).toEqual({
                contextId: "workspace123",
                contextKey: "workspace-key",
                default: true,
            });
            // Second context is compound (user files in workspace)
            expect(result.agentContext[1]).toEqual({
                contextId: "workspace123:user456",
                contextKey: "user-key",
                default: false,
            });
        });

        it("should return only workspace context when useCompoundContextId is false", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                workspaceId: "workspace123",
                workspaceContextKey: "workspace-key",
                userContextId: "user456",
                userContextKey: "user-key",
                useCompoundContextId: false,
            });

            expect(result.agentContext).toHaveLength(1);
            expect(result.agentContext[0]).toEqual({
                contextId: "workspace123",
                contextKey: "workspace-key",
                default: true,
            });
        });

        it("should return user context only when no workspaceId", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                workspaceId: null,
                userContextId: "user456",
                userContextKey: "user-key",
                useCompoundContextId: true,
            });

            expect(result.agentContext).toHaveLength(1);
            expect(result.agentContext[0]).toEqual({
                contextId: "user456",
                contextKey: "user-key",
                default: true,
            });
        });

        it("should not return agentContext when no contextIds provided", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                workspaceId: null,
                userContextId: null,
                useCompoundContextId: true,
            });

            expect(result.agentContext).toBeUndefined();
        });

        it("should handle missing contextKeys gracefully", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                workspaceId: "workspace123",
                workspaceContextKey: null,
                userContextId: "user456",
                userContextKey: null,
                useCompoundContextId: true,
            });

            expect(result.agentContext).toHaveLength(2);
            expect(result.agentContext[0].contextKey).toBe("");
            expect(result.agentContext[1].contextKey).toBe("");
        });

        it("should default useCompoundContextId to true", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                workspaceId: "workspace123",
                workspaceContextKey: "workspace-key",
                userContextId: "user456",
                userContextKey: "user-key",
            });

            // Should include both workspace and compound contexts
            expect(result.agentContext).toHaveLength(2);
        });
    });

    describe("edge cases", () => {
        it("should handle empty strings", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "",
                prompt: "",
                text: "",
            });

            expect(result.chatHistory).toEqual([
                {
                    role: "system",
                    content: [
                        JSON.stringify({
                            type: "text",
                            text: "Your output is being displayed in the user interface or used as an API response, not in an interactive chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
                        }),
                    ],
                },
            ]);
        });

        it("should handle whitespace-only strings", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "   ",
                prompt: "   ",
                text: "   ",
            });

            // Whitespace strings are not trimmed, so they will be included
            // System message with whitespace
            expect(result.chatHistory.length).toBeGreaterThan(0);
            const systemMessage = result.chatHistory.find(
                (m) => m.role === "system",
            );
            expect(systemMessage).toBeDefined();
        });

        it("should handle null/undefined values", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: null,
                prompt: undefined,
                text: null,
                files: null,
                chatHistory: undefined,
            });

            expect(result.chatHistory).toEqual([
                {
                    role: "system",
                    content: [
                        JSON.stringify({
                            type: "text",
                            text: "Your output is being displayed in the user interface or used as an API response, not in an interactive chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
                        }),
                    ],
                },
            ]);
        });

        it("should handle empty files array", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                files: [],
            });

            const userMessage = result.chatHistory.find(
                (m) => m.role === "user",
            );
            expect(userMessage.content).toHaveLength(2); // prompt + text, no files
        });
    });
});

describe("createCompoundContextId", () => {
    it("should create compound contextId from workspaceId and userContextId", () => {
        const result = createCompoundContextId("workspace123", "user456");
        expect(result).toBe("workspace123:user456");
    });

    it("should handle various ID formats", () => {
        expect(createCompoundContextId("abc-123", "xyz-789")).toBe(
            "abc-123:xyz-789",
        );
        expect(createCompoundContextId("workspaceId", "contextId")).toBe(
            "workspaceId:contextId",
        );
    });
});

describe("buildAgentContext", () => {
    it("should build workspace context with compound context when all params provided", () => {
        const result = buildAgentContext({
            workspaceId: "workspace123",
            workspaceContextKey: "workspace-key",
            userContextId: "user456",
            userContextKey: "user-key",
            includeCompoundContext: true,
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            contextId: "workspace123",
            contextKey: "workspace-key",
            default: true,
        });
        expect(result[1]).toEqual({
            contextId: "workspace123:user456",
            contextKey: "user-key",
            default: false,
        });
    });

    it("should build only workspace context when includeCompoundContext is false", () => {
        const result = buildAgentContext({
            workspaceId: "workspace123",
            workspaceContextKey: "workspace-key",
            userContextId: "user456",
            userContextKey: "user-key",
            includeCompoundContext: false,
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            contextId: "workspace123",
            contextKey: "workspace-key",
            default: true,
        });
    });

    it("should build user context only when no workspaceId", () => {
        const result = buildAgentContext({
            workspaceId: null,
            userContextId: "user456",
            userContextKey: "user-key",
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            contextId: "user456",
            contextKey: "user-key",
            default: true,
        });
    });

    it("should return empty array when no contextIds provided", () => {
        const result = buildAgentContext({
            workspaceId: null,
            userContextId: null,
        });

        expect(result).toEqual([]);
    });

    it("should handle missing contextKeys with empty strings", () => {
        const result = buildAgentContext({
            workspaceId: "workspace123",
            workspaceContextKey: null,
            userContextId: "user456",
            userContextKey: null,
            includeCompoundContext: true,
        });

        expect(result).toHaveLength(2);
        expect(result[0].contextKey).toBe("");
        expect(result[1].contextKey).toBe("");
    });

    it("should not include compound context when userContextId is missing", () => {
        const result = buildAgentContext({
            workspaceId: "workspace123",
            workspaceContextKey: "workspace-key",
            userContextId: null,
            includeCompoundContext: true,
        });

        expect(result).toHaveLength(1);
        expect(result[0].contextId).toBe("workspace123");
    });
});

describe("determineFileContextId", () => {
    it("should return workspaceId for artifacts when workspaceId is provided", () => {
        const result = determineFileContextId({
            isArtifact: true,
            workspaceId: "workspace123",
            userContextId: "user123",
        });
        expect(result).toBe("workspace123");
    });

    it("should return userContextId for non-artifacts when userContextId is provided", () => {
        const result = determineFileContextId({
            isArtifact: false,
            workspaceId: "workspace123",
            userContextId: "user123",
        });
        expect(result).toBe("user123");
    });

    it("should return compound contextId for non-artifacts when useCompoundContextId is true", () => {
        const result = determineFileContextId({
            isArtifact: false,
            workspaceId: "workspace123",
            userContextId: "user123",
            useCompoundContextId: true,
        });
        expect(result).toBe("workspace123:user123");
    });

    it("should return userContextId for non-artifacts when useCompoundContextId is true but workspaceId is missing", () => {
        const result = determineFileContextId({
            isArtifact: false,
            workspaceId: null,
            userContextId: "user123",
            useCompoundContextId: true,
        });
        expect(result).toBe("user123");
    });

    it("should return null for non-artifacts when useCompoundContextId is true but userContextId is missing", () => {
        const result = determineFileContextId({
            isArtifact: false,
            workspaceId: "workspace123",
            userContextId: null,
            useCompoundContextId: true,
        });
        expect(result).toBeNull();
    });

    it("should return workspaceId for artifacts even when useCompoundContextId is true", () => {
        const result = determineFileContextId({
            isArtifact: true,
            workspaceId: "workspace123",
            userContextId: "user123",
            useCompoundContextId: true,
        });
        expect(result).toBe("workspace123");
    });

    it("should return userContextId for artifacts when workspaceId is not provided", () => {
        // When workspaceId is not available, artifacts fall back to userContextId
        const result = determineFileContextId({
            isArtifact: true,
            workspaceId: null,
            userContextId: "user123",
        });
        expect(result).toBe("user123");
    });

    it("should return null for non-artifacts when userContextId is not provided", () => {
        const result = determineFileContextId({
            isArtifact: false,
            workspaceId: "workspace123",
            userContextId: null,
        });
        expect(result).toBeNull();
    });

    it("should return null when neither workspaceId nor userContextId is provided", () => {
        const result = determineFileContextId({
            isArtifact: false,
            workspaceId: null,
            userContextId: null,
        });
        expect(result).toBeNull();
    });

    it("should handle default parameters", () => {
        expect(determineFileContextId({})).toBeNull();
        expect(
            determineFileContextId({
                isArtifact: true,
                workspaceId: "workspace123",
            }),
        ).toBe("workspace123");
        expect(
            determineFileContextId({
                isArtifact: false,
                userContextId: "user123",
            }),
        ).toBe("user123");
    });
});

describe("fetchShortLivedUrl", () => {
    const originalFetch = global.fetch;
    const config = require("../../../../config");

    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
        // Reset config mock to return URL by default
        config.endpoints.mediaHelperDirect.mockReturnValue(
            "http://media-helper.test",
        );
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it("should return shortLivedUrl from media-helper response", async () => {
        const mockShortLivedUrl =
            "https://example.com/short-lived-url?expires=300";
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/original-url",
                shortLivedUrl: mockShortLivedUrl,
                hash: "testhash",
            }),
        });

        const result = await fetchShortLivedUrl("testhash", "context123");

        expect(result).toBe(mockShortLivedUrl);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("checkHash=true"),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("shortLived=true"),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("duration=300"),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("contextId=context123"),
        );
    });

    it("should fallback to url if shortLivedUrl is not in response", async () => {
        const mockUrl = "https://example.com/original-url";
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: mockUrl,
                hash: "testhash",
            }),
        });

        const result = await fetchShortLivedUrl("testhash", "context123");

        expect(result).toBe(mockUrl);
    });

    it("should return null when media-helper URL is not configured", async () => {
        config.endpoints.mediaHelperDirect.mockReturnValue(null);

        const result = await fetchShortLivedUrl("testhash", "context123");

        expect(result).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should return null when fetch fails", async () => {
        global.fetch.mockRejectedValue(new Error("Network error"));

        const result = await fetchShortLivedUrl("testhash", "context123");

        expect(result).toBeNull();
    });

    it("should return null when response is not ok", async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => "Not found",
        });

        const result = await fetchShortLivedUrl("testhash", "context123");

        expect(result).toBeNull();
    });

    it("should return null when response JSON parsing fails", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => {
                throw new Error("Invalid JSON");
            },
        });

        const result = await fetchShortLivedUrl("testhash", "context123");

        expect(result).toBeNull();
    });

    it("should not include contextId in URL when contextId is null", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/url",
            }),
        });

        await fetchShortLivedUrl("testhash", null);

        expect(global.fetch).toHaveBeenCalledWith(
            expect.not.stringContaining("contextId"),
        );
    });
});

describe("prepareFileContentForLLM", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it("should return empty array when files is empty", async () => {
        const result = await prepareFileContentForLLM([]);
        expect(result).toEqual([]);
    });

    it("should return empty array when files is null", async () => {
        const result = await prepareFileContentForLLM(null);
        expect(result).toEqual([]);
    });

    it("should format files with workspaceId for artifacts", async () => {
        const mockFiles = [
            {
                _id: "file123",
                hash: "hash1",
                url: "https://example.com/file1.jpg",
                gcsUrl: "gs://bucket/file1.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/file1.jpg",
                shortLivedUrl: "https://example.com/short-lived-1",
            }),
        });

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            null,
            true,
        );

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.type).toBe("image_url");
        expect(fileObj.url).toBe("https://example.com/short-lived-1");
        expect(fileObj.gcs).toBe("gs://bucket/file1.jpg");
        expect(fileObj.hash).toBe("hash1");
        expect(fileObj.contextId).toBe("workspace123");
    });

    it("should format files with userContextId for non-artifacts", async () => {
        const mockFiles = [
            {
                hash: "hash1",
                url: "https://example.com/file1.jpg",
                gcsUrl: "gs://bucket/file1.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/file1.jpg",
                shortLivedUrl: "https://example.com/short-lived-1",
            }),
        });

        const result = await prepareFileContentForLLM(
            mockFiles,
            null,
            "user123",
            true,
        );

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.contextId).toBe("user123");
    });

    it("should use original URL when fetchShortLivedUrls is false", async () => {
        const mockFiles = [
            {
                _id: "file123",
                hash: "hash1",
                url: "https://example.com/file1.jpg",
                gcsUrl: "gs://bucket/file1.jpg",
            },
        ];

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            null,
            false,
        );

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.url).toBe("https://example.com/file1.jpg");
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should use original URL when hash is missing", async () => {
        const mockFiles = [
            {
                _id: "file123",
                url: "https://example.com/file1.jpg",
                gcsUrl: "gs://bucket/file1.jpg",
            },
        ];

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            null,
            true,
        );

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.url).toBe("https://example.com/file1.jpg");
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should use original URL when contextId is missing", async () => {
        const mockFiles = [
            {
                _id: "file123",
                hash: "hash1",
                url: "https://example.com/file1.jpg",
                gcsUrl: "gs://bucket/file1.jpg",
            },
        ];

        const result = await prepareFileContentForLLM(
            mockFiles,
            null,
            null,
            true,
        );

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.url).toBe("https://example.com/file1.jpg");
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should use converted file URL and hash when available", async () => {
        const mockFiles = [
            {
                _id: "file123",
                hash: "original-hash",
                url: "https://example.com/original.jpg",
                converted: {
                    hash: "converted-hash",
                    url: "https://example.com/converted.jpg",
                    gcs: "gs://bucket/converted.jpg",
                },
            },
        ];

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/converted.jpg",
                shortLivedUrl: "https://example.com/short-lived-converted",
            }),
        });

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            null,
            true,
        );

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.url).toBe("https://example.com/short-lived-converted");
        expect(fileObj.gcs).toBe("gs://bucket/converted.jpg");
        expect(fileObj.hash).toBe("converted-hash");
        // Should use converted hash for fetching short-lived URL
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("hash=converted-hash"),
        );
    });

    it("should handle multiple files", async () => {
        const mockFiles = [
            {
                _id: "file1",
                hash: "hash1",
                url: "https://example.com/file1.jpg",
            },
            {
                hash: "hash2",
                url: "https://example.com/file2.jpg",
            },
        ];

        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    url: "https://example.com/file1.jpg",
                    shortLivedUrl: "https://example.com/short-lived-1",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    url: "https://example.com/file2.jpg",
                    shortLivedUrl: "https://example.com/short-lived-2",
                }),
            });

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            "user123",
            true,
        );

        expect(result).toHaveLength(2);
        const file1Obj = JSON.parse(result[0]);
        const file2Obj = JSON.parse(result[1]);
        expect(file1Obj.contextId).toBe("workspace123");
        expect(file2Obj.contextId).toBe("user123");
    });

    it("should use compound contextId for non-artifact files when useCompoundContextId is true", async () => {
        const mockFiles = [
            {
                // No _id, so it's a user file (non-artifact)
                hash: "hash1",
                url: "https://example.com/file1.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/file1.jpg",
                shortLivedUrl: "https://example.com/short-lived-1",
            }),
        });

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            "user123",
            true,
            true, // useCompoundContextId
        );

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.contextId).toBe("workspace123:user123");
    });

    it("should use workspaceId for artifact files even when useCompoundContextId is true", async () => {
        const mockFiles = [
            {
                _id: "file123", // Has _id, so it's an artifact
                hash: "hash1",
                url: "https://example.com/file1.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/file1.jpg",
                shortLivedUrl: "https://example.com/short-lived-1",
            }),
        });

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            "user123",
            true,
            true, // useCompoundContextId - but should not apply to artifacts
        );

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.contextId).toBe("workspace123"); // Artifact uses workspaceId
    });

    it("should handle mixed artifact and user files with useCompoundContextId", async () => {
        const mockFiles = [
            {
                _id: "file1", // Artifact
                hash: "hash1",
                url: "https://example.com/artifact.jpg",
            },
            {
                // User file (no _id)
                hash: "hash2",
                url: "https://example.com/userfile.jpg",
            },
        ];

        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    url: "https://example.com/artifact.jpg",
                    shortLivedUrl: "https://example.com/short-lived-1",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    url: "https://example.com/userfile.jpg",
                    shortLivedUrl: "https://example.com/short-lived-2",
                }),
            });

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            "user123",
            true,
            true, // useCompoundContextId
        );

        expect(result).toHaveLength(2);
        const file1Obj = JSON.parse(result[0]);
        const file2Obj = JSON.parse(result[1]);
        expect(file1Obj.contextId).toBe("workspace123"); // Artifact uses workspaceId
        expect(file2Obj.contextId).toBe("workspace123:user123"); // User file uses compound
    });

    it("should fallback to original URL when short-lived URL fetch fails", async () => {
        const mockFiles = [
            {
                _id: "file123",
                hash: "hash1",
                url: "https://example.com/file1.jpg",
                gcsUrl: "gs://bucket/file1.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: false,
            status: 404,
        });

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            null,
            true,
        );

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.url).toBe("https://example.com/file1.jpg");
    });

    it("should include image_url property", async () => {
        const mockFiles = [
            {
                _id: "file123",
                hash: "hash1",
                url: "https://example.com/file1.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/file1.jpg",
                shortLivedUrl: "https://example.com/short-lived-1",
            }),
        });

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            null,
            true,
        );

        const fileObj = JSON.parse(result[0]);
        expect(fileObj.image_url).toEqual({
            url: "https://example.com/short-lived-1",
        });
    });

    it("should handle files without gcsUrl", async () => {
        const mockFiles = [
            {
                _id: "file123",
                hash: "hash1",
                url: "https://example.com/file1.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/file1.jpg",
                shortLivedUrl: "https://example.com/short-lived-1",
            }),
        });

        const result = await prepareFileContentForLLM(
            mockFiles,
            "workspace123",
            null,
            true,
        );

        const fileObj = JSON.parse(result[0]);
        expect(fileObj.gcs).toBe("https://example.com/file1.jpg");
    });
});
