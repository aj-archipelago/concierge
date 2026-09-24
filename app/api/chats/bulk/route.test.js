/**
 * @jest-environment node
 */

import { DELETE } from "./route";

jest.mock("../_lib", () => ({
    createNewChat: jest.fn(),
    deleteChatIdFromRecentList: jest.fn(),
    sanitizeToolForPersistence: jest.fn((tool) => tool),
}));

jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: {
        findOneAndDelete: jest.fn(),
    },
}));

jest.mock("../../models/user", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
    handleError: jest.fn((error) => Response.json({ error: error.message })),
}));

jest.mock("../../utils/shareHelpers", () => ({
    deleteEntityShare: jest.fn(),
}));

jest.mock("../message-store.js", () => ({
    deleteExternalChatMessages: jest.fn(),
}));

const Chat = require("../../models/chat.mjs").default;
const { deleteChatIdFromRecentList } = require("../_lib");
const { getCurrentUser } = require("../../utils/auth");
const { deleteEntityShare } = require("../../utils/shareHelpers");
const { deleteExternalChatMessages } = require("../message-store.js");

describe("DELETE /api/chats/bulk", () => {
    const userId = "507f191e810c19729de860ea";
    const chatId = "507f191e810c19729de860eb";

    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: userId });
        deleteChatIdFromRecentList.mockResolvedValue({});
    });

    it("deletes share state for each deleted owned chat", async () => {
        Chat.findOneAndDelete.mockResolvedValue({ _id: chatId });

        const response = await DELETE({
            json: async () => ({ chatIds: [chatId] }),
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.deletedIds).toEqual([chatId]);
        expect(deleteExternalChatMessages).toHaveBeenCalledWith(chatId);
        expect(deleteEntityShare).toHaveBeenCalledWith("chat", chatId);
    });

    it("does not delete share state for missing or unauthorized chats", async () => {
        Chat.findOneAndDelete.mockResolvedValue(null);

        const response = await DELETE({
            json: async () => ({ chatIds: [chatId] }),
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.missingIds).toEqual([chatId]);
        expect(deleteEntityShare).not.toHaveBeenCalled();
    });
});
