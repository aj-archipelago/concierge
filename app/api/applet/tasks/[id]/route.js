import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Task from "../../../models/task.mjs";
import { getCurrentUser } from "../../../utils/auth";
import {
    checkAndUpdateAbandonedTask,
    syncTaskWithBullMQJob,
} from "../../../utils/task-utils.mjs";
import { validateAppletAccess } from "../../access.js";
import { APPLET_SDK_LIMITS, withAppletSdkGuard } from "../../sdk-guard.js";

const TERMINAL_TASK_STATUSES = new Set([
    "abandoned",
    "cancelled",
    "completed",
    "failed",
]);

function toPlainTask(task) {
    return typeof task?.toObject === "function" ? task.toObject() : task;
}

function getPublicTaskData(data) {
    if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        typeof data.data === "string"
    ) {
        return data.data;
    }

    return data;
}

function serializePublicTask(task) {
    const plain = toPlainTask(task) || {};
    const id = String(plain._id || "");

    return {
        _id: id,
        taskId: id,
        status: plain.status,
        progress: plain.progress,
        type: plain.type,
        ...(plain.statusText ? { statusText: plain.statusText } : {}),
        ...(plain.data !== undefined
            ? { data: getPublicTaskData(plain.data) }
            : {}),
        ...(plain.error ? { error: plain.error } : {}),
        ...(plain.createdAt ? { createdAt: plain.createdAt } : {}),
        ...(plain.updatedAt ? { updatedAt: plain.updatedAt } : {}),
    };
}

export async function GET(request, { params }) {
    try {
        params = await params;
        const { id } = params;
        const { searchParams } = new URL(request.url);
        const appletId = searchParams.get("appletId");

        if (!appletId) {
            return NextResponse.json(
                { error: "appletId is required" },
                { status: 400 },
            );
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { error: "taskId must be a valid ObjectId" },
                { status: 400 },
            );
        }

        const user = await getCurrentUser();
        const accessError = await validateAppletAccess(appletId, user);
        if (accessError) {
            return accessError;
        }

        return await withAppletSdkGuard({
            appletId,
            userId: user._id,
            api: "tasks.get",
            limits: APPLET_SDK_LIMITS.read,
            run: async () => {
                const task = await Task.findOne({
                    _id: id,
                    owner: user._id,
                    "invokedFrom.source": "applet_sdk",
                    "invokedFrom.appletId": appletId,
                });

                if (!task) {
                    return NextResponse.json(
                        { error: "task not found" },
                        { status: 404 },
                    );
                }

                let syncedTask = task;
                if (!TERMINAL_TASK_STATUSES.has(task.status)) {
                    syncedTask = await syncTaskWithBullMQJob(task);
                }
                const updatedTask =
                    await checkAndUpdateAbandonedTask(syncedTask);
                return NextResponse.json(serializePublicTask(updatedTask));
            },
        });
    } catch (error) {
        console.error("[applet/tasks] Failed to fetch task:", error);
        return NextResponse.json(
            { error: "Failed to fetch task" },
            { status: 500 },
        );
    }
}
