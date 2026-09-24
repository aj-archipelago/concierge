import { prepareDigestTask } from "../app/api/utils/digest-dispatch.mjs";
import Task from "../app/api/models/task.mjs";
import { requestProgressQueue } from "../app/api/utils/tasks.js";
import { BACKGROUND_RUNTIME_MS } from "../app/api/utils/background-policy.mjs";
import { getTaskLiveState } from "../app/api/utils/task-liveness.mjs";

// Mongo is the outbox. Redis acknowledgement is recorded only after enqueue;
// deterministic job IDs cover a crash on either side of that acknowledgement.
export async function reconcileBackgroundTasks(logger) {
    const pending = await Task.find({
        dispatchPending: true,
        status: "pending",
    })
        .sort({ createdAt: 1 })
        .limit(100);
    for (const task of pending) {
        if (task.executionStartedAt) continue;
        if (
            task.type === "build-digest" &&
            !(await prepareDigestTask(task)).claimed
        ) {
            await Task.findOneAndUpdate(
                { _id: task._id, status: "pending", executionStartedAt: null },
                { $set: { status: "cancelled", dispatchPending: false } },
            );
            continue;
        }
        const job = await requestProgressQueue.add(
            "task",
            {
                taskId: task._id,
                userId: task.owner,
                type: task.type,
                metadata: task.metadata,
                automation: task.automation,
            },
            {
                jobId: String(task._id),
                timeout: BACKGROUND_RUNTIME_MS,
                priority: 10,
                removeOnComplete: { age: 604800 },
                removeOnFail: { age: 604800 },
            },
        );
        await Task.findOneAndUpdate(
            { _id: task._id, status: "pending" },
            { $set: { jobId: job.id, dispatchPending: false } },
        );
        logger.log(`[Background] Recovered dispatch ${task._id}`);
    }
    // Old tasks do not carry the outbox marker. Repair only proven orphans,
    // never replay them, and never infer death from a stale Mongo heartbeat.
    const old = await Task.find({
        type: { $in: ["automation-run", "build-digest"] },
        status: { $in: ["pending", "in_progress"] },
        dispatchPending: { $ne: true },
        updatedAt: { $lt: new Date(Date.now() - 30 * 60000) },
    })
        .sort({ createdAt: 1 })
        .limit(100);
    for (const task of old) {
        if (await getTaskLiveState(task._id)) continue;
        const job = await requestProgressQueue.getJob(
            task.jobId || String(task._id),
        );
        const state = job ? await job.getState() : "unknown";
        if (job && !["completed", "failed", "unknown"].includes(state))
            continue;
        await Task.findOneAndUpdate(
            { _id: task._id, status: task.status, updatedAt: task.updatedAt },
            {
                $set: {
                    status: "abandoned",
                    statusText:
                        "Background job was interrupted. Review before rerunning.",
                },
            },
        );
        logger.log(`[Background] Marked orphan ${task._id} abandoned`);
    }
}
