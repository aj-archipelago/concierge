import { NextResponse } from "next/server";
import { getCurrentUser } from "../utils/auth";
import { createBackgroundTask } from "../utils/tasks";
import {
    checkAndUpdateAbandonedTask,
    syncTaskWithBullMQJob,
    deleteTask,
} from "../utils/task-utils.mjs";

import Task from "../models/task.mjs";
import UserState from "../models/user-state.mjs";
import Chat from "../models/chat.mjs";
import { prepareMessagesForPersistence } from "../chats/persistence.js";
import Automation from "../models/automation.js";
import {
    assertTranscribeModelOptionEnabled,
    getTranscribeTaskTimeout,
    normalizeTranscribeTaskMetadata,
} from "../utils/transcribe-model-options";
import { migrateTasks } from "../utils/task-migration.mjs";

/**
 * Adds a progress message to a chat for a given task
 * @param {string} chatId - The ID of the chat
 * @param {string} taskId - The ID of the task
 * @param {Object} user - The current user
 */
async function addProgressMessageToChat(chatId, taskId, user) {
    try {
        // First, fetch the entire chat document
        const chat = await Chat.findOne({ _id: chatId, userId: user._id });

        if (chat) {
            // Get the task to access its type
            const task = await Task.findById(taskId);
            const taskType = task?.type || "task";

            // Create the progress message
            const progressMessage = {
                payload: `A ${taskType} task has been enqueued and is in progress.`,
                sender: "assistant",
                sentTime: new Date().toISOString(),
                direction: "incoming",
                position: "single",
                taskId: taskId,
                isServerGenerated: true,
            };

            // Create a new messages array with all existing messages plus the new one
            const prepared = prepareMessagesForPersistence([
                ...(chat.messages || []),
                progressMessage,
            ]);
            const updateData = {
                messages: prepared.messages,
                isChatLoading: false,
                messageStorageBytes: prepared.messageStorageBytes,
            };
            if (prepared.messagesCompacted) {
                updateData.messagesCompacted = true;
                updateData.messagesCompactedAt = new Date();
            }

            // Replace the entire messages array in one operation
            await Chat.findOneAndUpdate(
                { _id: chatId, userId: user._id },
                updateData,
            );

            console.log(
                `Added progress message to chat ${chatId} for task ${taskId}`,
            );
        } else {
            console.warn(
                `Chat ${chatId} not found or doesn't belong to user ${user._id}`,
            );
        }
    } catch (error) {
        console.error(
            `Error adding progress message to chat: ${error.message}`,
        );
        // Don't fail if message adding fails
    }
}

async function enrichAutomationTasks(tasks, ownerId) {
    const automationIds = [
        ...new Set(
            tasks
                .map((task) =>
                    (
                        task?.automationRefId || task?.automation?.automationId
                    )?.toString(),
                )
                .filter(Boolean),
        ),
    ];

    if (automationIds.length === 0) {
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
        const obj =
            typeof task?.toObject === "function"
                ? task.toObject({ virtuals: true })
                : task;
        const automation = automationById.get(
            (obj?.automationRefId || obj?.automation?.automationId)?.toString(),
        );
        if (!automation) {
            return obj;
        }

        return {
            ...obj,
            automation: {
                ...obj.automation,
                name: automation.name,
                slug: automation.slug,
            },
        };
    });
}

export async function GET(request) {
    try {
        const user = await getCurrentUser();

        const userStateObject = await UserState.findOne({ user: user._id });
        const userState = JSON.parse(userStateObject?.serializedState || "{}");
        if (!userState.tasksMigrated) {
            await migrateTasks(user._id);
            userState.tasksMigrated = true;
            userStateObject.serializedState = JSON.stringify(userState);
            await userStateObject.save();
        }

        const { searchParams } = new URL(request.url);
        const showDismissed = searchParams.get("showDismissed") === "true";
        const page = parseInt(searchParams.get("page")) || 1;
        const limit = parseInt(searchParams.get("limit")) || 10;

        const query = {
            owner: user._id,
            type: { $ne: "resource-shared" },
        };

        if (!showDismissed) {
            query.dismissed = { $ne: true };
            const fortyEightHoursAgo = new Date(
                Date.now() - 48 * 60 * 60 * 1000,
            );
            query.createdAt = { $gte: fortyEightHoursAgo };
        }

        const requests = await Task.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const syncedRequests = await Promise.all(
            requests.map((task) => syncTaskWithBullMQJob(task)),
        );

        // Check each task for abandoned status
        let updatedRequests = await Promise.all(
            syncedRequests.map((task) => checkAndUpdateAbandonedTask(task)),
        );
        updatedRequests = await enrichAutomationTasks(
            updatedRequests,
            user._id,
        );

        const total = await Task.countDocuments(query);

        return NextResponse.json({
            requests: updatedRequests,
            hasMore: total > page * limit,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const user = await getCurrentUser();
        const { _id } = await request.json();
        await Task.findOneAndUpdate(
            { _id, owner: user._id },
            { dismissed: true },
        );
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const user = await getCurrentUser();
        const { _id } = await request.json();
        await deleteTask(_id, user._id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { type, synchronous = false, source, chatId, ...metadata } = body;

        try {
            // Get current user
            const user = await getCurrentUser();

            let taskMetadata =
                type === "transcribe"
                    ? { ...metadata, contextId: user.contextId }
                    : metadata;

            if (type === "transcribe") {
                try {
                    assertTranscribeModelOptionEnabled(
                        taskMetadata.modelOption,
                    );
                } catch (error) {
                    return NextResponse.json(
                        { error: error.message },
                        { status: 400 },
                    );
                }
                taskMetadata = normalizeTranscribeTaskMetadata(taskMetadata);
            }

            const taskTimeout =
                type === "transcribe"
                    ? getTranscribeTaskTimeout(taskMetadata.modelOption)
                    : undefined;
            const backgroundTaskArgs = {
                userId: user._id,
                type,
                metadata: taskMetadata,
                synchronous,
                invokedFrom: { source, chatId },
            };
            if (taskTimeout) {
                backgroundTaskArgs.timeout = taskTimeout;
            }

            // Create initial progress record and add job to queue
            const result = await createBackgroundTask(backgroundTaskArgs);

            // If chatId is provided, add a progress message to the chat
            if (chatId) {
                await addProgressMessageToChat(chatId, result.taskId, user);
            }

            if (synchronous) {
                return NextResponse.json({
                    taskId: result.taskId,
                    result: result.result,
                });
            }

            return NextResponse.json({
                taskId: result.taskId,
                jobId: result.job.id,
            });
        } catch (error) {
            console.error(`${error.message}:`, error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    } catch (error) {
        console.error(`${error.message}:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic";
