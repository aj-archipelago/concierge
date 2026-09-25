/**
 * @jest-environment node
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Chat from "../models/chat.mjs";
import ChatMessage from "../models/chat-message.mjs";
import {
    appendChatMessage,
    findChatsWithMatchingMessages,
    ensureExternalMessageStorage,
    readChatMessages,
    replaceChatMessages,
    updateChatMessageByTaskId,
} from "./message-store.js";

const buildMessage = (payload, sentTime) => ({
    payload,
    sender: "user",
    sentTime,
    direction: "outgoing",
    position: "single",
});

describe("chat message store", () => {
    let mongoServer;
    let userId;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create({
            instance: { ip: "127.0.0.1" },
        });
        await mongoose.connect(mongoServer.getUri());
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        userId = new Types.ObjectId();
        await Promise.all([Chat.deleteMany({}), ChatMessage.deleteMany({})]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("retries a partially copied history after Cosmos throttling without duplicating messages", async () => {
        const chat = await Chat.create({
            userId,
            messages: [
                buildMessage("first", "2026-01-01T00:00:00.000Z"),
                buildMessage("second", "2026-01-01T00:00:01.000Z"),
            ],
        });
        const original = chat.messages.map((message) => message.toObject());
        const bulkWrite = ChatMessage.bulkWrite.bind(ChatMessage);
        const copy = jest
            .spyOn(ChatMessage, "bulkWrite")
            .mockImplementationOnce(async (operations, options) => {
                await bulkWrite(operations.slice(0, 1), options);
                expect((await Chat.findById(chat._id)).messages).toHaveLength(
                    2,
                );
                throw Object.assign(new Error("RetryAfterMs=1"), {
                    code: 16500,
                });
            });

        const promoted = await ensureExternalMessageStorage(chat);
        expect(copy).toHaveBeenCalledTimes(2);
        expect((await readChatMessages(promoted)).messages).toEqual(original);
        expect(await ChatMessage.countDocuments({ chatId: chat._id })).toBe(2);
    });

    it("searches recent messages across owned headers in one query and excludes old generations", async () => {
        const create = async (payloads) =>
            ensureExternalMessageStorage(
                await Chat.create({
                    userId,
                    messages: payloads.map((payload) =>
                        buildMessage(payload, "2026-01-01T00:00:00Z"),
                    ),
                }),
            );
        const oldHit = await create(["needle old", "neutral", "neutral"]);
        const hit = await create(["neutral", "needle current"]);
        const replaced = await create(["needle replaced"]);
        await replaceChatMessages(replaced, [
            buildMessage("replacement neutral", "2026-01-01T00:00:00Z"),
        ]);
        await create(["needle outside owned headers"]);
        const headers = [
            oldHit,
            hit,
            await Chat.findOne({ _id: replaced._id }).lean(),
        ];
        const find = jest.spyOn(ChatMessage, "find");
        const matches = await findChatsWithMatchingMessages(
            headers,
            (message) => message.payload.includes("needle"),
            { limit: 2 },
        );
        expect([...matches]).toEqual([String(hit._id)]);
        expect(find).toHaveBeenCalledTimes(1);
    });

    it("discards partial search results before retrying a throttled cursor", async () => {
        const chat = await ensureExternalMessageStorage(
            await Chat.create({
                userId,
                messages: [buildMessage("neutral", "2026-01-01T00:00:00Z")],
            }),
        );
        jest.spyOn(ChatMessage, "find").mockImplementationOnce(() => ({
            select() {
                return this;
            },
            lean() {
                return this;
            },
            cursor() {
                return (async function* () {
                    yield {
                        chatId: chat._id,
                        message: { payload: "needle transient" },
                    };
                    throw Object.assign(new Error("RetryAfterMs=1"), {
                        code: 16500,
                    });
                })();
            },
        }));
        const matches = await findChatsWithMatchingMessages([chat], (message) =>
            message.payload.includes("needle"),
        );
        expect(matches.size).toBe(0);
    });

    it("searches past sequence gaps and still includes embedded histories", async () => {
        const chat = await ensureExternalMessageStorage(
            await Chat.create({
                userId,
                messages: [
                    "needle oldest",
                    "removed",
                    "removed",
                    "neutral",
                ].map((payload) =>
                    buildMessage(payload, "2026-01-01T00:00:00Z"),
                ),
            }),
        );
        await ChatMessage.deleteMany({
            chatId: chat._id,
            sequence: { $in: [2, 3] },
        });
        const embedded = await Chat.create({
            userId,
            messages: [buildMessage("needle embedded", "2026-01-01T00:00:00Z")],
        });
        const matches = await findChatsWithMatchingMessages(
            [chat, embedded],
            (message) => message.payload.includes("needle"),
            { limit: 2 },
        );
        expect([...matches].sort()).toEqual(
            [String(chat._id), String(embedded._id)].sort(),
        );
    });

    it("keeps promoted history when the commit succeeds but its acknowledgement is lost", async () => {
        const chat = await Chat.create({
            userId,
            messages: [
                buildMessage("irreplaceable", "2026-01-01T00:00:00.000Z"),
            ],
        });
        const update = Chat.findOneAndUpdate.bind(Chat);
        jest.spyOn(Chat, "findOneAndUpdate").mockImplementationOnce(
            async (...args) => {
                await update(...args);
                throw new Error(
                    "Connection closed after server committed promotion",
                );
            },
        );

        await expect(ensureExternalMessageStorage(chat)).rejects.toThrow(
            "Connection closed",
        );

        const stored = await Chat.findOne({ _id: chat._id }).lean();
        expect(
            (await readChatMessages(stored)).messages.map(
                (message) => message.payload,
            ),
        ).toEqual(["irreplaceable"]);
    });

    it("copies existing message payloads, tool metadata and timestamps without rewriting them", async () => {
        const chat = await Chat.create({
            userId,
            messages: [
                {
                    ...buildMessage(
                        "existing content",
                        "2026-01-01T00:00:00.000Z",
                    ),
                    tool: JSON.stringify({
                        citations: [
                            {
                                content: "x".repeat(13_000),
                                title: "saved citation",
                            },
                        ],
                        savedMetadata: "keep",
                    }),
                },
            ],
        });
        const original = chat.messages[0].toObject();

        await ensureExternalMessageStorage(chat);

        const stored = await Chat.findOne({ _id: chat._id }).lean();
        const { messages } = await readChatMessages(stored);
        expect(messages[0]).toEqual(original);
    });

    it("keeps the embedded source when copy verification fails", async () => {
        const chat = await Chat.create({
            userId,
            messages: [buildMessage("original", "2026-01-01T00:00:00.000Z")],
        });
        const write = ChatMessage.bulkWrite.bind(ChatMessage);
        jest.spyOn(ChatMessage, "bulkWrite").mockImplementationOnce(
            async (...args) => {
                const result = await write(...args);
                await ChatMessage.updateOne(
                    { chatId: chat._id },
                    { $set: { "message.payload": "unexpected change" } },
                );
                return result;
            },
        );

        await expect(ensureExternalMessageStorage(chat)).rejects.toThrow(
            "did not match its source",
        );

        const stored = await Chat.findOne({ _id: chat._id }).lean();
        expect(stored.messageStorageMode).toBeNull();
        expect(stored.messages[0].payload).toBe("original");
    });

    it("reads a legacy embedded chat without migrating it", async () => {
        const chat = await Chat.create({
            userId,
            messages: [
                buildMessage("first", "2026-01-01T00:00:00.000Z"),
                buildMessage("second", "2026-01-01T00:00:01.000Z"),
            ],
        });

        const page = await readChatMessages(chat, { limit: 1 });

        expect(page.messages.map((message) => message.payload)).toEqual([
            "second",
        ]);
        expect(page.hasMoreMessages).toBe(true);
        expect(await ChatMessage.countDocuments()).toBe(0);
    });

    it("atomically promotes a legacy chat before appending", async () => {
        const chat = await Chat.create({
            userId,
            messages: [buildMessage("first", "2026-01-01T00:00:00.000Z")],
        });

        await appendChatMessage(
            chat,
            buildMessage("second", "2026-01-01T00:00:01.000Z"),
            { dedupeKey: "client-message-2" },
        );

        const storedChat = await Chat.findOne({ _id: chat._id }).lean();
        const page = await readChatMessages(storedChat);
        expect(storedChat.messageStorageMode).toBe("external");
        expect(storedChat.messages).toBeUndefined();
        expect(page.messages.map((message) => message.payload)).toEqual([
            "first",
            "second",
        ]);
    });

    it("deduplicates retried appends without rewriting history", async () => {
        const chat = await Chat.create({
            userId,
            messages: [],
            messageStorageMode: "external",
            messageStorageGeneration: new Types.ObjectId(),
        });
        const message = buildMessage("once", "2026-01-01T00:00:00.000Z");

        await appendChatMessage(chat, message, { dedupeKey: "request-1" });
        await appendChatMessage(chat, message, { dedupeKey: "request-1" });

        expect(await ChatMessage.countDocuments({ chatId: chat._id })).toBe(1);
    });

    it("preserves concurrent appends while promoting legacy history once", async () => {
        const chat = await Chat.create({
            userId,
            messages: [buildMessage("first", "2026-01-01T00:00:00.000Z")],
        });

        await Promise.all([
            appendChatMessage(
                chat,
                buildMessage("second", "2026-01-01T00:00:01.000Z"),
                { dedupeKey: "second" },
            ),
            appendChatMessage(
                chat,
                buildMessage("third", "2026-01-01T00:00:02.000Z"),
                { dedupeKey: "third" },
            ),
        ]);

        const storedChat = await Chat.findOne({ _id: chat._id }).lean();
        const page = await readChatMessages(storedChat);
        expect(page.messages[0].payload).toBe("first");
        expect(
            page.messages.slice(1).map((message) => message.payload),
        ).toEqual(expect.arrayContaining(["second", "third"]));
        expect(await ChatMessage.countDocuments({ chatId: chat._id })).toBe(3);
    });

    it("paginates external history using the oldest visible message", async () => {
        const chat = await Chat.create({
            userId,
            messages: [],
            messageStorageMode: "external",
            messageStorageGeneration: new Types.ObjectId(),
        });
        for (const [index, payload] of ["first", "second", "third"].entries()) {
            await appendChatMessage(
                chat,
                buildMessage(payload, `2026-01-01T00:00:0${index}.000Z`),
            );
        }

        const storedChat = await Chat.findOne({ _id: chat._id }).lean();
        const latest = await readChatMessages(storedChat, { limit: 2 });
        const older = await readChatMessages(storedChat, {
            limit: 2,
            before: latest.messages[0]._id,
        });

        expect(latest.messages.map((message) => message.payload)).toEqual([
            "second",
            "third",
        ]);
        expect(latest.hasMoreMessages).toBe(true);
        expect(older.messages.map((message) => message.payload)).toEqual([
            "first",
        ]);
        expect(older.hasMoreMessages).toBe(false);
    });

    it("does not read or delete a committed append when the preview write confirms its generation", async () => {
        const chat = await Chat.create({
            userId,
            messages: [],
            messageStorageMode: "external",
            messageStorageGeneration: new Types.ObjectId(),
        });
        const staleRead = jest.spyOn(Chat, "exists").mockResolvedValue(null);
        await appendChatMessage(
            chat,
            buildMessage("kept", "2026-01-01T00:00:00Z"),
        );
        expect(staleRead).not.toHaveBeenCalled();
        expect(await ChatMessage.countDocuments({ chatId: chat._id })).toBe(1);
    });

    it("switches replacement history as a new generation", async () => {
        const chat = await Chat.create({
            userId,
            messages: [
                buildMessage("first", "2026-01-01T00:00:00.000Z"),
                buildMessage("old branch", "2026-01-01T00:00:01.000Z"),
            ],
        });
        await appendChatMessage(
            chat,
            buildMessage("promote", "2026-01-01T00:00:02.000Z"),
        );
        const externalChat = await Chat.findOne({ _id: chat._id });
        const previousGeneration = externalChat.messageStorageGeneration;

        await replaceChatMessages(externalChat, [
            buildMessage("first", "2026-01-01T00:00:00.000Z"),
        ]);

        const storedChat = await Chat.findOne({ _id: chat._id }).lean();
        const page = await readChatMessages(storedChat);
        expect(page.messages.map((message) => message.payload)).toEqual([
            "first",
        ]);
        expect(
            await ChatMessage.countDocuments({
                chatId: chat._id,
                generationId: storedChat.messageStorageGeneration,
            }),
        ).toBe(1);
        expect(
            await ChatMessage.countDocuments({
                chatId: chat._id,
                generationId: previousGeneration,
            }),
        ).toBe(3);
        expect((await readChatMessages(externalChat)).messages).toHaveLength(3);
    });

    it("updates task snapshots through top-level lookup metadata", async () => {
        const taskId = new Types.ObjectId();
        const chat = await Chat.create({
            userId,
            messages: [],
            messageStorageMode: "external",
            messageStorageGeneration: new Types.ObjectId(),
        });
        await appendChatMessage(chat, {
            ...buildMessage("working", "2026-01-01T00:00:00.000Z"),
            taskId,
        });

        await updateChatMessageByTaskId(chat, taskId, {
            _id: taskId,
            owner: userId,
            type: "chat",
            status: "completed",
        });

        const stored = await ChatMessage.findOne({ chatId: chat._id }).lean();
        expect(stored.taskId).toEqual(taskId);
        expect(stored.message.task).toMatchObject({ status: "completed" });
    });

    it("truncates only a single oversized message with a visible notice", async () => {
        const chat = await Chat.create({
            userId,
            messages: [buildMessage("kept", "2026-01-01T00:00:00.000Z")],
        });

        await appendChatMessage(
            chat,
            buildMessage("x".repeat(1_500_000), "2026-01-01T00:00:01.000Z"),
        );

        const storedChat = await Chat.findOne({ _id: chat._id }).lean();
        const page = await readChatMessages(storedChat);
        expect(page.messages).toHaveLength(2);
        expect(page.messages[0].payload).toBe("kept");
        expect(page.messages[1].payload).toContain("too large to save in full");
    });
});
