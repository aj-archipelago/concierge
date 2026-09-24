import { Queue } from "bullmq";
import { notifyWorkerAlert } from "./worker-notification.mjs";
import { getRedisConnection } from "./redis.mjs";
import { PollingMonitor } from "./polling-monitor.mjs";

const FAILURE_THRESHOLD = 0.2; // 20% failure rate threshold
const MONITORING_WINDOW = 10 * 60 * 1000; // 10 minutes in milliseconds
const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes cooldown between alerts

export class QueueMonitor extends PollingMonitor {
    constructor() {
        super();
        this.queues = new Map();
        this.redis = getRedisConnection();
        this.lockKey = "queue-monitor:lock";
        this.lockTTL = 70000; // 70 seconds, slightly longer than the default interval
        this.instanceId = `${process.pid}-${Math.random()}`; // Unique per process
        this.initializeQueues();
    }

    initializeQueues() {
        // Initialize monitoring for all queues
        const queueNames = ["task", "digest-build", "automation-scheduler"];
        queueNames.forEach((name) => {
            this.queues.set(
                name,
                new Queue(name, {
                    connection: getRedisConnection(),
                }),
            );
        });
    }

    async calculateFailureRate(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) return null;

        const { completed, failed } = await this.countRecentCompletions(queue);
        const totalJobs = completed + failed;
        return totalJobs === 0 ? 0 : failed / totalJobs;
    }

    async countRecentCompletions(queue) {
        const start = Date.now() - MONITORING_WINDOW;
        // BullMQ completion sets are scored by finishedOn. Count the time
        // window in Redis instead of loading every retained job and its data.
        const [completed, failed] = await Promise.all([
            this.redis.zcount(queue.toKey("completed"), start, "+inf"),
            this.redis.zcount(queue.toKey("failed"), start, "+inf"),
        ]);
        return { completed, failed };
    }

    async sendGoogleChatAlert(
        queueName,
        failureRate,
        pendingJobs = null,
        oldestWaitingJobAgeMs = null,
    ) {
        return notifyWorkerAlert({
            queueName,
            failureRate,
            pendingJobs,
            threshold: FAILURE_THRESHOLD,
            ...(oldestWaitingJobAgeMs === null
                ? {}
                : { oldestWaitingJobAgeMs }),
        });
    }

    async getLastAlertTime(queueName) {
        const key = `queue-alert:lastAlertTime:${queueName}`;
        const value = await this.redis.get(key);
        return value ? parseInt(value, 10) : 0;
    }

    async setLastAlertTime(queueName, timestamp) {
        const key = `queue-alert:lastAlertTime:${queueName}`;
        await this.redis.set(key, timestamp);
    }

    async checkQueues() {
        for (const [queueName, queue] of this.queues) {
            if (!queue) continue;

            const now = Date.now();

            const paused = await queue.isPaused();
            const [{ completed, failed }, waiting, active, counts] =
                await Promise.all([
                    this.countRecentCompletions(queue),
                    paused
                        ? []
                        : queue.getJobs(
                              ["waiting", "prioritized"],
                              0,
                              99,
                              true,
                          ),
                    queue.getActiveCount(),
                    paused ? {} : queue.getJobCounts("waiting", "prioritized"),
                ]);
            const waitingCount =
                (counts.waiting || 0) + (counts.prioritized || 0);
            const totalJobs = completed + failed;
            const timestamps = waiting
                .map((job) => job?.timestamp)
                .filter(Number.isFinite);
            const oldestWaitingJobAgeMs = timestamps.length
                ? Math.max(0, now - timestamps.reduce((a, b) => Math.min(a, b)))
                : 0;
            console.log(
                JSON.stringify({
                    event: "queue_health",
                    queue: queueName,
                    paused,
                    active,
                    waiting: waitingCount,
                    waitingAgeSampleSize: waiting.length,
                    oldestWaitingJobAgeMs,
                    completed,
                    failed,
                }),
            );

            const failureRate = totalJobs === 0 ? 0 : failed / totalJobs;
            if (failureRate === null) continue;

            let lastAlert = await this.getLastAlertTime(queueName);

            // Check for high failure rate
            if (
                totalJobs > 10 &&
                failureRate > FAILURE_THRESHOLD &&
                now - lastAlert > ALERT_COOLDOWN
            ) {
                if (await this.sendGoogleChatAlert(queueName, failureRate)) {
                    await this.setLastAlertTime(queueName, now);
                    lastAlert = now;
                }
            }

            // Queue starvation matters even when no jobs have finished.
            if (
                (waitingCount > 5 || oldestWaitingJobAgeMs >= 5 * 60 * 1000) &&
                now - lastAlert > ALERT_COOLDOWN
            ) {
                if (
                    await this.sendGoogleChatAlert(
                        queueName,
                        null,
                        waitingCount,
                        oldestWaitingJobAgeMs,
                    )
                ) {
                    await this.setLastAlertTime(queueName, now);
                }
            }
        }
    }

    // Try to acquire the lock
    async acquireLock() {
        // SET key value NX PX <ttl>
        const result = await this.redis.set(
            this.lockKey,
            this.instanceId,
            "NX",
            "PX",
            this.lockTTL,
        );
        return result === "OK";
    }

    async releaseLock() {
        await this.redis.eval(
            `if redis.call('GET', KEYS[1]) == ARGV[1] then
                return redis.call('DEL', KEYS[1])
            end
            return 0`,
            1,
            this.lockKey,
            this.instanceId,
        );
    }

    async check() {
        if (await this.acquireLock()) await this.checkQueues();
    }

    async close() {
        await super.close();
        try {
            await this.releaseLock();
        } finally {
            await Promise.all(
                [...this.queues.values()].map((queue) => queue.close()),
            );
        }
    }
}

// Export a singleton instance
export const queueMonitor = new QueueMonitor();
