import { Queue } from "bullmq";
import { getRedisConnection } from "../../../utils/redis";
import { createBackgroundTask } from "../../../utils/tasks";

const queueName = "digest-build";

const digestBuild = new Queue(queueName, {
    connection: getRedisConnection(),
});

export async function getJob(jobId) {
    return await digestBuild.getJob(jobId);
}

export async function enqueueBuildDigest(userId) {
    return await createBackgroundTask({
        userId,
        type: "build-digest",
        metadata: {
            userId,
        },
        timeout: 60 * 60 * 1000, // 1 hour timeout
    });
}
