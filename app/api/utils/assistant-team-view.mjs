import Task from "../models/task.mjs";
import AssistantMessage from "../models/assistant-message.mjs";
import Chat from "../models/chat.mjs";
import { isShared } from "./colleague-chat.js";
import {
    getTaskLiveState,
    mergeTaskLiveState,
    TASK_LIVE_STALE_MS,
} from "./task-liveness.mjs";

const id = (value) => (value ? String(value) : null);
const text = (value, max = 12000) =>
    typeof value === "string" ? value.slice(0, max) : "";
const handback = (value) =>
    value
        ? {
              outcome: text(value.outcome, 40),
              summary: text(value.summary),
              evidence: Array.isArray(value.evidence)
                  ? value.evidence.map((v) => text(v, 2000)).slice(0, 20)
                  : [],
          }
        : null;

async function withActivity(task) {
    const plain = task.toObject ? task.toObject() : task;
    if (task.status !== "in_progress") return plain;
    const live = await getTaskLiveState(task._id);
    return {
        ...mergeTaskLiveState(plain, live),
        activityStale:
            !live &&
            (!task.updatedAt ||
                Date.now() -
                    new Date(task.lastHeartbeat || task.updatedAt).getTime() >
                    TASK_LIVE_STALE_MS),
    };
}

// A read-only view of the existing task/message ledger. Never send continuation
// prompts, tool payloads, or workspace credentials to the browser.
export async function describeTeamViews(user, roots, { detail = false } = {}) {
    let own = roots.filter(
        (root) => id(root.owner) === id(user._id) && root.assistantTeam,
    );
    if (!own.length) return [];
    let children = await Task.find({
        owner: user._id,
        assistantRootId: { $in: own.map((r) => r._id) },
    })
        .select(
            "assistantRootId assistantEntityId status statusText error data createdAt updatedAt lastHeartbeat",
        )
        .lean();
    [own, children] = await Promise.all([
        Promise.all(own.map(withActivity)),
        Promise.all(
            children
                .filter((c) => !own.some((r) => id(r._id) === id(c._id)))
                .map(withActivity),
        ),
    ]);
    const tasks = new Map(
        [...children, ...own].map((task) => [id(task._id), task]),
    );
    const messages = await AssistantMessage.find({
        owner: user._id,
        sourceTaskId: { $in: [...tasks.keys()] },
    })
        .sort({ createdAt: 1, _id: 1 })
        .lean();
    const chatIds = [
        ...new Set(
            [
                ...own.map((r) => id(r.invokedFrom?.chatId)),
                ...messages.map((m) => id(m.chatId)),
            ].filter(Boolean),
        ),
    ];
    const chats = chatIds.length
        ? await Chat.find({ userId: user._id, _id: { $in: chatIds } })
        : [];
    const privateIds = new Set(
        (
            await Promise.all(
                chats.map(async (chat) =>
                    (await isShared(chat)) ? null : id(chat._id),
                ),
            )
        ).filter(Boolean),
    );
    return own.map((root) => {
        const team = root.assistantTeam;
        const teamTasks = new Set([
            id(root._id),
            ...children
                .filter((c) => id(c.assistantRootId) === id(root._id))
                .map((c) => id(c._id)),
        ]);
        const assignments = messages
            .filter((m) => teamTasks.has(id(m.sourceTaskId)))
            .map((m) => {
                const task = tasks.get(id(m.taskId));
                const result = handback(
                    m.payload?.handback || task?.data?.handback,
                );
                return {
                    messageId: id(m._id),
                    taskId: id(m.taskId),
                    from: m.fromEntityId,
                    to: m.toEntityId || "user",
                    purpose: m.purpose || "assignment",
                    status: m.status,
                    executionStatus: task?.status || null,
                    activityStale: !!task?.activityStale,
                    statusText: text(task?.statusText, 600),
                    request: text(m.payload?.message, detail ? 12000 : 240),
                    result: detail
                        ? result
                        : result && { outcome: result.outcome },
                    ...(detail
                        ? {
                              checkpoint: text(m.payload?.checkpoint),
                              answer: text(m.payload?.answer),
                              error: text(task?.error, 2000),
                          }
                        : {}),
                    questionChatId: privateIds.has(id(m.chatId))
                        ? id(m.chatId)
                        : null,
                    createdAt: m.createdAt,
                    updatedAt: m.updatedAt,
                };
            });
        return {
            teamId: id(root._id),
            title: text(team.title, 240),
            currentStep: text(team.currentStep, 240),
            state: team.state,
            taskStatus: root.status,
            activityStale: !!root.activityStale,
            statusText: text(root.statusText, 600),
            coordinatorId: team.coordinatorId,
            members: (team.members || []).map((m) => ({
                assistantId: m.assistantId,
                name: text(m.name, 200),
                role: text(m.role, 2000),
            })),
            assignments,
            createdAt: root.createdAt,
            updatedAt: root.updatedAt,
            chatId: privateIds.has(id(root.invokedFrom?.chatId))
                ? id(root.invokedFrom.chatId)
                : null,
            ...(detail
                ? {
                      goal: text(team.goal),
                      plan: text(team.plan),
                      acceptanceCriteria: (team.acceptanceCriteria || []).map(
                          (v) => text(v, 2000),
                      ),
                      decisions: (team.decisions || []).map((d) => ({
                          author: d.author,
                          text: text(d.text),
                          at: d.at,
                      })),
                      result: handback(team.result),
                      error: text(root.error, 2000),
                      downloads:
                          root.status === "completed" &&
                          team.state === "completed"
                              ? (team.result?.artifacts || []).map(
                                    (a, index) => ({
                                        name: a.path.split("/").at(-1),
                                        url: `/api/assistant-teams/${root._id}/artifacts/${index}`,
                                    }),
                                )
                              : [],
                  }
                : {}),
        };
    });
}
