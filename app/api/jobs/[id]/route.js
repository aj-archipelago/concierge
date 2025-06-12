import { Queue } from "bullmq";
import { NextResponse } from "next/server";
import { getRedisConnection } from "../../utils/redis.mjs";

// Use the same queue name as in task-utils.js
const requestProgressQueue = new Queue("task", {
    connection: getRedisConnection(),
});

export async function GET(request, { params }) {
    try {
        const { id } = params;

        // Fetch the job from BullMQ
        const job = await requestProgressQueue.getJob(id);

        if (!job) {
            return NextResponse.json(
                { error: "Job not found" },
                { status: 404 },
            );
        }

        // You can customize which job properties to return
        const jobData = {
            id: job.id,
            name: job.name,
            data: job.data,
            opts: job.opts,
            progress: job.progress,
            attemptsMade: job.attemptsMade,
            finishedOn: job.finishedOn,
            processedOn: job.processedOn,
            failedReason: job.failedReason,
            stacktrace: job.stacktrace,
            returnvalue: job.returnvalue,
            state: await job.getState(),
        };

        return NextResponse.json(jobData);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
