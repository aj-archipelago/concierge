import { getClient, SUBSCRIPTIONS } from "../../../jobs/graphql.mjs";
import { Logger } from "../../../jobs/logger.js";
import { loadTaskDefinition } from "../../../src/utils/task-loader.mjs";
import Task from "../models/task.mjs";
import { copyTaskToChatMessage } from "./task-utils.mjs";

// Remove the Apollo client initialization code and use getClient instead

export async function executeTask(jobData, job) {
    const { taskId, type } = jobData;
    const logger = new Logger(job);
    logger.log(
        `[DEBUG] Starting executeTask - Type: ${type}, RequestProgressId: ${taskId}`,
    );

    const client = await getClient();

    // Check if cancelled
    const request = await Task.findOne({ _id: taskId });
    if (request?.status === "cancelled") {
        logger.log(`[DEBUG] Task ${taskId} was cancelled before execution`);
        return;
    }

    // Create a job-like object for consistency
    const taskInfo = { id: taskId, data: jobData, client };

    // Initialize progress tracker
    const progressTracker = new CortexRequestTracker(taskInfo, client, logger);

    // Set initial status
    await progressTracker.updateRequestStatus("in_progress", null, null, 0.05);

    // Initialize taskInfo handler
    const handler = await loadTaskDefinition(type);

    try {
        const cortexRequestId = await handler.startRequest(taskInfo);

        if (cortexRequestId) {
            await Task.findOneAndUpdate({ _id: taskId }, { cortexRequestId });

            return await progressTracker.run(cortexRequestId);
        } else {
            await Task.findOneAndUpdate(
                { _id: taskId },
                { status: "completed", progress: 1 },
            );
            return;
        }
    } catch (error) {
        console.error(`[DEBUG] Error in executeTask: ${error.stack}`);
        await progressTracker.updateRequestStatus(
            "failed",
            `Failed to execute ${type} task: ${error.message} ${error.stack}`,
        );
        throw error;
    }
}

class CortexRequestTracker {
    constructor(job, client, logger) {
        this.logger = logger;
        this.logger.log(
            `[DEBUG] Initializing CortexRequestTracker for job ${job.id}`,
        );
        this.job = job;
        this.client = client;
        this.timeoutId = null;
        this.subscription = null;
        this.progressUpdateReceived = false;
        this.intervals = new Set();
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        this.setupHeartbeat();
    }

    resetIdleTimeout() {
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(
            () => this.handleTimeout(),
            5 * 60 * 1000, // 5 minutes
        );
    }

    async run(cortexRequestId) {
        this.logger.log(
            `[DEBUG] Starting run with cortexRequestId: ${cortexRequestId}`,
        );
        try {
            this.setupCancellationCheck();
            if (cortexRequestId) {
                this.setupSubscription(cortexRequestId);
            }
            this.resetIdleTimeout();
            return this.promise;
        } catch (error) {
            console.error(`[DEBUG] Error in run method: ${error.stack}`);
            this.cleanup();
            throw error;
        }
    }

    async handleTimeout() {
        console.warn(
            `Job ${this.job.id} timed out after 5 minutes of inactivity`,
        );
        this.cleanup();
        await this.updateRequestStatus(
            "failed",
            "Operation timed out after 5 minutes of inactivity",
        );

        this.reject(new Error("Operation timed out after 5 minutes of inactivity"));
    }

    setupCancellationCheck() {
        const interval = setInterval(async () => {
            try {
                const updatedRequest = await retryDbOperation(() =>
                    Task.findOne({
                        _id: this.job.data.taskId,
                    }),
                );

                if (updatedRequest?.status === "cancelled") {
                    this.logger.log(`Job ${this.job.id} received cancellation`);
                    this.cleanup();
                    return true; // Indicates cancellation
                }
            } catch (error) {
                console.error("Error in cancellation check:", error);
            }
        }, 5000);

        this.intervals.add(interval);
        return interval;
    }

    async resubscribe(cortexRequestId) {
        this.logger.log(`Resubscribing to updates for ${cortexRequestId}`);
        // Handle both subscription protocols safely
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
        this.setupSubscription(cortexRequestId);
    }

    async handleProgressUpdate(data, taskId) {
        this.logger.log(`[DEBUG] Handling progress update for ${taskId}.`);
        let progress = data?.requestProgress?.progress || 0;

        let dataObject = await this.parseProgressData(
            data?.requestProgress?.data,
        );

        if (data?.requestProgress?.error) {
            this.logger.log(
                `[DEBUG] Progress update contains error:`,
                data.requestProgress.error,
            );
            await this.handleProgressError(
                data.requestProgress.error,
                taskId,
                dataObject,
            );
            return { shouldResolve: true, dataObject };
        }

        progress = await this.updateProgress(
            progress,
            taskId,
            data?.requestProgress?.info,
        );

        if (progress === 1) {
            this.logger.log(`[DEBUG] Progress complete, handling completion`);
            return await this.handleCompletion(data, taskId, dataObject);
        }

        return { shouldResolve: false, dataObject };
    }

    async parseProgressData(data) {
        if (!data) return null;

        try {
            // Try double-encoded JSON
            return JSON.parse(JSON.parse(data));
        } catch (innerError) {
            try {
                // Try single-encoded JSON
                return JSON.parse(data);
            } catch (singleError) {
                // Use raw data
                return { message: data };
            }
        }
    }

    async updateProgress(progress, taskId, info) {
        const currentDoc = await retryDbOperation(() =>
            Task.findOne({ _id: taskId }),
        );

        if (currentDoc && progress < currentDoc.progress) {
            if (info) {
                await retryDbOperation(() =>
                    Task.findOneAndUpdate(
                        { _id: taskId },
                        { statusText: info },
                    ),
                );
            }

            return currentDoc.progress;
        }

        await retryDbOperation(() =>
            Task.findOneAndUpdate(
                { _id: taskId },
                { progress, ...(info && { statusText: info }) },
                { new: true },
            ),
        );

        return progress;
    }

    async handleProgressError(error, taskId, dataObject) {
        console.error("Error in request progress worker", error);
        await this.updateRequestStatus("failed", error);
        this.cleanup();
        return { shouldResolve: true, dataObject };
    }

    async handleCompletion(data, taskId, dataObject) {
        if (data?.requestProgress?.error) {
            await this.updateRequestStatus(
                "failed",
                data.requestProgress.error,
            );
            return { shouldResolve: true, dataObject };
        }

        if (dataObject) {
            dataObject = await this.processCompletedData(dataObject);
            const task = await this.updateRequestStatus(
                "completed",
                null,
                dataObject,
            );

            await copyTaskToChatMessage(task);
        } else {
            await this.updateRequestStatus("completed");
        }

        return { shouldResolve: true, dataObject };
    }

    async processCompletedData(dataObject) {
        const { type, userId, metadata } = this.job.data;
        const handler = await loadTaskDefinition(type);

        if (handler.handleCompletion) {
            return await handler.handleCompletion(
                this.job.data.taskId,
                dataObject,
                { ...metadata, userId },
                this.client,
            );
        }
        return dataObject;
    }

    async updateRequestStatus(
        status,
        statusText = null,
        data = null,
        progress = null,
    ) {
        this.logger.log(
            `[DEBUG] Updating request status - Status: ${status}, Progress: ${progress}`,
        );

        if (typeof data === "string") {
            data = { data: data };
        }

        const update = {
            status,
            ...(statusText && { statusText }),
            ...(data && { data }),
            ...(status === "completed" && { progress: 1 }),
            ...(progress !== null && { progress }),
            lastHeartbeat: new Date(),
        };
        return await retryDbOperation(() =>
            Task.findOneAndUpdate({ _id: this.job.data.taskId }, update, {
                new: true,
            }),
        );
    }

    cleanup() {
        clearTimeout(this.timeoutId);
        // Handle both subscription protocols safely
        if (this.subscription) {
            if (typeof this.subscription.close === "function") {
                this.subscription.close();
            } else if (typeof this.subscription.unsubscribe === "function") {
                this.subscription.unsubscribe();
            }
        }
        this.intervals.forEach((interval) => clearInterval(interval));
        this.intervals.clear();
    }

    setupSubscription(cortexRequestId) {
        const { REQUEST_PROGRESS } = SUBSCRIPTIONS;
        this.subscription = this.client
            .subscribe({
                query: REQUEST_PROGRESS,
                variables: { requestIds: [cortexRequestId] },
            })
            .subscribe({
                next: async (x) => {
                    this.progressUpdateReceived = true;
                    this.resetIdleTimeout();

                    try {
                        const { data } = x;
                        const { shouldResolve, dataObject } =
                            await this.handleProgressUpdate(
                                data,
                                this.job.data.taskId,
                            );

                        if (shouldResolve) {
                            this.cleanup();
                            this.resolve(dataObject);
                        }
                    } catch (error) {
                        console.error("Error handling progress update:", error);
                        await this.updateRequestStatus(
                            "failed",
                            `Failed to process progress update: ${error.message}`,
                        );
                        this.cleanup();
                        this.reject(error);
                    }
                },
                error: async (error) => {
                    console.error(
                        `Subscription error for ${cortexRequestId}:`,
                        error,
                    );
                    try {
                        this.cleanup();
                        await this.updateRequestStatus(
                            "failed",
                            error.message || error.toString(),
                        );
                    } catch (cleanupError) {
                        console.error("Error during cleanup:", cleanupError);
                    } finally {
                        this.logger.log(
                            `[DEBUG] Rejecting promise with error: ${error}`,
                        );
                        this.reject(error);
                    }
                },
                complete: () => {
                    this.logger.log(
                        `Subscription completed for ${cortexRequestId}`,
                    );
                    this.cleanup();
                    this.logger.log(
                        `[DEBUG] Resolving promise on subscription completion`,
                    );
                    this.resolve();
                },
            });
    }

    setupHeartbeat() {
        const interval = setInterval(async () => {
            try {
                await retryDbOperation(() =>
                    Task.findOneAndUpdate(
                        { _id: this.job.data.taskId },
                        { lastHeartbeat: new Date() },
                    ),
                );
            } catch (error) {
                console.error("Error updating heartbeat:", error);
            }
        }, 5000); // 5 seconds

        this.intervals.add(interval);
        return interval;
    }
}

// Add a helper function for DB operations with retries
async function retryDbOperation(operation, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await operation();
            return result;
        } catch (error) {
            console.error(
                `[DEBUG] DB operation failed attempt ${attempt}:`,
                error.stack,
            );
            lastError = error;
            console.warn(
                `DB operation attempt ${attempt}/${maxRetries} failed: ${error.message}`,
            );

            // Check explicitly for MongoNotConnectedError and other connection issues
            if (
                error.name === "MongoNotConnectedError" ||
                ((error.name === "MongooseError" ||
                    error.name === "MongoError") &&
                    error.message &&
                    (error.message.includes("buffering") ||
                        error.message.includes("disconnected") ||
                        error.message.includes("timeout") ||
                        error.message.includes("not connected") ||
                        error.message.includes("must be connected")))
            ) {
                this.logger.log(
                    "Detected MongoDB connection issue, attempting to reconnect...",
                );
                // Use the global mongoose instance to check connection state
                const mongoose = (await import("mongoose")).default;
                if (mongoose.connection.readyState !== 1) {
                    try {
                        // First try to close any existing connection
                        if (mongoose.connection.readyState !== 0) {
                            await mongoose.connection
                                .close()
                                .catch((err) =>
                                    console.warn(
                                        "Error closing existing connection:",
                                        err.message,
                                    ),
                                );
                        }

                        // Get a fresh database connection
                        const { connectToDatabase } = await import(
                            "../../../src/db.mjs"
                        );
                        await connectToDatabase();
                        this.logger.log("Successfully reconnected to MongoDB");
                    } catch (reconnectError) {
                        console.error(
                            "Failed to reconnect to MongoDB:",
                            reconnectError.message,
                        );
                    }
                }
            }

            if (attempt < maxRetries) {
                const waitTime = Math.min(retryDelay, 30000); // Cap at 30 seconds max
                this.logger.log(
                    `Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`,
                );
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                // Increase delay for next retry (exponential backoff)
                retryDelay *= 2;
            }
        }
    }
    throw lastError;
}
