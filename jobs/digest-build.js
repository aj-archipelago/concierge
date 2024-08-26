const mongoose = require("mongoose");
const dayjs = require("dayjs");
const {
    generateDigestBlockContent,
    generateDigestGreeting,
} = require("./digest/digest.utils.js");

const {
    MONGO_URI = "mongodb://127.0.0.1:27017/labeeb",
    DIGEST_REBUILD_INTERVAL_DAYS = 1,
    ACTIVE_USER_PERIOD_DAYS = 7,
} = process.env;

async function buildDigestForUser(user, logger, job) {
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
            dayjs().diff(dayjs(b.updatedAt), "days") >
                DIGEST_REBUILD_INTERVAL_DAYS ||
            b.state.status === DigestGenerationStatus.PENDING ||
            b.state.status === DigestGenerationStatus.IN_PROGRESS;

        if (shouldBeRebuilt) {
            shouldGreetingBeRebuilt = true;
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

        if (changed) {
            // if the first block is changed, update the greeting
            if (i === 0) {
                const greeting = await generateDigestGreeting(
                    user,
                    block.content,
                    logger,
                );

                await Digest.findOneAndUpdate(
                    {
                        owner,
                    },
                    {
                        $set: {
                            greeting,
                        },
                    },
                    {
                        upsert: true,
                        new: true,
                    },
                );
            }

            const existingBlocks = (
                await Digest.findOne({
                    owner,
                })
            ).blocks;

            const newBlocks = existingBlocks.map((b) => {
                if (b._id.toString() === block._id.toString()) {
                    return block;
                }
                return b;
            });

            logger.log("updating block in database", owner, block._id);
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

                logger.log("updated block in database", owner, block._id);
            } catch (e) {
                logger.log(
                    "error updating block in database",
                    owner,
                    block._id,
                    e,
                );
            }
        }
    });

    await Promise.all(promises);

    return digest;
}

async function buildDigestsForAllUsers(logger) {
    const User = (await import("../app/api/models/user.mjs")).default;

    // using an async iterator (for "await" syntax) creates a cursor
    // and returns only one document at a time
    for await (const user of User.find({
        lastActiveAt: {
            $gte: new Date(
                Date.now() - ACTIVE_USER_PERIOD_DAYS * 24 * 60 * 60 * 1000,
            ),
        },
    })) {
        await buildDigestForUser(user, logger);
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

module.exports = {
    buildDigestsForAllUsers,
    buildDigestForSingleUser,
};
