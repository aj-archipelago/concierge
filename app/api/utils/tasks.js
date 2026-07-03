import { Queue } from "bullmq";
import Task from "../models/task.mjs";
import { getRedisConnection } from "./redis.mjs";
import { formatDbErrorForLog, getDbRetryDelayMs } from "./db-retry.mjs";

const requestProgressQueue = new Queue("task", {
    connection: getRedisConnection(),
});

async function retryDbOperation(operation, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.warn(
                `Background task DB operation attempt ${attempt}/${maxRetries} failed: ${formatDbErrorForLog(error)}`,
            );

            if (attempt < maxRetries) {
                const waitTime = getDbRetryDelayMs(error, retryDelay);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                retryDelay *= 2;
            }
        }
    }
    throw lastError;
}

async function createBackgroundTask({
    userId,
    type,
    metadata,
    timeout = 5 * 60 * 1000, // default 5 minutes
    synchronous = false, // Add synchronous flag
    invokedFrom,
    automation,
}) {
    // Create initial progress record with pending status
    const requestProgress = await retryDbOperation(() =>
        Task.create({
            owner: userId,
            type,
            status: "pending",
            progress: 0,
            metadata,
            invokedFrom,
            automation,
            automationRefId: automation?.automationId ?? null,
        }),
    );

    const jobData = {
        taskId: requestProgress._id,
        type,
        userId,
        metadata,
        automation,
    };

    if (synchronous) {
        // Import and execute task directly
        const { executeTask } = await import("./task-executor.mjs");
        const result = await executeTask(jobData);
        return {
            taskId: requestProgress._id,
            result,
        };
    }

    // Async path: Add job to queue
    const job = await requestProgressQueue.add("task", jobData, {
        timeout,
        removeOnComplete: {
            age: 24 * 3600 * 7,
        },
        removeOnFail: {
            age: 24 * 3600 * 7,
        },
    });

    // Update the Task document with the job id
    await retryDbOperation(() =>
        Task.findByIdAndUpdate(requestProgress._id, { jobId: job.id }),
    );

    return {
        job,
        taskId: requestProgress._id,
    };
}

export { createBackgroundTask };
