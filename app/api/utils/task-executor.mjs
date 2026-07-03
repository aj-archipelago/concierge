import { getClient, SUBSCRIPTIONS } from "../../../jobs/graphql.mjs";
import { Logger } from "../../../jobs/logger.js";
import { loadTaskDefinition } from "../../../src/utils/task-loader.mjs";
import Task from "../models/task.mjs";
import {
    copyTaskToChatMessage,
    MISSING_COMPLETION_DATA_MESSAGE,
    RESULT_DATA_REQUIRED_TASK_TYPES,
} from "./task-utils.mjs";
import {
    rememberLatestProgressPayload,
    resolveCompletionPayload,
} from "./task-progress-state.mjs";
import {
    clearTaskCancellation,
    clearTaskLive,
    isTaskCancellationRequested,
    markTaskLive,
    TASK_LIVE_RENEW_INTERVAL_MS,
} from "./task-liveness.mjs";
import { redactSensitiveText } from "./log-redaction.mjs";
import { formatDbErrorForLog, getDbRetryDelayMs } from "./db-retry.mjs";
import { getNormalizedYouTubeTranscriptionAccessErrorMessage } from "../../../src/utils/transcriptionErrors.js";

// Remove the Apollo client initialization code and use getClient instead
const terminalTaskStatuses = new Set([
    "completed",
    "failed",
    "cancelled",
    "abandoned",
]);

const activeTaskStatusFilter = {
    $nin: Array.from(terminalTaskStatuses),
};
const PROGRESS_WRITE_MIN_INTERVAL_MS = 15_000;
const PROGRESS_WRITE_MIN_DELTA = 0.05;
function stringifyForLog(value, maxLength) {
    if (value == null) return null;
    try {
        return redactSensitiveText(JSON.stringify(value)).substring(
            0,
            maxLength,
        );
    } catch {
        return redactSensitiveText("[Unserializable log value]").substring(
            0,
            maxLength,
        );
    }
}

function getConfiguredJobTimeoutMs(job) {
    const timeout = Number(job?.opts?.timeout);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : null;
}

function getTaskErrorMessage(error) {
    if (!error) return "";
    if (typeof error === "string") return error;
    return error.message || error.toString?.() || "";
}

function getNormalizedTaskStatusText(error, options) {
    if (!options) return null;
    return getNormalizedYouTubeTranscriptionAccessErrorMessage(error, options);
}

function getTaskStatusText(error, options) {
    const normalizedMessage = getNormalizedTaskStatusText(error, options);
    if (normalizedMessage) return normalizedMessage;
    return redactSensitiveText(getTaskErrorMessage(error));
}

function getSimpleStatusText(info) {
    if (!info || typeof info !== "string") return null;
    try {
        JSON.parse(info);
        return null;
    } catch {
        return info;
    }
}

function getTranscriptionErrorContext(jobData) {
    if (jobData?.type !== "transcribe") return null;

    return {
        isYoutube: jobData?.metadata?.isYoutube,
        url: jobData?.metadata?.url,
    };
}

export async function executeTask(jobData, job) {
    const { taskId, type } = jobData;
    const logger = new Logger(job);
    const queueJobId = job?.id?.toString?.() || job?.id || null;

    const client = await getClient();

    // Check if cancelled
    const request = await Task.findOne({ _id: taskId });
    if (request?.status === "cancelled") {
        // Call handler's cancelRequest method if it exists
        const handler = await loadTaskDefinition(type);
        if (
            handler.cancelRequest &&
            typeof handler.cancelRequest === "function"
        ) {
            try {
                await handler.cancelRequest(taskId, client);
            } catch (error) {
                console.error("Error in handler.cancelRequest:", error);
                // Don't throw - cancellation check should succeed
            }
        }
        return;
    }

    // Create a job-like object for consistency
    const taskInfo = {
        id: queueJobId || taskId,
        data: jobData,
        client,
        opts: job?.opts || {},
    };

    // Initialize progress tracker
    const progressTracker = new CortexRequestTracker(taskInfo, client, logger);

    // Set initial status
    await progressTracker.updateRequestStatus("in_progress", null, null, 0.05);

    // Initialize taskInfo handler
    const handler = await loadTaskDefinition(type);

    try {
        const cortexRequestId = await handler.startRequest(taskInfo);

        if (cortexRequestId) {
            await Task.findOneAndUpdate(
                {
                    _id: taskId,
                    status: activeTaskStatusFilter,
                },
                { cortexRequestId },
            );

            return await progressTracker.run(cortexRequestId);
        } else {
            await progressTracker.updateRequestStatus(
                "completed",
                null,
                null,
                1,
            );
            return;
        }
    } catch (error) {
        console.error(
            `Error in executeTask: ${redactSensitiveText(error.stack)}`,
        );

        // Call the handler's handleError method if it exists
        if (
            handler.handleError &&
            typeof handler.handleError === "function" &&
            (await progressTracker.isTaskActive())
        ) {
            try {
                await handler.handleError(
                    taskId,
                    error,
                    jobData.metadata,
                    client,
                );
            } catch (handleErrorException) {
                console.error(
                    `Error in handler.handleError: ${redactSensitiveText(
                        handleErrorException.stack,
                    )}`,
                );
            }
        }

        const normalizedStatusText = getNormalizedTaskStatusText(
            error,
            getTranscriptionErrorContext(jobData),
        );
        await progressTracker.updateRequestStatus(
            "failed",
            normalizedStatusText ||
                redactSensitiveText(
                    `Failed to execute ${type} task: ${error.message} ${error.stack}`,
                ),
        );
        throw error;
    }
}

class CortexRequestTracker {
    // Task types that need a longer idle timeout (e.g. video generation
    // polls a long-running operation with no intermediate progress updates)
    static LONG_TIMEOUT_TYPES = new Set(["media-generation"]);

    constructor(job, client, logger) {
        this.logger = logger;
        this.job = job;
        this.client = client;
        this.timeoutId = null;
        this.subscription = null;
        this.progressUpdateReceived = false;
        this.intervals = new Set();
        this.lastDataObject = null;
        this.lastInfoObject = null;
        this.lastProgressPersistedAt = 0;
        this.lastPersistedProgress = 0;
        this.lastPersistedStatusText = null;
        this.progressUpdateChain = Promise.resolve();
        this.isClosed = false;
        this.pendingProgressUpdates = new Set();
        this.settled = false;
        this.workerId =
            process.env.WEBSITE_INSTANCE_ID ||
            process.env.HOSTNAME ||
            `pid:${process.pid}`;
        const taskIdleTimeoutMs = CortexRequestTracker.LONG_TIMEOUT_TYPES.has(
            job.data?.type,
        )
            ? 10 * 60 * 1000 // 10 minutes for media generation
            : 5 * 60 * 1000; // 5 minutes for everything else
        this.idleTimeoutMs = Math.max(
            taskIdleTimeoutMs,
            getConfiguredJobTimeoutMs(job) || 0,
        );
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        this.setupHeartbeat();
    }

    get errorContext() {
        return getTranscriptionErrorContext(this.job?.data);
    }

    resetIdleTimeout() {
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(
            () => this.handleTimeout(),
            this.idleTimeoutMs,
        );
    }

    async run(cortexRequestId) {
        try {
            this.setupCancellationCheck();
            if (cortexRequestId) {
                this.setupSubscription(cortexRequestId);
            }
            this.resetIdleTimeout();
            return this.promise;
        } catch (error) {
            console.error(
                `Error in run method: ${redactSensitiveText(error.stack)}`,
            );
            this.cleanup();
            throw error;
        }
    }

    async handleTimeout() {
        if (this.settled) return;
        this.settled = true;
        const timeoutMinutes = Math.round(this.idleTimeoutMs / 60000);
        console.warn(
            `Job ${this.job.id} timed out after ${timeoutMinutes} minutes of inactivity`,
        );
        const timeoutMsg = `Operation timed out after ${timeoutMinutes} minutes of inactivity`;

        this.cleanup();
        const wasTaskActive = await this.isTaskActive();
        await this.updateRequestStatus("failed", timeoutMsg);

        // Call handler's handleError for timeout errors
        try {
            const { type, userId, metadata } = this.job.data;
            const handler = await loadTaskDefinition(type);
            if (
                wasTaskActive &&
                handler.handleError &&
                typeof handler.handleError === "function"
            ) {
                await handler.handleError(
                    this.job.data.taskId,
                    new Error(timeoutMsg),
                    { ...metadata, userId },
                    this.client,
                );
            }
        } catch (error) {
            console.error(
                "Error calling handler.handleError on timeout:",
                error,
            );
        }

        this.reject(new Error(timeoutMsg));
    }

    setupCancellationCheck() {
        const interval = setInterval(async () => {
            try {
                if (await isTaskCancellationRequested(this.job.data.taskId)) {
                    await this.handleCancellationRequest();
                }
            } catch (error) {
                console.error("Error in cancellation check:", error);
            }
        }, 5000);

        this.intervals.add(interval);
        return interval;
    }

    async handleCancellationRequest() {
        if (this.isClosed) return;

        try {
            const { type } = this.job.data;
            const handler = await loadTaskDefinition(type);
            if (
                handler.cancelRequest &&
                typeof handler.cancelRequest === "function"
            ) {
                await handler.cancelRequest(this.job.data.taskId, this.client);
            }
        } catch (error) {
            console.error("Error in handler.cancelRequest:", error);
        } finally {
            this.cleanup();
            this.resolve({ cancelled: true });
        }
    }

    async resubscribe(cortexRequestId) {
        // Handle both subscription protocols safely
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
        this.setupSubscription(cortexRequestId);
    }

    /**
     * Appends additional error details to a base error message.
     * Handles proper spacing when the base error ends with a colon.
     * @param {string} baseError - The base error message
     * @param {string|object} additionalError - Additional error details (string or object with error/message/details/result)
     * @param {boolean} checkDuplication - Whether to check if the additional error is already included
     * @returns {string} The concatenated error message
     */
    appendErrorDetails(baseError, additionalError, checkDuplication = false) {
        if (!additionalError) return baseError;

        // Extract error text from object if needed
        const errorText =
            typeof additionalError === "string"
                ? additionalError
                : additionalError.error ||
                  additionalError.message ||
                  additionalError.details ||
                  additionalError.result ||
                  null;

        if (!errorText) return baseError;

        const errorTextString =
            typeof errorText === "string"
                ? errorText
                : JSON.stringify(errorText);

        // Check for duplication if requested
        if (checkDuplication && baseError.includes(errorTextString)) {
            return baseError;
        }

        // Check if base error ends with colon
        const errorEndsWithColon =
            baseError.trim().endsWith(":") || baseError.trim().endsWith(": ");

        // Append with appropriate spacing
        if (errorEndsWithColon) {
            return `${baseError.trim()} ${errorTextString}`;
        } else {
            return `${baseError} ${errorTextString}`;
        }
    }

    async handleProgressUpdate(data, taskId) {
        let progress = data?.requestProgress?.progress || 0;

        let dataObject = await this.parseProgressData(
            data?.requestProgress?.data,
        );

        let infoObject = await this.parseProgressData(
            data?.requestProgress?.info,
        );

        const latestPayload = rememberLatestProgressPayload(
            {
                dataObject: this.lastDataObject,
                infoObject: this.lastInfoObject,
            },
            {
                rawData: data?.requestProgress?.data,
                parsedData: dataObject,
                rawInfo: data?.requestProgress?.info,
                parsedInfo: infoObject,
            },
        );
        this.lastDataObject = latestPayload.dataObject;
        this.lastInfoObject = latestPayload.infoObject;

        try {
            await this.processProgressData(
                data?.requestProgress?.data,
                dataObject,
                data?.requestProgress?.info,
                infoObject,
            );
        } catch (progressError) {
            return await this.handleProgressError(
                progressError,
                taskId,
                dataObject,
            );
        }

        if (data?.requestProgress?.error) {
            // Log the full requestProgress object to see what's available
            console.error(
                "[TaskExecutor] Full requestProgress object:",
                redactSensitiveText(
                    JSON.stringify(data.requestProgress, null, 2),
                ),
            );

            // Try to extract more error details from infoObject or dataObject
            let errorDetails = data.requestProgress.error;

            // Check if infoObject contains additional error information
            if (infoObject && typeof infoObject === "object") {
                errorDetails = this.appendErrorDetails(
                    errorDetails,
                    infoObject,
                );
            }

            // Check if dataObject contains error information
            if (dataObject && typeof dataObject === "object") {
                errorDetails = this.appendErrorDetails(
                    errorDetails,
                    dataObject,
                    true, // Check for duplication
                );
            }

            await this.handleProgressError(errorDetails, taskId, dataObject);
            return { shouldResolve: true, dataObject };
        }

        progress = await this.updateProgress(
            progress,
            taskId,
            data?.requestProgress?.info,
        );

        if (progress === 1) {
            const completionPayload = resolveCompletionPayload({
                currentDataObject: dataObject,
                currentInfoObject: infoObject,
                lastDataObject: this.lastDataObject,
                lastInfoObject: this.lastInfoObject,
            });
            return await this.handleCompletion(
                data,
                taskId,
                completionPayload.dataObject,
                completionPayload.infoObject,
            );
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
        const safeProgress = Math.max(progress, this.lastPersistedProgress);
        const statusText = getSimpleStatusText(info);
        const now = Date.now();
        const shouldPersist =
            safeProgress >= 1 ||
            safeProgress - this.lastPersistedProgress >=
                PROGRESS_WRITE_MIN_DELTA ||
            (statusText && statusText !== this.lastPersistedStatusText) ||
            now - this.lastProgressPersistedAt >=
                PROGRESS_WRITE_MIN_INTERVAL_MS;

        await this.writeLiveHeartbeat({
            progress: safeProgress,
            statusText,
        });

        if (!shouldPersist) {
            return safeProgress;
        }

        const updateData = { progress: safeProgress };
        if (statusText) updateData.statusText = statusText;

        await this.retryDbOperation(() =>
            Task.findOneAndUpdate(
                { _id: taskId, status: activeTaskStatusFilter },
                updateData,
                { new: true },
            ),
        );

        this.lastProgressPersistedAt = now;
        this.lastPersistedProgress = safeProgress;
        if (statusText) this.lastPersistedStatusText = statusText;

        return safeProgress;
    }

    async handleProgressError(error, taskId, dataObject) {
        const { type, userId, metadata } = this.job.data;

        // Extract error message - handle both Error objects and strings
        let errorMessage = error;
        let errorStack = undefined;
        let errorCode = undefined;
        let errorName = undefined;

        if (error && typeof error === "object") {
            errorMessage = error.message || error.toString();
            errorStack = error.stack;
            errorCode = error.code;
            errorName = error.name;
        } else if (typeof error === "string") {
            errorMessage = error;
        }

        // Log comprehensive error details
        console.error("[TaskExecutor] Error in request progress worker:", {
            taskId,
            type,
            userId,
            errorMessage: redactSensitiveText(errorMessage),
            errorStack: redactSensitiveText(errorStack),
            errorCode,
            errorName,
            originalError: redactSensitiveText(error?.message || error),
            dataObject: stringifyForLog(dataObject, 1000),
            metadata: stringifyForLog(metadata, 500),
        });
        console.error("[TaskExecutor] Full error object:", {
            name: error?.name,
            code: error?.code,
            message: redactSensitiveText(error?.message),
            stack: redactSensitiveText(error?.stack),
        });

        // Create an Error object if we only have a string
        const errorObj =
            typeof error === "string" ? new Error(errorMessage) : error;

        // Call task handler's error method if it exists
        try {
            const handler = await loadTaskDefinition(type);

            if (handler.handleError && (await this.isTaskActive())) {
                await handler.handleError(
                    this.job.data.taskId,
                    errorObj,
                    { ...metadata, userId },
                    this.client,
                );
            }
        } catch (handlerError) {
            console.error(
                "[TaskExecutor] Error calling task handler error method:",
                {
                    handlerError: redactSensitiveText(
                        handlerError?.message || handlerError?.toString(),
                    ),
                    handlerErrorStack: redactSensitiveText(handlerError?.stack),
                    taskType: type,
                },
            );
        }

        await this.updateRequestStatus(
            "failed",
            getTaskStatusText(errorObj, this.errorContext),
        );
        this.cleanup();
        return { shouldResolve: true, dataObject };
    }

    async handleCompletion(data, taskId, dataObject, infoObject) {
        if (data?.requestProgress?.error) {
            await this.updateRequestStatus(
                "failed",
                getTaskStatusText(
                    data.requestProgress.error,
                    this.errorContext,
                ),
            );
            return { shouldResolve: true, dataObject };
        }

        if (dataObject) {
            dataObject = await this.processCompletedData(
                dataObject,
                infoObject,
            );

            // Check if handler returned an error in the result
            if (dataObject?.error) {
                const errorMessage =
                    typeof dataObject.error === "string"
                        ? dataObject.error
                        : dataObject.error?.message || "Task execution failed";
                console.error(
                    "[TaskExecutor] Handler returned error in completion result:",
                    {
                        taskId,
                        error: redactSensitiveText(
                            JSON.stringify(dataObject.error),
                        ),
                        errorMessage: redactSensitiveText(errorMessage),
                    },
                );
                await this.updateRequestStatus(
                    "failed",
                    getNormalizedTaskStatusText(
                        dataObject.error,
                        this.errorContext,
                    ) || redactSensitiveText(errorMessage),
                );
                return { shouldResolve: true, dataObject };
            }

            const task = await this.updateRequestStatus(
                "completed",
                null,
                dataObject,
            );

            await copyTaskToChatMessage(task);
        } else {
            // For Gemini, we might need to process even when dataObject is null
            // if infoObject contains the artifacts
            if (infoObject && infoObject.artifacts) {
                dataObject = await this.processCompletedData(null, infoObject);

                // Check if handler returned an error in the result
                if (dataObject?.error) {
                    const errorMessage =
                        typeof dataObject.error === "string"
                            ? dataObject.error
                            : dataObject.error?.message ||
                              "Task execution failed";
                    console.error(
                        "[TaskExecutor] Handler returned error in completion result:",
                        {
                            taskId,
                            error: redactSensitiveText(
                                JSON.stringify(dataObject.error),
                            ),
                            errorMessage: redactSensitiveText(errorMessage),
                        },
                    );
                    await this.updateRequestStatus(
                        "failed",
                        getNormalizedTaskStatusText(
                            dataObject.error,
                            this.errorContext,
                        ) || redactSensitiveText(errorMessage),
                    );
                    return { shouldResolve: true, dataObject };
                }

                const task = await this.updateRequestStatus(
                    "completed",
                    null,
                    dataObject,
                );
                await copyTaskToChatMessage(task);
            } else {
                if (this.job.data.type === "media-generation") {
                    const missingDataError = new Error(
                        "Media generation completed without returning media data. Please try again.",
                    );
                    missingDataError.code = "MISSING_COMPLETION_DATA";
                    return await this.handleProgressError(
                        missingDataError,
                        taskId,
                        dataObject,
                    );
                }

                if (RESULT_DATA_REQUIRED_TASK_TYPES.has(this.job.data.type)) {
                    const missingDataError = new Error(
                        MISSING_COMPLETION_DATA_MESSAGE,
                    );
                    missingDataError.code = "MISSING_COMPLETION_DATA";
                    return await this.handleProgressError(
                        missingDataError,
                        taskId,
                        dataObject,
                    );
                }

                await this.updateRequestStatus("completed");
            }
        }

        return { shouldResolve: true, dataObject };
    }

    async processProgressData(rawData, dataObject, rawInfo, infoObject) {
        if (!rawData && !dataObject && !rawInfo && !infoObject) {
            return;
        }

        const { type, userId, metadata } = this.job.data;
        const handler = await loadTaskDefinition(type);

        if (handler.handleProgress) {
            await handler.handleProgress(
                this.job.data.taskId,
                rawData,
                dataObject,
                rawInfo,
                infoObject,
                { ...metadata, userId },
                this.client,
            );
        }
    }

    async processCompletedData(dataObject, infoObject) {
        const { type, userId, metadata } = this.job.data;
        const handler = await loadTaskDefinition(type);

        if (handler.handleCompletion) {
            if (!(await this.isTaskActive())) {
                this.logger.log(
                    `[TaskExecutor] Skipping completion side effects for terminal task ${this.job.data.taskId}`,
                );
                return dataObject;
            }

            return await handler.handleCompletion(
                this.job.data.taskId,
                dataObject,
                infoObject,
                { ...metadata, userId },
                this.client,
            );
        }
        return dataObject;
    }

    async isTaskActive() {
        const task = await this.retryDbOperation(() =>
            Task.findOne({
                _id: this.job.data.taskId,
                status: activeTaskStatusFilter,
            }).select("_id"),
        );
        return !!task;
    }

    async updateRequestStatus(
        status,
        statusText = null,
        data = null,
        progress = null,
    ) {
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
        if (!terminalTaskStatuses.has(status)) {
            await this.writeLiveHeartbeat({ status, progress, statusText });
        }
        return await this.retryDbOperation(() =>
            Task.findOneAndUpdate(
                {
                    _id: this.job.data.taskId,
                    status: activeTaskStatusFilter,
                },
                update,
                {
                    new: true,
                },
            ),
        );
    }

    cleanup() {
        this.isClosed = true;
        clearTimeout(this.timeoutId);
        void clearTaskLive(this.job.data.taskId).catch((error) => {
            console.error("Error clearing task liveness:", error);
        });
        void clearTaskCancellation(this.job.data.taskId).catch((error) => {
            console.error("Error clearing task cancellation request:", error);
        });
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

    trackProgressUpdate(promise) {
        this.pendingProgressUpdates.add(promise);
        promise.then(
            () => this.pendingProgressUpdates.delete(promise),
            () => this.pendingProgressUpdates.delete(promise),
        );
        return promise;
    }

    async waitForPendingProgressUpdates() {
        while (this.pendingProgressUpdates.size > 0) {
            await Promise.allSettled([...this.pendingProgressUpdates]);
        }
    }

    setupSubscription(cortexRequestId) {
        const { REQUEST_PROGRESS } = SUBSCRIPTIONS;
        this.subscription = this.client
            .subscribe({
                query: REQUEST_PROGRESS,
                variables: { requestIds: [cortexRequestId] },
            })
            .subscribe({
                next: (x) => {
                    if (this.settled || this.isClosed) return;
                    const progressUpdate = this.trackProgressUpdate(
                        (this.progressUpdateChain =
                            this.progressUpdateChain.then(() =>
                                this.handleSubscriptionProgress(x),
                            )),
                    );
                    void progressUpdate;
                },
                error: async (error) => {
                    if (this.settled) return;
                    this.settled = true;
                    console.error(
                        `Subscription error for ${cortexRequestId}:`,
                        {
                            message: redactSensitiveText(error?.message),
                            stack: redactSensitiveText(error?.stack),
                        },
                    );
                    try {
                        this.cleanup();
                        await this.updateRequestStatus(
                            "failed",
                            getTaskStatusText(error, this.errorContext),
                        );
                    } catch (cleanupError) {
                        console.error("Error during cleanup:", cleanupError);
                    } finally {
                        this.reject(error);
                    }
                },
                complete: async () => {
                    await this.waitForPendingProgressUpdates();
                    if (this.settled) return;
                    this.settled = true;
                    this.cleanup();
                    if (
                        RESULT_DATA_REQUIRED_TASK_TYPES.has(this.job.data.type)
                    ) {
                        const missingDataError = new Error(
                            MISSING_COMPLETION_DATA_MESSAGE,
                        );
                        missingDataError.code = "MISSING_COMPLETION_DATA";
                        try {
                            await this.updateRequestStatus(
                                "failed",
                                getTaskStatusText(
                                    missingDataError,
                                    this.errorContext,
                                ),
                            );
                        } catch (error) {
                            console.error(
                                "Error marking incomplete task failed:",
                                error,
                            );
                        }
                        this.reject(missingDataError);
                        return;
                    }
                    this.resolve();
                },
            });
    }

    async handleSubscriptionProgress(x) {
        if (this.settled || this.isClosed) return;

        try {
            this.progressUpdateReceived = true;
            this.resetIdleTimeout();

            const { data } = x;
            const { shouldResolve, dataObject } =
                await this.handleProgressUpdate(data, this.job.data.taskId);

            if (shouldResolve) {
                this.settled = true;
                this.cleanup();
                this.resolve(dataObject);
            }
        } catch (error) {
            console.error("Error handling progress update:", {
                message: redactSensitiveText(error?.message),
                stack: redactSensitiveText(error?.stack),
            });

            this.settled = true;
            this.cleanup();
            try {
                await this.updateRequestStatus(
                    "failed",
                    getNormalizedTaskStatusText(error, this.errorContext) ||
                        redactSensitiveText(
                            `Failed to process progress update: ${error.message}`,
                        ),
                );
            } catch (statusError) {
                console.error("Error marking failed progress update:", {
                    message: redactSensitiveText(statusError?.message),
                    stack: redactSensitiveText(statusError?.stack),
                });
            }
            this.reject(error);
        }
    }

    setupHeartbeat() {
        void this.writeLiveHeartbeat();
        const interval = setInterval(async () => {
            try {
                await this.writeLiveHeartbeat();
            } catch (error) {
                console.error("Error updating heartbeat:", error);
            }
        }, TASK_LIVE_RENEW_INTERVAL_MS);

        this.intervals.add(interval);
        return interval;
    }

    async writeLiveHeartbeat(state = {}) {
        if (this.isClosed) return null;

        try {
            return await markTaskLive(this.job.data.taskId, {
                type: this.job.data.type,
                userId:
                    this.job.data.userId?.toString?.() || this.job.data.userId,
                jobId: this.job?.id?.toString?.() || this.job?.id || null,
                workerId: this.workerId,
                ...state,
            });
        } catch (error) {
            console.error("Error updating task liveness:", error);
            return null;
        }
    }

    // Add a helper method for DB operations with retries
    async retryDbOperation(operation, maxRetries = 3, retryDelay = 1000) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await operation();
                return result;
            } catch (error) {
                lastError = error;
                console.warn(
                    `DB operation attempt ${attempt}/${maxRetries} failed: ${formatDbErrorForLog(error)}`,
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
                    console.log(
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
                            console.log("Successfully reconnected to MongoDB");
                        } catch (reconnectError) {
                            console.error(
                                "Failed to reconnect to MongoDB:",
                                reconnectError.message,
                            );
                        }
                    }
                }

                if (attempt < maxRetries) {
                    const waitTime = getDbRetryDelayMs(error, retryDelay);
                    await new Promise((resolve) =>
                        setTimeout(resolve, waitTime),
                    );
                    // Increase delay for next retry (exponential backoff)
                    retryDelay *= 2;
                }
            }
        }
        throw lastError;
    }
}
