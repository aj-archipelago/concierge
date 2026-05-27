/**
 * @jest-environment node
 */

import {
    buildFileAccessPlan,
    buildRunContext,
    buildWorkspacePromptVariables,
    determineFileContextId,
    determineFileRouting,
    extractBlobPathFromUrl,
    fetchShortLivedUrl,
    prepareFileContentForLLM,
} from "../llm-file-utils";
import {
    createUserGlobalStorageTarget,
    createWorkspacePrivateStorageTarget,
    createWorkspaceSharedStorageTarget,
} from "../../../../src/utils/storageTargets.js";

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
                contextId: "",
                contextKey: "",
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
                contextId: "",
                contextKey: "",
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
                contextId: "",
                contextKey: "",
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
                contextId: "",
                contextKey: "",
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
                userFiles: mockFiles,
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

        it("routes workspace shared files and request files through explicit targets", async () => {
            const originalFetch = global.fetch;
            global.fetch = jest
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        url: "https://example.com/shared.jpg",
                        shortLivedUrl: "https://example.com/shared-short",
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        url: "https://example.com/private.jpg",
                        shortLivedUrl: "https://example.com/private-short",
                    }),
                });

            try {
                const result = await buildWorkspacePromptVariables({
                    prompt: "Analyze these files",
                    sharedFiles: [
                        {
                            _id: "shared-file-1",
                            hash: "shared-hash",
                            url: "https://example.com/shared.jpg",
                        },
                    ],
                    userFiles: [
                        {
                            hash: "user-hash",
                            url: "https://example.com/private.jpg",
                        },
                    ],
                    workspaceId: "workspace123",
                    userContextId: "user456",
                });

                const userMessage = result.chatHistory.find(
                    (message) => message.role === "user",
                );
                const sharedEntry = JSON.parse(userMessage.content[1]);
                const userEntry = JSON.parse(userMessage.content[2]);

                expect(sharedEntry).toEqual(
                    expect.objectContaining({
                        url: "https://example.com/shared-short",
                        contextId: "workspace123",
                        fileScope: "workspace-shared-legacy",
                        workspaceId: "workspace123",
                    }),
                );
                expect(userEntry).toEqual(
                    expect.objectContaining({
                        url: "https://example.com/private-short",
                        contextId: "user456",
                        fileScope: "workspace-user-legacy",
                        userId: "user456",
                        workspaceId: "workspace123",
                    }),
                );
            } finally {
                global.fetch = originalFetch;
            }
        });

        it("should include files even when no text content", async () => {
            const mockFiles = [{ hash: "hash1", url: "url1" }];

            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                userFiles: mockFiles,
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
                userFiles: mockFiles,
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
                userFiles: mockFiles,
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
                userFiles: mockFiles,
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

    describe("fileAccessPlan and runContext", () => {
        it("should return fileAccessPlan with workspace write target and user files read target when workspaceId is provided", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                workspaceId: "workspace123",
                workspaceContextKey: "workspace-key",
                userContextId: "user456",
                userContextKey: "user-key",
            });

            expect(result.fileAccessPlan).toEqual([
                {
                    kind: "app-shared",
                    workspaceId: "workspace123",
                    contextKey: "workspace-key",
                    write: true,
                },
                {
                    kind: "user-files",
                    userContextId: "user456",
                    contextKey: "user-key",
                },
            ]);
            expect(result.contextId).toBe("workspace123");
            expect(result.contextKey).toBe("workspace-key");
        });

        it("should return user-global write target only when no narrower context exists", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                workspaceId: null,
                userContextId: "user456",
                userContextKey: "user-key",
            });

            expect(result.fileAccessPlan).toEqual([
                {
                    kind: "user-global",
                    userContextId: "user456",
                    contextKey: "user-key",
                    write: true,
                },
            ]);
            expect(result.contextId).toBe("user456");
            expect(result.contextKey).toBe("user-key");
        });

        it("should prefer current chat writes and include all user files for reads when chatId is provided", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                chatId: "chat789",
                userContextId: "user456",
                userContextKey: "user-key",
            });

            expect(result.fileAccessPlan).toEqual([
                {
                    kind: "chat",
                    userContextId: "user456",
                    chatId: "chat789",
                    contextKey: "user-key",
                    write: true,
                },
                {
                    kind: "user-files",
                    userContextId: "user456",
                    contextKey: "user-key",
                },
            ]);
        });

        it("should not return fileAccessPlan when no contextIds provided", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "Context",
                prompt: "Prompt",
                text: "Text",
                workspaceId: null,
                userContextId: null,
            });

            expect(result.fileAccessPlan).toBeUndefined();
            expect(result.contextId).toBe("");
            expect(result.contextKey).toBe("");
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
            });

            expect(result.fileAccessPlan).toEqual([
                {
                    kind: "app-shared",
                    workspaceId: "workspace123",
                    write: true,
                },
                {
                    kind: "user-files",
                    userContextId: "user456",
                },
            ]);
            expect(result.contextId).toBe("workspace123");
            expect(result.contextKey).toBe("");
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
                userFiles: null,
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
                userFiles: [],
            });

            const userMessage = result.chatHistory.find(
                (m) => m.role === "user",
            );
            expect(userMessage.content).toHaveLength(2); // prompt + text, no files
        });
    });
});

describe("buildFileAccessPlan", () => {
    it("should build workspace write target and user files read target when workspaceId is provided", () => {
        const result = buildFileAccessPlan({
            workspaceId: "workspace123",
            workspaceContextKey: "workspace-key",
            userContextId: "user456",
            userContextKey: "user-key",
        });

        expect(result).toEqual([
            {
                kind: "app-shared",
                workspaceId: "workspace123",
                contextKey: "workspace-key",
                write: true,
            },
            {
                kind: "user-files",
                userContextId: "user456",
                contextKey: "user-key",
            },
        ]);
    });

    it("should build workspace target only when no userContextId", () => {
        const result = buildFileAccessPlan({
            workspaceId: "workspace123",
            workspaceContextKey: "workspace-key",
            userContextId: null,
        });

        expect(result).toEqual([
            {
                kind: "app-shared",
                workspaceId: "workspace123",
                contextKey: "workspace-key",
                write: true,
            },
        ]);
    });

    it("should build user target only when no workspaceId", () => {
        const result = buildFileAccessPlan({
            workspaceId: null,
            userContextId: "user456",
            userContextKey: "user-key",
        });

        expect(result).toEqual([
            {
                kind: "user-global",
                userContextId: "user456",
                contextKey: "user-key",
                write: true,
            },
        ]);
    });

    it("should build chat write target and user files read target when chatId is provided", () => {
        const result = buildFileAccessPlan({
            chatId: "chat789",
            userContextId: "user456",
            userContextKey: "user-key",
        });

        expect(result).toEqual([
            {
                kind: "chat",
                userContextId: "user456",
                chatId: "chat789",
                contextKey: "user-key",
                write: true,
            },
            {
                kind: "user-files",
                userContextId: "user456",
                contextKey: "user-key",
            },
        ]);
    });

    it("should return empty array when no contextIds provided", () => {
        const result = buildFileAccessPlan({
            workspaceId: null,
            userContextId: null,
        });

        expect(result).toEqual([]);
    });

    it("should not build applet targets when applet userContextId is missing", () => {
        const result = buildFileAccessPlan({
            appletId: "applet-123",
            workspaceId: "workspace123",
            workspaceContextKey: "workspace-key",
            userContextId: null,
        });

        expect(result).toEqual([]);
    });

    it("should omit contextKeys when they are missing", () => {
        const result = buildFileAccessPlan({
            workspaceId: "workspace123",
            workspaceContextKey: null,
            userContextId: "user456",
            userContextKey: null,
        });

        expect(result).toEqual([
            {
                kind: "app-shared",
                workspaceId: "workspace123",
                write: true,
            },
            {
                kind: "user-files",
                userContextId: "user456",
            },
        ]);
    });
});

describe("buildRunContext", () => {
    it("should build workspace run context when workspaceId is provided", () => {
        const result = buildRunContext({
            workspaceId: "workspace123",
            workspaceContextKey: "workspace-key",
            userContextId: "user456",
            userContextKey: "user-key",
        });

        expect(result).toEqual({
            contextId: "workspace123",
            contextKey: "workspace-key",
        });
    });

    it("should build user run context when no workspaceId", () => {
        const result = buildRunContext({
            workspaceId: null,
            userContextId: "user456",
            userContextKey: "user-key",
        });

        expect(result).toEqual({
            contextId: "user456",
            contextKey: "user-key",
        });
    });

    it("should return empty run context when no contextIds provided", () => {
        const result = buildRunContext({
            workspaceId: null,
            userContextId: null,
        });

        expect(result).toEqual({
            contextId: "",
            contextKey: "",
        });
    });

    it("should return empty run context when applet userContextId is missing", () => {
        const result = buildRunContext({
            appletId: "applet-123",
            workspaceId: "workspace123",
            workspaceContextKey: "workspace-key",
            userContextId: null,
        });

        expect(result).toEqual({
            contextId: "",
            contextKey: "",
        });
    });

    it("should handle missing contextKeys with empty strings", () => {
        const result = buildRunContext({
            workspaceId: "workspace123",
            workspaceContextKey: null,
            userContextId: "user456",
            userContextKey: null,
        });

        expect(result).toEqual({
            contextId: "workspace123",
            contextKey: "",
        });
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

describe("determineFileRouting", () => {
    it("should return workspace-shared-legacy routing for artifacts with workspaceId", () => {
        const result = determineFileRouting({
            isArtifact: true,
            workspaceId: "workspace123",
            userId: "user123",
        });
        expect(result).toEqual({
            workspaceId: "workspace123",
            fileScope: "workspace-shared-legacy",
        });
    });

    it("should return chat routing when chatId is provided", () => {
        const result = determineFileRouting({
            isArtifact: false,
            workspaceId: null,
            userId: "user123",
            chatId: "chat456",
        });
        expect(result).toEqual({
            userId: "user123",
            chatId: "chat456",
            workspaceId: null,
            fileScope: "chat",
        });
    });

    it("should return applet routing when workspaceId is provided without chatId", () => {
        const result = determineFileRouting({
            isArtifact: false,
            workspaceId: "workspace123",
            userId: "user123",
        });
        expect(result).toEqual({
            userId: "user123",
            chatId: null,
            workspaceId: "workspace123",
            fileScope: "workspace-user-legacy",
        });
    });

    it("should return global routing when no chatId or workspaceId", () => {
        const result = determineFileRouting({
            isArtifact: false,
            userId: "user123",
        });
        expect(result).toEqual({
            userId: "user123",
            chatId: null,
            workspaceId: null,
            fileScope: "global",
        });
    });

    it("should fall back to user routing when artifact has no workspaceId", () => {
        const result = determineFileRouting({
            isArtifact: true,
            workspaceId: null,
            userId: "user123",
        });
        expect(result).toEqual({
            userId: "user123",
            chatId: null,
            workspaceId: null,
            fileScope: "global",
        });
    });

    it("should handle empty options", () => {
        const result = determineFileRouting({});
        expect(result).toEqual({
            userId: undefined,
            chatId: null,
            workspaceId: null,
            fileScope: "global",
        });
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

    it("should return shortLivedUrl and gcs from media-helper response", async () => {
        const mockShortLivedUrl =
            "https://example.com/short-lived-url?expires=300";
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/original-url",
                shortLivedUrl: mockShortLivedUrl,
                gcs: "gs://bucket/file.jpg",
                hash: "testhash",
            }),
        });

        const result = await fetchShortLivedUrl({
            hash: "testhash",
            contextId: "context123",
        });

        expect(result).toEqual({
            url: mockShortLivedUrl,
            gcs: "gs://bucket/file.jpg",
        });
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

    it("should prefer blobPath over hash when both provided", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/url",
                shortLivedUrl: "https://example.com/short",
            }),
        });

        await fetchShortLivedUrl({
            blobPath: "global/abc_file.pdf",
            hash: "testhash",
            contextId: "context123",
        });

        const fetchUrl = global.fetch.mock.calls[0][0];
        expect(fetchUrl).toContain("blobPath=");
        expect(fetchUrl).not.toContain("hash=testhash");
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should fall back to hash when blobPath lookup misses", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                text: async () => "Blob path not found",
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    url: "https://example.com/url",
                    shortLivedUrl: "https://example.com/short",
                    gcs: "gs://bucket/fallback.pdf",
                }),
            });

        const result = await fetchShortLivedUrl({
            blobPath: "global/abc_file.pdf",
            hash: "testhash",
            contextId: "context123",
        });

        expect(result).toEqual({
            url: "https://example.com/short",
            gcs: "gs://bucket/fallback.pdf",
        });
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[0][0]).toContain("blobPath=");
        expect(global.fetch.mock.calls[0][0]).not.toContain("hash=testhash");
        expect(global.fetch.mock.calls[1][0]).toContain("hash=testhash");
        expect(global.fetch.mock.calls[1][0]).toContain("checkHash=true");
    });

    it("should work with blobPath only (no hash)", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/url",
                shortLivedUrl: "https://example.com/short",
            }),
        });

        const result = await fetchShortLivedUrl({
            blobPath: "global/abc_file.pdf",
            contextId: "context123",
        });

        expect(result).toEqual({
            url: "https://example.com/short",
            gcs: null,
        });
        const fetchUrl = global.fetch.mock.calls[0][0];
        expect(fetchUrl).toContain("blobPath=");
        expect(fetchUrl).not.toContain("checkHash=");
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

        const result = await fetchShortLivedUrl({
            hash: "testhash",
            contextId: "context123",
        });

        expect(result).toEqual({ url: mockUrl, gcs: null });
    });

    it("should return null when media-helper URL is not configured", async () => {
        config.endpoints.mediaHelperDirect.mockReturnValue(null);

        const result = await fetchShortLivedUrl({
            hash: "testhash",
            contextId: "context123",
        });

        expect(result).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should return null when fetch fails", async () => {
        global.fetch.mockRejectedValue(new Error("Network error"));

        const result = await fetchShortLivedUrl({
            hash: "testhash",
            contextId: "context123",
        });

        expect(result).toBeNull();
    });

    it("should return null when response is not ok", async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => "Not found",
        });

        const result = await fetchShortLivedUrl({
            hash: "testhash",
            contextId: "context123",
        });

        expect(result).toBeNull();
    });

    it("should return null when response JSON parsing fails", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => {
                throw new Error("Invalid JSON");
            },
        });

        const result = await fetchShortLivedUrl({
            hash: "testhash",
            contextId: "context123",
        });

        expect(result).toBeNull();
    });

    it("should not include contextId in URL when contextId is null", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/url",
            }),
        });

        await fetchShortLivedUrl({ hash: "testhash" });

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

    it("should format files with a workspace-shared storage target", async () => {
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
                gcs: "gs://bucket/file1.jpg",
            }),
        });

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspaceSharedStorageTarget("workspace123"),
        });

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.type).toBe("image_url");
        expect(fileObj.url).toBe("https://example.com/short-lived-1");
        expect(fileObj.gcs).toBe("gs://bucket/file1.jpg");
        expect(fileObj.hash).toBe("hash1");
        expect(fileObj.contextId).toBe("workspace123");
    });

    it("should format files with a user-global storage target", async () => {
        const mockFiles = [
            {
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

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createUserGlobalStorageTarget("user123"),
        });

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
            },
        ];

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspaceSharedStorageTarget("workspace123"),
            fetchShortLivedUrls: false,
        });

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
            },
        ];

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspaceSharedStorageTarget("workspace123"),
        });

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
            },
        ];

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspaceSharedStorageTarget(null),
        });

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.url).toBe("https://example.com/file1.jpg");
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should use file URL and hash for short-lived URL fetch", async () => {
        const mockFiles = [
            {
                _id: "file123",
                hash: "file-hash",
                url: "https://example.com/original.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/original.jpg",
                shortLivedUrl: "https://example.com/short-lived-original",
                gcs: "gs://bucket/original.jpg",
            }),
        });

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspaceSharedStorageTarget("workspace123"),
        });

        expect(result).toHaveLength(1);
        const fileObj = JSON.parse(result[0]);
        expect(fileObj.url).toBe("https://example.com/short-lived-original");
        expect(fileObj.gcs).toBe("gs://bucket/original.jpg");
        expect(fileObj.hash).toBe("file-hash");
        // Should use hash for fetching short-lived URL
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("hash=file-hash"),
            expect.objectContaining({ cache: "no-store" }),
        );
    });

    it("should preserve blobPath and hash in Cortex file content", async () => {
        const mockFiles = [
            {
                _id: "file123",
                blobPath: "global/example-gemini.png",
                hash: "file-hash",
                url: "https://example.com/original.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/original.jpg",
                shortLivedUrl: "https://example.com/short-lived-original",
            }),
        });

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspaceSharedStorageTarget("workspace123"),
        });

        const fileObj = JSON.parse(result[0]);
        expect(fileObj.blobPath).toBe("global/example-gemini.png");
        expect(fileObj.hash).toBe("file-hash");
        expect(global.fetch.mock.calls[0][0]).toContain("blobPath=");
        expect(global.fetch.mock.calls[0][0]).not.toContain("hash=file-hash");
    });

    it("should handle multiple files with one explicit storage target", async () => {
        const mockFiles = [
            {
                hash: "hash1",
                url: "https://example.com/file1.jpg",
            },
            {
                hash: "hash2",
                url: "https://example.com/file2.jpg",
            },
        ];

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createUserGlobalStorageTarget("user123"),
            fetchShortLivedUrls: false,
        });

        expect(result).toHaveLength(2);
        const file1Obj = JSON.parse(result[0]);
        const file2Obj = JSON.parse(result[1]);
        expect(file1Obj.contextId).toBe("user123");
        expect(file2Obj.contextId).toBe("user123");
    });

    it("should fallback to original URL when short-lived URL fetch fails", async () => {
        const mockFiles = [
            {
                _id: "file123",
                hash: "hash1",
                url: "https://example.com/file1.jpg",
            },
        ];

        global.fetch.mockResolvedValue({
            ok: false,
            status: 404,
        });

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspaceSharedStorageTarget("workspace123"),
        });

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

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspaceSharedStorageTarget("workspace123"),
        });

        const fileObj = JSON.parse(result[0]);
        expect(fileObj.image_url).toEqual({
            url: "https://example.com/short-lived-1",
        });
    });

    it("should omit gcs when CFH response has no gcs", async () => {
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

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspaceSharedStorageTarget("workspace123"),
        });

        const fileObj = JSON.parse(result[0]);
        expect(fileObj.gcs).toBeUndefined();
    });

    it("should preserve mimeType for signed blob URLs", async () => {
        const mockFiles = [
            {
                hash: "hash1",
                mimeType: "text/csv",
                url: "https://customerstorage.blob.core.windows.net/container/concierge-production.users.csv?sv=2025-05-05&sig=abc123",
            },
        ];

        const result = await prepareFileContentForLLM(mockFiles, {
            storageTarget: createWorkspacePrivateStorageTarget(
                "user123",
                "workspace123",
            ),
            fetchShortLivedUrls: false,
        });

        const fileObj = JSON.parse(result[0]);
        expect(fileObj.mimeType).toBe("text/csv");
        expect(fileObj.image_url).toEqual({
            url: "https://customerstorage.blob.core.windows.net/container/concierge-production.users.csv?sv=2025-05-05&sig=abc123",
        });
    });
});

describe("extractBlobPathFromUrl", () => {
    it("should extract blob path from Azure blob URL", () => {
        const url =
            "https://customerstorage.blob.core.windows.net/container/global/abc123_myfile.pdf";
        expect(extractBlobPathFromUrl(url)).toBe("global/abc123_myfile.pdf");
    });

    it("should extract blob path from Azure URL with nested folders", () => {
        const url =
            "https://account.blob.core.windows.net/container/chats/chatId/abc123_myfile.pdf";
        expect(extractBlobPathFromUrl(url)).toBe(
            "chats/chatId/abc123_myfile.pdf",
        );
    });

    it("should extract blob path from Azurite URL (127.0.0.1)", () => {
        const url =
            "http://127.0.0.1:10000/devstoreaccount1/container/global/abc123_myfile.pdf";
        expect(extractBlobPathFromUrl(url)).toBe("global/abc123_myfile.pdf");
    });

    it("should extract blob path from Azurite URL (localhost)", () => {
        const url =
            "http://localhost:10000/devstoreaccount1/container/chats/chatId/file.txt";
        expect(extractBlobPathFromUrl(url)).toBe("chats/chatId/file.txt");
    });

    it("should decode URI-encoded segments", () => {
        const url =
            "https://account.blob.core.windows.net/container/global/abc123_my%20file.pdf";
        expect(extractBlobPathFromUrl(url)).toBe("global/abc123_my file.pdf");
    });

    it("should return null for URL with only container (no blob path)", () => {
        const url = "https://account.blob.core.windows.net/container";
        expect(extractBlobPathFromUrl(url)).toBeNull();
    });

    it("should return null for Azurite URL with only account and container", () => {
        const url = "http://127.0.0.1:10000/devstoreaccount1/container";
        expect(extractBlobPathFromUrl(url)).toBeNull();
    });

    it("should return null for invalid URL", () => {
        expect(extractBlobPathFromUrl("not-a-url")).toBeNull();
    });

    it("should return null for empty string", () => {
        expect(extractBlobPathFromUrl("")).toBeNull();
    });

    it("should handle SAS token in URL (query params are ignored)", () => {
        const url =
            "https://account.blob.core.windows.net/container/global/file.pdf?sv=2022-11-02&sig=abc";
        expect(extractBlobPathFromUrl(url)).toBe("global/file.pdf");
    });

    it("should handle single-segment blob path", () => {
        const url =
            "https://account.blob.core.windows.net/container/abc123_file.pdf";
        expect(extractBlobPathFromUrl(url)).toBe("abc123_file.pdf");
    });
});
