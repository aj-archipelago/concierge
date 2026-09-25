import { randomUUID } from "node:crypto";
import { DelayedError } from "bullmq";
import Task from "../app/api/models/task.mjs";
import { getRedisConnection } from "../app/api/utils/redis.mjs";
import { getTaskLiveState } from "../app/api/utils/task-liveness.mjs";
import {
    BACKGROUND_CONCURRENCY,
    ASSISTANT_CONCURRENCY,
    ASSISTANT_USER_CONCURRENCY,
    ASSISTANT_WORKFLOW_CONCURRENCY,
    BACKGROUND_RUNTIME_MS,
    BACKGROUND_LEASE_MS,
    BACKGROUND_DEFER_MS,
    isBoundedBackgroundTask,
} from "../app/api/utils/background-policy.mjs";

// A fixed lease lasts longer than Cortex's absolute request deadline. If a
// worker dies, its capacity is quarantined until the upstream budget expires.
// No heartbeat failure can prematurely admit a replacement run.
export const ACQUIRE_BACKGROUND = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('EXISTS', KEYS[2]) == 1 or redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), ARGV[1])
redis.call('SET', KEYS[2], ARGV[1], 'PX', ARGV[3])
return now
`;
export const RELEASE_BACKGROUND = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[2])
redis.call('ZREM', KEYS[1], ARGV[1])
return 1
`;

export const ACQUIRE_ASSISTANT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
for i = 1, 3 do redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now) end
if redis.call('EXISTS', KEYS[4]) == 1 then return 0 end
for i = 1, 3 do if redis.call('ZCARD', KEYS[i]) >= tonumber(ARGV[i + 1]) then return 0 end end
for i = 1, 3 do
 redis.call('ZADD', KEYS[i], now + tonumber(ARGV[5]), ARGV[1])
 redis.call('PEXPIRE', KEYS[i], ARGV[5])
end
redis.call('SET', KEYS[4], ARGV[1], 'PX', ARGV[5])
return now
`;
export const RELEASE_ASSISTANT = `
if redis.call('GET', KEYS[4]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[4])
for i = 1, 3 do redis.call('ZREM', KEYS[i], ARGV[1]) end
return 1
`;

export async function processWithBackgroundAdmission(job, token, execute) {
    const assistant = job.data.type === "assistant-run";
    if (!assistant && !isBoundedBackgroundTask(job.data.type))
        return execute(job.data, job);
    // Old queue records predate workflow routing. Resolve once, then persist it
    // so admission retries don't repeatedly read task documents.
    if (assistant && !job.data.assistantRootId) {
        const task = await Task.findById(job.data.taskId);
        if (!task) return;
        job.data.assistantRootId = String(task.assistantRootId || task._id);
        await job.updateData?.(job.data);
    }
    const waitingKey = "background:runs:waiting";
    const redis = getRedisConnection();
    const keys = assistant
        ? [
              "background:assistants:active",
              `background:assistants:owner:${job.data.userId}`,
              `background:assistants:workflow:${job.data.assistantRootId}`,
              `background:assistants:task:${job.data.taskId}`,
          ]
        : [
              "background:runs:active",
              `background:runs:owner:${job.data.userId}`,
          ];
    const lease = randomUUID();
    const admissionStartedAt = Date.now();
    const acquiredAt = await redis.eval(
        assistant ? ACQUIRE_ASSISTANT : ACQUIRE_BACKGROUND,
        keys.length,
        ...keys,
        lease,
        ...(assistant
            ? [
                  ASSISTANT_CONCURRENCY,
                  ASSISTANT_USER_CONCURRENCY,
                  ASSISTANT_WORKFLOW_CONCURRENCY,
              ]
            : [BACKGROUND_CONCURRENCY]),
        BACKGROUND_LEASE_MS,
    );
    if (!acquiredAt) return defer();
    await redis.zrem(waitingKey, String(job.id));
    let release = false;
    try {
        // Deferred jobs touch only Redis. Do not repeatedly fetch/decrypt
        // thousands of Task documents while all provider slots are occupied.
        const task = await Task.findById(job.data.taskId);
        if (!task || !["pending", "in_progress"].includes(task.status)) {
            release = true;
            return;
        }
        // A completed earlier turn may leave a BullMQ receipt behind.
        if ((job.data.assistantTurn ?? 0) !== (task.assistantTurn ?? 0)) {
            release = true;
            return;
        }
        if (String(task.owner) !== String(job.data.userId)) {
            release = true;
            throw new Error(
                "Background task owner does not match queue record",
            );
        }
        if (task.executionStartedAt || task.status === "in_progress") {
            release = true;
            if (await getTaskLiveState(task._id)) return await defer();
            // Never replay an agent after a worker crash: external tools may
            // already have acted. Its Cortex deadline has expired by now.
            await Task.findOneAndUpdate(
                {
                    _id: task._id,
                    status: { $in: ["pending", "in_progress"] },
                    ...(task.assistantTurn != null
                        ? { assistantTurn: task.assistantTurn }
                        : {}),
                },
                {
                    $set: {
                        status: "abandoned",
                        dispatchPending: false,
                        statusText:
                            "Worker stopped before completion. Review the output before running again.",
                    },
                },
            );
            return;
        }
        const claimed = await Task.findOneAndUpdate(
            {
                _id: task._id,
                status: "pending",
                executionStartedAt: null,
                ...(task.assistantTurn != null
                    ? { assistantTurn: task.assistantTurn }
                    : {}),
            },
            {
                $set: {
                    executionStartedAt: new Date(),
                    dispatchPending: false,
                },
            },
            { new: true },
        );
        if (!claimed) {
            release = true;
            return;
        }
        // Use a relative local deadline; Redis TIME is used only for leases.
        job.backgroundDeadline = admissionStartedAt + BACKGROUND_RUNTIME_MS;
        const result = await execute(job.data, job);
        // Failure/cancellation may not establish that a remote tool stopped.
        // Keep its lease until the deadline; successful completion frees it.
        const completed = await Task.findById(task._id);
        release =
            completed?.status === "completed" ||
            (result?.assistantWaiting === true &&
                (completed?.status === "waiting" ||
                    // A quick reply may already have queued the next turn.
                    (completed?.assistantTurn ?? 0) >
                        (job.data.assistantTurn ?? 0)));
        console.log(
            JSON.stringify({
                event: "background_run_finished",
                taskId: String(task._id),
                type: task.type,
                elapsedMs:
                    BACKGROUND_RUNTIME_MS -
                    (job.backgroundDeadline - Date.now()),
                status: completed?.status,
            }),
        );
        return result;
    } finally {
        if (release)
            await redis.eval(
                assistant ? RELEASE_ASSISTANT : RELEASE_BACKGROUND,
                keys.length,
                ...keys,
                lease,
            );
    }
    async function defer() {
        await redis.zadd(waitingKey, "NX", Date.now(), String(job.id));
        await job.moveToDelayed(
            Date.now() + BACKGROUND_DEFER_MS + Math.floor(Math.random() * 5000),
            token,
        );
        throw new DelayedError();
    }
}
