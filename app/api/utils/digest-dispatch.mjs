import { randomUUID } from "node:crypto";
import Digest from "../models/digest.mjs";
import Task from "../models/task.mjs";
import { createBackgroundTask } from "./tasks.js";
import { sameDigestGeneration, updateDigestBlocks } from "./digest-store.mjs";

export async function enqueueDigestBlock(
    userId,
    blockId,
    { slot, scheduledFor } = {},
) {
    const digest = await Digest.findOne({ owner: userId });
    const block = digest?.blocks.find((b) => String(b._id) === String(blockId));
    if (!block || block.automationId) return { skipped: true };
    const active = block.taskId ? await Task.findById(block.taskId) : null;
    if (active && ["pending", "in_progress"].includes(active.status)) {
        return { taskId: active._id, coalesced: true };
    }
    const runKey = JSON.stringify([
        "digest",
        String(blockId),
        block.prompt,
        block.generationKey,
        slot || randomUUID(),
    ]);
    let coalescedTaskId;
    const result = await createBackgroundTask({
        userId,
        type: "build-digest",
        idempotencyKey: runKey,
        metadata: {
            userId: String(userId),
            blockId: String(blockId),
            prompt: block.prompt,
            generationKey: block.generationKey,
            ...(scheduledFor ? { scheduledFor } : {}),
        },
        beforeEnqueue: async (task) => {
            const prepared = await prepareDigestTask(task);
            coalescedTaskId = prepared.coalescedTaskId;
            return prepared.claimed;
        },
    });
    return coalescedTaskId
        ? { taskId: coalescedTaskId, coalesced: true }
        : result;
}

// The outbox reconciler uses the same preparation as the web dispatcher. This
// closes the crash window between saving a Task and assigning its card marker.
export async function prepareDigestTask(task) {
    const metadata = task.metadata || {};
    const snapshot = {
        _id: metadata.blockId,
        prompt: metadata.prompt,
        generationKey: metadata.generationKey,
    };
    let claimed = false;
    let coalescedTaskId;
    await updateDigestBlocks(task.owner, async (blocks) => {
        claimed = false;
        const latestTask = await Task.findById(task._id);
        if (
            !latestTask ||
            latestTask.status !== "pending" ||
            latestTask.executionStartedAt
        )
            return null;
        const current = blocks.find(
            (b) => String(b._id) === String(metadata.blockId),
        );
        if (!sameDigestGeneration(current, snapshot)) return null;
        if (String(current.taskId) === String(task._id)) {
            claimed = true;
            return null;
        }
        if (current.taskId) {
            const previous = await Task.findById(current.taskId);
            if (
                previous &&
                ["pending", "in_progress"].includes(previous.status)
            ) {
                coalescedTaskId = previous._id;
                return null;
            }
        }
        current.taskId = task._id;
        claimed = true;
        return blocks;
    });
    return { claimed, coalescedTaskId };
}
