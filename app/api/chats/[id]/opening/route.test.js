/** @jest-environment node */
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Chat from "../../../models/chat.mjs";
import ChatMessage from "../../../models/chat-message.mjs";
import { appendChatMessage, readChatMessages } from "../../message-store.js";
import { getChatForOwnerWrite } from "../../_lib";
import { getCurrentUser } from "../../../utils/auth";
import { requireColleague } from "../../../utils/colleagues.js";
import { getClient } from "../../../../../src/graphql";
import { POST } from "./route";

jest.mock("../../_lib", () => ({ getChatForOwnerWrite: jest.fn() }));
jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
    handleError: (error) =>
        Response.json({ error: error.message }, { status: 500 }),
}));
jest.mock("../../../utils/colleagues.js", () => ({
    requireColleague: jest.fn(),
}));
jest.mock("../../../../../src/graphql", () => ({
    getClient: jest.fn(),
    QUERIES: { SYS_ENTITY_AGENT: "agent" },
}));
jest.mock("../../../utils/agent-tool-capabilities.mjs", () => ({
    issueAgentToolsToken: async () => "test-token",
}));
jest.mock("../../../utils/mcp-agent-config", () => ({
    buildMcpAgentConfigForUser: async () => ({}),
}));
jest.mock("../../../../../config", () => ({
    __esModule: true,
    default: { cortex: { defaultChatModel: "fallback" } },
}));

describe("idle conversation opening", () => {
    let mongo;
    let chat;
    let query;
    const token = "test-opening-token-1234";
    const call = (action = "prepare", options = {}) =>
        POST(
            new Request("http://localhost/api/chats/test/opening", {
                method: "POST",
                body: JSON.stringify({
                    action,
                    token,
                    entityId: "colleague-editor",
                    language: "ar",
                    ...options,
                }),
            }),
            { params: Promise.resolve({ id: String(chat._id) }) },
        );
    const messages = async () =>
        (await readChatMessages(await Chat.findById(chat._id))).messages;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create({
            instance: { ip: "127.0.0.1" },
        });
        await mongoose.connect(mongo.getUri());
    });
    afterAll(async () => {
        await mongoose.disconnect();
        await mongo.stop();
    });
    beforeEach(async () => {
        jest.clearAllMocks();
        await Promise.all([Chat.deleteMany({}), ChatMessage.deleteMany({})]);
        const userId = new Types.ObjectId();
        chat = await Chat.create({
            userId,
            messages: [],
            selectedEntityId: "colleague-editor",
            messageStorageMode: "external",
            messageStorageGeneration: new Types.ObjectId(),
        });
        getCurrentUser.mockResolvedValue({
            _id: userId,
            personalEntityId: "personal",
            agentModel: "user-default",
            contextId: "test-context",
        });
        getChatForOwnerWrite.mockImplementation(async () => ({
            ok: true,
            chat: await Chat.findById(chat._id),
        }));
        requireColleague.mockResolvedValue({
            id: "colleague-editor",
            name: "Editor",
            model: "editor-model",
            reasoningEffort: "medium",
        });
        query = jest.fn(async () => ({
            data: {
                sys_entity_agent: { result: "What are we working on today?" },
            },
        }));
        getClient.mockReturnValue({ query });
    });

    it("generates as the selected entity and publishes only after an idle commit", async () => {
        expect(await (await call()).json()).toEqual({ ready: true });
        const variables = query.mock.calls[0][0].variables;
        expect(variables).toMatchObject({
            entityId: "colleague-editor",
            model: "editor-model",
            reasoningEffort: "medium",
            aiName: "Editor",
            aiMemorySelfModify: false,
        });
        expect(
            variables.chatHistory.every((message) => message.role === "system"),
        ).toBe(true);
        expect(JSON.parse(variables.userInfo).language).toBe("ar");
        expect(await messages()).toEqual([]);
        const pendingChat = await Chat.findById(chat._id);
        expect(pendingChat.conversationOpening).toBeUndefined();
        expect(pendingChat.lastMessagePreview).toBe("");
        const staged = await ChatMessage.findOne({ chatId: chat._id });
        expect(String(staged.generationId)).not.toBe(
            String(chat.messageStorageGeneration),
        );
        expect(await (await call("commit")).json()).toEqual({
            committed: true,
        });
        expect(await messages()).toEqual([
            expect.objectContaining({
                sender: "concierge",
                entityId: "colleague-editor",
                payload: "What are we working on today?",
            }),
        ]);
        expect(await ChatMessage.countDocuments({ chatId: chat._id })).toBe(1);
        expect(await (await call("commit")).json()).toEqual({ skipped: true });
        expect(await messages()).toHaveLength(1);
    });

    it("allows only one preparation across concurrent requests", async () => {
        await Promise.all([
            call(),
            call("prepare", { token: "another-opening-token-1234" }),
        ]);
        expect(query).toHaveBeenCalledTimes(1);
        expect(await ChatMessage.countDocuments({ chatId: chat._id })).toBe(1);
        expect(await messages()).toEqual([]);
    });

    it("honors cancellation even when it arrives before preparation", async () => {
        await call("cancel");
        expect(await (await call()).json()).toEqual({ skipped: true });
        expect(query).not.toHaveBeenCalled();
    });

    it("discards a reply if the user starts typing during generation", async () => {
        let resolveGeneration;
        let started;
        const generating = new Promise((resolve) => {
            started = resolve;
        });
        query.mockImplementationOnce(() => {
            started();
            return new Promise((resolve) => {
                resolveGeneration = resolve;
            });
        });
        const preparation = call();
        await generating;
        await call("cancel");
        resolveGeneration({
            data: {
                sys_entity_agent: {
                    result: "An opening that should not appear",
                },
            },
        });
        expect(await (await preparation).json()).toEqual({ ready: false });
        expect(await ChatMessage.countDocuments({ chatId: chat._id })).toBe(0);
        expect(await messages()).toEqual([]);
    });

    it("lets a normal user message take the first sequence before commit", async () => {
        await call();
        await appendChatMessage(chat, {
            payload: "Please review this",
            sender: "user",
            sentTime: new Date().toISOString(),
            direction: "outgoing",
            position: "single",
        });
        expect(await (await call("commit")).json()).toEqual({
            committed: false,
        });
        expect((await messages()).map((message) => message.payload)).toEqual([
            "Please review this",
        ]);
        expect(await ChatMessage.countDocuments({ chatId: chat._id })).toBe(1);
    });

    it("does not publish for a different selected colleague", async () => {
        await call();
        await Chat.updateOne(
            { _id: chat._id },
            { selectedEntityId: "colleague-researcher" },
        );
        expect(await (await call("commit")).json()).toEqual({
            committed: false,
        });
        expect(await messages()).toEqual([]);
    });

    it("ignores a stale entity selection before generating", async () => {
        expect(
            await (
                await call("prepare", { entityId: "colleague-researcher" })
            ).json(),
        ).toEqual({ skipped: true });
        expect(query).not.toHaveBeenCalled();
        expect(requireColleague).not.toHaveBeenCalled();
        expect(await ChatMessage.countDocuments()).toBe(0);
    });

    it("resolves an empty chat selection to the personal entity", async () => {
        await Chat.updateOne({ _id: chat._id }, { selectedEntityId: "" });
        requireColleague.mockResolvedValue({
            id: "personal",
            name: "Personal",
        });
        expect(
            await (await call("prepare", { entityId: "personal" })).json(),
        ).toEqual({ ready: true });
        expect(requireColleague).toHaveBeenCalledWith(
            expect.objectContaining({ personalEntityId: "personal" }),
            "personal",
        );
        expect(query.mock.calls[0][0].variables.entityId).toBe("personal");
    });

    it("does not generate for old, archived, or occupied chats", async () => {
        await Chat.updateOne({ _id: chat._id }, { archived: true });
        expect(await (await call()).json()).toEqual({ skipped: true });
        await Chat.updateOne(
            { _id: chat._id },
            { archived: false, isChatLoading: true },
        );
        expect(await (await call()).json()).toEqual({ skipped: true });
        getChatForOwnerWrite.mockResolvedValue({
            ok: true,
            chat: { ...chat.toObject(), createdAt: new Date("2020-01-01") },
        });
        expect(await (await call()).json()).toEqual({ skipped: true });
        expect(query).not.toHaveBeenCalled();
    });

    it("keeps shared read-only chats and foreign chats out of the opening path", async () => {
        getChatForOwnerWrite.mockResolvedValue({
            ok: false,
            status: 403,
            error: "Unauthorized access",
        });
        expect((await call()).status).toBe(403);
        expect(query).not.toHaveBeenCalled();
        expect(await ChatMessage.countDocuments()).toBe(0);
    });
});
