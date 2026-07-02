import mongoose from "mongoose";
import { NextResponse } from "next/server";
import Task from "../../models/task.mjs";
import { getCurrentUser } from "../../utils/auth";
import {
    checkAndUpdateAbandonedTask,
    syncTaskWithBullMQJob,
} from "../../utils/task-utils.mjs";
import { normalizeTaskForInbox } from "../../utils/inbox.js";

const ACTIVE_TASK_STATUSES = ["pending", "in_progress"];
const TERMINAL_TASK_STATUSES = new Set([
    "abandoned",
    "cancelled",
    "completed",
    "failed",
]);
const MAX_LIVE_TASKS = 50;
const MAX_TRACKED_IDS = 50;

function parseTaskIds(searchParams) {
    const rawIds = searchParams
        .get("ids")
        ?.split(",")
        .map((id) => id.trim())
        .filter(Boolean);

    return [
        ...new Set(
            (rawIds || [])
                .filter((id) => mongoose.Types.ObjectId.isValid(id))
                .slice(0, MAX_TRACKED_IDS),
        ),
    ];
}

async function syncLiveTask(task) {
    if (!task || TERMINAL_TASK_STATUSES.has(task.status)) {
        return task;
    }

    let syncedTask = await syncTaskWithBullMQJob(task);
    syncedTask = await checkAndUpdateAbandonedTask(syncedTask);
    return syncedTask;
}

export async function GET(request) {
    try {
        const user = await getCurrentUser();
        const { searchParams } = new URL(request.url);
        const trackedIds = parseTaskIds(searchParams);

        const activeQuery = {
            owner: user._id,
            type: { $ne: "resource-shared" },
            dismissed: { $ne: true },
            status: { $in: ACTIVE_TASK_STATUSES },
        };

        const trackedQuery =
            trackedIds.length > 0
                ? {
                      owner: user._id,
                      type: { $ne: "resource-shared" },
                      dismissed: { $ne: true },
                      _id: { $in: trackedIds },
                  }
                : null;

        const [activeTasks, trackedTasks] = await Promise.all([
            Task.find(activeQuery)
                .sort({ createdAt: -1 })
                .limit(MAX_LIVE_TASKS),
            trackedQuery ? Task.find(trackedQuery) : Promise.resolve([]),
        ]);

        const taskById = new Map();
        for (const task of [...activeTasks, ...trackedTasks]) {
            taskById.set(task._id.toString(), task);
        }

        const syncedTasks = await Promise.all(
            Array.from(taskById.values()).map((task) => syncLiveTask(task)),
        );
        const normalizedTasks = syncedTasks
            .filter(Boolean)
            .map((task) => normalizeTaskForInbox(task));

        const activeTaskCount = await Task.countDocuments(activeQuery);

        return NextResponse.json({
            tasks: normalizedTasks,
            activeTaskCount,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic";
