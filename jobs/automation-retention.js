import { Queue, Worker } from "bullmq";
import Automation from "../app/api/models/automation.js";
import { pruneAutomationOutputs } from "../app/api/utils/automation-retention.mjs";
import { getRedisConnection } from "../app/api/utils/redis.mjs";
import { ensureDbConnection } from "./db-connection.js";
import { managedWorker } from "./managed-worker.js";

const name = "automation-output-retention";
const connection = getRedisConnection();
const queue = new Queue(name, { connection });
const consumer = managedWorker(
    () =>
        new Worker(
            name,
            async (job) => {
                await ensureDbConnection();
                let after = null;
                for (;;) {
                    const automations = await Automation.find(
                        after ? { _id: { $gt: after } } : {},
                    )
                        .sort({ _id: 1 })
                        .limit(100)
                        .select("_id")
                        .lean();
                    if (!automations.length) break;
                    for (const automation of automations) {
                        try {
                            const result = await pruneAutomationOutputs(
                                automation._id,
                            );
                            if (result.expiredRuns || result.errors?.length) {
                                await job.log(
                                    JSON.stringify({
                                        automationId: automation._id,
                                        ...result,
                                    }),
                                );
                            }
                        } catch (error) {
                            await job.log(
                                `Output retention ${automation._id}: ${error.message}`,
                            );
                        }
                    }
                    after = automations.at(-1)._id;
                }
            },
            { connection, autorun: false, concurrency: 1 },
        ),
    async () => {
        await queue.add(
            name,
            {},
            {
                jobId: name,
                repeat: { every: 60 * 60 * 1000 },
                removeOnComplete: { age: 24 * 3600 },
                removeOnFail: { age: 7 * 24 * 3600 },
            },
        );
    },
);

const automationRetention = {
    run: consumer.run,
    async close() {
        await consumer.close();
        await queue.close();
    },
};
export default automationRetention;
