import Digest from "../app/api/models/digest.mjs";
import Task from "../app/api/models/task.mjs";
import User from "../app/api/models/user.mjs";
import { generateDigestBlockContent } from "./digest/digest.utils.js";
import { getPreferredDigestLanguage } from "./digest/language.js";
import { enqueueDigestBlock } from "../app/api/utils/digest-dispatch.mjs";
import {
    plainBlock,
    sameDigestGeneration,
    updateDigestBlocks,
} from "../app/api/utils/digest-store.mjs";

const ACTIVE_USER_PERIOD_DAYS = Number(
    process.env.ACTIVE_USER_PERIOD_DAYS || 7,
);

// Dispatch only. One durable task per card makes work visible to autoscaling and
// lets replicas share it without duplicating a multi-hour all-user generation.
export async function buildDigestForUser(user, logger, options = {}) {
    const digest = await Digest.findOne({ owner: user._id });
    for (const block of digest?.blocks || []) {
        if (block.automationId) continue;
        await enqueueDigestBlock(user._id, block._id, options);
    }
    return digest;
}

export async function buildDigestsForAllUsers(logger, job) {
    const scheduledFor = new Date(
        job?.opts?.prevMillis || job?.timestamp || Date.now(),
    );
    const slot = String(job?.id || scheduledFor.toISOString());
    let lastId = job?.data?.lastUserId || null;
    let count = 0;
    while (true) {
        const users = await User.find({
            lastActiveAt: {
                $gte: new Date(
                    scheduledFor.getTime() - ACTIVE_USER_PERIOD_DAYS * 86400000,
                ),
            },
            ...(lastId ? { _id: { $gt: lastId } } : {}),
        })
            .sort({ _id: 1 })
            .limit(50);
        if (!users.length) break;
        for (const user of users) {
            // A failed dispatch fails this job. Retry resumes its cursor with
            // the same slot key, including a crash before the cursor was saved.
            await buildDigestForUser(user, logger, { slot, scheduledFor });
            lastId = String(user._id);
            await job?.updateData({ ...job.data, lastUserId: lastId });
            count++;
        }
    }
    logger.log(`[Digest] Dispatched ${count} users; slot=${slot}`);
}

export async function buildDigestBlock(
    blockId,
    userId,
    logger,
    taskId = null,
    options = {},
) {
    const digest = await Digest.findOne({ owner: userId });
    const found = digest?.blocks.find((b) => String(b._id) === String(blockId));
    const user = await User.findById(userId);
    if (!found || !user) return { success: true, skipped: true };
    const block = plainBlock(found);
    if (
        block.automationId ||
        (taskId && String(block.taskId) !== String(taskId))
    ) {
        return { success: true, skipped: true };
    }
    const ownsBlock = (current) =>
        sameDigestGeneration(current, block) &&
        (!taskId || String(current.taskId) === String(taskId));
    try {
        const preferredLanguage = await getPreferredDigestLanguage(
            userId,
            logger,
        );
        const content = await generateDigestBlockContent(
            block,
            user,
            logger,
            async (progress) => {
                if (taskId)
                    await Task.findOneAndUpdate(
                        { _id: taskId, status: "in_progress" },
                        { $set: { progress: progress / 100 } },
                    );
            },
            { language: preferredLanguage, ...options },
        );
        options.signal?.throwIfAborted();
        let saved = false;
        await updateDigestBlocks(userId, (blocks) => {
            options.signal?.throwIfAborted();
            saved = false;
            const current = blocks.find(
                (b) => String(b._id) === String(blockId),
            );
            if (!ownsBlock(current)) return null;
            current.content = content;
            current.updatedAt = new Date();
            current.taskId = null;
            saved = true;
            return blocks;
        });
        return { success: true, skipped: !saved };
    } catch (error) {
        // Clear only this run's marker, preserving edits, other cards and the
        // last good result. CAS retries also protect concurrent failure cleanup.
        try {
            await updateDigestBlocks(userId, (blocks) => {
                const current = blocks.find(
                    (b) => String(b._id) === String(blockId),
                );
                if (
                    !current?.taskId ||
                    (taskId && String(current.taskId) !== String(taskId))
                )
                    return null;
                current.taskId = null;
                return blocks;
            });
        } catch (cleanupError) {
            logger.log(
                `[Digest] Failed task cleanup: ${cleanupError.message}`,
                userId,
                blockId,
            );
        }
        return { block, success: false, error: error.message };
    }
}
