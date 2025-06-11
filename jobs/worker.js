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
const cortexRequestWorker = require("./cortex-request-worker.js");
require("dotenv").config();

// Import the queue monitor
import("../app/api/utils/queue-monitor.mjs")
    .then(({ queueMonitor }) => {
        // Start monitoring queues
        queueMonitor.startMonitoring();
    })
    .catch((error) => {
        const logger = new Logger("QueueMonitor");
        logger.error("Failed to import queue-monitor.mjs:", error);
    });

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
    // wait between 10 and 30 seconds to avoid race condition with other workers
    await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 20000 + 10000),
    );

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
            delay: 60 * 1000, // delay makes sure that it's not available for workers to pick up until everyone has started up
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
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

// Ensure we have a database connection
async function ensureDbConnection(forceReconnect = false) {
    if (forceReconnect) {
        dbInitialized = false;
    }

    // Get mongoose to check connection state
    const mongoose = (await import("mongoose")).default;

    if (
        !dbInitialized ||
        !mongoose.connection ||
        mongoose.connection.readyState !== 1
    ) {
        try {
            connectionAttempts++;
            console.log(
                `Connecting to database (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})...`,
            );

            const connectToDatabase = (await import("../src/db.mjs"))
                .connectToDatabase;
            await connectToDatabase();

            // Give the connection a moment to fully establish
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                console.log("Successfully connected to MongoDB database");
                dbInitialized = true;
                connectionAttempts = 0;
            } else {
                throw new Error(
                    `Failed to establish MongoDB connection, current state: ${mongoose.connection ? mongoose.connection.readyState : "unknown"}`,
                );
            }
        } catch (error) {
            console.error(
                `Failed to connect to database (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}):`,
                error,
            );

            if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
                console.error(
                    "Maximum connection attempts reached. Giving up.",
                );
                throw new Error(
                    `Failed to connect to MongoDB after ${MAX_CONNECTION_ATTEMPTS} attempts: ${error.message}`,
                );
            }

            // Wait before next attempt with exponential backoff
            const backoffTime = Math.min(
                1000 * Math.pow(2, connectionAttempts),
                30000,
            );
            console.log(
                `Waiting ${backoffTime / 1000}s before next connection attempt...`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffTime));

            // Recursive call to retry
            return ensureDbConnection();
        }
    }
}

// Graceful shutdown handler
const cleanupAndExit = async () => {
    console.log("Shutting down workers...");

    try {
        // Stop processing new jobs
        await worker.close();
        console.log("Digest worker stopped");

        // Close database connection
        if (dbInitialized) {
            const closeDatabaseConnection = (await import("../src/db.mjs"))
                .closeDatabaseConnection;
            await closeDatabaseConnection();
            console.log("Database connection closed");
        }

        console.log("Cleanup completed, exiting");
        process.exit(0);
    } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
    }
};

// Register shutdown handlers
process.on("SIGTERM", cleanupAndExit);
process.on("SIGINT", cleanupAndExit);

// Safely start all workers after ensuring database connection
async function startWorkers() {
    try {
        // Initialize database connection
        console.log("Initializing connection to database...");
        await ensureDbConnection();

        // Start workers
        console.log("Starting workers...");
        await cortexRequestWorker.run();
        worker.run();

        console.log("All workers are running");
    } catch (error) {
        console.error("Failed to initialize:", error);

        // Try to restart after a delay
        console.log("Will attempt to restart workers in 15 seconds...");
        setTimeout(startWorkers, 15000);
    }
}

// Start the workers
startWorkers();

module.exports = {
    run: startWorkers,
    ensureDbConnection,
};
