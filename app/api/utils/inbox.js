import Task from "../models/task.mjs";
import Notification from "../models/notification.mjs";
import UserState from "../models/user-state.mjs";
import { migrateTasks } from "./task-migration.mjs";
import {
    linkLegacyTeamNotifications,
    teamInboxSnapshot,
    inboxAttentionRank,
    hydrateTeamInboxItems,
} from "./team-inbox.mjs";

function fortyEightHoursAgo() {
    return new Date(Date.now() - 48 * 60 * 60 * 1000);
}

export function buildInboxTimeFilter(showDismissed) {
    if (showDismissed) {
        return {};
    }
    return {
        dismissed: { $ne: true },
        createdAt: { $gte: fortyEightHoursAgo() },
    };
}

function parseUserState(serializedState) {
    try {
        return JSON.parse(serializedState || "{}");
    } catch (error) {
        console.error(
            "Error deserializing serializedState during inbox migrations",
            error,
        );
        return {};
    }
}

export async function ensureInboxMigrations(user) {
    const userStateObject = await UserState.findOne({ user: user._id });
    const userState = parseUserState(userStateObject?.serializedState);
    let userStateChanged = false;

    if (!userState.tasksMigrated) {
        await migrateTasks(user._id);
        userState.tasksMigrated = true;
        userStateChanged = true;
    }

    if (!userState.shareNotificationsMigrated) {
        const legacyShareTasks = await Task.find({
            owner: user._id,
            type: "resource-shared",
        }).lean();

        if (legacyShareTasks.length > 0) {
            await Notification.insertMany(
                legacyShareTasks.map((task) => ({
                    owner: task.owner,
                    type: "resource-shared",
                    metadata: task.metadata || {},
                    dismissed: Boolean(task.dismissed),
                    read: true,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                })),
                { ordered: false },
            );
            await Task.deleteMany({
                _id: { $in: legacyShareTasks.map((task) => task._id) },
            });
        }

        userState.shareNotificationsMigrated = true;
        userStateChanged = true;
    }

    if (!userState.teamNotificationsLinked) {
        await linkLegacyTeamNotifications(user._id);
        userState.teamNotificationsLinked = true;
        userStateChanged = true;
    }

    if (!userStateChanged) {
        return;
    }

    await UserState.findOneAndUpdate(
        { user: user._id },
        { user: user._id, serializedState: JSON.stringify(userState) },
        { upsert: true, new: true, runValidators: true },
    );
}

export function normalizeNotificationForInbox(notification) {
    const plain =
        typeof notification?.toObject === "function"
            ? notification.toObject()
            : notification;

    return {
        ...plain,
        inboxKind: "notification",
        status: "completed",
        progress: 1,
    };
}

export function normalizeTaskForInbox(task) {
    const plain = typeof task?.toObject === "function" ? task.toObject() : task;

    return {
        ...plain,
        inboxKind: "task",
    };
}

export async function getInboxCounts(userId, { teamUnreadCount } = {}) {
    const timeFilter = buildInboxTimeFilter(false);

    const individualCount = await Notification.countDocuments({
        assistantRootId: null,
        owner: userId,
        read: { $ne: true },
        ...timeFilter,
    });

    const unreadTeams =
        teamUnreadCount ??
        (await teamInboxSnapshot(userId, { includeViews: false })).unreadCount;
    return {
        unreadNotificationCount: individualCount + unreadTeams,
        activeTaskCount: 0,
    };
}

export async function markNotificationsRead(
    userId,
    { ids = [], all = false } = {},
) {
    const filter = {
        owner: userId,
        read: { $ne: true },
        dismissed: { $ne: true },
    };

    if (!all) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return { modifiedCount: 0 };
        }
        filter._id = { $in: ids };
    }

    const result = await Notification.updateMany(filter, {
        $set: { read: true },
    });

    return { modifiedCount: result.modifiedCount || 0 };
}

export async function listInboxItems(
    userId,
    { page = 1, limit = 10, showDismissed = false } = {},
) {
    const timeFilter = buildInboxTimeFilter(showDismissed);
    const skip = (page - 1) * limit;
    const perCollectionLimit = skip + limit + 1;

    const taskMatch = {
        owner: userId,
        type: { $nin: ["resource-shared", "build-digest"] },
        assistantTeamRevision: { $not: { $gt: 0 } },
        assistantDepth: { $not: { $gt: 0 } },
        ...timeFilter,
    };
    const notificationMatch = {
        owner: userId,
        assistantRootId: null,
        ...timeFilter,
    };

    const teamSnapshot = await teamInboxSnapshot(userId, { showDismissed });
    const [taskItems, notificationItems, taskTotal, notificationTotal, counts] =
        await Promise.all([
            Task.find(taskMatch)
                .sort({ createdAt: -1, _id: -1 })
                .limit(perCollectionLimit)
                .lean(),
            Notification.find(notificationMatch)
                .sort({ createdAt: -1, _id: -1 })
                .limit(perCollectionLimit)
                .lean(),
            Task.countDocuments(taskMatch),
            Notification.countDocuments(notificationMatch),
            showDismissed
                ? Promise.resolve({
                      unreadNotificationCount: 0,
                      activeTaskCount: 0,
                  })
                : getInboxCounts(userId, {
                      teamUnreadCount: teamSnapshot.unreadCount,
                  }),
        ]);

    const combinedItems = [
        ...teamSnapshot.items,
        ...taskItems.map(normalizeTaskForInbox),
        ...notificationItems.map(normalizeNotificationForInbox),
    ].sort((a, b) => {
        const bTime =
            new Date(b.team ? b.updatedAt : b.createdAt).getTime() || 0;
        const aTime =
            new Date(a.team ? a.updatedAt : a.createdAt).getTime() || 0;
        return (
            inboxAttentionRank(a) - inboxAttentionRank(b) ||
            bTime - aTime ||
            String(b._id).localeCompare(String(a._id))
        );
    });

    const total = taskTotal + notificationTotal + teamSnapshot.items.length;
    const pageItems = combinedItems.slice(skip, skip + limit + 1);
    const hasMore = pageItems.length > limit;
    const requests = hasMore ? pageItems.slice(0, limit) : pageItems;

    return {
        requests: await hydrateTeamInboxItems(userId, requests),
        hasMore,
        total,
        ...counts,
    };
}
