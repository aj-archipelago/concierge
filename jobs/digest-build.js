import dayjs from "dayjs";
import {
    generateDigestBlockContent,
    generateDigestGreeting,
} from "./digest/digest.utils.js";
import Task from "../app/api/models/task.mjs";
import Digest from "../app/api/models/digest.mjs";
import User from "../app/api/models/user.mjs";

const { DIGEST_REBUILD_INTERVAL_HOURS = 4, ACTIVE_USER_PERIOD_DAYS = 7 } =
    process.env;

async function buildDigestForUser(user, logger, job, force = false, taskId) {
    const owner = user._id;

    let digest = await Digest.findOne({
        owner,
    });

    if (!digest) {
        logger.log("[Digest] User does not have digest", owner);
        return;
    }

    logger.log("[Digest] Building digest for user", owner);
    // update states of blocks that need to be rebuilt
    const existingBlocks = (
        await Digest.findOne({
            owner,
        })
    ).blocks;

    const newBlocks = existingBlocks.map((b) => {
        const shouldBeRebuilt =
            !b.updatedAt ||
            !b.content ||
            dayjs().diff(dayjs(b.updatedAt), "hours") >
                DIGEST_REBUILD_INTERVAL_HOURS ||
            force;

        if (shouldBeRebuilt) {
            b.taskId = taskId;
        }

        return b;
    });

    try {
        digest = await Digest.findOneAndUpdate(
            {
                owner,
            },
            {
                $set: {
                    blocks: newBlocks,
                },
            },
            {
                upsert: true,
                new: true,
            },
        );
    } catch (e) {
        logger.log(`[Digest] Error updating block state ${e.message}`, owner);
    }

    let greeting = null; // Variable to store the greeting

    const promises = digest.blocks.map(async (block, i) => {
        const lastUpdated = block.updatedAt;

        const daysSinceLastUpdate = dayjs().diff(dayjs(lastUpdated), "days");
        let changed = false;

        console.log("taskIds", block.taskId, taskId);

        if (block.taskId?.toString() === taskId?.toString()) {
            logger.log(
                `[Digest] Regenerating content. Last updated: ${lastUpdated}. Has Content: ${!!block.content}. Interval: ${daysSinceLastUpdate} days.`,
                owner,
                block._id,
            );

            try {
                const content = await generateDigestBlockContent(
                    block,
                    user,
                    logger,
                    async (progress) => {
                        if (taskId) {
                            await Task.findOneAndUpdate(
                                { _id: taskId },
                                { $set: { progress: progress / 100 } },
                            );
                        }
                    },
                );
                block.content = content;
                block.updatedAt = new Date();
                changed = true;

                // Generate greeting if the first block is generated
                if (i === 0) {
                    greeting = await generateDigestGreeting(
                        user,
                        block.content,
                        logger,
                    );
                }
            } catch (e) {
                logger.log(
                    `[Digest] Error generating content: ${e.message}`,
                    owner,
                    block._id,
                );
                block.taskId = null;
                block.content = `Error generating content: ${e.message}`;
                changed = true;
            }
        }

        return { block, changed, i };
    });

    const results = await Promise.all(promises);

    let blocksChanged = false;

    for (const { block, changed, i } of results) {
        if (changed) {
            digest.blocks[i] = block; // Update the block in the local digest object
            blocksChanged = true;
        }
    }

    if (blocksChanged) {
        // Update the entire blocks array in one call
        logger.log("[Digest] Updating blocks in database", owner);
        try {
            digest = await Digest.findOneAndUpdate(
                { owner },
                { $set: { blocks: digest.blocks } }, // Update the entire blocks array
                { upsert: true, new: true },
            );

            logger.log("[Digest] Updated blocks in database", owner);
        } catch (e) {
            logger.log("[Digest] Error updating blocks in database", owner, e);
        }
    }

    // Update the greeting in the database if it was generated
    if (greeting) {
        try {
            await Digest.findOneAndUpdate(
                { owner },
                { $set: { greeting } },
                { upsert: true, new: true },
            );
            logger.log("[Digest] Updated greeting in database", owner);
        } catch (e) {
            logger.log(
                "[Digest] Error updating greeting in database",
                owner,
                e,
            );
        }
    }

    return digest;
}

async function buildDigestsForAllUsers(logger) {
    const User = (await import("../app/api/models/user.mjs")).default;
    const batchSize = 10;
    let lastId = null;

    while (true) {
        const users = await User.find({
            lastActiveAt: {
                $gte: new Date(
                    Date.now() - ACTIVE_USER_PERIOD_DAYS * 24 * 60 * 60 * 1000,
                ),
            },
            ...(lastId && { _id: { $gt: lastId } }),
        })
            .limit(batchSize)
            .sort({ _id: 1 });

        if (users.length === 0) break;

        for (const user of users) {
            await buildDigestForUser(user, logger, null, true);
        }

        lastId = users[users.length - 1]._id;
    }
}

async function buildDigestForSingleUser(userId, logger, job, taskId) {
    const User = (await import("../app/api/models/user.mjs")).default;

    const user = await User.findById(userId);
    if (!user) {
        logger.log("[Digest] User not found", userId);
        return;
    }

    await buildDigestForUser(user, logger, job, true, taskId);
}

async function buildDigestBlock(blockId, userId, logger, taskId = null) {
    const digest = await Digest.findOne({ owner: userId });
    const block = digest.blocks.find((b) => b._id.toString() === blockId);
    const user = await User.findById(userId);

    if (!digest || !block || !user) {
        logger.log("[Digest] Block or user not found", userId, blockId);
        return;
    }

    try {
        const content = await generateDigestBlockContent(
            block,
            user,
            logger,
            async (progress) => {
                if (taskId) {
                    await Task.findOneAndUpdate(
                        { _id: taskId },
                        { $set: { progress: progress / 100 } },
                    );
                }
            },
        );

        console.log("content generated");

        block.content = content;
        block.updatedAt = new Date();

        const newBlocks = digest.blocks.map((b) => {
            if (b._id.toString() === block._id.toString()) {
                return block;
            }
            return b;
        });

        await Digest.findOneAndUpdate(
            { owner: userId },
            { $set: { blocks: newBlocks } },
            { upsert: true, new: true },
        );

        return {
            block,
            success: true,
        };
    } catch (e) {
        logger.log(
            `[Digest] Error generating content: ${e.message}`,
            user?._id,
            block?._id,
        );
        block.taskId = null;
        block.content = JSON.stringify({
            payload: `Error generating content: ${e.message}`,
        });

        await Digest.findOneAndUpdate(
            { owner: userId },
            { $set: { blocks: digest.blocks } },
            { upsert: true, new: true },
        );

        return {
            block,
            success: false,
            error: e.message,
        };
    }
}

export { buildDigestsForAllUsers, buildDigestForSingleUser, buildDigestBlock };
