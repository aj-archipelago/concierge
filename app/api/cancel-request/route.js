import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import Redis from "ioredis";
import RequestProgress from "../models/request-progress.mjs";
import { getCurrentUser } from "../utils/auth";

const connection = new Redis(
    process.env.REDIS_CONNECTION_STRING || "redis://localhost:6379",
    {
        maxRetriesPerRequest: null,
    },
);

const requestProgressQueue = new Queue("request-progress", { connection });

export async function POST(req) {
    try {
        const { requestId } = await req.json();
        const user = await getCurrentUser();

        // Find the request and verify ownership
        const request = await RequestProgress.findOne({
            requestId,
            owner: user._id,
        });

        if (!request) {
            return NextResponse.json(
                { error: "Request not found" },
                { status: 404 },
            );
        }

        // Get active jobs for this request
        const jobs = await requestProgressQueue.getJobs(["waiting"]);
        const job = jobs.find((job) => job.data.requestId === requestId);

        if (job) {
            await job.remove();
        }

        // Update request status
        await RequestProgress.findOneAndUpdate(
            { requestId },
            { status: "cancelled" },
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Cancel request error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
