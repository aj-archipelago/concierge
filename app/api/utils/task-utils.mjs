import { Queue } from "bullmq";
import { getRedisConnection } from "./redis.mjs";
import Task from "../models/task.mjs";

const requestProgressQueue = new Queue("task", {
    connection: getRedisConnection(),
});

const ABANDONED_TASK_THRESHOLD = 30000; // 30 seconds in milliseconds

/**
 * Checks if a task should be marked as abandoned and updates it if necessary
 * @param {Object} task - The task document to check
 * @returns {Object} The potentially updated task
 */
export async function checkAndUpdateAbandonedTask(task) {
    if (!task) return task;

    if (
        task.lastHeartbeat &&
        task.status !== "abandoned" &&
        task.status !== "completed" &&
        task.status !== "failed"
    ) {
        const abandonedThreshold = new Date(
            Date.now() - ABANDONED_TASK_THRESHOLD,
        ); // 30 seconds in milliseconds
        if (new Date(task.lastHeartbeat) < abandonedThreshold) {
            task = await Task.findByIdAndUpdate(
                task._id,
                {
                    status: "abandoned",
                },
                { new: true },
            );
            await copyTaskToChatMessage(task);
        }
    }
    return task;
}

const jobStatusToTaskStatus = {
    completed: "completed",
    failed: "failed",
    waiting: "pending",
    active: "in_progress",
    delayed: "pending",
};

/**
 * Copies task data to the associated chat message if the task was invoked from a chat
 * @param {Object} task - The task document to copy
 * @returns {Promise<void>}
 */
export async function copyTaskToChatMessage(task) {
    if (!task?.invokedFrom?.source === "chat" || !task?.invokedFrom?.chatId) {
        return;
    }

    const Chat = (await import("../models/chat.mjs")).default;
    const chat = await Chat.findById(task.invokedFrom.chatId);
    if (!chat) {
        return;
    }

    // Find the message with this taskId
    const messageIndex = chat.messages.findIndex(
        (msg) => msg.taskId?.toString() === task._id.toString(),
    );

    console.log(`Message index: ${messageIndex} ${task._id}`);
    if (messageIndex === -1) {
        return;
    }

    // Create a new messages array with the updated task
    const updatedMessages = [...chat.messages];
    updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        task: task.toObject(),
    };

    // Update the entire messages array using findOneAndUpdate
    await Chat.findOneAndUpdate(
        { _id: task.invokedFrom.chatId },
        { $set: { messages: updatedMessages } },
        { new: true },
    );
}

/**
 * Syncs the task status with BullMQ job status if jobId is present.
 * If the job is failed, updates the task in the DB.
 * @param {Object} task - The task document to check and update
 * @returns {Object} The potentially updated task
 */
export async function syncTaskWithBullMQJob(task) {
    if (!task?.jobId) return task;

    const job = await requestProgressQueue.getJob(task.jobId);

    if (!job) return task;
    const status = await job.getState();

    let update = {};

    if (
        jobStatusToTaskStatus[status] &&
        task.status !== jobStatusToTaskStatus[status] &&
        task.status !== "cancelled"
    ) {
        update.status = jobStatusToTaskStatus[status];
        update.statusText = job.failedReason;
    }

    if (job && job.failedReason && task.status !== "failed") {
        update.status = "failed";
        update.statusText = job.failedReason;
    }

    if (Object.keys(update).length > 0) {
        await Task.findByIdAndUpdate(task._id, update, { new: true });

        if (update.status === "failed" || update.status === "completed") {
            await copyTaskToChatMessage(task);
        }
    }

    return task;
}

/**
 * Removes the task object from the associated chat message while keeping the taskId reference
 * @param {Object} task - The task document
 * @returns {Promise<void>}
 */
export async function removeTaskFromChatMessage(task) {
    if (!task?.invokedFrom?.source === "chat" || !task?.invokedFrom?.chatId) {
        return;
    }

    const Chat = (await import("../models/chat.mjs")).default;
    const chat = await Chat.findById(task.invokedFrom.chatId);
    if (!chat) {
        return;
    }

    const messageIndex = chat.messages.findIndex(
        (msg) => msg.taskId?.toString() === task._id.toString(),
    );
    if (messageIndex === -1) {
        return;
    }

    // Create a new messages array with the task removed
    const updatedMessages = [...chat.messages];
    updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        task: undefined,
    };

    // Update the entire messages array using findOneAndUpdate
    await Chat.findOneAndUpdate(
        { _id: task.invokedFrom.chatId },
        { $set: { messages: updatedMessages } },
        { new: true },
    );
}

/**
 * Retries a failed or abandoned task by re-adding it to the BullMQ queue and updating its status.
 * @param {Object} task - The task document to retry
 * @returns {Object} The updated task
 */
export async function retryTask(task) {
    if (!task) throw new Error("No task provided");

    console.log(`Trying to retry task ${task._id}. Job ID ${task.jobId}`);
    if (
        task.status !== "failed" &&
        task.status !== "abandoned" &&
        task.status !== "cancelled"
    ) {
        throw new Error(
            "Only failed, abandoned or cancelled tasks can be retried",
        );
    }

    let retried = false;

    if (task.jobId) {
        let job = await requestProgressQueue.getJob(task.jobId);

        if (!job) return task;

        const status = await job.getState();

        if (status === "failed") {
            await job.retry();
        } else {
            console.log(
                `Job ${task.jobId} is not failed. Will create a new job for this task.`,
            );
            const data = job.data;
            try {
                await job.discard();
                await job.remove();
            } catch (error) {
                // This can happen if there's a lock on the job, in which case we can just ignore it
            }

            delete data.id;

            job = await requestProgressQueue.add("task", data);

            await Task.findByIdAndUpdate(
                task._id,
                {
                    jobId: job.id,
                    lastHeartbeat: new Date(),
                },
                { new: true },
            );
        }
        retried = true;
    }

    if (retried) {
        // Update task status
        task.status = "pending";
        task.statusText = "";
        task = await Task.findByIdAndUpdate(
            task._id,
            {
                status: "pending",
                statusText: "",
            },
            { new: true },
        );

        // Remove cached task object from chat message
        await removeTaskFromChatMessage(task);
    }

    console.log(`Retried task ${task._id}. Job ID ${task.jobId}`);
    return task;
}

/**
 * Deletes a task and its associated BullMQ job if it exists
 * @param {string} taskId - The ID of the task to delete
 * @param {string} userId - The ID of the user who owns the task
 * @returns {Promise<boolean>} True if deletion was successful
 * @throws {Error} If task deletion fails or task doesn't exist
 */
export async function deleteTask(taskId, userId) {
    try {
        // Delete the task from the database
        const result = await Task.findOneAndDelete({
            _id: taskId,
            owner: userId,
        });

        if (!result) {
            throw new Error("Task not found");
        }

        return true;
    } catch (error) {
        console.error(`Error deleting task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Cancels a task by removing its BullMQ job and updating its status
 * @param {string} taskId - The ID of the task to cancel
 * @param {string} userId - The ID of the user who owns the task
 * @returns {Promise<Object>} The updated task
 * @throws {Error} If task cancellation fails or task doesn't exist
 */
export async function cancelTask(taskId, userId) {
    try {
        // Find the request and verify ownership
        const task = await Task.findOne({
            _id: taskId,
            owner: userId,
        });

        if (!task) {
            throw new Error("Request not found");
        }

        // Get active jobs for this request
        const jobs = await requestProgressQueue.getJobs(["waiting"]);
        const job = jobs.find((job) => job.data.taskId === taskId);

        if (job) {
            await job.remove();
        }

        // Update request status
        const updatedTask = await Task.findOneAndUpdate(
            { _id: taskId },
            { status: "cancelled" },
            { new: true },
        );

        // Copy the cancelled task to chat message
        await copyTaskToChatMessage(updatedTask);

        return updatedTask;
    } catch (error) {
        console.error("Cancel task error:", error);
        throw error;
    }
}
