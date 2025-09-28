import { Queue } from "bullmq";
import { NextResponse } from "next/server";
import { getRedisConnection } from "../utils/redis.mjs";
import User from "../models/user.mjs";

// Define the queues we want to monitor
const QUEUES = {
    task: new Queue("task", { connection: getRedisConnection() }),
    "digest-build": new Queue("digest-build", {
        connection: getRedisConnection(),
    }),
};

const JOB_DATA_WHITELIST = {
    transcribe: {
        metadata: {
            responseFormat: true,
            modelOption: true,
            language: true,
        },
    },
    "video-translate": {
        metadata: {
            responseFormat: true,
            modelOption: true,
            sourceLocale: true,
            targetLocale: true,
            targetLocaleLabel: true,
        },
    },
    "media-generation": {
        metadata: {
            prompt: true,
            outputType: true,
            model: true,
            inputImageUrl: true,
            inputImageUrl2: true,
            inputImageUrl3: true,
            settings: true,
        },
    },
    coding: {
        metadata: {
            codeRequestId: true,
        },
    },
    "subtitle-translate": {
        metadata: {
            name: true,
            to: true,
            format: true,
        },
    },
    default: {
        taskId: true,
        userId: true,
        type: true,
    },
};

// Function to anonymize job data based on whitelist
function anonymizeJobData(data, jobName) {
    if (!data || typeof data !== "object") {
        return data;
    }

    // Check if a specific whitelist exists for this job type
    const hasSpecificWhitelist = jobName && JOB_DATA_WHITELIST[jobName];
    const specificWhitelist = hasSpecificWhitelist
        ? JOB_DATA_WHITELIST[jobName]
        : {};
    const defaultWhitelist = JOB_DATA_WHITELIST.default || {};

    // If no specific whitelist exists for the job type, use empty whitelist (anonymize everything)
    // Otherwise, merge specific whitelist with default whitelist, with specific taking precedence
    const whitelist = hasSpecificWhitelist
        ? { ...defaultWhitelist, ...specificWhitelist }
        : { ...defaultWhitelist };

    function anonymizeObject(obj, whitelistObj) {
        if (!obj || typeof obj !== "object") {
            return obj;
        }

        const result = {};

        for (const [key, value] of Object.entries(obj)) {
            if (whitelistObj[key] === true) {
                // Field is whitelisted, keep as is
                result[key] = value;
            } else if (
                whitelistObj[key] &&
                typeof whitelistObj[key] === "object" &&
                typeof value === "object"
            ) {
                // Nested object, recursively anonymize
                result[key] = anonymizeObject(value, whitelistObj[key]);
            } else {
                // Field is not whitelisted, anonymize it
                if (typeof value === "string") {
                    result[key] = "****";
                } else if (typeof value === "number") {
                    result[key] = 0;
                } else if (typeof value === "boolean") {
                    result[key] = false;
                } else if (Array.isArray(value)) {
                    result[key] = [];
                } else if (value === null) {
                    result[key] = null;
                } else if (typeof value === "object") {
                    result[key] = "****";
                } else {
                    result[key] = "****";
                }
            }
        }

        return result;
    }

    return anonymizeObject(data, whitelist);
}

// Function to anonymize return value to show only metadata
function anonymizeReturnValue(returnValue) {
    if (returnValue === null || returnValue === undefined) {
        return null;
    }

    if (typeof returnValue === "string") {
        const charCount = returnValue.length;
        const lineCount = returnValue.split("\n").length;
        return {
            type: "string",
            charCount,
            lineCount,
            hasContent: charCount > 0,
        };
    }

    if (typeof returnValue === "object") {
        const jsonString = JSON.stringify(returnValue);
        const charCount = jsonString.length;
        const lineCount = jsonString.split("\n").length;
        return {
            type: "object",
            charCount,
            lineCount,
            hasContent: charCount > 0,
            keys: Object.keys(returnValue),
        };
    }

    if (typeof returnValue === "number") {
        return {
            type: "number",
            charCount: returnValue.toString().length,
            lineCount: 1,
            hasContent: true,
        };
    }

    if (typeof returnValue === "boolean") {
        return {
            type: "boolean",
            charCount: returnValue.toString().length,
            lineCount: 1,
            hasContent: true,
        };
    }

    // For any other type
    const stringValue = String(returnValue);
    return {
        type: typeof returnValue,
        charCount: stringValue.length,
        lineCount: stringValue.split("\n").length,
        hasContent: stringValue.length > 0,
    };
}

// Add this function to get worker info
async function getWorkerInfo(queue) {
    const workers = await queue.getWorkers();

    return workers.map((worker) => ({
        id: worker.id,
        name: worker.name,
        addr: worker.addr,
        age: worker.age,
        flags: worker.flags,
        debug: worker,
    }));
}

export async function GET(req) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const queueName = searchParams.get("queue");
        const jobId = searchParams.get("jobId");
        const action = searchParams.get("action");
        const page = parseInt(searchParams.get("page") || "1");
        const pageSize = parseInt(searchParams.get("pageSize") || "10");
        const status = searchParams.get("status");
        const search = searchParams.get("search");

        // If a specific job ID is provided, return job details
        if (jobId && queueName) {
            const queue = QUEUES[queueName];
            if (!queue) {
                return NextResponse.json(
                    { error: "Queue not found" },
                    { status: 404 },
                );
            }

            const job = await queue.getJob(jobId);
            if (!job) {
                return NextResponse.json(
                    { error: "Job not found" },
                    { status: 404 },
                );
            }

            return NextResponse.json({
                id: job.id,
                name: job.name,
                data: anonymizeJobData(job.data, job.data?.type),
                status: await job.getState(),
                progress: job.progress,
                failedReason: job.failedReason,
                timestamp: job.timestamp,
                processedOn: job.processedOn,
                finishedOn: job.finishedOn,
                returnvalue: anonymizeReturnValue(job.returnvalue),
            });
        }

        // If an action is specified, perform the action
        if (action && queueName) {
            const queue = QUEUES[queueName];
            if (!queue) {
                return NextResponse.json(
                    { error: "Queue not found" },
                    { status: 404 },
                );
            }

            switch (action) {
                case "clean":
                    const type = searchParams.get("type") || "completed";
                    const count = parseInt(searchParams.get("count") || "100");
                    await queue.clean(count * 1000, type);
                    return NextResponse.json({ success: true });
                case "retry":
                    const failedJobs = await queue.getFailed();
                    await Promise.all(failedJobs.map((job) => job.retry()));
                    return NextResponse.json({ success: true });
                default:
                    return NextResponse.json(
                        { error: "Invalid action" },
                        { status: 400 },
                    );
            }
        }

        // If a specific queue is requested, return its stats
        if (queueName) {
            const queue = QUEUES[queueName];
            if (!queue) {
                return NextResponse.json(
                    { error: "Queue not found" },
                    { status: 404 },
                );
            }

            const [jobCounts, workers] = await Promise.all([
                queue.getJobCounts(),
                getWorkerInfo(queue),
            ]);

            // Get all jobs first
            const [waiting, active, completed, failed] = await Promise.all([
                queue.getWaiting(),
                queue.getActive(),
                queue.getCompleted(),
                queue.getFailed(),
            ]);

            let jobs = [...waiting, ...active, ...completed, ...failed];

            // Apply status filter if specified
            if (status && status !== "all") {
                switch (status) {
                    case "waiting":
                        jobs = waiting;
                        break;
                    case "active":
                        jobs = active;
                        break;
                    case "completed":
                        jobs = completed;
                        break;
                    case "failed":
                        jobs = failed;
                        break;
                    default:
                        jobs = [];
                        break;
                }
            }

            // Apply search filter if provided
            if (search) {
                // Get unique user IDs for search
                const uniqueUserIds = [
                    ...new Set(
                        jobs.map((job) => job.data?.userId).filter(Boolean),
                    ),
                ];

                // Get users for search filtering
                const usersForSearch =
                    uniqueUserIds.length > 0
                        ? await User.find({ _id: { $in: uniqueUserIds } })
                        : [];

                // Create a map for quick user lookups during search
                const userMapForSearch = usersForSearch.reduce((acc, user) => {
                    acc[user._id] = user;
                    return acc;
                }, {});

                jobs = jobs.filter((job) => {
                    const jobId = job.id.toString();
                    const jobName = job.name.toLowerCase();
                    const username = job.data?.userId
                        ? userMapForSearch[
                              job.data.userId
                          ]?.username?.toLowerCase()
                        : "";

                    return (
                        jobId.includes(search) ||
                        jobName.includes(search.toLowerCase()) ||
                        username.includes(search.toLowerCase())
                    );
                });
            }

            // Sort jobs by timestamp in descending order
            jobs.sort((a, b) => b.timestamp - a.timestamp);

            // Apply pagination
            const totalItems = jobs.length;
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const paginatedJobs = jobs.slice(start, end);

            // Map jobs to consistent format, but first get unique users
            const uniqueUserIds = [
                ...new Set(
                    paginatedJobs
                        .map((job) => job.data?.userId)
                        .filter(Boolean),
                ),
            ];

            const users =
                uniqueUserIds.length > 0
                    ? await User.find({ _id: { $in: uniqueUserIds } })
                    : [];

            // Create a map for quick user lookups
            const userMap = users.reduce((acc, user) => {
                acc[user._id] = user;
                return acc;
            }, {});

            const formattedJobs = await Promise.all(
                paginatedJobs.map(async (job) => ({
                    id: job.id,
                    name: job.name === "task" ? job.data.type : job.name,
                    status: await job.getState(),
                    data: anonymizeJobData(job.data, job.data?.type),
                    logs: await queue.getJobLogs(job.id),
                    progress: job.progress || 0,
                    timestamp: job.timestamp,
                    failedReason: job.failedReason,
                    returnvalue: anonymizeReturnValue(job.returnvalue),
                    attemptsMade: job.attemptsMade,
                    username: job.data?.userId
                        ? userMap[job.data.userId]?.username
                        : null,
                })),
            );

            return NextResponse.json({
                name: queueName,
                counts: jobCounts,
                workers,
                jobs: formattedJobs,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalItems / pageSize),
                    pageSize,
                    totalItems,
                },
            });
        }

        // If no specific queue is requested, return stats for all queues
        const allQueues = await Promise.all(
            Object.entries(QUEUES).map(async ([name, queue]) => {
                const counts = await queue.getJobCounts();
                return {
                    name,
                    counts,
                };
            }),
        );

        return NextResponse.json(allQueues);
    } catch (error) {
        console.error("Queue monitoring error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
