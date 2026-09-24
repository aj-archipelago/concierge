/** @jest-environment node */
import { createHash } from "node:crypto";
import { GET } from "./route";
import { getCurrentUser } from "../../../../utils/auth";
import { colleagueRequest } from "../../../../utils/colleagues.js";
import Task from "../../../../models/task.mjs";
jest.mock("../../../../utils/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("../../../../utils/colleagues.js", () => ({
    colleagueRequest: jest.fn(),
}));
jest.mock("../../../../models/task.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));
const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const bytes = Buffer.from("<!doctype html><h1>Reviewed game</h1>");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const artifact = { path: "/workspace/teams/demo/index.html", sha256 };
let root;
const get = (index = "0") =>
    GET(
        new Request(
            "http://localhost/api/assistant-teams/demo?path=/workspace/secrets",
        ),
        { params: Promise.resolve({ id, index }) },
    );
beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue({
        _id: "owner",
        contextId: "bound-context",
    });
    root = {
        assistantEntityId: "coordinator",
        assistantTeam: {
            state: "completed",
            result: { artifacts: [artifact] },
        },
    };
    Task.findOne.mockImplementation(() => ({
        select: jest.fn(async () => root),
    }));
    colleagueRequest.mockResolvedValue({ base64: bytes.toString("base64") });
});
it("downloads only the owner’s recorded reviewed artifact, as an attachment with no shared caching", async () => {
    const response = await get();
    expect(Task.findOne).toHaveBeenCalledWith({
        _id: id,
        owner: "owner",
        status: "completed",
    });
    expect(colleagueRequest).toHaveBeenCalledWith("artifact", {
        userId: "bound-context",
        entityId: "coordinator",
        ...artifact,
    });
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-disposition")).toContain(
        "attachment;",
    );
    expect(response.headers.get("content-type")).toBe(
        "application/octet-stream",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain(
        "sandbox",
    );
});
it("rejects unauthenticated, foreign, unfinished, and nonexistent artifact requests", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    root = null;
    expect((await get()).status).toBe(404);
    root = { assistantTeam: { state: "active" } };
    expect((await get()).status).toBe(404);
    expect((await get("99")).status).toBe(404);
    expect(colleagueRequest).not.toHaveBeenCalled();
});
it("refuses bytes changed after the recorded review", async () => {
    colleagueRequest.mockResolvedValue({
        base64: Buffer.from("changed").toString("base64"),
    });
    expect((await get()).status).toBe(409);
});
