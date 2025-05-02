import { Queue } from "bullmq";
import Task from "../models/task.mjs";
import { getRedisConnection } from "./redis.mjs";

const requestProgressQueue = new Queue("task", {
    connection: getRedisConnection(),
});

async function createBackgroundTask({
    userId,
    type,
    metadata,
    timeout = 5 * 60 * 1000, // default 5 minutes
    synchronous = false, // Add synchronous flag
    invokedFrom,
}) {
    // Create initial progress record with pending status
    const requestProgress = await Task.create({
        owner: userId,
        type,
        status: "pending",
        progress: 0,
        metadata,
        invokedFrom,
    });

    const jobData = {
        taskId: requestProgress._id,
        type,
        userId,
        metadata,
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
            age: 24 * 3600,
            count: 1000,
        },
        removeOnFail: {
            age: 24 * 3600,
        },
    });

    // Update the Task document with the job id
    await Task.findByIdAndUpdate(requestProgress._id, { jobId: job.id });

    return {
        job,
        taskId: requestProgress._id,
    };
}

export { createBackgroundTask };
