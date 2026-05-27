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

const QUEUE_NAME = "automation-scheduler";
const SCHEDULER_TICK_JOB = "automation-scheduler-tick";
const SCHEDULER_REPEAT = { every: 60 * 1000 };
const CLAIM_STALE_MS = 10 * 60 * 1000;

/** Exclude manual schedules and docs without a runnable frequency */
const SCHEDULED_FREQUENCIES = ["hourly", "daily", "weekly"];

const connection = getRedisConnection();
const queue = new Queue(QUEUE_NAME, { connection });

async function hasActiveRun(automation) {
    return hasActiveAutomationRun(automation._id, automation.owner);
}

async function enqueueDueAutomation(automation, logger) {
    const now = new Date();
    const scheduledFor = automation.nextRunAt || now;
    const nextRunAt = calculateNextRunAt(
        automation.schedule,
        automation.timezone,
        now,
    );
    const staleLockedBefore = new Date(now.getTime() - CLAIM_STALE_MS);

    const claimed = await Automation.findOneAndUpdate(
        {
            _id: automation._id,
            enabled: true,
            "schedule.frequency": { $in: SCHEDULED_FREQUENCIES },
            nextRunAt: automation.nextRunAt,
            $or: [
                { schedulerLockedAt: null },
                { schedulerLockedAt: { $exists: false } },
                { schedulerLockedAt: { $lt: staleLockedBefore } },
            ],
        },
        {
            schedulerLockedAt: now,
            nextRunAt,
            lastEnqueuedAt: now,
        },
        { new: true },
    );

    if (!claimed) {
        return;
    }

    if (await hasActiveRun(claimed)) {
        await Automation.findByIdAndUpdate(claimed._id, {
            $unset: { schedulerLockedAt: 1 },
        });
        logger.log(`Skipped automation ${claimed._id}; run already active`);
        return;
    }

    await createBackgroundTask({
        userId: claimed.owner,
        type: AUTOMATION_TASK_TYPE,
        timeout: 15 * 60 * 1000,
        metadata: {
            automationId: claimed._id.toString(),
            automationName: claimed.name,
            automationSlug: claimed.slug,
            trigger: "scheduled",
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

    logger.log(`Enqueued automation ${claimed._id}`);
}

async function enqueueDueAutomations(logger) {
    const now = new Date();
    const dueAutomations = await Automation.find({
        enabled: true,
        // Exclude manual-only and null nextRunAt — BSON null satisfies $lte
        "schedule.frequency": { $in: SCHEDULED_FREQUENCIES },
        nextRunAt: { $ne: null, $lte: now },
    })
        .limit(200)
        .lean();
    dueAutomations.sort(
        (a, b) => new Date(a.nextRunAt || 0) - new Date(b.nextRunAt || 0),
    );

    for (const automation of dueAutomations.slice(0, 50)) {
        await enqueueDueAutomation(automation, logger);
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

let worker;

async function run() {
    await ensureRepeatableJob();
    worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            await ensureDbConnection();
            const logger = new Logger(job, queue);
            await enqueueDueAutomations(logger);
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

    worker.run();
}

async function close() {
    await worker?.close();
    await queue.close();
}

const automationScheduler = { run, close };

export default automationScheduler;
export { enqueueDueAutomations };
