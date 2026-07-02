/**
 * @jest-environment node
 */

import { listOwnedSharedResources } from "../listSharedResources.js";
import Share from "../../models/share.js";
import Chat from "../../models/chat.mjs";

const ownerId = "507f191e810c19729de860ea";
const chatId = "69fcdbb6ac8ccc9ef8a8c0b1";

jest.mock("../../models/share.js", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

jest.mock("../../models/workspace.js", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

jest.mock("../../models/applet.js", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

jest.mock("../../models/automation.js", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

describe("listOwnedSharedResources", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Share.find.mockReturnValue({
            lean: jest.fn(async () => [
                {
                    entityType: "chat",
                    entityId: chatId,
                    link: { enabled: true, role: "viewer" },
                    recipients: [{ userId: "abc", role: "viewer" }],
                    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
                },
            ]),
        });
        Chat.find.mockImplementation((query) => {
            if (query?._id?.$in) {
                return {
                    select: jest.fn().mockReturnThis(),
                    lean: jest.fn(async () => [
                        {
                            _id: chatId,
                            title: "Planning chat",
                            updatedAt: new Date("2026-06-01T12:00:00.000Z"),
                        },
                    ]),
                };
            }

            return {
                select: jest.fn().mockReturnThis(),
                lean: jest.fn(async () => []),
            };
        });
    });

    it("returns active shares and legacy public chats only", async () => {
        const result = await listOwnedSharedResources(ownerId);

        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({
            entityType: "chat",
            entityId: chatId,
            title: "Planning chat",
            recipientCount: 1,
            url: `/chat/${chatId}`,
        });
    });
});
