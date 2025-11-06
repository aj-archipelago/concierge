import { QueryClient } from "@tanstack/react-query";
import { findEmptyChat } from "../chats";

describe("findEmptyChat", () => {
    let queryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });
    });

    afterEach(() => {
        queryClient.clear();
    });

    describe("only checks the latest (first) chat", () => {
        it("should return null if first chat has messages, even if later chats are empty", () => {
            const activeChats = [
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "Chat with messages",
                    messages: [{ content: "Hello" }],
                },
                {
                    _id: "507f1f77bcf86cd799439012",
                    title: "",
                    // This is empty but won't be checked
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });

        it("should return first chat if it's empty, ignoring later chats", () => {
            const emptyChat = {
                _id: "507f1f77bcf86cd799439011",
                title: "",
            };

            const activeChats = [
                emptyChat,
                {
                    _id: "507f1f77bcf86cd799439012",
                    title: "Chat with messages",
                    messages: [{ content: "Hello" }],
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toEqual(emptyChat);
            expect(result._id).toBe("507f1f77bcf86cd799439011");
        });
    });

    describe("when empty chat exists in individual chat cache", () => {
        it("should find empty chat with no messages array in individual cache", () => {
            const emptyChatInCache = {
                _id: "507f1f77bcf86cd799439011",
                title: "",
                messages: [],
            };

            const activeChats = [
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "",
                },
                {
                    _id: "507f1f77bcf86cd799439012",
                    title: "Chat with messages",
                    firstMessage: "Hello",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);
            queryClient.setQueryData(
                ["chat", "507f1f77bcf86cd799439011"],
                emptyChatInCache,
            );

            const result = findEmptyChat(queryClient);

            // Function returns the chat from activeChats, not individual cache
            expect(result).toEqual(activeChats[0]);
            expect(result._id).toBe("507f1f77bcf86cd799439011");
        });

        it("should find empty chat with undefined messages in individual cache", () => {
            const emptyChatInCache = {
                _id: "507f1f77bcf86cd799439011",
                title: "",
            };

            const activeChats = [
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);
            queryClient.setQueryData(
                ["chat", "507f1f77bcf86cd799439011"],
                emptyChatInCache,
            );

            const result = findEmptyChat(queryClient);

            // Function returns the chat from activeChats
            expect(result).toEqual(activeChats[0]);
        });

        it("should prioritize individual cache over activeChats data for checking emptiness", () => {
            // activeChats might have stale data showing firstMessage
            const activeChats = [
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "",
                    firstMessage: "Stale message",
                },
            ];

            // But individual cache has accurate empty state
            const individualChat = {
                _id: "507f1f77bcf86cd799439011",
                title: "",
                messages: [],
            };

            queryClient.setQueryData(["activeChats"], activeChats);
            queryClient.setQueryData(
                ["chat", "507f1f77bcf86cd799439011"],
                individualChat,
            );

            const result = findEmptyChat(queryClient);

            // Function returns chat from activeChats, but uses individual cache to determine emptiness
            expect(result).toEqual(activeChats[0]);
            expect(result._id).toBe("507f1f77bcf86cd799439011");
            // Individual cache check correctly identifies it as empty despite stale firstMessage in activeChats
        });
    });

    describe("when empty chat exists only in activeChats (fallback)", () => {
        it("should find empty chat with no messages and no firstMessage", () => {
            const emptyChat = {
                _id: "507f1f77bcf86cd799439011",
                title: "",
            };

            const activeChats = [
                emptyChat,
                {
                    _id: "507f1f77bcf86cd799439012",
                    title: "Chat with messages",
                    firstMessage: "Hello",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toEqual(emptyChat);
        });

        it("should find empty chat with empty messages array and no firstMessage", () => {
            const emptyChat = {
                _id: "507f1f77bcf86cd799439011",
                title: "",
                messages: [],
            };

            const activeChats = [emptyChat];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toEqual(emptyChat);
        });
    });

    describe("when no empty chat exists", () => {
        it("should return null when first chat has messages", () => {
            const activeChats = [
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "Chat 1",
                    messages: [{ content: "Hello" }],
                },
                {
                    _id: "507f1f77bcf86cd799439012",
                    title: "Chat 2",
                    firstMessage: "Hi there",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });

        it("should return null when activeChats is empty", () => {
            queryClient.setQueryData(["activeChats"], []);

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });

        it("should return null when activeChats is undefined", () => {
            // Don't set activeChats at all
            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });
    });

    describe("when chat has messages", () => {
        it("should not find chat with messages in individual cache", () => {
            const chatWithMessages = {
                _id: "507f1f77bcf86cd799439011",
                title: "Chat",
                messages: [{ content: "Hello" }],
            };

            const activeChats = [chatWithMessages];

            queryClient.setQueryData(["activeChats"], activeChats);
            queryClient.setQueryData(
                ["chat", "507f1f77bcf86cd799439011"],
                chatWithMessages,
            );

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });

        it("should not find chat with firstMessage in activeChats", () => {
            const activeChats = [
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "Chat",
                    firstMessage: "Hello",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });

        it("should not find chat with both messages and firstMessage", () => {
            const activeChats = [
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "Chat",
                    messages: [{ content: "Hello" }],
                    firstMessage: "Hello",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });
    });

    describe("when filtering invalid chats", () => {
        it("should return null if first chat has invalid ObjectId", () => {
            const activeChats = [
                {
                    _id: "invalid-id",
                    title: "",
                },
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });

        it("should return null if first chat is null", () => {
            const activeChats = [
                null,
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });

        it("should return null if first chat has no _id", () => {
            const activeChats = [
                {
                    title: "",
                },
                {
                    _id: "507f1f77bcf86cd799439012",
                    title: "",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });

        it("should return null if first chat has short ObjectId", () => {
            const activeChats = [
                {
                    _id: "123",
                    title: "",
                },
                {
                    _id: "507f1f77bcf86cd799439011",
                    title: "",
                },
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toBeNull();
        });
    });

    describe("when multiple empty chats exist", () => {
        it("should return the first chat if it's empty", () => {
            const emptyChat1 = {
                _id: "507f1f77bcf86cd799439011",
                title: "Empty 1",
            };
            const emptyChat2 = {
                _id: "507f1f77bcf86cd799439012",
                title: "Empty 2",
            };

            const activeChats = [emptyChat1, emptyChat2];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toEqual(emptyChat1);
            expect(result._id).toBe("507f1f77bcf86cd799439011");
        });

        it("should only check first chat and return it if empty", () => {
            const emptyChat1 = {
                _id: "507f1f77bcf86cd799439011",
                title: "Empty 1",
            };
            const emptyChat2 = {
                _id: "507f1f77bcf86cd799439012",
                title: "Empty 2",
                messages: [],
            };

            const activeChats = [emptyChat1, emptyChat2];

            queryClient.setQueryData(["activeChats"], activeChats);
            queryClient.setQueryData(
                ["chat", "507f1f77bcf86cd799439012"],
                emptyChat2,
            );

            const result = findEmptyChat(queryClient);

            // Only checks first chat, doesn't look at second
            expect(result).toEqual(emptyChat1);
        });
    });

    describe("edge cases", () => {
        it("should handle chat with messages array containing empty objects", () => {
            const chatWithEmptyMessages = {
                _id: "507f1f77bcf86cd799439011",
                title: "",
                messages: [{}],
            };

            const activeChats = [chatWithEmptyMessages];

            queryClient.setQueryData(["activeChats"], activeChats);
            queryClient.setQueryData(
                ["chat", "507f1f77bcf86cd799439011"],
                chatWithEmptyMessages,
            );

            const result = findEmptyChat(queryClient);

            // Should not find it because messages.length > 0
            expect(result).toBeNull();
        });

        it("should return null if first chat has messages, even if later chats are empty", () => {
            const chatWithMessages = {
                _id: "507f1f77bcf86cd799439012",
                title: "Chat",
                messages: [{ content: "Hello" }],
            };
            const emptyChat = {
                _id: "507f1f77bcf86cd799439011",
                title: "",
            };
            const chatWithFirstMessage = {
                _id: "507f1f77bcf86cd799439013",
                title: "Chat 2",
                firstMessage: "Hi",
            };

            const activeChats = [
                chatWithMessages,
                emptyChat,
                chatWithFirstMessage,
            ];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            // Only checks first chat, which has messages, so returns null
            expect(result).toBeNull();
        });

        it("should handle ObjectId with uppercase letters", () => {
            const emptyChat = {
                _id: "507F1F77BCF86CD799439011",
                title: "",
            };

            const activeChats = [emptyChat];

            queryClient.setQueryData(["activeChats"], activeChats);

            const result = findEmptyChat(queryClient);

            expect(result).toEqual(emptyChat);
        });
    });
});
