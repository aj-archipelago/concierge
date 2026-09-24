/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../models/chat.mjs", () => {
    const MockChat = jest.fn(function MockChat(data) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(this);
    });
    MockChat.findOne = jest.fn();
    MockChat.findOneAndUpdate = jest.fn();
    MockChat.find = jest.fn();
    MockChat.findById = jest.fn();
    MockChat.countDocuments = jest.fn();
    MockChat.updateOne = jest.fn();
    return {
        __esModule: true,
        default: MockChat,
    };
});

jest.mock("../models/task.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(() => ({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        })),
    },
}));

jest.mock("../models/user", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn(),
    },
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../utils/shareAccess", () => ({
    resolveShareAccess: jest.fn(
        async ({ ownerId, userId, legacyPublic, role }) => {
            const isOwner = String(ownerId) === String(userId);
            if (isOwner) {
                return { canAccess: true, isOwner: true, role: "editor" };
            }
            if (legacyPublic) {
                return { canAccess: true, isOwner: false, role: "viewer" };
            }
            return { canAccess: false, isOwner: false, role: null };
        },
    ),
}));

jest.mock("../models/share.js", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(() => ({
            lean: jest.fn(async () => null),
        })),
        find: jest.fn(() => ({
            lean: jest.fn(async () => []),
        })),
        findOneAndUpdate: jest.fn(async () => null),
    },
}));

jest.mock("./message-store.js", () => ({
    EXTERNAL_MESSAGE_STORAGE: "external",
    MESSAGE_SEARCH_BATCH_SIZE: 20,
    findChatsWithMatchingMessages: jest.fn(async () => new Set()),
    usesExternalMessageStorage: jest.fn(
        (chat) => chat?.messageStorageMode === "external",
    ),
    readChatMessages: jest.fn(
        async (chat, { limit, before, fromStart } = {}) => {
            const messages = Array.isArray(chat?.messages) ? chat.messages : [];
            if (fromStart) {
                return {
                    messages: messages.slice(0, limit),
                    hasMoreMessages: messages.length > limit,
                };
            }
            const beforeIndex = before
                ? messages.findIndex(
                      (message) => String(message?._id) === String(before),
                  )
                : messages.length;
            const end = beforeIndex >= 0 ? beforeIndex : messages.length;
            const start = limit ? Math.max(0, end - limit) : 0;
            return {
                messages: messages.slice(start, end),
                hasMoreMessages: start > 0,
            };
        },
    ),
    replaceChatMessages: jest.fn(async (chat, messages) => ({
        chat,
        messages,
    })),
}));

import Chat from "../models/chat.mjs";
import Task from "../models/task.mjs";
import { getCurrentUser } from "../utils/auth";
import { resolveShareAccess } from "../utils/shareAccess";
import {
    readChatMessages,
    findChatsWithMatchingMessages,
} from "./message-store.js";
import {
    attachLatestChatTaskStatus,
    createNewChat,
    getChatById,
    getChatForOwnerWrite,
    getChatsOfCurrentUser,
    getRecentChatsOfCurrentUser,
    getTotalChatCount,
    searchChatContent,
    prepareMessageForPersistence,
    sanitizeMessagesForPersistence,
    sanitizeToolForPersistence,
    sanitizeMessage,
} from "./_lib";

it("renders legacy server-generated inbox messages as assistant messages", () => {
    expect(
        sanitizeMessage({
            sender: "bot",
            isServerGenerated: true,
            entityId: "personal",
        }).sender,
    ).toBe("concierge");
    expect(sanitizeMessage({ sender: "user" }).sender).toBe("user");
});

describe("searchChatContent", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: "507f1f77bcf86cd799439011" });
    });

    it("projects owned chat generation and sequence boundaries before searching", async () => {
        const chat = {
            _id: "507f1f77bcf86cd799439012",
            messageStorageMode: "external",
            messageStorageGeneration: "507f1f77bcf86cd799439013",
            nextMessageSequence: 80,
        };
        Chat.find.mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([chat]),
        });
        findChatsWithMatchingMessages.mockImplementationOnce(
            async (_chats, matches) => {
                expect(matches({ payload: "find this external message" })).toBe(
                    true,
                );
                expect(matches({ payload: "only external" })).toBe(false);
                return new Set([chat._id]);
            },
        );
        expect(await searchChatContent("external message")).toEqual([chat]);
        expect(Chat.find).toHaveBeenCalledWith(
            { userId: "507f1f77bcf86cd799439011" },
            expect.objectContaining({
                messageStorageMode: 1,
                messageStorageGeneration: 1,
                nextMessageSequence: 1,
            }),
        );
        expect(findChatsWithMatchingMessages).toHaveBeenCalledWith(
            [chat],
            expect.any(Function),
            { limit: 50 },
        );
    });

    it("bounds each search batch and keeps database scans sequential", async () => {
        const chats = Array.from({ length: 24 }, (_, i) => ({
            _id: `chat-${i}`,
        }));
        Chat.find.mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(chats),
        });
        let active = 0,
            peak = 0;
        const scan = async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 1));
            active--;
            return new Set();
        };
        findChatsWithMatchingMessages
            .mockImplementationOnce(scan)
            .mockImplementationOnce(scan);
        await searchChatContent("not present", { scanLimit: 24 });
        expect(
            findChatsWithMatchingMessages.mock.calls.map(
                ([batch]) => batch.length,
            ),
        ).toEqual([20, 4]);
        expect(peak).toBe(1);
    });

    it("preserves header order and stops after reaching the result limit", async () => {
        const chats = Array.from({ length: 24 }, (_, i) => ({
            _id: `chat-${i}`,
        }));
        Chat.find.mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(chats),
        });
        findChatsWithMatchingMessages.mockResolvedValueOnce(
            new Set([chats[3]._id, chats[0]._id]),
        );
        expect(
            await searchChatContent("match", { limit: 1, scanLimit: 24 }),
        ).toEqual([chats[0]]);
        expect(findChatsWithMatchingMessages).toHaveBeenCalledTimes(1);
    });
});

describe("sanitizeToolForPersistence", () => {
    it("stores only citations and hideFromModel from tool metadata", () => {
        const sanitized = sanitizeToolForPersistence(
            JSON.stringify({
                citations: [
                    {
                        title: "Source title",
                        url: "https://example.com/story",
                        content: "Preview text",
                        path: "/story",
                        wireid: "wire-1",
                        source: "wire",
                        slugline: "slug",
                        date: "2026-04-28",
                        searchResultId: "result-1",
                        data: "large artifact",
                    },
                ],
                hideFromModel: true,
                artifacts: [{ data: "x".repeat(1000) }],
                result: { screenshot: { base64: "x".repeat(1000) } },
                toolArgs: { chatHistory: ["large"] },
                usage: { totalTokens: 123 },
            }),
        );

        expect(JSON.parse(sanitized)).toEqual({
            citations: [
                {
                    title: "Source title",
                    url: "https://example.com/story",
                    content: "Preview text",
                    path: "/story",
                    wireid: "wire-1",
                    source: "wire",
                    slugline: "slug",
                    date: "2026-04-28",
                    searchResultId: "result-1",
                },
            ],
            hideFromModel: true,
        });
    });

    it("caps citation content to a preview-sized string", () => {
        const sanitized = sanitizeToolForPersistence(
            JSON.stringify({
                citations: [
                    {
                        title: "Long source",
                        content: "a".repeat(20_000),
                    },
                ],
            }),
        );

        const citation = JSON.parse(sanitized).citations[0];
        expect(citation.content.length).toBeLessThan(13_000);
        expect(citation.content).toContain("Citation preview truncated");
    });

    it("drops tool metadata when no whitelisted fields are present", () => {
        expect(
            sanitizeToolForPersistence(
                JSON.stringify({
                    artifacts: [{ data: "x".repeat(1000) }],
                    result: { ok: true },
                }),
            ),
        ).toBeNull();
    });
});

describe("sanitizeMessagesForPersistence", () => {
    it("applies the tool whitelist to messages before persistence", () => {
        const [message] = sanitizeMessagesForPersistence([
            {
                payload: "hello",
                tool: JSON.stringify({
                    citations: [{ title: "Source" }],
                    artifacts: [{ data: "large" }],
                }),
            },
        ]);

        expect(JSON.parse(message.tool)).toEqual({
            citations: [{ title: "Source" }],
        });
    });

    it("normalizes Mongoose message documents before estimating storage size", () => {
        const message = {
            toObject: () => ({
                _id: "message-1",
                payload: "hello",
                sender: "user",
                sentTime: "2026-04-28T00:00:00.000Z",
                direction: "outgoing",
                position: "single",
                tool: JSON.stringify({
                    citations: [{ title: "Source" }],
                    artifacts: [{ data: "x".repeat(50_000) }],
                }),
                createdAt: "not persisted by helper",
                updatedAt: "not persisted by helper",
                $__: { cache: "x".repeat(50_000) },
                _doc: { cache: "x".repeat(50_000) },
            }),
        };

        const [sanitized] = sanitizeMessagesForPersistence([message]);

        expect(sanitized).toEqual({
            _id: "message-1",
            payload: "hello",
            sender: "user",
            sentTime: "2026-04-28T00:00:00.000Z",
            direction: "outgoing",
            position: "single",
            tool: JSON.stringify({ citations: [{ title: "Source" }] }),
        });
    });
});

describe("prepareMessageForPersistence", () => {
    const buildMessage = (payload) => ({
        payload,
        sender: "concierge",
        sentTime: new Date(0).toISOString(),
        direction: "incoming",
        position: "single",
    });

    it("leaves a normal message intact", () => {
        const result = prepareMessageForPersistence(buildMessage("hello"), {
            targetBytes: 2_500,
        });

        expect(result.message.payload).toBe("hello");
        expect(result.wasTruncated).toBe(false);
    });

    it("truncates only an oversized message with a visible explanation", () => {
        const result = prepareMessageForPersistence(
            buildMessage("x".repeat(4_000)),
            { targetBytes: 2_500 },
        );

        expect(result.message.payload.length).toBeLessThan(4_000);
        expect(result.message.payload).toContain("too large to save in full");
        expect(result.wasTruncated).toBe(true);
    });
});

describe("chat history visibility", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("marks explicitly titled empty chats as visible", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
        });

        await createNewChat(
            {
                messages: [],
                title: "Weather Applet",
            },
            { setActive: false },
        );

        expect(Chat).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "507f1f77bcf86cd799439011",
                messages: [],
                title: "Weather Applet",
                titleSetByUser: true,
            }),
        );
    });

    it("creates a fresh canonical New Chat for untitled empty new-chat requests", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
            recentChatIds: ["507f1f77bcf86cd799439013"],
        });
        const existingChat = {
            _id: "507f1f77bcf86cd799439012",
            userId: "507f1f77bcf86cd799439011",
            messages: [],
            title: "New Chat",
            titleSetByUser: false,
        };
        Chat.findOneAndUpdate.mockResolvedValue(existingChat);

        const result = await createNewChat(
            {
                messages: [],
                title: "",
            },
            { setActive: false },
        );

        expect(result).toBeInstanceOf(Chat);
        expect(result).not.toBe(existingChat);
        expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
        expect(Chat).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "507f1f77bcf86cd799439011",
                messages: [],
                title: "New Chat",
                titleSetByUser: false,
            }),
        );
    });

    it("creates a visible canonical New Chat when none exists", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
        });

        await createNewChat(
            {
                messages: [],
                title: "",
            },
            { setActive: false },
        );

        expect(Chat).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "507f1f77bcf86cd799439011",
                messages: [],
                title: "New Chat",
                titleSetByUser: false,
            }),
        );
        expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("lists content-bearing chats plus the active empty chat without using legacy unused flags", async () => {
        const activeChatId = "507f1f77bcf86cd799439012";
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
            activeChatId,
        });

        const findChain = {
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
                {
                    _id: activeChatId,
                    title: "",
                    updatedAt: "2026-06-08T00:00:00.000Z",
                    lastMessagePreview: "",
                    lastMessageSender: "",
                    lastMessageAt: "2026-06-08T00:00:00.000Z",
                },
            ]),
        };
        Chat.find.mockReturnValue(findChain);

        const result = await getChatsOfCurrentUser();

        expect(result).toHaveLength(1);
        const query = Chat.find.mock.calls[0][0];
        expect(query).toMatchObject({
            userId: "507f1f77bcf86cd799439011",
            $or: expect.arrayContaining([
                { _id: activeChatId },
                { "messages.0": { $exists: true } },
                { titleSetByUser: true },
                {
                    title: "New Chat",
                    titleSetByUser: { $ne: true },
                    "messages.0": { $exists: false },
                },
                { nextMessageSequence: { $gt: 0 } },
            ]),
        });
        expect(JSON.stringify(query)).not.toContain("lastMessagePreview");
    });

    it("counts the same visible chat set as the history list", async () => {
        const activeChatId = "507f1f77bcf86cd799439012";
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
            activeChatId,
        });
        Chat.countDocuments.mockResolvedValue(3);

        await expect(getTotalChatCount()).resolves.toBe(3);

        const query = Chat.countDocuments.mock.calls[0][0];
        expect(query).toMatchObject({
            userId: "507f1f77bcf86cd799439011",
            $or: expect.arrayContaining([
                { _id: activeChatId },
                { "messages.0": { $exists: true } },
                { nextMessageSequence: { $gt: 0 } },
            ]),
        });
        expect(JSON.stringify(query)).not.toContain("lastMessagePreview");
    });

    it("loads sidebar recent chats in the same activity order as chat history", async () => {
        const activeChatId = "507f1f77bcf86cd799439012";
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
            activeChatId,
        });

        const recentFindChain = {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
                {
                    _id: activeChatId,
                    title: "Newest",
                    updatedAt: "2026-06-08T00:00:00.000Z",
                },
            ]),
        };
        const pinnedFindChain = {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        };
        Chat.find
            .mockReturnValueOnce(recentFindChain)
            .mockReturnValueOnce(pinnedFindChain)
            .mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue([
                    {
                        _id: activeChatId,
                        messages: [
                            {
                                payload: "Newest message",
                                sender: "user",
                            },
                        ],
                    },
                ]),
            });

        const result = await getRecentChatsOfCurrentUser();

        expect(result.map((chat) => String(chat._id))).toEqual([activeChatId]);
        expect(recentFindChain.sort).toHaveBeenCalledWith({ updatedAt: -1 });
        expect(pinnedFindChain.sort).toHaveBeenCalledWith({ updatedAt: -1 });
        const query = Chat.find.mock.calls[0][0];
        expect(query).toMatchObject({
            userId: "507f1f77bcf86cd799439011",
            archived: { $ne: true },
            $or: expect.arrayContaining([{ _id: activeChatId }]),
        });
        // Second query loads pinned chats without requiring a composite index.
        expect(Chat.find.mock.calls[1][0]).toMatchObject({
            userId: "507f1f77bcf86cd799439011",
            pinned: true,
            archived: { $ne: true },
        });
    });

    it("attaches the latest completed or failed chat task status", async () => {
        const chats = [
            { _id: "507f1f77bcf86cd799439012", title: "Chat A" },
            { _id: "507f1f77bcf86cd799439013", title: "Chat B" },
        ];
        const activeSort = jest.fn().mockReturnThis();
        const terminalSort = jest.fn().mockReturnThis();
        // Active-task query first.
        Task.find.mockReturnValueOnce({
            sort: activeSort,
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        });
        // Terminal-task query second.
        Task.find.mockReturnValueOnce({
            sort: terminalSort,
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
                {
                    status: "failed",
                    updatedAt: "2026-08-04T13:00:00.000Z",
                    invokedFrom: {
                        source: "chat",
                        chatId: "507f1f77bcf86cd799439012",
                    },
                },
                {
                    status: "completed",
                    updatedAt: "2026-08-04T12:00:00.000Z",
                    invokedFrom: {
                        source: "chat",
                        chatId: "507f1f77bcf86cd799439012",
                    },
                },
                {
                    status: "completed",
                    updatedAt: "2026-08-04T11:30:00.000Z",
                    invokedFrom: {
                        source: "automation",
                        chatId: "507f1f77bcf86cd799439012",
                    },
                },
                {
                    status: "completed",
                    updatedAt: "2026-08-04T11:00:00.000Z",
                    invokedFrom: {
                        source: "chat",
                        chatId: "507f1f77bcf86cd799439013",
                    },
                },
            ]),
        });

        await attachLatestChatTaskStatus(chats, "507f1f77bcf86cd799439011");

        expect(Task.find).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: "507f1f77bcf86cd799439011",
                status: { $in: ["pending", "in_progress"] },
            }),
            expect.any(Object),
        );
        expect(Task.find).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: "507f1f77bcf86cd799439011",
                status: { $in: ["completed", "failed"] },
                createdAt: expect.objectContaining({ $gte: expect.any(Date) }),
            }),
            expect.any(Object),
        );
        expect(activeSort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(terminalSort).toHaveBeenCalledWith({ createdAt: -1 });
        // Nested invokedFrom filters are not used (Cosmos/CSFLE-safe).
        expect(Task.find.mock.calls[0][0]).not.toHaveProperty(
            "invokedFrom.source",
        );
        expect(Task.find.mock.calls[0][0]).not.toHaveProperty(
            "invokedFrom.chatId",
        );

        expect(chats[0]).toMatchObject({
            latestTaskStatus: "failed",
            latestTaskAt: "2026-08-04T13:00:00.000Z",
        });
        expect(chats[1]).toMatchObject({
            latestTaskStatus: "completed",
            latestTaskAt: "2026-08-04T11:00:00.000Z",
        });
    });

    it("attaches tasks linked by chatId even when source is not chat", async () => {
        const chats = [{ _id: "507f1f77bcf86cd799439012", title: "Chat A" }];
        Task.find.mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        });
        Task.find.mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
                {
                    status: "completed",
                    updatedAt: "2026-08-04T14:00:00.000Z",
                    invokedFrom: {
                        source: "canvas_image_modify",
                        chatId: "507f1f77bcf86cd799439012",
                    },
                },
            ]),
        });

        await attachLatestChatTaskStatus(chats, "507f1f77bcf86cd799439011");

        expect(chats[0]).toMatchObject({
            latestTaskStatus: "completed",
            latestTaskAt: "2026-08-04T14:00:00.000Z",
        });
    });

    it("prefers an in-progress chat task over a terminal one", async () => {
        const chats = [{ _id: "507f1f77bcf86cd799439012", title: "Chat A" }];
        Task.find.mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
                {
                    status: "in_progress",
                    updatedAt: "2026-08-04T12:00:00.000Z",
                    invokedFrom: {
                        source: "chat",
                        chatId: "507f1f77bcf86cd799439012",
                    },
                },
            ]),
        });
        Task.find.mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
                {
                    status: "completed",
                    updatedAt: "2026-08-04T13:00:00.000Z",
                    invokedFrom: {
                        source: "chat",
                        chatId: "507f1f77bcf86cd799439012",
                    },
                },
            ]),
        });

        await attachLatestChatTaskStatus(chats, "507f1f77bcf86cd799439011");

        expect(chats[0]).toMatchObject({
            latestTaskStatus: "in_progress",
            latestTaskAt: "2026-08-04T12:00:00.000Z",
        });
    });

    it("leaves chats unchanged when the task query fails", async () => {
        const chats = [{ _id: "507f1f77bcf86cd799439012", title: "Chat A" }];
        Task.find.mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockRejectedValue(new Error("cosmos order-by")),
        });

        await expect(
            attachLatestChatTaskStatus(chats, "507f1f77bcf86cd799439011"),
        ).resolves.toEqual(chats);
        expect(chats[0].latestTaskStatus).toBeUndefined();
    });
});

describe("getChatById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns activeSubscriptionId for in-flight chats", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
        });

        Chat.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                title: "Streaming chat",
                createdAt: "2026-09-12T12:00:00.000Z",
                messages: [],
                isPublic: false,
                isChatLoading: true,
                activeSubscriptionId: "sub_123",
                titleSetByUser: false,
                selectedEntityId: "",
                userId: "507f1f77bcf86cd799439011",
            }),
        });

        const result = await getChatById("507f1f77bcf86cd799439012");

        expect(result).toMatchObject({
            _id: "507f1f77bcf86cd799439012",
            isChatLoading: true,
            activeSubscriptionId: "sub_123",
            isShared: false,
            createdAt: "2026-09-12T12:00:00.000Z",
        });
        expect(Chat.findOne.mock.calls[0][1].createdAt).toBe(1);
    });

    it("bounds the initial legacy message projection", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
        });
        Chat.findOne.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                title: "Legacy chat",
                messages: [],
                userId: "507f1f77bcf86cd799439011",
            }),
        });

        await getChatById("507f1f77bcf86cd799439012", { limit: 30 });

        expect(Chat.findOne.mock.calls[0][1].messages).toEqual({ $slice: -31 });
    });

    it("sanitizes tool data from a legacy embedded chat without rewriting it", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
        });

        const largeTool = JSON.stringify({
            citations: [{ title: "Source" }],
            artifacts: [{ data: "x".repeat(100_000) }],
            toolArgs: { chatHistory: ["x".repeat(100_000)] },
        });
        const storedMessage = {
            _id: "message-1",
            payload: "hello",
            sender: "user",
            tool: largeTool,
            sentTime: "2026-04-28T00:00:00.000Z",
            direction: "outgoing",
            position: "single",
        };

        Chat.findOne.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                title: "Large chat",
                messages: [storedMessage],
                isPublic: false,
                isChatLoading: false,
                activeSubscriptionId: null,
                titleSetByUser: false,
                selectedEntityId: "",
                userId: "507f1f77bcf86cd799439011",
            }),
        });

        const result = await getChatById("507f1f77bcf86cd799439012");

        expect(JSON.parse(result.messages[0].tool)).toEqual({
            citations: [{ title: "Source" }],
        });
        expect(Chat.updateOne).not.toHaveBeenCalled();
    });

    it("does not rewrite a legacy embedded chat while reading it", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
        });

        const messages = [
            {
                _id: "message-1",
                payload: "hello",
                sender: "user",
                sentTime: "2026-04-28T00:00:00.000Z",
                direction: "outgoing",
                position: "single",
            },
        ];

        Chat.findOne.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                title: "Small chat",
                messages,
                isPublic: false,
                isChatLoading: false,
                activeSubscriptionId: null,
                titleSetByUser: false,
                selectedEntityId: "",
                userId: "507f1f77bcf86cd799439011",
            }),
        });

        const result = await getChatById("507f1f77bcf86cd799439012");

        expect(result.messages).toHaveLength(1);
        expect(Chat.updateOne).not.toHaveBeenCalled();
    });
});

describe("getChatForOwnerWrite", () => {
    const chatId = "507f1f77bcf86cd799439012";
    const ownerId = "507f1f77bcf86cd799439011";
    const collaboratorId = "507f1f77bcf86cd799439013";

    beforeEach(() => {
        resolveShareAccess.mockReset();
    });

    it("returns chat for owner", async () => {
        const chatDoc = { _id: chatId, userId: ownerId, isPublic: false };
        Chat.findById.mockResolvedValue(chatDoc);
        resolveShareAccess.mockResolvedValue({
            canAccess: true,
            isOwner: true,
            role: "editor",
        });

        const result = await getChatForOwnerWrite(chatId, ownerId);

        expect(result.ok).toBe(true);
        expect(result.chat).toBe(chatDoc);
        expect(result.access.isOwner).toBe(true);
    });

    it("rejects shared recipients", async () => {
        const chatDoc = { _id: chatId, userId: ownerId, isPublic: false };
        Chat.findById.mockResolvedValue(chatDoc);
        resolveShareAccess.mockResolvedValue({
            canAccess: true,
            isOwner: false,
            role: "editor",
        });

        const result = await getChatForOwnerWrite(chatId, collaboratorId);

        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
    });

    it("rejects shared viewers", async () => {
        const chatDoc = { _id: chatId, userId: ownerId, isPublic: false };
        Chat.findById.mockResolvedValue(chatDoc);
        resolveShareAccess.mockResolvedValue({
            canAccess: true,
            isOwner: false,
            role: "viewer",
        });

        const result = await getChatForOwnerWrite(chatId, collaboratorId);

        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
    });

    it("returns 404 when user has no access", async () => {
        const chatDoc = { _id: chatId, userId: ownerId, isPublic: false };
        Chat.findById.mockResolvedValue(chatDoc);
        resolveShareAccess.mockResolvedValue({
            canAccess: false,
            isOwner: false,
            role: null,
        });

        const result = await getChatForOwnerWrite(chatId, collaboratorId);

        expect(result.ok).toBe(false);
        expect(result.status).toBe(404);
    });
});
