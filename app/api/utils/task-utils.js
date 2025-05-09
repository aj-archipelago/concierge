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
        // Optionally, you can return the updated task:
        // return await Task.findById(task._id);
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
        // Optionally update task status
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
    }

    console.log(`Retried task ${task._id}. Job ID ${task.jobId}`);
    return task;
}
