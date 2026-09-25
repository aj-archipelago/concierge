import Share from "../../models/share.js";
/** @jest-environment node */
import {
    publishColleagueMessage,
    getColleagueChat,
} from "../colleague-chat.js";
import Chat from "../../models/chat.mjs";
import Notification from "../../models/notification.mjs";
import { appendChatMessage } from "../../chats/message-store.js";
jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock("../../models/notification.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock("../../chats/message-store.js", () => ({
    EXTERNAL_MESSAGE_STORAGE: "external",
    appendChatMessage: jest.fn(),
}));
jest.mock("../../models/share.js", () => ({
    __esModule: true,
    default: { exists: jest.fn(async () => false) },
}));
const user = { _id: "owner" };
const message = {
    _id: "source-1",
    entityId: "colleague",
    name: "Noor",
    message: "Please choose a source",
    kind: "help",
};
beforeEach(() => {
    jest.clearAllMocks();
    Share.exists.mockResolvedValue(false);
    Chat.findOne.mockReturnValue({
        sort: async () => ({ _id: "thread" }),
        _id: "thread",
        selectedEntityId: "colleague",
    });
    Notification.findOne.mockResolvedValue(null);
    Notification.findOneAndUpdate.mockResolvedValue({
        metadata: { chatId: "thread" },
    });
    appendChatMessage.mockResolvedValue({});
});
it("uses ordinary encrypted chat storage and an idempotent source key", async () => {
    await publishColleagueMessage(user, message);
    expect(appendChatMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
            payload: message.message,
            sender: "concierge",
            direction: "incoming",
            position: "single",
            entityId: "colleague",
        }),
        { dedupeKey: "colleague:source-1" },
    );
    expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ owner: "owner" }),
        expect.objectContaining({
            $setOnInsert: expect.objectContaining({
                metadata: expect.objectContaining({
                    chatId: "thread",
                    kind: "help",
                }),
            }),
        }),
        { upsert: true, new: true },
    );
});
it("retries the original thread after an interrupted delivery", async () => {
    Notification.findOne.mockResolvedValue({
        metadata: { chatId: "original-thread" },
    });
    await publishColleagueMessage(user, message);
    expect(Notification.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Chat.findOne).toHaveBeenCalledWith({
        _id: "original-thread",
        userId: "owner",
    });
    expect(appendChatMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { dedupeKey: "colleague:source-1" },
    );
});

it("does not deliver private colleague updates into a shared conversation", async () => {
    Share.exists.mockResolvedValue(true);
    Chat.create.mockResolvedValue({ _id: "private-thread" });
    await expect(
        getColleagueChat(user, "colleague", "Noor"),
    ).resolves.toMatchObject({ _id: "private-thread" });
    expect(Chat.create).toHaveBeenCalledWith(
        expect.objectContaining({
            userId: "owner",
            selectedEntityId: "colleague",
            messageStorageMode: "external",
        }),
    );
});
