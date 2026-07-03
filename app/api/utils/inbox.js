import Task from "../models/task.mjs";
import Notification from "../models/notification.mjs";
import UserState from "../models/user-state.mjs";
import { migrateTasks } from "./task-migration.mjs";

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

    if (!userState.tasksMigrated) {
        await migrateTasks(user._id);
        userState.tasksMigrated = true;
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

export async function getInboxCounts(userId) {
    const timeFilter = buildInboxTimeFilter(false);

    const unreadNotificationCount = await Notification.countDocuments({
        owner: userId,
        read: { $ne: true },
        ...timeFilter,
    });

    return { unreadNotificationCount, activeTaskCount: 0 };
}

export async function markNotificationsRead(
    userId,
    { ids = [], all = false } = {},
) {
    const filter = {
        owner: userId,
        read: { $ne: true },
        dismissed: { $ne: true },
        ...buildInboxTimeFilter(false),
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
        type: { $ne: "resource-shared" },
        ...timeFilter,
    };
    const notificationMatch = {
        owner: userId,
        ...timeFilter,
    };

    const [taskItems, notificationItems, taskTotal, notificationTotal, counts] =
        await Promise.all([
            Task.find(taskMatch)
                .sort({ createdAt: -1 })
                .limit(perCollectionLimit)
                .lean(),
            Notification.find(notificationMatch)
                .sort({ createdAt: -1 })
                .limit(perCollectionLimit)
                .lean(),
            Task.countDocuments(taskMatch),
            Notification.countDocuments(notificationMatch),
            showDismissed
                ? Promise.resolve({
                      unreadNotificationCount: 0,
                      activeTaskCount: 0,
                  })
                : getInboxCounts(userId),
        ]);

    const combinedItems = [
        ...taskItems.map(normalizeTaskForInbox),
        ...notificationItems.map(normalizeNotificationForInbox),
    ].sort((a, b) => {
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        return bTime - aTime;
    });

    const total = taskTotal + notificationTotal;
    const pageItems = combinedItems.slice(skip, skip + limit + 1);
    const hasMore = pageItems.length > limit;
    const requests = hasMore ? pageItems.slice(0, limit) : pageItems;

    return {
        requests,
        hasMore,
        total,
        ...counts,
    };
}
