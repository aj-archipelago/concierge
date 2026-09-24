/** @jest-environment node */
import { GET, POST } from "../route";
import { PATCH } from "../[id]/route";
import { getCurrentUser } from "../../utils/auth";
import { colleagueRequest, listColleagues } from "../../utils/colleagues.js";
jest.mock("../../utils/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("../../utils/colleagues.js", () => ({
    colleagueRequest: jest.fn(),
    listColleagues: jest.fn(),
}));
beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue({
        _id: "owner",
        contextId: "trusted-owner",
    });
});
it("uses the authenticated owner when creating a colleague", async () => {
    colleagueRequest.mockResolvedValue({ id: "new-id", name: "Noor" });
    const response = await POST({
        json: async () => ({ name: "Noor", userId: "foreign-owner" }),
    });
    expect(response.status).toBe(201);
    expect(colleagueRequest).toHaveBeenCalledWith(
        "manage",
        expect.objectContaining({ userId: "trusted-owner", action: "create" }),
    );
});
it("binds updates to both the authenticated owner and requested entity", async () => {
    colleagueRequest.mockResolvedValue({ id: "colleague", status: "paused" });
    await PATCH(
        { json: async () => ({ status: "paused" }) },
        { params: Promise.resolve({ id: "colleague" }) },
    );
    expect(colleagueRequest).toHaveBeenCalledWith("manage", {
        userId: "trusted-owner",
        action: "update",
        entityId: "colleague",
        settings: '{"status":"paused"}',
    });
});
it("does not contact Cortex for an unauthenticated request", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST({ json: async () => ({}) })).status).toBe(401);
    expect(colleagueRequest).not.toHaveBeenCalled();
    expect(listColleagues).not.toHaveBeenCalled();
});
it("reports unavailable service without presenting an empty team", async () => {
    listColleagues.mockRejectedValue(new Error("Unavailable"));
    expect((await GET()).status).toBe(503);
});
