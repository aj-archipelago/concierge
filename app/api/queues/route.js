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
                data: job.data,
                status: await job.getState(),
                progress: job.progress,
                failedReason: job.failedReason,
                timestamp: job.timestamp,
                processedOn: job.processedOn,
                finishedOn: job.finishedOn,
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

            // Get jobs based on status filter
            let jobs = [];
            if (!status || status === "all") {
                const [waiting, active, completed, failed] = await Promise.all([
                    queue.getWaiting(),
                    queue.getActive(),
                    queue.getCompleted(),
                    queue.getFailed(),
                ]);
                jobs = [...waiting, ...active, ...completed, ...failed];
            } else {
                switch (status) {
                    case "waiting":
                        jobs = await queue.getWaiting();
                        break;
                    case "active":
                        jobs = await queue.getActive();
                        break;
                    case "completed":
                        jobs = await queue.getCompleted();
                        break;
                    case "failed":
                        jobs = await queue.getFailed();
                        break;
                }
            }

            // Apply search filter if provided
            if (search) {
                jobs = jobs.filter(
                    (job) =>
                        job.id.includes(search) ||
                        job.name.toLowerCase().includes(search.toLowerCase()),
                );
            }

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
                    name: job.name,
                    status: await job.getState(),
                    data: job.data,
                    progress: job.progress || 0,
                    timestamp: job.timestamp,
                    failedReason: job.failedReason,
                    returnvalue: job.returnvalue,
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
