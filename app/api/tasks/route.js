import { NextResponse } from "next/server";
import { getCurrentUser } from "../utils/auth";
import { createBackgroundTask } from "../utils/tasks";
import {
    checkAndUpdateAbandonedTask,
    syncTaskWithBullMQJob,
} from "../utils/task-utils";

import RequestProgress from "../models/request-progress.mjs";
import Task from "../models/task.mjs";
import UserState from "../models/user-state.mjs";
import Chat from "../models/chat.mjs";

/*  RequestProgress is deprecated. This function migrates the tasks 
    to the new Task model. */
async function migrateTasks(userId) {
    const requestProgresses = await RequestProgress.find({ owner: userId });
    for (const requestProgress of requestProgresses) {
        const task = requestProgress.toJSON();
        try {
            // Ensure encrypted fields have the correct type
            const sanitizedTask = {
                ...task,
                // Convert null to empty object for data and metadata
                data: task.data || {},
                metadata: task.metadata || {},
                // Convert null to empty string for statusText and error
                statusText: task.statusText || "",
                error: task.error || "",
            };

            // Use findOneAndUpdate with upsert to handle existing tasks
            await Task.findOneAndUpdate({ _id: task._id }, sanitizedTask, {
                upsert: true,
                new: true,
            });
        } catch (error) {
            console.error(`Error migrating task ${task._id}`, error);
        }
    }
}

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
                sender: "labeeb",
                sentTime: new Date().toISOString(),
                direction: "incoming",
                position: "single",
                taskId: taskId,
                isServerGenerated: true,
            };

            // Create a new messages array with all existing messages plus the new one
            const messages = [...(chat.messages || []), progressMessage];

            // Replace the entire messages array in one operation
            await Chat.findOneAndUpdate(
                { _id: chatId, userId: user._id },
                {
                    messages: messages,
                    isChatLoading: false,
                },
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

        // Check each task for abandoned status
        const updatedRequests = await Promise.all(
            requests.map((task) => checkAndUpdateAbandonedTask(task)),
            requests.map((task) => syncTaskWithBullMQJob(task)),
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
        await Task.findOneAndDelete({ _id, owner: user._id });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { type, synchronous = false, source, chatId, ...metadata } = body;

        console.log(
            `Starting ${type} request (${synchronous ? "sync" : "async"}):`,
            metadata,
        );

        try {
            // Get current user
            const user = await getCurrentUser();
            console.log("User ID:", user._id);

            // Create initial progress record and add job to queue
            const result = await createBackgroundTask({
                userId: user._id,
                type,
                metadata,
                synchronous,
                invokedFrom: { source, chatId },
            });

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
