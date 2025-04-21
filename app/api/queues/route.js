import { Queue } from "bullmq";
import { NextResponse } from "next/server";
import { getRedisConnection } from "../utils/redis.mjs";

// Define the queues we want to monitor
const QUEUES = {
    task: new Queue("task", { connection: getRedisConnection() }),
    "digest-build": new Queue("digest-build", {
        connection: getRedisConnection(),
    }),
};

export async function GET(req) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const queueName = searchParams.get("queue");
        const jobId = searchParams.get("jobId");
        const action = searchParams.get("action");

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

            const [
                jobCounts,
                waiting,
                active,
                completed,
                failed,
                delayed,
                paused,
            ] = await Promise.all([
                queue.getJobCounts(),
                queue.getWaiting(),
                queue.getActive(),
                queue.getCompleted(),
                queue.getFailed(),
                queue.getDelayed(),
                queue.isPaused(),
            ]);

            return NextResponse.json({
                name: queueName,
                counts: jobCounts,
                waiting: waiting.map((job) => ({
                    id: job.id,
                    name: job.name,
                    timestamp: job.timestamp,
                })),
                active: active.map((job) => ({
                    id: job.id,
                    name: job.name,
                    progress: job.progress,
                    timestamp: job.timestamp,
                })),
                failed: failed.map((job) => ({
                    id: job.id,
                    name: job.name,
                    failedReason: job.failedReason,
                    timestamp: job.timestamp,
                })),
                delayed: delayed.map((job) => ({
                    id: job.id,
                    name: job.name,
                    delay: job.delay,
                    timestamp: job.timestamp,
                })),
                isPaused: paused,
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
