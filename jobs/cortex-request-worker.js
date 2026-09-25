import { processWithBackgroundAdmission } from "./background-admission.mjs";
import { Worker } from "bullmq";
import { getRedisConnection } from "../app/api/utils/redis.mjs";
import { ensureDbConnection } from "./db-connection.js";
import { executeTask } from "../app/api/utils/task-executor.mjs";

import { managedWorker } from "./managed-worker.js";

const cortexRequestWorker = managedWorker(() => {
    const connection = getRedisConnection();
    const worker = new Worker(
        "task",
        async (job, token) => {
            console.log(`Worker processing job ${job.id}`);
            await ensureDbConnection();
            return await processWithBackgroundAdmission(
                job,
                token,
                executeTask,
            );
        },
        {
            connection,
            autorun: false,
            concurrency: 20,
        },
    );

    worker.on("completed", (job, result) => {
        console.log(`Job ${job.id} completed`);
    });

    worker.on("failed", (job, error) => {
        console.error(`Job ${job.id} failed with error:`, error);
    });
    return worker;
});

export default cortexRequestWorker;
