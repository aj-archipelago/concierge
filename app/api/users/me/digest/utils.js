import { Queue } from "bullmq";
import { getRedisConnection } from "../../../utils/redis";

const queueName = "digest-build";

const digestBuild = new Queue(queueName, {
    connection: getRedisConnection(),
});

export async function getJob(jobId) {
    return await digestBuild.getJob(jobId);
}

export async function enqueueBuildDigest(userId) {
    await digestBuild.add(
        "build-digest",
        {
            userId,
        },
        {
            removeOnComplete: {
                age: 60 * 60 * 24, // keep up to 24 hours
                count: 1000, // keep up to 1000 jobs
            },
            removeOnFail: {
                age: 60 * 60 * 24, // keep up to 24 hours
            },
        },
    );
}
