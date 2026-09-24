/** @jest-environment node */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Chat from "../../../models/chat.mjs";
import Notification from "../../../models/notification.mjs";
import { getCurrentUser } from "../../../utils/auth";
import { isShared } from "../../../utils/colleague-chat.js";
import { GET } from "./route";

jest.mock("../../../utils/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("../../../utils/colleague-chat.js", () => ({
    isShared: jest.fn(async () => false),
}));
let mongo, user, chat;
const get = (id) =>
    GET(new Request("http://localhost/api/chats/test/deliveries"), {
        params: { id: String(id || chat._id) },
    });
beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
}, 60000);
afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
});
beforeEach(async () => {
    await Chat.deleteMany({});
    await Notification.deleteMany({});
    user = { _id: new mongoose.Types.ObjectId() };
    getCurrentUser.mockResolvedValue(user);
    isShared.mockResolvedValue(false);
    chat = await Chat.create({
        userId: user._id,
        title: "Job conversation",
        isPublic: false,
    });
});
const notice = (overrides = {}) =>
    Notification.create({
        owner: user._id,
        type: "colleague-message",
        metadata: {
            chatId: String(chat._id),
            messageId: String(new mongoose.Types.ObjectId()),
            kind: "result",
            message: "Private result text",
        },
        ...overrides,
    });

it("signals persisted results and questions without exposing text or marking anything read", async () => {
    const result = await notice();
    const help = await notice({
        metadata: {
            chatId: String(chat._id),
            messageId: "question-message",
            kind: "help",
        },
    });
    const response = await get();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const data = await response.json();
    expect(data.deliveries).toEqual(
        expect.arrayContaining([
            {
                id: String(result._id),
                messageId: result.metadata.messageId,
                kind: "result",
            },
            {
                id: String(help._id),
                messageId: "question-message",
                kind: "help",
            },
        ]),
    );
    expect(JSON.stringify(data)).not.toContain("Private result text");
    expect(await Notification.countDocuments({ read: false })).toBe(2);
});

it("excludes other chats, other users, read/dismissed notices, and uncommitted messages", async () => {
    await notice({ owner: new mongoose.Types.ObjectId() });
    await notice({
        metadata: {
            chatId: String(new mongoose.Types.ObjectId()),
            messageId: "elsewhere",
            kind: "result",
        },
    });
    await notice({ read: true });
    await notice({ dismissed: true });
    await notice({ metadata: { chatId: String(chat._id), kind: "result" } });
    expect((await (await get()).json()).deliveries).toEqual([]);
});

it("requires the owning user and a private chat", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    getCurrentUser.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    expect((await get()).status).toBe(404);
    getCurrentUser.mockResolvedValue(user);
    isShared.mockResolvedValue(true);
    expect((await get()).status).toBe(404);
    isShared.mockResolvedValue(false);
    await Chat.updateOne({ _id: chat._id }, { isPublic: true });
    expect((await get()).status).toBe(404);
    expect((await get("bad-id")).status).toBe(404);
});
