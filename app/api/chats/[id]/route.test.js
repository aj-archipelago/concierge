/**
 * @jest-environment node
 */

import { PUT } from "./route";
import Chat from "../../models/chat.mjs";

const chatId = "507f191e810c19729de860ea";
let mockExistingChat;

jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(async () => mockExistingChat),
        findOneAndUpdate: jest.fn(),
        findOneAndDelete: jest.fn(),
    },
}));

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(async () => ({ _id: "user-1" })),
    handleError: jest.fn((error) => Response.json({ error: error.message })),
}));

const createRequest = (body) => ({
    json: async () => body,
});

describe("PUT /api/chats/[id]", () => {
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
                {
                    _id: "m2",
                    payload: "durable answer",
                    sender: "assistant",
                    sentTime: "2026-01-01T00:00:01.000Z",
                    direction: "incoming",
                    position: "single",
                    isServerGenerated: true,
                },
            ],
        };
        Chat.findOneAndUpdate.mockImplementation(async (query, update) => ({
            _id: query._id,
            ...mockExistingChat,
            ...update,
            toObject() {
                return this;
            },
        }));
    });

    it("preserves server-owned assistant messages during stale non-replay updates", async () => {
        const response = await PUT(
            createRequest({
                messages: [mockExistingChat.messages[0]],
            }),
            { params: { id: chatId } },
        );

        expect(response.status).toBe(200);
        const update = Chat.findOneAndUpdate.mock.calls[0][1];
        expect(update.messages).toHaveLength(2);
        expect(update.messages.map((message) => message._id)).toEqual([
            "m1",
            "m2",
        ]);
    });

    it("allows intentional replay truncation when the client opts in", async () => {
        const response = await PUT(
            createRequest({
                messages: [mockExistingChat.messages[0]],
                allowMessageTruncation: true,
            }),
            { params: { id: chatId } },
        );

        expect(response.status).toBe(200);
        const update = Chat.findOneAndUpdate.mock.calls[0][1];
        expect(update.messages).toHaveLength(1);
        expect(update.messages[0]._id).toBe("m1");
        expect(update.allowMessageTruncation).toBeUndefined();
    });
});
