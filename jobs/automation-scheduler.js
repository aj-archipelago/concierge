import { reconcileBackgroundTasks } from "./background-reconcile.mjs";
import {
    claimAutomationDispatch,
    releaseAutomationDispatch,
} from "../app/api/utils/automation-dispatch-lock.mjs";
import User from "../app/api/models/user.mjs";
import {
    colleagueRequest,
    requireColleague,
} from "../app/api/utils/colleagues.js";
import { deliverColleagueMessages } from "./colleague-delivery.js";
import { reconcileAssistantMessages } from "../app/api/utils/assistant-coordination.mjs";
import { Queue, Worker } from "bullmq";
import { getRedisConnection } from "../app/api/utils/redis.mjs";
import { createBackgroundTask } from "../app/api/utils/tasks.js";
import Automation from "../app/api/models/automation.js";
import {
    AUTOMATION_TASK_TYPE,
    calculateNextRunAt,
    hasActiveAutomationRun,
} from "../app/api/automations/utils.js";
import { ensureDbConnection } from "./db-connection.js";
import { Logger } from "./logger.js";
import { managedWorker } from "./managed-worker.js";

const QUEUE_NAME = "automation-scheduler";
const SCHEDULER_TICK_JOB = "automation-scheduler-tick";
const SCHEDULER_REPEAT = { every: 60 * 1000 };

/** Exclude manual schedules and docs without a runnable frequency */
const SCHEDULED_FREQUENCIES = ["hourly", "daily", "weekly", "files"];

const connection = getRedisConnection();
const queue = new Queue(QUEUE_NAME, { connection });

async function hasActiveRun(automation) {
    return hasActiveAutomationRun(automation._id, automation.owner);
}

export async function enqueueDueAutomation(automation, logger) {
    const now = new Date();
    const scheduledFor = automation.nextRunAt || now;
    const nextRunAt = calculateNextRunAt(
        automation.schedule,
        automation.timezone,
        now,
    );
    const claimed = await claimAutomationDispatch(automation._id, {
        enabled: true,
        "schedule.frequency": { $in: SCHEDULED_FREQUENCIES },
        nextRunAt: automation.nextRunAt,
    });
    const advance = (fields = {}) =>
        releaseAutomationDispatch(claimed, { nextRunAt, ...fields });

    if (!claimed) {
        return;
    }

    if (await hasActiveRun(claimed)) {
        await advance();
        logger.log(`Skipped automation ${claimed._id}; run already active`);
        return;
    }

    let fingerprint = null;
    try {
        if (claimed.entityId) {
            const user = await User.findById(claimed.owner);
            await requireColleague(user, claimed.entityId, { runnable: true });
            if (claimed.schedule.frequency === "files") {
                const watch = await colleagueRequest("watch", {
                    userId: user.contextId,
                    entityId: claimed.entityId,
                    path: claimed.schedule.watchPath,
                });
                fingerprint = watch.fingerprint;
                if (claimed.watchError)
                    await Automation.findByIdAndUpdate(claimed._id, {
                        $set: { watchError: null },
                    });
                if (
                    fingerprint &&
                    claimed.watchFingerprint &&
                    fingerprint !== claimed.watchFingerprint &&
                    fingerprint !== claimed.watchCandidate
                ) {
                    await advance({ watchCandidate: fingerprint });
                    return;
                }
                if (
                    !fingerprint ||
                    !claimed.watchFingerprint ||
                    fingerprint === claimed.watchFingerprint
                ) {
                    await advance(
                        fingerprint
                            ? {
                                  watchFingerprint: fingerprint,
                                  watchCandidate: fingerprint,
                              }
                            : {},
                    );
                    return;
                }
            }
        }
    } catch (error) {
        await advance({ watchError: error.message });
        logger.log(`Skipped colleague task ${claimed._id}: ${error.message}`);
        return;
    }
    try {
        await createBackgroundTask({
            userId: claimed.owner,
            type: AUTOMATION_TASK_TYPE,
            idempotencyKey: `schedule:${claimed._id}:${new Date(scheduledFor).toISOString()}`,
            timeout: 15 * 60 * 1000,
            metadata: {
                automationId: claimed._id.toString(),
                automationName: claimed.name,
                automationSlug: claimed.slug,
                trigger:
                    claimed.schedule.frequency === "files"
                        ? "files"
                        : "scheduled",
                scheduledFor,
                inputs: claimed.inputs || null,
            },
            invokedFrom: { source: "automation" },
            automation: {
                automationId: claimed._id,
                trigger: "scheduled",
                scheduledFor,
            },
        });

        await advance({
            lastEnqueuedAt: now,
            ...(fingerprint
                ? {
                      watchFingerprint: fingerprint,
                      watchCandidate: fingerprint,
                  }
                : {}),
        });
    } catch (error) {
        // Preserve the due slot; the durable task outbox covers a crash after
        // task creation or an enqueue whose acknowledgement was lost.
        await releaseAutomationDispatch(claimed);
        throw error;
    }
    logger.log(`Enqueued automation ${claimed._id}`);
}

export async function enqueueDueAutomations(logger) {
    const now = new Date();
    await reconcileBackgroundTasks(logger);
    const missing = await Automation.find({
        enabled: true,
        "schedule.frequency": { $in: SCHEDULED_FREQUENCIES },
        nextRunAt: null,
    })
        .sort({ _id: 1 })
        .limit(100)
        .lean();
    for (const automation of missing) {
        await Automation.findOneAndUpdate(
            {
                _id: automation._id,
                nextRunAt: null,
                updatedAt: automation.updatedAt,
            },
            {
                $set: {
                    nextRunAt: calculateNextRunAt(
                        automation.schedule,
                        automation.timezone,
                        now,
                    ),
                },
            },
        );
    }
    const dueAutomations = await Automation.find({
        enabled: true,
        // Exclude manual-only and null nextRunAt — BSON null satisfies $lte
        "schedule.frequency": { $in: SCHEDULED_FREQUENCIES },
        nextRunAt: { $ne: null, $lte: now },
    })
        .sort({ nextRunAt: 1, _id: 1 })
        .limit(200)
        .lean();
    for (const automation of dueAutomations) {
        try {
            await enqueueDueAutomation(automation, logger);
        } catch (error) {
            logger.log(
                `Automation dispatch failed ${automation._id}: ${error.message}`,
            );
        }
    }
}

async function ensureRepeatableJob() {
    const repeatableJobs = await queue.getRepeatableJobs();
    const existing = repeatableJobs.find(
        (job) => job.name === SCHEDULER_TICK_JOB,
    );
    if (!existing) {
        await queue.add(
            SCHEDULER_TICK_JOB,
            {},
            {
                repeat: SCHEDULER_REPEAT,
                removeOnComplete: { age: 24 * 3600 },
                removeOnFail: { age: 24 * 3600 },
            },
        );
    }
}

const consumer = managedWorker(() => {
    const worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            await ensureDbConnection();
            const logger = new Logger(job, queue);
            await reconcileAssistantMessages().catch((error) =>
                logger.log(`Assistant handoff delivery: ${error.message}`),
            );
            await enqueueDueAutomations(logger);
            await deliverColleagueMessages().catch((error) =>
                logger.log(`Colleague inbox delivery: ${error.message}`),
            );
        },
        { connection, autorun: false, concurrency: 1 },
    );

    worker.on("completed", (job) => {
        const logger = new Logger(job, queue);
        logger.log("automation scheduler tick completed");
    });

    worker.on("failed", (job, error) => {
        const logger = new Logger(job, queue);
        logger.log(`automation scheduler tick failed: ${error.message}`);
    });

    return worker;
}, ensureRepeatableJob);

async function close() {
    await consumer.close();
    await queue.close();
}

const automationScheduler = { run: consumer.run, close };

export default automationScheduler;
