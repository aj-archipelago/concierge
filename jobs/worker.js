const pkg = require("bullmq");
const { Worker, Queue } = pkg;
const {
    buildDigestsForAllUsers,
    buildDigestForSingleUser,
} = require("./digest-build.js");
const Redis = require("ioredis");
const queueName = "digest-build";
const { REDIS_CONNECTION_STRING } = process.env;
const { Logger } = require("./logger.js");
const { DIGEST_REBUILD_INTERVAL_HOURS = 4 } = process.env;
const requestProgressWorker = require("./request-progress-worker");

const connection = new Redis(
    REDIS_CONNECTION_STRING || "redis://localhost:6379",
    {
        maxRetriesPerRequest: null,
    },
);

const digestBuild = new Queue(queueName, {
    connection,
});

const nHourlyRepeat = {
    pattern: `0 0/${DIGEST_REBUILD_INTERVAL_HOURS} * * *`,
};

const PERIODIC_BUILD_JOB = "periodic-build";
const SINGLE_BUILD_JOB = "build-digest";

(async function main() {
    for (const job of await digestBuild.getRepeatableJobs()) {
        await digestBuild.removeRepeatableByKey(job.key);
    }

    for (const job of await digestBuild.getJobs()) {
        await digestBuild.remove(job.id);
    }

    await digestBuild.add(
        PERIODIC_BUILD_JOB,
        {}, // data
        {
            repeat: nHourlyRepeat,
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

            if (job.name === PERIODIC_BUILD_JOB) {
                logger.log("building digests for all users");
                await buildDigestsForAllUsers(logger, job);
            } else if (job.name === SINGLE_BUILD_JOB) {
                logger.log(`building digest for user`, job.data.userId);
                await buildDigestForSingleUser(job.data.userId, logger, job);
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

worker.on("failed", (job, error) => {
    const logger = new Logger(job);
    logger.log("job failed with error: " + error.message);
});

// Shared database connection management
let dbInitialized = false;

// Graceful shutdown handler
const cleanupAndExit = async () => {
    console.log('Shutting down workers...');
    const closeDatabaseConnection = (await import("../src/db.mjs")).closeDatabaseConnection;
    
    try {
        // Stop processing new jobs
        await worker.close();
        console.log('Digest worker stopped');
        
        // Close database connection
        if (dbInitialized) {
            await closeDatabaseConnection();
            console.log('Database connection closed');
        }
        
        console.log('Cleanup completed, exiting');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
};

// Register shutdown handlers
process.on('SIGTERM', cleanupAndExit);
process.on('SIGINT', cleanupAndExit);

(async () => {
    try {
        const connectToDatabase = (await import("../src/db.mjs")).connectToDatabase;
        
        // Initialize database connection
        console.log('Connecting to database...');
        await connectToDatabase();
        dbInitialized = true;
        console.log("Connected to database");
        
        // Start workers
        console.log('Starting workers...');
        requestProgressWorker.run();
        worker.run();
        console.log('Workers are running');
    } catch (error) {
        console.error('Failed to initialize:', error);
        process.exit(1);
    }
})();
