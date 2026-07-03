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

import Chat from "../models/chat.mjs";
import { getCurrentUser } from "../utils/auth";
import { resolveShareAccess } from "../utils/shareAccess";
import {
    createNewChat,
    getChatById,
    getChatForOwnerWrite,
    getChatsOfCurrentUser,
    getRecentChatsOfCurrentUser,
    getTotalChatCount,
    prepareMessagesForPersistence,
    sanitizeMessagesForPersistence,
    sanitizeToolForPersistence,
} from "./_lib";

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

describe("prepareMessagesForPersistence", () => {
    const buildMessage = (index) => ({
        payload: `message-${index}:${"x".repeat(1000)}`,
        sender: index % 2 === 0 ? "user" : "assistant",
        sentTime: new Date(index).toISOString(),
        direction: index % 2 === 0 ? "outgoing" : "incoming",
        position: "single",
    });

    it("trims oldest messages with a FIFO window and records storage status", () => {
        const result = prepareMessagesForPersistence(
            Array.from({ length: 8 }, (_, index) => buildMessage(index)),
            { targetBytes: 2_500 },
        );

        expect(result.messagesCompacted).toBe(true);
        expect(result.messagesDropped).toBeGreaterThan(0);
        expect(result.messageStorageBytes).toBeLessThanOrEqual(2_500);
        expect(result.messages[0].payload).not.toContain("message-0:");
        expect(result.messages.at(-1).payload).toContain("message-7:");
    });

    it("does not insert a user-visible notice when compacting", () => {
        const result = prepareMessagesForPersistence(
            Array.from({ length: 8 }, (_, index) => buildMessage(index)),
            { targetBytes: 2_500 },
        );

        expect(
            result.messages.some((message) =>
                String(message.payload || "").includes(
                    "This chat is getting large",
                ),
            ),
        ).toBe(false);
        expect(
            result.messages.every((message) => !message.isServerGenerated),
        ).toBe(true);
    });

    it("keeps a single oversized newest message when it cannot compact further", () => {
        const result = prepareMessagesForPersistence(
            [
                buildMessage(0),
                { ...buildMessage(1), payload: "x".repeat(4_000) },
            ],
            { targetBytes: 2_500 },
        );

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].payload).toBe("x".repeat(4_000));
        expect(result.messagesCompacted).toBe(true);
        expect(result.messagesDropped).toBe(1);
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
            ]),
        });
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
            ]),
        });
    });

    it("loads sidebar recent chats in the same activity order as chat history", async () => {
        const activeChatId = "507f1f77bcf86cd799439012";
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
            activeChatId,
        });

        const findChain = {
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
        Chat.find.mockReturnValueOnce(findChain).mockReturnValueOnce({
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
        expect(findChain.sort).toHaveBeenCalledWith({ updatedAt: -1 });
        const query = Chat.find.mock.calls[0][0];
        expect(query).toMatchObject({
            userId: "507f1f77bcf86cd799439011",
            $or: expect.arrayContaining([{ _id: activeChatId }]),
        });
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
                messages: [],
                isPublic: false,
                isChatLoading: true,
                activeSubscriptionId: "sub_123",
                titleSetByUser: false,
                selectedEntityId: "",
                messageStorageBytes: 1_000,
                messagesCompacted: true,
                messagesCompactedAt: new Date("2026-04-28T00:00:00.000Z"),
                userId: "507f1f77bcf86cd799439011",
            }),
        });

        const result = await getChatById("507f1f77bcf86cd799439012");

        expect(result).toMatchObject({
            _id: "507f1f77bcf86cd799439012",
            isChatLoading: true,
            activeSubscriptionId: "sub_123",
            isShared: false,
            messageStorageBytes: 1_000,
            messagesCompacted: true,
            messagesCompactedAt: new Date("2026-04-28T00:00:00.000Z"),
        });
    });

    it("self-heals oversized chat metadata after tool data sanitization before returning storage status", async () => {
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

        Chat.findOne
            .mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue({
                    _id: "507f1f77bcf86cd799439012",
                    title: "Large chat",
                    messages: [storedMessage],
                    isPublic: false,
                    isChatLoading: false,
                    activeSubscriptionId: null,
                    titleSetByUser: false,
                    selectedEntityId: "",
                    messageStorageBytes: 1_800_000,
                    messagesCompacted: true,
                    messagesCompactedAt: new Date("2026-04-28T00:00:00.000Z"),
                    userId: "507f1f77bcf86cd799439011",
                }),
            })
            .mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue({
                    messages: [storedMessage],
                }),
            });
        Chat.updateOne.mockResolvedValue({ modifiedCount: 1 });

        const result = await getChatById("507f1f77bcf86cd799439012");

        expect(result.messageStorageBytes).toBeLessThan(1_800_000);
        expect(result.messagesCompacted).toBe(false);
        expect(JSON.parse(result.messages[0].tool)).toEqual({
            citations: [{ title: "Source" }],
        });
        expect(Chat.updateOne).toHaveBeenCalledWith(
            {
                _id: "507f1f77bcf86cd799439012",
                userId: "507f1f77bcf86cd799439011",
            },
            expect.objectContaining({
                $set: expect.objectContaining({
                    messagesCompacted: false,
                    messagesCompactedAt: null,
                    messages: [
                        expect.objectContaining({
                            tool: JSON.stringify({
                                citations: [{ title: "Source" }],
                            }),
                        }),
                    ],
                }),
            }),
        );
    });

    it("does not rewrite an already-normalized large chat that cannot be compacted below the warning threshold", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
        });

        const prepared = prepareMessagesForPersistence([
            {
                _id: "message-1",
                payload: "x".repeat(1_850_000),
                sender: "user",
                sentTime: "2026-04-28T00:00:00.000Z",
                direction: "outgoing",
                position: "single",
            },
        ]);
        expect(prepared.messageStorageBytes).toBeGreaterThanOrEqual(1_800_000);
        expect(prepared.messagesCompacted).toBe(false);

        Chat.findOne
            .mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue({
                    _id: "507f1f77bcf86cd799439012",
                    title: "Large chat",
                    messages: prepared.messages,
                    isPublic: false,
                    isChatLoading: false,
                    activeSubscriptionId: null,
                    titleSetByUser: false,
                    selectedEntityId: "",
                    messageStorageBytes: prepared.messageStorageBytes,
                    messagesCompacted: prepared.messagesCompacted,
                    messagesCompactedAt: null,
                    userId: "507f1f77bcf86cd799439011",
                }),
            })
            .mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue({
                    messages: prepared.messages,
                }),
            });

        const result = await getChatById("507f1f77bcf86cd799439012");

        expect(result.messageStorageBytes).toBe(prepared.messageStorageBytes);
        expect(result.messagesCompacted).toBe(false);
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
