import { Queue } from "bullmq";
import { getRedisConnection } from "./redis.mjs";

const requestProgressQueue = new Queue("task", {
    connection: getRedisConnection(),
});

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
        const tenSecondsAgo = new Date(Date.now() - 10000); // 10 seconds in milliseconds
        if (new Date(task.lastHeartbeat) < tenSecondsAgo) {
            task.status = "abandoned";
            await task.save();
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
 * Syncs the task status with BullMQ job status if jobId is present.
 * If the job is failed, updates the task in the DB.
 * @param {Object} task - The task document to check and update
 * @returns {Object} The potentially updated task
 */
export async function syncTaskWithBullMQJob(task) {
    if (!task?.jobId) return task;

    const job = await requestProgressQueue.getJob(task.jobId);

    const status = await job.getState();

    if (
        jobStatusToTaskStatus[status] &&
        task.status !== jobStatusToTaskStatus[status]
    ) {
        task.status = jobStatusToTaskStatus[status];
        task.statusText = job.failedReason;
        await task.save();
    }

    if (job && job.failedReason && task.status !== "failed") {
        task.status = "failed";
        task.statusText = job.failedReason;
        await task.save();
    }

    return task;
}

/**
 * Retries a failed or abandoned task by re-adding it to the BullMQ queue and updating its status.
 * @param {Object} task - The task document to retry
 * @returns {Object} The updated task
 */
export async function retryTask(task) {
    if (!task) throw new Error("No task provided");

    if (task.status !== "failed" && task.status !== "abandoned") {
        throw new Error("Only failed or abandoned tasks can be retried");
    }

    let retried = false;

    console.log("task", task);

    if (task.jobId) {
        console.log("task.jobId", task.jobId);
        const job = await requestProgressQueue.getJob(task.jobId);

        const status = await job.getState();
        console.log("job", status);

        if (status === "failed") {
            await job.retry();
            retried = true;
        }
    }

    if (retried) {
        // Optionally update task status
        task.status = "pending";
        task.statusText = "";
        await task.save();
    }

    return task;
}
