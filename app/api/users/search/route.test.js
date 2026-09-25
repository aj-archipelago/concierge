/**
 * @jest-environment node
 */

import { GET } from "./route.js";
import User from "../../models/user";
import { getCurrentUser } from "../../utils/auth";

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
    handleError: jest.fn((error) =>
        Response.json({ error: error.message }, { status: 500 }),
    ),
}));

jest.mock("../../models/user", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

function mockUserFind(users) {
    User.find.mockReturnValue({
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(users),
    });
}

describe("GET /api/users/search", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({
            _id: "current-id",
            username: "current@example.test",
        });
    });

    test("deduplicates case variants and excludes aliases of the current user", async () => {
        mockUserFind([
            {
                _id: "stale-id",
                name: "GRACE.HOPPER@example.test",
                username: "grace.hopper@example.test",
                lastActiveAt: new Date("2026-01-01T00:00:00Z"),
            },
            {
                _id: "active-id",
                name: "Grace Hopper",
                username: "Grace.Hopper@example.test",
                lastActiveAt: new Date("2026-07-01T00:00:00Z"),
            },
            {
                _id: "current-alias-id",
                name: "Current User",
                username: "CURRENT@example.test",
            },
        ]);

        const response = await GET({
            url: "https://example.test/api/users/search?q=grace",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([
            expect.objectContaining({
                _id: "active-id",
                name: "Grace Hopper",
            }),
        ]);
        expect(User.find).toHaveBeenCalledWith(
            expect.objectContaining({
                username: expect.any(RegExp),
                $or: expect.any(Array),
            }),
            expect.objectContaining({
                name: 1,
                username: 1,
                lastActiveAt: 1,
            }),
        );
    });

    test("requires email-backed identities so legacy name-only users cannot be selected", async () => {
        mockUserFind([]);

        await GET({
            url: "https://example.test/api/users/search?q=babar",
        });

        const query = User.find.mock.calls[0][0];
        expect(query.username).toBeInstanceOf(RegExp);
        expect(query.username.test("Alex@example.com")).toBe(true);
        expect(query.username.test("Babar Mustafa")).toBe(false);
    });
});
