const mongoose = require("mongoose");
const dayjs = require("dayjs");
const { generateDigestBlockContent } = require("./digest/digest.utils.js");

const {
    MONGO_URI = "mongodb://127.0.0.1:27017/labeeb",
    DIGEST_REBUILD_INTERVAL_DAYS = 1,
    ACTIVE_USER_PERIOD_DAYS = 7,
} = process.env;

async function buildDigestForUser(user, logger) {
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
    const promises = digest.blocks.map(async (block) => {
        const lastUpdated = block.updatedAt;

        const daysSinceLastUpdate = dayjs().diff(dayjs(lastUpdated), "days");
        let changed = false;

        if (
            !lastUpdated ||
            !block.content ||
            daysSinceLastUpdate > DIGEST_REBUILD_INTERVAL_DAYS ||
            block.state.status === DigestGenerationStatus.PENDING
        ) {
            logger.log(
                `regenerating content. Status: ${block.state.status}. Last updated: ${lastUpdated}. Has Content: ${!!block.content}. Interval: ${daysSinceLastUpdate} days.`,
                owner,
                block._id,
            );

            try {
                const content = await generateDigestBlockContent(block, user);
                logger.log("generated content", owner, block._id);
                block.content = content;
                block.updatedAt = new Date();
                block.state.status = DigestGenerationStatus.SUCCESS;
                block.state.error = null;
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
            logger.log("updating block in database", owner, block._id);
            digest = await Digest.findOneAndUpdate(
                {
                    owner,
                },
                {
                    $set: {
                        "blocks.$[block]": block,
                    },
                },
                {
                    arrayFilters: [
                        {
                            "block._id": block._id,
                        },
                    ],
                    upsert: true,
                    new: true,
                },
            );
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

async function buildDigestForSingleUser(userId, logger) {
    const User = (await import("../app/api/models/user.mjs")).default;

    const user = await User.findById(userId);
    if (!user) {
        logger.log("user not found", userId);
        return;
    }

    await buildDigestForUser(user, logger);
}

module.exports = {
    buildDigestsForAllUsers,
    buildDigestForSingleUser,
};
