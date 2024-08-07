const pkg = require("bullmq");
const { Worker, Queue, QueueScheduler } = pkg;
const {
    buildDigestsForAllUsers,
    buildDigestForSingleUser,
} = require("./digest-build.js");
const Redis = require("ioredis");
const queueName = "digest-build";
const { REDIS_CONNECTION_STRING } = process.env;
const { Logger } = require("./logger.js");

const connection = new Redis(
    REDIS_CONNECTION_STRING || "redis://localhost:6379",
    {
        maxRetriesPerRequest: null,
    },
);

const digestBuild = new Queue(queueName, {
    connection,
});

const dailyRepeat = {
    // 6am UTC
    pattern: "0 6 * * *",
};

const DAILY_BUILD_JOB = "daily-build";
const SINGLE_BUILD_JOB = "build-digest";

(async function main() {
    for (const job of await digestBuild.getRepeatableJobs()) {
        await digestBuild.removeRepeatableByKey(job.key);
    }

    for (const job of await digestBuild.getJobs()) {
        await digestBuild.remove(job.id);
    }

    await digestBuild.add(
        DAILY_BUILD_JOB,
        {}, // data
        {
            repeat: dailyRepeat,
        },
    );
})();

const worker = new Worker(
    queueName,
    async (job) => {
        const connectToDatabase = (await import("../src/db.mjs"))
            .connectToDatabase;
        const closeDatabaseConnection = (await import("../src/db.mjs"))
            .closeDatabaseConnection;

        try {
            await connectToDatabase();

            const logger = new Logger(job);

            if (job.name === DAILY_BUILD_JOB) {
                logger.log("building digests for all users");
                await buildDigestsForAllUsers(logger);
            } else if (job.name === SINGLE_BUILD_JOB) {
                logger.log(`building digest for user`, job.data.userId);
                await buildDigestForSingleUser(job.data.userId, logger);
            }
        } finally {
            await closeDatabaseConnection();
        }
    },
    {
        connection,
        autorun: false,
    },
);

worker.on("completed", (job) => {
    const logger = new Logger(job);
    logger.log("job completed");
});

worker.on("failed", (job, err) => {
    const logger = new Logger(job);
    logger.log("job failed", err.message);
});

worker.on("error", (err) => {
    const logger = new Logger();
    logger.log("worker error", err.message);
});

console.log("starting worker");

(async () => {
    const connectToDatabase = (await import("../src/db.mjs")).connectToDatabase;
    const closeDatabaseConnection = (await import("../src/db.mjs"))
        .closeDatabaseConnection;

    console.log(
        "Connecting to database",
        connectToDatabase,
        closeDatabaseConnection,
    );
    await connectToDatabase();
    console.log("Connected to database");
    await buildDigestsForAllUsers(new Logger());
})();
worker.run();
