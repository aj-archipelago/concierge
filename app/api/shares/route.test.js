/**
 * @jest-environment node
 */

import { GET } from "./route.js";
import { listOwnedSharedResources } from "../utils/listSharedResources.js";

const ownerId = "507f191e810c19729de860ea";

jest.mock("../utils/listSharedResources.js", () => ({
    listOwnedSharedResources: jest.fn(),
}));

jest.mock("../utils/auth.js", () => ({
    getCurrentUser: jest.fn(async () => ({ _id: ownerId })),
    handleError: jest.fn((error) =>
        Response.json({ error: error.message }, { status: 500 }),
    ),
}));

describe("GET /api/shares", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        listOwnedSharedResources.mockResolvedValue({
            ownerId,
            items: [
                {
                    entityType: "chat",
                    entityId: "69fcdbb6ac8ccc9ef8a8c0b1",
                    title: "Planning chat",
                    url: "/chat/69fcdbb6ac8ccc9ef8a8c0b1",
                    link: { enabled: true, role: "viewer" },
                    recipientCount: 0,
                    updatedAt: "2026-06-01T12:00:00.000Z",
                    legacyShared: false,
                },
            ],
        });
    });

    it("returns owned shared resources for the current user", async () => {
        const response = await GET();
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(listOwnedSharedResources).toHaveBeenCalledWith(ownerId);
        expect(body.items).toHaveLength(1);
        expect(body.items[0].title).toBe("Planning chat");
    });
});
