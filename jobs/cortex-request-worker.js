import { Worker } from "bullmq";
import { getRedisConnection } from "../app/api/utils/redis.mjs";
import { ensureDbConnection } from "./worker.js";
import { executeTask } from "../app/api/utils/task-executor.mjs";

let worker;

const initializeWorker = async () => {
    const connection = getRedisConnection();
    worker = new Worker(
        "task",
        async (job) => {
            console.log(`Worker processing job ${job.id}`);
            await ensureDbConnection();
            return await executeTask(job.data, job);
        },
        {
            connection,
            autorun: false,
            concurrency: 5,
            stalledInterval: 300000,
        },
    );

    worker.on("completed", (job, result) => {
        console.log(`Job ${job.id} completed`);
    });

    worker.on("failed", (job, error) => {
        console.error(`Job ${job.id} failed with error:`, error);
    });
};

async function safelyStartWorker() {
    try {
        console.log("Starting task worker...");
        await initializeWorker();
        worker.run();
        console.log("task worker is now running");
    } catch (error) {
        console.error("Failed to start worker:", error);
        console.log("Will attempt to restart worker in 10 seconds...");
        setTimeout(safelyStartWorker, 10000);
    }
}

// eslint-disable-next-line import/no-anonymous-default-export
export default { run: safelyStartWorker };
