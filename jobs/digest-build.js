import dayjs from "dayjs";
import {
    generateDigestBlockContent,
    generateDigestGreeting,
} from "./digest/digest.utils.js";

const { DIGEST_REBUILD_INTERVAL_HOURS = 4, ACTIVE_USER_PERIOD_DAYS = 7 } =
    process.env;

async function buildDigestForUser(user, logger, job, force = false) {
    const owner = user._id;
    const Digest = (await import("../app/api/models/digest.mjs")).default;
    const DigestGenerationStatus = (
        await import("../app/api/models/digest.mjs")
    ).DigestGenerationStatus;

    let digest = await Digest.findOne({
        owner,
    });

    if (!digest) {
        logger.log("user does not have digest", owner);
        return;
    }

    logger.log("building digest", owner);
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
            force ||
            b.state.status === DigestGenerationStatus.PENDING ||
            b.state.status === DigestGenerationStatus.IN_PROGRESS;

        if (shouldBeRebuilt) {
            b.state.status = DigestGenerationStatus.IN_PROGRESS;
            b.state.jobId = job?.id;
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
        logger.log(`error updating block state ${e.message}`, owner);
    }

    let greeting = null; // Variable to store the greeting

    const promises = digest.blocks.map(async (block, i) => {
        const lastUpdated = block.updatedAt;

        const daysSinceLastUpdate = dayjs().diff(dayjs(lastUpdated), "days");
        let changed = false;

        if (block.state.status === DigestGenerationStatus.IN_PROGRESS) {
            logger.log(
                `regenerating content. Status: ${block.state.status}. Last updated: ${lastUpdated}. Has Content: ${!!block.content}. Interval: ${daysSinceLastUpdate} days.`,
                owner,
                block._id,
            );

            try {
                const content = await generateDigestBlockContent(
                    block,
                    user,
                    logger,
                    (progress) => {
                        if (job) {
                            job.updateProgress(progress);
                        }
                    },
                );
                logger.log("generated content", owner, block._id);
                block.content = content;
                block.updatedAt = new Date();
                block.state.status = DigestGenerationStatus.SUCCESS;
                block.state.error = null;
                block.state.jobId = null;
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
                    `error generating content: ${e.message}`,
                    owner,
                    block._id,
                );
                block.state.status = DigestGenerationStatus.FAILURE;
                block.state.error = e.message;
                block.content = null;
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
        logger.log("updating blocks in database", owner);
        try {
            digest = await Digest.findOneAndUpdate(
                { owner },
                { $set: { blocks: digest.blocks } }, // Update the entire blocks array
                { upsert: true, new: true },
            );

            logger.log("updated blocks in database", owner);
        } catch (e) {
            logger.log("error updating blocks in database", owner, e);
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
            logger.log("updated greeting in database", owner);
        } catch (e) {
            logger.log("error updating greeting in database", owner, e);
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

async function buildDigestForSingleUser(userId, logger, job) {
    const User = (await import("../app/api/models/user.mjs")).default;

    const user = await User.findById(userId);
    if (!user) {
        logger.log("user not found", userId);
        return;
    }

    await buildDigestForUser(user, logger, job);
}

export { buildDigestsForAllUsers, buildDigestForSingleUser };
