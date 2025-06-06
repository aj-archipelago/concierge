import { Queue } from "bullmq";
import { getRedisConnection } from "./redis.mjs";

const FAILURE_THRESHOLD = 0.2; // 20% failure rate threshold
const MONITORING_WINDOW = 10 * 60 * 1000; // 10 minutes in milliseconds
const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes cooldown between alerts

class QueueMonitor {
    constructor() {
        this.queues = new Map();
        this.redis = getRedisConnection();
        this.lockKey = "queue-monitor:lock";
        this.lockTTL = 70000; // 70 seconds, slightly longer than the default interval
        this.instanceId = `${process.pid}-${Math.random()}`; // Unique per process
        this.initializeQueues();
        this.setupExitHandlers();
    }

    initializeQueues() {
        // Initialize monitoring for all queues
        const queueNames = ["task", "digest-build"];
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

        const now = Date.now();
        const windowStart = now - MONITORING_WINDOW;

        // Get all jobs in the time window
        const [completed, failed] = await Promise.all([
            queue.getJobs(["completed"], 0, -1, true),
            queue.getJobs(["failed"], 0, -1, true),
        ]);

        // Filter jobs within the time window
        const recentCompleted = completed.filter(
            (job) => job.finishedOn >= windowStart,
        );
        const recentFailed = failed.filter(
            (job) => job.finishedOn >= windowStart,
        );

        const totalJobs = recentCompleted.length + recentFailed.length;
        if (totalJobs === 0) return 0;

        return recentFailed.length / totalJobs;
    }

    async sendSlackAlert(queueName, failureRate, pendingJobs = null) {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;
        if (!webhookUrl) {
            console.error("SLACK_WEBHOOK_URL is not configured");
            return;
        }

        const containerAppName = process.env.CONTAINER_APP_NAME || "local";

        const message = {
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: pendingJobs
                            ? "🚨 Queue Alert: High Pending Jobs"
                            : "🚨 Queue Alert: High Failure Rate Detected",
                        emoji: true,
                    },
                },
                {
                    type: "section",
                    fields: [
                        {
                            type: "mrkdwn",
                            text: `*Queue:*\n${queueName}`,
                        },
                        {
                            type: "mrkdwn",
                            text: `*Time:*\n${new Date().toLocaleString()}`,
                        },
                        ...(pendingJobs
                            ? [
                                  {
                                      type: "mrkdwn",
                                      text: `*Pending Jobs:*\n*${pendingJobs}*`,
                                  },
                              ]
                            : [
                                  {
                                      type: "mrkdwn",
                                      text: `*Failure Rate:*\n*${(failureRate * 100).toFixed(2)}%*`,
                                  },
                                  {
                                      type: "mrkdwn",
                                      text: `*Threshold:*\n${(FAILURE_THRESHOLD * 100).toFixed(2)}%`,
                                  },
                                  {
                                      type: "mrkdwn",
                                      text: `*Window:*\n10 minutes`,
                                  },
                              ]),
                        {
                            type: "mrkdwn",
                            text: `*Container App:*\n${containerAppName}`,
                        },
                    ],
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: pendingJobs
                                ? "_Please investigate the cause of the high number of pending jobs._"
                                : "_Please investigate the cause of the high failure rate._",
                        },
                    ],
                },
            ],
        };

        try {
            await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(message),
            });
            console.log(`Slack alert sent for queue ${queueName}`);
        } catch (error) {
            console.error("Failed to send Slack alert:", error);
        }
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
            const windowStart = now - MONITORING_WINDOW;

            const [completed, failed, waiting] = await Promise.all([
                queue.getJobs(["completed"], 0, -1, true),
                queue.getJobs(["failed"], 0, -1, true),
                queue.getJobs(["waiting"], 0, -1, true),
            ]);
            const recentCompleted = completed.filter(
                (job) => job.finishedOn >= windowStart,
            );
            const recentFailed = failed.filter(
                (job) => job.finishedOn >= windowStart,
            );

            const totalJobs = recentCompleted.length + recentFailed.length;
            if (totalJobs <= 10) continue; // Only alert if more than 10 jobs

            const failureRate =
                totalJobs === 0 ? 0 : recentFailed.length / totalJobs;
            if (failureRate === null) continue;

            const lastAlert = await this.getLastAlertTime(queueName);

            // Check for high failure rate
            if (
                failureRate > FAILURE_THRESHOLD &&
                now - lastAlert > ALERT_COOLDOWN
            ) {
                await this.sendSlackAlert(queueName, failureRate);
                await this.setLastAlertTime(queueName, now);
            }

            // Check for high waiting jobs
            if (waiting.length > 5 && now - lastAlert > ALERT_COOLDOWN) {
                await this.sendSlackAlert(queueName, null, waiting.length);
                await this.setLastAlertTime(queueName, now);
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

    // Optionally, release the lock if you want to be extra safe (not strictly needed for this use case)
    async releaseLock() {
        const value = await this.redis.get(this.lockKey);
        if (value === this.instanceId) {
            await this.redis.del(this.lockKey);
        }
    }

    async startMonitoring(interval = 10000) {
        setInterval(async () => {
            const gotLock = await this.acquireLock();
            if (gotLock) {
                await this.checkQueues();
                // The lock will expire automatically after lockTTL
            } else {
                // console.log("Another instance is running the monitor.");
            }
        }, interval);
    }

    setupExitHandlers() {
        const cleanup = async () => {
            await this.releaseLock();
            process.exit(0);
        };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
        process.on("exit", async () => {
            await this.releaseLock();
        });
    }
}

// Export a singleton instance
export const queueMonitor = new QueueMonitor();
