export const PERIODIC_BUILD_JOB = "periodic-build";

export async function ensureDigestSchedule(queue, intervalHours = 4) {
    const hours = Number(intervalHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
        throw new Error(
            "DIGEST_REBUILD_INTERVAL_HOURS must be between 1 and 24",
        );
    }
    const pattern = `0 0/${hours} * * *`;
    const existing = (await queue.getRepeatableJobs()).filter(
        (job) => job.name === PERIODIC_BUILD_JOB,
    );
    if (existing.length) {
        if (existing.length !== 1 || existing[0].pattern !== pattern) {
            console.warn(
                "Digest schedule differs from configuration; preserve it and reconcile during a release window",
            );
        }
        return;
    }
    // The same name and repeat options have the same BullMQ repeat key across
    // replicas. Do not delete jobs or re-register an existing delayed iteration.
    await queue.add(
        PERIODIC_BUILD_JOB,
        {},
        {
            repeat: { pattern },
            attempts: 5,
            backoff: { type: "exponential", delay: 5000 },
        },
    );
}
