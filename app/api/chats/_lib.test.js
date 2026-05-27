/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../models/chat.mjs", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        updateOne: jest.fn(),
    },
}));

jest.mock("../models/user", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

import Chat from "../models/chat.mjs";
import { getCurrentUser } from "../utils/auth";
import {
    getChatById,
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
