import { getRedisConnection } from "./redis.mjs";

const TASK_LIVE_KEY_PREFIX = "task:live:";
const TASK_CANCEL_KEY_PREFIX = "task:cancel:";

export const TASK_LIVE_RENEW_INTERVAL_MS = 5_000;
export const TASK_LIVE_TTL_SECONDS = 45;
export const TASK_LIVE_STALE_MS = TASK_LIVE_TTL_SECONDS * 1000;
export const TASK_CANCEL_TTL_SECONDS = 24 * 60 * 60;

function getTaskId(taskOrId) {
    return taskOrId?._id?.toString?.() || taskOrId?.toString?.() || taskOrId;
}

function getLiveKey(taskOrId) {
    return `${TASK_LIVE_KEY_PREFIX}${getTaskId(taskOrId)}`;
}

function getCancelKey(taskOrId) {
    return `${TASK_CANCEL_KEY_PREFIX}${getTaskId(taskOrId)}`;
}

function parseLiveState(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function markTaskLive(taskOrId, state = {}) {
    const taskId = getTaskId(taskOrId);
    if (!taskId) return null;

    const now = new Date().toISOString();
    const liveState = {
        taskId,
        status: "in_progress",
        lastSeenAt: now,
        ...state,
    };

    await getRedisConnection().set(
        getLiveKey(taskId),
        JSON.stringify(liveState),
        "EX",
        TASK_LIVE_TTL_SECONDS,
    );

    return liveState;
}

export async function getTaskLiveState(taskOrId) {
    const taskId = getTaskId(taskOrId);
    if (!taskId) return null;

    return parseLiveState(await getRedisConnection().get(getLiveKey(taskId)));
}

export async function clearTaskLive(taskOrId) {
    const taskId = getTaskId(taskOrId);
    if (!taskId) return;

    await getRedisConnection().del(getLiveKey(taskId));
}

export async function requestTaskCancellation(taskOrId) {
    const taskId = getTaskId(taskOrId);
    if (!taskId) return;

    await getRedisConnection().set(
        getCancelKey(taskId),
        new Date().toISOString(),
        "EX",
        TASK_CANCEL_TTL_SECONDS,
    );
}

export async function isTaskCancellationRequested(taskOrId) {
    const taskId = getTaskId(taskOrId);
    if (!taskId) return false;

    return Boolean(await getRedisConnection().get(getCancelKey(taskId)));
}

export async function clearTaskCancellation(taskOrId) {
    const taskId = getTaskId(taskOrId);
    if (!taskId) return;

    await getRedisConnection().del(getCancelKey(taskId));
}

export function mergeTaskLiveState(task, liveState) {
    if (!task || !liveState) return task;

    const plain = typeof task.toObject === "function" ? task.toObject() : task;
    const progress =
        typeof liveState.progress === "number"
            ? Math.max(plain.progress || 0, liveState.progress)
            : plain.progress;

    return {
        ...plain,
        status: liveState.status || plain.status,
        progress,
        statusText: liveState.statusText || plain.statusText,
        lastHeartbeat: liveState.lastSeenAt || plain.lastHeartbeat,
        live: {
            lastSeenAt: liveState.lastSeenAt,
            workerId: liveState.workerId,
            jobId: liveState.jobId,
        },
    };
}
