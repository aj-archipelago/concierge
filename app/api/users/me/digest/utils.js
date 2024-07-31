import Redis from "ioredis";
import { Queue } from "bullmq";

const queueName = "digest-build";
const { REDIS_CONNECTION_STRING } = process.env;

const connection = new Redis(
    REDIS_CONNECTION_STRING || "redis://localhost:6379",
    {
        maxRetriesPerRequest: null,
    },
);

const digestBuild = new Queue(queueName, {
    connection,
});

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
