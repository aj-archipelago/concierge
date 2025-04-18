import { Queue } from "bullmq";
import RequestProgress from "../models/request-progress.mjs";
import { getRedisConnection } from "./redis.mjs";

const requestProgressQueue = new Queue("request-progress", {
    connection: getRedisConnection(),
});

async function createRequestProgressAndQueue({
    userId,
    type,
    metadata,
    timeout = 5 * 60 * 1000, // default 5 minutes
}) {
    console.log("Type", type, userId);
    // Create initial progress record with pending status
    const requestProgress = await RequestProgress.create({
        owner: userId,
        type,
        status: "pending",
        progress: 0,
        metadata,
    });

    console.log("Request progress created");

    // Add job to queue
    const job = await requestProgressQueue.add(
        "request-progress",
        {
            requestProgressId: requestProgress._id,
            type,
            userId,
            metadata,
        },
        {
            timeout,
            removeOnComplete: {
                age: 24 * 3600,
                count: 1000,
            },
            removeOnFail: {
                age: 24 * 3600,
            },
        },
    );

    return {
        job,
        requestProgressId: requestProgress._id,
    };
}

export { createRequestProgressAndQueue };
