/** @jest-environment node */
import { describeTeamViews } from "../assistant-team-view.mjs";
import Task from "../../models/task.mjs";
import AssistantMessage from "../../models/assistant-message.mjs";
import Chat from "../../models/chat.mjs";
import { isShared } from "../colleague-chat.js";
jest.mock("../task-liveness.mjs", () => ({
    getTaskLiveState: jest.fn(async () => null),
    mergeTaskLiveState: (task) => task,
    TASK_LIVE_STALE_MS: 45000,
}));
jest.mock("../../models/task.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));
jest.mock("../../models/assistant-message.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));
jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));
jest.mock("../colleague-chat.js", () => ({ isShared: jest.fn() }));
const team = {
    title: "Build game",
    coordinatorId: "assistant",
    members: [{ assistantId: "assistant", name: "Assistant", role: "lead" }],
    state: "active",
    goal: "Game",
    plan: "Review",
    acceptanceCriteria: ["Playable"],
    decisions: [],
};
const root = {
    _id: "root",
    owner: "owner",
    status: "waiting",
    invokedFrom: { chatId: "source-chat" },
    assistantTeam: team,
    assistantContext: { secret: "continuation" },
};
const child = {
    _id: "child",
    assistantRootId: "root",
    status: "in_progress",
    data: {
        handback: { outcome: "blocked", summary: "Need clarification" },
        secret: "credential",
    },
};
const message = {
    _id: "request",
    sourceTaskId: "root",
    fromEntityId: "assistant",
    toEntityId: "pixel",
    taskId: "child",
    status: "pending",
    payload: { message: "Build a game", secret: "tool-secret" },
};
beforeEach(() => {
    Task.find.mockReturnValue({
        select: () => ({ lean: async () => [child] }),
    });
    AssistantMessage.find.mockReturnValue({
        sort: () => ({
            lean: async () => [
                message,
                {
                    _id: "q",
                    sourceTaskId: "child",
                    fromEntityId: "pixel",
                    purpose: "question",
                    status: "pending",
                    chatId: "question",
                    payload: {
                        message: "Which style?",
                        checkpoint: "Design",
                        answer: "Arcade",
                    },
                },
            ],
        }),
    });
    Chat.find.mockResolvedValue([{ _id: "source-chat" }, { _id: "question" }]);
    isShared.mockImplementation(async (chat) => chat._id === "question");
});
it("includes descendants and useful handoffs without private execution data", async () => {
    const [view] = await describeTeamViews({ _id: "owner" }, [root], {
        detail: true,
    });
    expect(view.assignments).toHaveLength(2);
    expect(view.assignments[0].executionStatus).toBe("in_progress");
    expect(view.assignments[0].result.outcome).toBe("blocked");
    expect(view.assignments[1].checkpoint).toBe("Design");
    expect(view.assignments[1].answer).toBe("Arcade");
    expect(view.assignments[1].questionChatId).toBeNull();
    expect(view.chatId).toBe("source-chat");
    expect(JSON.stringify(view)).not.toMatch(
        /secret|credential|continuation|tool-secret/,
    );
    expect(Task.find).toHaveBeenCalledWith({
        owner: "owner",
        assistantRootId: { $in: ["root"] },
    });
    expect(AssistantMessage.find).toHaveBeenCalledWith({
        owner: "owner",
        sourceTaskId: { $in: expect.arrayContaining(["root", "child"]) },
    });
});
it("refuses foreign roots and never offers unreviewed downloads", async () => {
    expect(await describeTeamViews({ _id: "other" }, [root])).toEqual([]);
    const [view] = await describeTeamViews(
        { _id: "owner" },
        [
            {
                ...root,
                assistantTeam: {
                    ...team,
                    result: {
                        summary: "Done",
                        artifacts: [
                            { path: "/workspace/game.html", sha256: "hash" },
                        ],
                    },
                },
            },
        ],
        { detail: true },
    );
    expect(view.downloads).toEqual([]);
});
it("links only saved completed team artifacts through authenticated downloads", async () => {
    const [view] = await describeTeamViews(
        { _id: "owner" },
        [
            {
                ...root,
                status: "completed",
                assistantTeam: {
                    ...team,
                    state: "completed",
                    result: {
                        summary: "Done",
                        artifacts: [
                            { path: "/workspace/game.html", sha256: "hash" },
                        ],
                    },
                },
            },
        ],
        { detail: true },
    );
    expect(view.downloads).toEqual([
        { name: "game.html", url: "/api/assistant-teams/root/artifacts/0" },
    ]);
});
