import mongoose from "mongoose";
import User from "../app/api/models/user";
import Digest from "../app/api/models/digest";
const {
    MONGO_URI,
    DIGEST_REBUILD_INTERVAL_DAYS = 1,
    ACTIVE_USER_PERIOD_DAYS = 7,
} = process.env;

(async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        // using an async iterator (for "await" syntax) creates a cursor
        // and returns only one document at a time
        for await (const user of User.find({
            lastActiveAt: {
                $gte: new Date(
                    Date.now() - ACTIVE_USER_PERIOD_DAYS * 24 * 60 * 60 * 1000,
                ),
            },
        })) {
            const digest = await Digest.findOne({
                owner: user._id,
            });

            let changed = false;

            for (const block of digest.blocks) {
                const lastUpdated = block.updatedAt;

                if (
                    !lastUpdated ||
                    !block.content ||
                    dayjs().diff(dayjs(lastUpdated)) >
                        DIGEST_REBUILD_INTERVAL_DAYS
                ) {
                    const content = await generateDigestBlockContent(
                        block,
                        user,
                    );

                    block.content = content;
                    block.updatedAt = new Date();
                    changed = true;
                }
            }

            if (changed) {
                await Digest.findOneAndUpdate(
                    {
                        owner: user._id,
                    },
                    {
                        owner: user._id,
                        blocks: digest.blocks,
                    },
                    {
                        upsert: true,
                        new: true,
                    },
                );
            }
        }
    } catch (error) {
        console.error("Error connecting to MongoDB", error);
    } finally {
        mongoose.connection.close();
    }
})();
