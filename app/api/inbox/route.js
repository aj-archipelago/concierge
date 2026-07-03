import { NextResponse } from "next/server";
import { getCurrentUser } from "../utils/auth";
import Automation from "../models/automation.js";
import { ensureInboxMigrations, listInboxItems } from "../utils/inbox.js";

export const dynamic = "force-dynamic";

async function enrichAutomationTasks(tasks, ownerId) {
    const automationIds = [
        ...new Set(
            tasks
                .map(
                    (task) =>
                        task?.automationRefId || task?.automation?.automationId,
                )
                .filter(Boolean)
                .map(String),
        ),
    ];

    if (!automationIds.length) {
        return tasks;
    }

    const automations = await Automation.find({
        _id: { $in: automationIds },
        owner: ownerId,
    })
        .select("name slug")
        .lean();
    const automationById = new Map(
        automations.map((automation) => [
            automation._id.toString(),
            automation,
        ]),
    );

    return tasks.map((task) => {
        const automation = automationById.get(
            (
                task?.automationRefId || task?.automation?.automationId
            )?.toString(),
        );
        if (!automation) {
            return task;
        }

        return {
            ...task,
            automation: {
                ...task.automation,
                name: automation.name,
                slug: automation.slug,
            },
        };
    });
}

export async function GET(request) {
    try {
        const user = await getCurrentUser();
        await ensureInboxMigrations(user);

        const { searchParams } = new URL(request.url);
        const showDismissed = searchParams.get("showDismissed") === "true";
        const page = parseInt(searchParams.get("page"), 10) || 1;
        const limit = parseInt(searchParams.get("limit"), 10) || 10;

        const { requests, hasMore, unreadNotificationCount, activeTaskCount } =
            await listInboxItems(user._id, {
                page,
                limit,
                showDismissed,
            });

        const taskItems = requests.filter((item) => item.inboxKind === "task");
        const enrichedTasks = await enrichAutomationTasks(taskItems, user._id);
        const enrichedTaskById = new Map(
            enrichedTasks.map((task) => [String(task._id), task]),
        );

        const hydratedRequests = requests.map((item) =>
            item.inboxKind === "task"
                ? enrichedTaskById.get(String(item._id)) || item
                : item,
        );

        return NextResponse.json({
            requests: hydratedRequests,
            hasMore,
            unreadNotificationCount,
            activeTaskCount,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const user = await getCurrentUser();
        const { _id, inboxKind = "task" } = await request.json();

        if (inboxKind === "notification") {
            const Notification = (await import("../models/notification.mjs"))
                .default;
            await Notification.findOneAndUpdate(
                { _id, owner: user._id },
                { dismissed: true },
            );
        } else {
            const Task = (await import("../models/task.mjs")).default;
            await Task.findOneAndUpdate(
                { _id, owner: user._id },
                { dismissed: true },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const user = await getCurrentUser();
        const { _id, inboxKind = "task" } = await request.json();
        const { deleteTask } = await import("../utils/task-utils.mjs");

        if (inboxKind === "notification") {
            const Notification = (await import("../models/notification.mjs"))
                .default;
            await Notification.deleteOne({ _id, owner: user._id });
        } else {
            await deleteTask(_id, user._id);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
