const { Worker } = require("bullmq");
const { getRedisConnection } = require("../app/api/utils/redis.js");
const connection = getRedisConnection();

// Ensure the worker has a database connection before starting operations
const worker = new Worker(
    "task",
    async (job) => {
        console.log(`Worker processing job ${job.id}`);
        const { executeTask } = await import(
            "../app/api/utils/task-executor.js"
        );
        return await executeTask(job.data);
    },
    {
        connection,
        autorun: false,
        concurrency: 5,
        stalledInterval: 300000,
    },
);

worker.on("completed", (job, result) => {
    console.log(`Job ${job.id} completed with result:`, result);
});

worker.on("failed", (job, error) => {
    console.error(`Job ${job.id} failed with error:`, error);
});

async function safelyStartWorker() {
    try {
        console.log("Starting task worker...");
        worker.run();
        console.log("task worker is now running");
    } catch (error) {
        console.error("Failed to start worker:", error);
        console.log("Will attempt to restart worker in 10 seconds...");
        setTimeout(safelyStartWorker, 10000);
    }
}

module.exports = {
    run: safelyStartWorker,
};
