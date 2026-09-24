import { Queue, Worker } from "bullmq";
import "./load-env.js";
import Redis from "ioredis";
import automationScheduler from "./automation-scheduler.js";
import automationRetention from "./automation-retention.js";
import cortexRequestWorker from "./cortex-request-worker.js";
import {
    closeDbConnectionIfInitialized,
    ensureDbConnection,
} from "./db-connection.js";
import { buildDigestsForAllUsers } from "./digest-build.js";
import { Logger } from "./logger.js";
import { managedWorker } from "./managed-worker.js";
import { workerRuntime } from "./worker-runtime.js";
import { ensureDigestSchedule, PERIODIC_BUILD_JOB } from "./digest-schedule.js";
import { queueMonitor } from "../app/api/utils/queue-monitor.mjs";
import { closeRedisConnection } from "../app/api/utils/redis.mjs";
import { TaskScaleMonitor } from "./task-scale-monitor.js";

const queueName = "digest-build";
const { REDIS_CONNECTION_STRING } = process.env;
const { DIGEST_REBUILD_INTERVAL_HOURS = 4 } = process.env;

const connection = new Redis(
    REDIS_CONNECTION_STRING || "redis://localhost:6379",
    {
        maxRetriesPerRequest: null,
    },
);

const digestBuild = new Queue(queueName, {
    connection,
});

const digestWorker = managedWorker(
    () => {
        const worker = new Worker(
            queueName,
            async (job) => {
                await ensureDbConnection();
                const logger = new Logger(job, digestBuild);
                if (job.name === PERIODIC_BUILD_JOB) {
                    logger.log("building digests for all users");
                    await buildDigestsForAllUsers(logger, job);
                }
            },
            { connection, autorun: false },
        );
        worker.on("completed", (job) => {
            new Logger(job, digestBuild).log("job completed");
        });
        worker.on("failed", (job, error) => {
            new Logger(job, digestBuild).log(
                "job failed with error: " + error.message,
            );
        });
        return worker;
    },
    () => ensureDigestSchedule(digestBuild, DIGEST_REBUILD_INTERVAL_HOURS),
);

const scaleMonitor = new TaskScaleMonitor();
const runtime = workerRuntime({
    workers: [
        digestWorker,
        automationScheduler,
        cortexRequestWorker,
        automationRetention,
    ],
    monitors: [queueMonitor, scaleMonitor],
    connect: ensureDbConnection,
    disconnect: async () => {
        await digestBuild.close();
        await closeDbConnectionIfInitialized();
        await Promise.all([connection.quit(), closeRedisConnection()]);
    },
});

let shutdownPromise;
function shutdown(code = 0) {
    shutdownPromise ??= runtime.close().then(
        () => {
            console.log("All workers drained; exiting");
            process.exit(code);
        },
        (error) => {
            console.error("Error during worker shutdown:", error);
            process.exit(1);
        },
    );
    return shutdownPromise;
}

function failed(error) {
    console.error("Worker startup/run failed:", error);
    // Database initialization already retries. Let the container restart the
    // whole process after draining, instead of duplicating consumers locally.
    shutdown(1);
}

process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
const run = () => runtime.run(failed);
run().catch(failed);
export { run };
