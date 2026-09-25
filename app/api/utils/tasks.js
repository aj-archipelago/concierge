import {
    isBoundedBackgroundTask,
    BACKGROUND_RUNTIME_MS,
} from "./background-policy.mjs";
import { Queue } from "bullmq";
import { createHash } from "node:crypto";
import Task from "../models/task.mjs";
import { assertMediaGenerationInputs } from "../../../src/utils/mediaGenerationValidation.js";
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

export function getBackgroundTaskId({
    userId,
    type,
    invokedFrom,
    idempotencyKey,
}) {
    // Blue and production can share Redis; copied applet/user IDs must not
    // share a queue receipt across Mongo databases or credential rotations.
    const database = (process.env.MONGO_URI || "local")
        .replace(/\/\/[^/]*@/, "//")
        .split("?")[0];
    return idempotencyKey
        ? createHash("sha256")
              .update(
                  JSON.stringify([
                      database,
                      String(userId),
                      type,
                      String(invokedFrom?.appletId || ""),
                      idempotencyKey,
                  ]),
              )
              .digest("hex")
              .slice(0, 24)
        : null;
}

async function createBackgroundTask({
    userId,
    type,
    metadata,
    timeout = 5 * 60 * 1000, // default 5 minutes
    synchronous = false, // Add synchronous flag
    invokedFrom,
    automation,
    idempotencyKey,
    beforeCreate,
    beforeEnqueue,
    assistantRouting,
}) {
    if (type === "media-generation") assertMediaGenerationInputs(metadata);
    if (idempotencyKey && synchronous) {
        throw new Error("Idempotent tasks must use the background queue");
    }
    const taskId = getBackgroundTaskId({
        userId,
        type,
        invokedFrom,
        idempotencyKey,
    });
    const bounded = isBoundedBackgroundTask(type);
    const existingTask = taskId ? await Task.findById(taskId) : null;
    if (!existingTask && beforeCreate) await beforeCreate();
    // Create initial progress record with pending status
    const initialTask = {
        ...(bounded && !synchronous ? { dispatchPending: true } : {}),
        owner: userId,
        type,
        status: "pending",
        progress: 0,
        metadata,
        invokedFrom,
        automation,
        automationRefId: automation?.automationId ?? null,
        ...(type === "assistant-run" && assistantRouting
            ? {
                  assistantEntityId: assistantRouting.entityId,
                  assistantRootId: assistantRouting.rootId,
                  assistantDepth: assistantRouting.depth,
              }
            : {}),
    };
    const requestProgress =
        existingTask ||
        (await retryDbOperation(async () => {
            if (!taskId) return Task.create(initialTask);
            try {
                return await Task.findOneAndUpdate(
                    { _id: taskId },
                    {
                        $setOnInsert: {
                            ...initialTask,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    },
                    { upsert: true, new: true, timestamps: false },
                );
            } catch (error) {
                if (error.code !== 11000) throw error;
                const existing = await Task.findById(taskId);
                if (!existing) throw error;
                return existing;
            }
        }));

    if (
        taskId &&
        ((!bounded && requestProgress.jobId) ||
            requestProgress.status !== "pending" ||
            requestProgress.executionStartedAt)
    ) {
        return { taskId: requestProgress._id };
    }

    const jobData = {
        taskId: requestProgress._id,
        type,
        ...(type === "assistant-run"
            ? {
                  assistantRootId: String(
                      requestProgress.assistantRootId || requestProgress._id,
                  ),
              }
            : {}),
        userId,
        metadata: taskId ? requestProgress.metadata : metadata,
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

    if (beforeEnqueue && !(await beforeEnqueue(requestProgress))) {
        await Task.findOneAndUpdate(
            {
                _id: requestProgress._id,
                status: "pending",
                executionStartedAt: null,
            },
            { $set: { status: "cancelled", dispatchPending: false } },
        );
        return { taskId: requestProgress._id };
    }

    // Async path: Add job to queue
    const job = await requestProgressQueue.add("task", jobData, {
        timeout: bounded ? BACKGROUND_RUNTIME_MS : timeout,
        ...(bounded || type === "assistant-run" ? { priority: 10 } : {}),
        ...(taskId || bounded ? { jobId: String(requestProgress._id) } : {}),
        // Keep the queue receipt for reusable assets. A request interrupted
        // between enqueue and the DB update must never resubmit paid work,
        // even after the ordinary seven-day job retention window.
        removeOnComplete:
            taskId && !bounded
                ? false
                : {
                      age: 24 * 3600 * 7,
                  },
        removeOnFail:
            taskId && !bounded
                ? false
                : {
                      age: 24 * 3600 * 7,
                  },
    });

    // Update the Task document with the job id
    await retryDbOperation(() =>
        Task.findByIdAndUpdate(requestProgress._id, {
            jobId: job.id,
            ...(bounded ? { dispatchPending: false } : {}),
        }),
    );

    return {
        job,
        taskId: requestProgress._id,
    };
}

export { createBackgroundTask, requestProgressQueue };

// Each continuation has a different queue receipt but keeps the same logical
// task/run ID. Replaying reconciliation cannot enqueue the same turn twice.
export async function enqueueAssistantContinuation(task) {
    const jobId = `assistant-${task._id}-${task.assistantTurn}`;
    await requestProgressQueue.add(
        "task",
        {
            taskId: String(task._id),
            type: task.type,
            userId: String(task.owner),
            metadata: task.metadata || {},
            automation: task.automation,
            assistantTurn: task.assistantTurn,
            assistantRootId: String(task.assistantRootId || task._id),
        },
        {
            jobId,
            timeout: 15 * 60 * 1000,
            priority: 10,
            removeOnComplete: { age: 7 * 24 * 3600 },
            removeOnFail: { age: 7 * 24 * 3600 },
        },
    );
    await Task.updateOne(
        { _id: task._id, assistantTurn: task.assistantTurn },
        { $set: { jobId } },
    );
}
