/**
 * @jest-environment node
 */

import { POST } from "../canvas-applets/[id]/copy/route";

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../canvas-applets/copy", () => ({
    copyAppletForAdmin: jest.fn(),
}));

const { getCurrentUser } = require("../utils/auth");
const { copyAppletForAdmin } = require("../canvas-applets/copy");

describe("canvas applet admin copy route", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 400 for invalid applet id", async () => {
        getCurrentUser.mockResolvedValue({ _id: "admin1", role: "admin" });

        const response = await POST(new Request("http://localhost"), {
            params: Promise.resolve({ id: "not-an-id" }),
        });

        expect(response.status).toBe(400);
        expect(copyAppletForAdmin).not.toHaveBeenCalled();
    });

    it("copies applet for admin users", async () => {
        getCurrentUser.mockResolvedValue({ _id: "admin1", role: "admin" });
        copyAppletForAdmin.mockResolvedValue({
            _id: "copy1",
            name: "Copy of Contract Compliance",
        });

        const response = await POST(new Request("http://localhost"), {
            params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
        });
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(copyAppletForAdmin).toHaveBeenCalledWith(
            { _id: "admin1", role: "admin" },
            "507f1f77bcf86cd799439011",
        );
        expect(json).toEqual({
            _id: "copy1",
            name: "Copy of Contract Compliance",
        });
    });

    it("returns forbidden when copy helper rejects non-admin users", async () => {
        getCurrentUser.mockResolvedValue({ _id: "user1", role: "user" });
        const forbidden = new Error("Forbidden");
        forbidden.status = 403;
        copyAppletForAdmin.mockRejectedValue(forbidden);

        const response = await POST(new Request("http://localhost"), {
            params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
        });

        expect(response.status).toBe(403);
    });
});
