import { Queue } from "bullmq";
import { NextResponse } from "next/server";
import { getClient } from "../../../jobs/graphql.mjs";
import { loadTaskDefinition } from "../../../src/utils/task-loader.mjs";
import Task from "../models/task.mjs";
import { getCurrentUser } from "../utils/auth";
import { getRedisConnection } from "../utils/redis.mjs";

const requestProgressQueue = new Queue("task", {
    connection: getRedisConnection(),
});

export async function POST(req) {
    try {
        const { _id } = await req.json();
        const user = await getCurrentUser();

        // Find the request and verify ownership
        const request = await Task.findOne({
            _id,
            owner: user._id,
        });

        if (!request) {
            return NextResponse.json(
                { error: "Request not found" },
                { status: 404 },
            );
        }

        // Load the task handler for this request type
        const taskHandler = await loadTaskDefinition(request.type);
        const client = await getClient();

        // Call the handler's cancelRequest method
        if (taskHandler.cancelRequest) {
            await taskHandler.cancelRequest(_id, client);
        }

        // Get active jobs for this request
        const jobs = await requestProgressQueue.getJobs(["waiting"]);
        const job = jobs.find((job) => job.data.taskId === _id);

        if (job) {
            await job.remove();
        }

        // Update request status
        await Task.findOneAndUpdate({ _id }, { status: "cancelled" });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Cancel request error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
