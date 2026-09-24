import {
    applyChatTaskStatusToActiveChats,
    CHAT_ATTENTION_QUERY_KEY,
    CHATS_LAST_VIEWED_STORAGE_KEY,
    clearChatNeedsAttention,
    getChatLastViewedAt,
    getChatNeedsAttention,
    getChatTaskNotificationStatus,
    markChatNeedsAttention,
    markChatViewed,
} from "../chatsUnread";

describe("chatsUnread", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("stores and reads per-chat last viewed timestamps", () => {
        markChatViewed("chat-a", "2026-08-04T12:00:00.000Z");
        expect(getChatLastViewedAt("chat-a")).toBe("2026-08-04T12:00:00.000Z");
        expect(getChatLastViewedAt("chat-b")).toBeNull();
        expect(
            JSON.parse(
                window.localStorage.getItem(CHATS_LAST_VIEWED_STORAGE_KEY),
            ),
        ).toEqual({ "chat-a": "2026-08-04T12:00:00.000Z" });
    });

    it("returns completed status when a task finished after last view", () => {
        expect(
            getChatTaskNotificationStatus(
                {
                    latestTaskStatus: "completed",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                },
                "2026-08-04T12:00:00.000Z",
            ),
        ).toBe("completed");
    });

    it("returns failed status for errors after last view", () => {
        expect(
            getChatTaskNotificationStatus(
                {
                    latestTaskStatus: "failed",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                },
                "2026-08-04T12:00:00.000Z",
            ),
        ).toBe("failed");
    });

    it("returns idle after the chat was viewed more recently", () => {
        expect(
            getChatTaskNotificationStatus(
                {
                    latestTaskStatus: "completed",
                    latestTaskAt: "2026-08-04T12:00:00.000Z",
                },
                "2026-08-04T13:00:00.000Z",
            ),
        ).toBe("idle");
    });

    it("returns idle while a completed chat is currently open", () => {
        expect(
            getChatTaskNotificationStatus(
                {
                    latestTaskStatus: "completed",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                },
                null,
                { isCurrentlyViewing: true },
            ),
        ).toBe("idle");
    });

    it("returns idle when there is no latest task", () => {
        expect(getChatTaskNotificationStatus({}, null)).toBe("idle");
        expect(getChatTaskNotificationStatus(null, null)).toBe("idle");
    });

    it("returns in_progress for running chat tasks regardless of last viewed", () => {
        expect(
            getChatTaskNotificationStatus(
                {
                    latestTaskStatus: "in_progress",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                },
                "2026-08-04T14:00:00.000Z",
            ),
        ).toBe("in_progress");
        expect(
            getChatTaskNotificationStatus(
                {
                    latestTaskStatus: "pending",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                },
                null,
            ),
        ).toBe("in_progress");
    });

    it("returns in_progress when the chat stream is loading", () => {
        expect(
            getChatTaskNotificationStatus(
                { isChatLoading: true },
                "2026-08-04T14:00:00.000Z",
            ),
        ).toBe("in_progress");
        expect(
            getChatTaskNotificationStatus({ isChatLoading: true }, null, {
                isCurrentlyViewing: true,
            }),
        ).toBe("in_progress");
    });

    it("returns completed when an assistant message arrived after last view", () => {
        expect(
            getChatTaskNotificationStatus(
                {
                    lastMessageAt: "2026-08-04T13:00:00.000Z",
                    lastMessageSender: "concierge",
                },
                "2026-08-04T12:00:00.000Z",
            ),
        ).toBe("completed");
    });

    it("stays idle for never-viewed chats with only message activity", () => {
        expect(
            getChatTaskNotificationStatus(
                {
                    lastMessageAt: "2026-08-04T13:00:00.000Z",
                    lastMessageSender: "concierge",
                },
                null,
            ),
        ).toBe("idle");
    });

    it("keeps in_progress while the chat is currently open", () => {
        expect(
            getChatTaskNotificationStatus(
                {
                    latestTaskStatus: "in_progress",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                },
                null,
                { isCurrentlyViewing: true },
            ),
        ).toBe("in_progress");
    });

    it("returns needs_attention when the chat is waiting on the user", () => {
        expect(
            getChatTaskNotificationStatus(
                {
                    latestTaskStatus: "in_progress",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                },
                "2026-08-04T12:00:00.000Z",
                { needsAttention: true },
            ),
        ).toBe("needs_attention");
        expect(
            getChatTaskNotificationStatus(
                {
                    latestTaskStatus: "completed",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                },
                "2026-08-04T12:00:00.000Z",
                { needsAttention: true, isCurrentlyViewing: true },
            ),
        ).toBe("idle");
    });

    it("tracks per-chat attention flags in the query cache", () => {
        const store = {};
        const queryClient = {
            setQueryData: (key, updater) => {
                const current = store[JSON.stringify(key)];
                store[JSON.stringify(key)] =
                    typeof updater === "function" ? updater(current) : updater;
            },
            getQueryData: (key) => store[JSON.stringify(key)],
        };

        expect(markChatNeedsAttention(queryClient, "chat-a")).toBe(true);
        expect(
            getChatNeedsAttention(
                queryClient.getQueryData(CHAT_ATTENTION_QUERY_KEY),
                "chat-a",
            ),
        ).toBe(true);
        expect(markChatNeedsAttention(queryClient, "chat-a")).toBe(false);
        expect(clearChatNeedsAttention(queryClient, "chat-a")).toBe(true);
        expect(
            getChatNeedsAttention(
                queryClient.getQueryData(CHAT_ATTENTION_QUERY_KEY),
                "chat-a",
            ),
        ).toBe(false);
    });

    it("patches activeChats when a chat-sourced task completes", () => {
        const queryClient = {
            setQueryData: jest.fn((key, updater) => {
                const next = updater([
                    { _id: "chat-a", title: "Chat A" },
                    { _id: "chat-b", title: "Chat B" },
                ]);
                expect(key).toEqual(["activeChats"]);
                expect(next[0]).toMatchObject({
                    latestTaskStatus: "completed",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                });
            }),
            invalidateQueries: jest.fn(),
        };

        expect(
            applyChatTaskStatusToActiveChats(queryClient, {
                status: "completed",
                updatedAt: "2026-08-04T13:00:00.000Z",
                invokedFrom: { source: "chat", chatId: "chat-a" },
            }),
        ).toBe(true);
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ["activeChats"],
        });
    });

    it("patches activeChats when a chat-sourced task is in progress", () => {
        const queryClient = {
            setQueryData: jest.fn((key, updater) => {
                const next = updater([{ _id: "chat-a", title: "Chat A" }]);
                expect(key).toEqual(["activeChats"]);
                expect(next[0]).toMatchObject({
                    latestTaskStatus: "in_progress",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                });
            }),
            invalidateQueries: jest.fn(),
        };

        expect(
            applyChatTaskStatusToActiveChats(queryClient, {
                status: "in_progress",
                updatedAt: "2026-08-04T13:00:00.000Z",
                invokedFrom: { source: "chat", chatId: "chat-a" },
            }),
        ).toBe(true);
    });

    it("patches activeChats for chat-linked tasks with non-chat sources", () => {
        const queryClient = {
            setQueryData: jest.fn((key, updater) => {
                const next = updater([{ _id: "chat-a", title: "Chat A" }]);
                expect(key).toEqual(["activeChats"]);
                expect(next[0]).toMatchObject({
                    latestTaskStatus: "completed",
                    latestTaskAt: "2026-08-04T13:00:00.000Z",
                });
            }),
            invalidateQueries: jest.fn(),
        };

        expect(
            applyChatTaskStatusToActiveChats(queryClient, {
                status: "completed",
                updatedAt: "2026-08-04T13:00:00.000Z",
                invokedFrom: {
                    source: "canvas_image_modify",
                    chatId: "chat-a",
                },
            }),
        ).toBe(true);
    });
});
