/**
 * @jest-environment node
 */

import { buildWorkspacePromptVariables } from "../llm-file-utils";

// Suppress console.error for expected errors in file handling
const originalError = console.error;
beforeAll(() => {
    console.error = jest.fn();
});

afterAll(() => {
    console.error = originalError;
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
                chatHistory: [],
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

    describe("edge cases", () => {
        it("should handle empty strings", async () => {
            const result = await buildWorkspacePromptVariables({
                systemPrompt: "",
                prompt: "",
                text: "",
            });

            expect(result.chatHistory).toEqual([]);
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

            expect(result.chatHistory).toEqual([]);
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
