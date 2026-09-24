/**
 * @jest-environment node
 */

import { POST, PUT } from "./route";
import Chat from "../../models/chat.mjs";
import {
    appendChatMessage,
    replaceChatMessages,
    updateChatMessages,
} from "../message-store.js";

const chatId = "507f191e810c19729de860ea";
let mockExistingChat;

jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: {
        findOneAndUpdate: jest.fn(),
        findOneAndDelete: jest.fn(),
    },
}));

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(async () => ({ _id: "user-1" })),
    handleError: jest.fn((error) => Response.json({ error: error.message })),
}));

jest.mock("../_lib", () => ({
    addStoppedSubscription: jest.fn((entries) => entries || []),
    deleteChatIdFromRecentList: jest.fn(),
    getChatById: jest.fn(async () => ({
        ...mockExistingChat,
        messageStorageMode: "external",
    })),
    getChatForOwnerWrite: jest.fn(async () => ({
        ok: true,
        chat: mockExistingChat,
        access: { isOwner: true },
    })),
    sanitizeMessagesForPersistence: jest.fn((messages) => messages),
}));

jest.mock("../message-store.js", () => ({
    appendChatMessage: jest.fn(),
    deleteExternalChatMessages: jest.fn(),
    replaceChatMessages: jest.fn(),
    updateChatMessages: jest.fn(),
}));

jest.mock("../../utils/shareHelpers", () => ({
    deleteEntityShare: jest.fn(),
    syncChatLinkSharing: jest.fn(),
}));

const createRequest = (body) => ({
    json: async () => body,
});

describe("chat message mutations", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExistingChat = {
            _id: chatId,
            userId: "user-1",
            messages: [
                {
                    _id: "m1",
                    payload: "question",
                    sender: "user",
                    sentTime: "2026-01-01T00:00:00.000Z",
                    direction: "outgoing",
                    position: "single",
                },
            ],
        };
        Chat.findOneAndUpdate.mockResolvedValue(mockExistingChat);
    });

    it("appends one message through the message store", async () => {
        const message = {
            ...mockExistingChat.messages[0],
            _clientId: "draft-1",
        };
        const response = await POST(createRequest({ message }), {
            params: { id: chatId },
        });

        expect(response.status).toBe(200);
        expect(appendChatMessage).toHaveBeenCalledWith(
            mockExistingChat,
            message,
            { dedupeKey: "draft-1" },
        );
    });

    it("switches to a replacement generation for a history replacement", async () => {
        const response = await PUT(
            createRequest({ messages: mockExistingChat.messages }),
            { params: { id: chatId } },
        );

        expect(response.status).toBe(200);
        expect(replaceChatMessages).toHaveBeenCalledWith(
            mockExistingChat,
            mockExistingChat.messages,
        );
        expect(Chat.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty(
            "messages",
        );
    });

    it("updates existing messages without replacing chat history", async () => {
        const response = await PUT(
            createRequest({ messageUpdates: mockExistingChat.messages }),
            { params: { id: chatId } },
        );

        expect(response.status).toBe(200);
        expect(updateChatMessages).toHaveBeenCalledWith(
            mockExistingChat,
            mockExistingChat.messages,
        );
        expect(replaceChatMessages).not.toHaveBeenCalled();
    });
});
