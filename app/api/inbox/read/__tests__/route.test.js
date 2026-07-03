/**
 * @jest-environment node
 */

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../../utils/inbox.js", () => ({
    markNotificationsRead: jest.fn(),
}));

const { getCurrentUser } = require("../../../utils/auth");
const { markNotificationsRead } = require("../../../utils/inbox.js");
const { POST } = require("../route");

describe("POST /api/inbox/read", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: "user-1" });
        markNotificationsRead.mockResolvedValue({ modifiedCount: 2 });
    });

    it("marks all unread notifications as read", async () => {
        const response = await POST(
            new Request("http://localhost/api/inbox/read", {
                method: "POST",
                body: JSON.stringify({ all: true }),
            }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ success: true, modifiedCount: 2 });
        expect(markNotificationsRead).toHaveBeenCalledWith("user-1", {
            ids: [],
            all: true,
        });
    });

    it("marks specific notifications as read", async () => {
        const response = await POST(
            new Request("http://localhost/api/inbox/read", {
                method: "POST",
                body: JSON.stringify({ ids: ["n-1", "n-2"] }),
            }),
        );

        expect(response.status).toBe(200);
        expect(markNotificationsRead).toHaveBeenCalledWith("user-1", {
            ids: ["n-1", "n-2"],
            all: false,
        });
    });
});
