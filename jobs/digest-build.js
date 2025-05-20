import dayjs from "dayjs";
import {
    generateDigestBlockContent,
    generateDigestGreeting,
} from "./digest/digest.utils.js";
import Task from "../app/api/models/task.mjs";
import Digest from "../app/api/models/digest.mjs";
import User from "../app/api/models/user.mjs";

const { ACTIVE_USER_PERIOD_DAYS = 7 } =
    typeof process.env === "object" ? process.env : {};

async function buildDigestForUser(user, logger) {
    const owner = user._id;

    let digest = await Digest.findOne({
        owner,
    });

    if (!digest) {
        logger.log("[Digest] User does not have digest", owner);
        return;
    }

    logger.log("[Digest] Generate greeting for user", owner);

    logger.log("[Digest] Building digest for user", owner);
    const promises = digest.blocks.map(async (block, i) => {
        const lastUpdated = block.updatedAt;

        logger.log(
            `[Digest] Regenerating content. Last updated: ${lastUpdated}. Has Content: ${!!block.content}.`,
            owner,
            block._id,
        );

        try {
            const content = await generateDigestBlockContent(
                block,
                user,
                logger,
                () => {},
            );
            block.content = content;
            block.updatedAt = new Date();
        } catch (e) {
            logger.log(
                `[Digest] Error generating content: ${e.message}`,
                owner,
                block._id,
            );
            block.taskId = null;
            block.content = `Error generating content: ${e.message}`;
        }

        return block;
    });

    const updatedBlocks = await Promise.all(promises);
    const greeting = await generateDigestGreeting(
        user,
        updatedBlocks[0]?.content,
        logger,
    );

    // Update the entire blocks array in one call
    logger.log("[Digest] Updating greeting and blocks in database", owner);
    try {
        digest = await Digest.findOneAndUpdate(
            { owner },
            { $set: { blocks: updatedBlocks, greeting } }, // Update the entire blocks array
            { upsert: true, new: true },
        );

        logger.log("[Digest] Updated blocks in database", owner);
    } catch (e) {
        logger.log("[Digest] Error updating blocks in database", owner, e);
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
            try {
                await buildDigestForUser(user, logger);
            } catch (e) {
                console.error(e);
                logger.log(
                    "[Digest] Error building digest for user",
                    user._id,
                    e,
                );
            }
        }

        lastId = users[users.length - 1]._id;
    }
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

export { buildDigestsForAllUsers, buildDigestBlock };
