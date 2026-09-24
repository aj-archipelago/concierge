/** @jest-environment node */
import { GET } from "./route";
import { GET as getTeam } from "./[id]/route";
import { getCurrentUser } from "../utils/auth";
import Task from "../models/task.mjs";
import Chat from "../models/chat.mjs";
import { isShared, getAssistantConversation } from "../utils/colleague-chat.js";
import { describeTeamViews } from "../utils/assistant-team-view.mjs";
jest.mock("../utils/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("../models/task.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn(), findOne: jest.fn() },
}));
jest.mock("../models/chat.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));
jest.mock("../utils/colleague-chat.js", () => ({
    isShared: jest.fn(),
    getAssistantConversation: jest.fn(),
}));
jest.mock("../utils/assistant-team-view.mjs", () => ({
    describeTeamViews: jest.fn(),
}));
const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const root = {
    _id: id,
    owner: "owner",
    assistantTeam: { title: "Build game" },
    createdAt: new Date("2026-09-19T12:00:00Z"),
};
const cursor = Buffer.from(
    JSON.stringify({ id, at: "2026-09-19T12:00:00.000Z" }),
).toString("base64url");
const list = (query = "") =>
    GET(new Request(`http://localhost/api/assistant-teams${query}`));
const detail = (teamId = id) =>
    getTeam(new Request("http://localhost"), {
        params: Promise.resolve({ id: teamId }),
    });
let limit;
beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue({ _id: "owner" });
    limit = jest.fn().mockResolvedValue([root]);
    Task.find.mockReturnValue({ select: () => ({ sort: () => ({ limit }) }) });
    Task.findOne.mockReturnValue({ select: () => Promise.resolve(root) });
    Chat.findOne.mockResolvedValue({ _id: id, userId: "owner" });
    isShared.mockResolvedValue(false);
    getAssistantConversation.mockResolvedValue({ chat: { _id: id } });
    describeTeamViews.mockResolvedValue([{ teamId: id, title: "Build game" }]);
});
it("requires sign-in before looking up tasks", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await list()).status).toBe(401);
    expect((await detail()).status).toBe(401);
    expect(Task.find).not.toHaveBeenCalled();
});
it("bounds and scopes list pagination to the current owner", async () => {
    limit.mockResolvedValue([
        root,
        { ...root, _id: "bbbbbbbbbbbbbbbbbbbbbbbb" },
    ]);
    const response = await list(`?limit=1&status=active&cursor=${cursor}`);
    expect(Task.find).toHaveBeenCalledWith({
        owner: "owner",
        assistantTeamRevision: { $gt: 0 },
        $or: [
            { createdAt: { $lt: root.createdAt } },
            { createdAt: root.createdAt, _id: { $lt: id } },
        ],
        status: { $in: ["pending", "in_progress", "waiting"] },
    });
    expect(limit).toHaveBeenCalledWith(2);
    expect((await response.json()).nextCursor).toBe(cursor);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("does not expose team activity through a shared or foreign chat", async () => {
    isShared.mockResolvedValue(true);
    expect((await list(`?chatId=${id}`)).status).toBe(404);
    expect(Task.find).not.toHaveBeenCalled();
    Chat.findOne.mockResolvedValue(null);
    expect((await list(`?chatId=${id}`)).status).toBe(404);
    expect(Chat.findOne).toHaveBeenCalledWith({ _id: id, userId: "owner" });
});
it("filters a private chat and validates cursor/status parameters", async () => {
    expect((await list(`?chatId=${id}`)).status).toBe(200);
    expect(Task.find).toHaveBeenCalledWith(
        expect.objectContaining({ "invokedFrom.chatId": id, owner: "owner" }),
    );
    for (const query of ["?chatId=no", "?cursor=no", "?status=banana"])
        expect((await list(query)).status).toBe(400);
});
it("binds team detail to owner and hides nonexistent teams", async () => {
    const response = await detail();
    expect(response.status).toBe(200);
    expect(Task.findOne).toHaveBeenCalledWith({
        _id: id,
        owner: "owner",
        assistantTeamRevision: { $gt: 0 },
    });
    expect(describeTeamViews).toHaveBeenCalledWith({ _id: "owner" }, [root], {
        detail: true,
    });
    Task.findOne.mockReturnValue({ select: () => Promise.resolve(null) });
    expect((await detail()).status).toBe(404);
    expect((await detail("not-an-id")).status).toBe(404);
});
it("does not expose internal errors", async () => {
    getCurrentUser.mockRejectedValue(new Error("secret URI"));
    const response = await detail();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
});
it("links a background team to its conversation before any question or result", async () => {
    const background = { ...root, invokedFrom: { source: "automation" } };
    Task.findOne.mockReturnValue({ select: () => Promise.resolve(background) });
    expect((await detail()).status).toBe(200);
    expect(getAssistantConversation).toHaveBeenCalledWith(
        { _id: "owner" },
        background,
        { create: true },
    );
    expect(background.invokedFrom).toEqual({
        source: "automation",
        chatId: id,
    });
});
it("keeps team details available when its original private conversation is unavailable", async () => {
    getAssistantConversation.mockRejectedValue(
        Object.assign(new Error("private"), { status: 403 }),
    );
    expect((await detail()).status).toBe(200);
    expect(describeTeamViews).toHaveBeenCalled();
});
