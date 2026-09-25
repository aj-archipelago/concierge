import Task from "../models/task.mjs";
import Notification from "../models/notification.mjs";
import AssistantMessage from "../models/assistant-message.mjs";
import { colleagueNotificationId } from "./colleague-chat.js";
import { describeTeamViews } from "./assistant-team-view.mjs";

const active = ["pending", "in_progress", "waiting"];
const id = (value) => String(value);

// Associate historical question/result notices using their durable delivery IDs.
// Never infer a job from chatId: several jobs may share the same conversation.
export async function linkLegacyTeamNotifications(userId) {
    const roots = await Task.find({
        owner: userId,
        assistantTeamRevision: { $gt: 0 },
    })
        .select("_id")
        .lean();
    if (!roots.length) return;
    const tasks = await Task.find({
        owner: userId,
        $or: [
            { _id: { $in: roots.map((r) => r._id) } },
            { assistantRootId: { $in: roots.map((r) => r._id) } },
        ],
    })
        .select("assistantRootId")
        .lean();
    const rootByTask = new Map(
        tasks.map((t) => [id(t._id), t.assistantRootId || t._id]),
    );
    const questions = await AssistantMessage.find({
        owner: userId,
        toEntityId: null,
        sourceTaskId: { $in: tasks.map((t) => t._id) },
    })
        .select("sourceTaskId status")
        .lean();
    const deliveries = [
        ...roots.map((r) => ({
            key: `assistant-result:${r._id}`,
            root: r._id,
        })),
        ...questions.map((q) => ({
            key: `question:${q._id}`,
            root: rootByTask.get(id(q.sourceTaskId)),
            answered: q.status !== "pending",
        })),
    ];
    for (const delivery of deliveries)
        await Notification.updateOne(
            { owner: userId, _id: colleagueNotificationId(delivery.key) },
            {
                $set: {
                    assistantRootId: delivery.root,
                    ...(delivery.answered ? { read: true } : {}),
                },
            },
        );
}

export async function teamInboxSnapshot(
    userId,
    { showDismissed = false, includeViews = true } = {},
) {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const roots = await Task.find({
        owner: userId,
        assistantTeamRevision: { $gt: 0 },
        ...(!showDismissed
            ? {
                  $or: [
                      { status: { $in: active } },
                      { dismissed: { $ne: true }, updatedAt: { $gte: cutoff } },
                  ],
              }
            : {}),
    })
        .select(
            "owner type status statusText createdAt updatedAt dismissed invokedFrom assistantEntityId assistantRootId assistantTeamRevision",
        )
        .sort({ updatedAt: -1 })
        .lean();
    if (!roots.length) return { items: [], unreadCount: 0 };
    const notices = await Notification.find({
        owner: userId,
        assistantRootId: { $in: roots.map((r) => r._id) },
        dismissed: { $ne: true },
        read: { $ne: true },
    })
        .select("assistantRootId")
        .lean();
    const unreadByRoot = new Map();
    for (const notice of notices) {
        const key = id(notice.assistantRootId);
        if (!unreadByRoot.has(key)) unreadByRoot.set(key, []);
        unreadByRoot.get(key).push(id(notice._id));
    }
    if (!includeViews) return { unreadCount: unreadByRoot.size, items: [] };
    // Rank old unanswered jobs ahead of history without loading every team's
    // full ledger. Only the selected inbox page is hydrated below.
    const pending = await AssistantMessage.find({
        owner: userId,
        toEntityId: null,
        status: "pending",
    })
        .select("sourceTaskId")
        .lean();
    const sources = pending.length
        ? await Task.find({
              owner: userId,
              _id: { $in: pending.map((q) => q.sourceTaskId) },
          })
              .select("assistantRootId")
              .lean()
        : [];
    const needsAnswer = new Set(
        sources.map((t) => id(t.assistantRootId || t._id)),
    );
    return {
        unreadCount: unreadByRoot.size,
        items: roots.map((root) => ({
            ...root,
            inboxKind: "task",
            team: {
                teamId: id(root._id),
                assignments: needsAnswer.has(id(root._id))
                    ? [{ to: "user", status: "pending" }]
                    : [],
            },
            notificationIds: unreadByRoot.get(id(root._id)) || [],
            read: !unreadByRoot.has(id(root._id)),
        })),
    };
}

export async function hydrateTeamInboxItems(userId, items) {
    const teamIds = items.filter((i) => i.team).map((i) => i._id);
    if (!teamIds.length) return items;
    const roots = await Task.find({
        owner: userId,
        _id: { $in: teamIds },
        assistantTeamRevision: { $gt: 0 },
    })
        .select("+assistantTeam")
        .lean();
    const views = await describeTeamViews({ _id: userId }, roots);
    const byId = new Map(views.map((team) => [team.teamId, team]));
    return items
        .filter((item) => !item.team || byId.has(id(item._id)))
        .map((item) =>
            item.team ? { ...item, team: byId.get(id(item._id)) } : item,
        );
}

export function inboxAttentionRank(item) {
    if (
        item.team?.assignments.some(
            (a) => a.to === "user" && a.status === "pending",
        ) &&
        active.includes(item.status)
    )
        return 0;
    if (item.team && ["failed", "abandoned"].includes(item.status)) return 1;
    if (item.team && item.read === false) return 2;
    if (item.team && active.includes(item.status)) return 3;
    return 4;
}
