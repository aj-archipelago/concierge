import { Queue } from "bullmq";
import { getRedisConnection } from "../../../utils/redis";
import { enqueueDigestBlock } from "../../../utils/digest-dispatch.mjs";

const queueName = "digest-build";

const digestBuild = new Queue(queueName, {
    connection: getRedisConnection(),
});

export async function getJob(jobId) {
    return await digestBuild.getJob(jobId);
}

export async function enqueueBuildDigest(userId, blockId) {
    return enqueueDigestBlock(userId, blockId);
}
