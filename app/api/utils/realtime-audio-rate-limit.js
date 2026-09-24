import crypto from "node:crypto";
import { getRedisConnection } from "./redis.mjs";

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 12;
const DEFAULT_REDIS_TIMEOUT_MS = 1500;
const sessionBuckets = new Map();
let rateLimitRedisConnection;

const CLAIM_SESSIONS_SCRIPT = `
for index, key in ipairs(KEYS) do
    redis.call("ZREMRANGEBYSCORE", key, "-inf", ARGV[2])
    if redis.call("ZCARD", key) >= tonumber(ARGV[3]) then
        local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
        return {0, math.max(1000, tonumber(oldest[2]) + tonumber(ARGV[4]) - tonumber(ARGV[1]))}
    end
end
for index, key in ipairs(KEYS) do
    redis.call("ZADD", key, ARGV[1], ARGV[5])
    redis.call("PEXPIRE", key, ARGV[4])
end
return {1, 0}
`;

function getLimit() {
    const parsed = Number(process.env.REALTIME_AUDIO_SESSION_LIMIT);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.floor(parsed)
        : DEFAULT_MAX_SESSIONS;
}

function getWindowMs() {
    const parsed = Number(process.env.REALTIME_AUDIO_SESSION_WINDOW_MS);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.floor(parsed)
        : DEFAULT_WINDOW_MS;
}

function createRateLimitError(retryAfterMs) {
    const error = new Error("Realtime audio session limit exceeded");
    error.status = 429;
    error.code = "REALTIME_AUDIO_RATE_LIMITED";
    error.retryAfter = Math.ceil(Math.max(1000, retryAfterMs) / 1000);
    return error;
}

function createRateLimitUnavailableError(cause) {
    const error = new Error("Realtime audio session limiter is unavailable", {
        cause,
    });
    error.status = 503;
    error.code = "REALTIME_AUDIO_RATE_LIMIT_UNAVAILABLE";
    return error;
}

function getRedisTimeoutMs() {
    const parsed = Number(process.env.REALTIME_AUDIO_RATE_LIMIT_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.floor(parsed)
        : DEFAULT_REDIS_TIMEOUT_MS;
}

async function withTimeout(promise, timeoutMs, onTimeout) {
    let timeout;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeout = setTimeout(() => {
                    onTimeout?.();
                    reject(new Error("Redis rate limit timed out"));
                }, timeoutMs);
            }),
        ]);
    } finally {
        clearTimeout(timeout);
    }
}

function getRateLimitRedisConnection() {
    if (
        !rateLimitRedisConnection ||
        ["end", "close"].includes(rateLimitRedisConnection.status)
    ) {
        rateLimitRedisConnection = getRedisConnection().duplicate({
            maxRetriesPerRequest: 1,
        });
        rateLimitRedisConnection.on("error", () => {});
    }
    return rateLimitRedisConnection;
}

function normalizeKeys(keys) {
    return [
        ...new Set(
            (Array.isArray(keys) && keys.length ? keys : ["anonymous"]).map(
                (key) => String(key || "anonymous"),
            ),
        ),
    ];
}

function pruneBuckets(cutoff) {
    for (const [storedKey, timestamps] of sessionBuckets.entries()) {
        const active = timestamps.filter((timestamp) => timestamp > cutoff);
        if (active.length > 0) {
            sessionBuckets.set(storedKey, active);
        } else {
            sessionBuckets.delete(storedKey);
        }
    }
}

function assertLocalSessionsAllowed({ keys, now, windowMs, maxSessions }) {
    const cutoff = now - windowMs;
    const nextBuckets = new Map();

    for (const limiterKey of keys) {
        const bucket = (sessionBuckets.get(limiterKey) || []).filter(
            (timestamp) => timestamp > cutoff,
        );
        if (bucket.length >= maxSessions) {
            throw createRateLimitError(bucket[0] + windowMs - now);
        }
        nextBuckets.set(limiterKey, [...bucket, now]);
    }

    for (const [limiterKey, bucket] of nextBuckets.entries()) {
        sessionBuckets.set(limiterKey, bucket);
    }
    pruneBuckets(cutoff);
}

async function assertSharedSessionsAllowed({
    keys,
    now,
    windowMs,
    maxSessions,
    redisClient = getRateLimitRedisConnection(),
}) {
    const redisKeys = keys.map((key) => {
        const hash = crypto.createHash("sha256").update(key).digest("hex");
        return `realtime-audio:sessions:${hash}`;
    });
    const member = `${now}:${crypto.randomUUID()}`;
    const [allowed, retryAfterMs] = await withTimeout(
        redisClient.eval(
            CLAIM_SESSIONS_SCRIPT,
            redisKeys.length,
            ...redisKeys,
            now,
            now - windowMs,
            maxSessions,
            windowMs,
            member,
        ),
        getRedisTimeoutMs(),
        () => redisClient.disconnect?.(false),
    );
    if (Number(allowed) !== 1) throw createRateLimitError(retryAfterMs);
}

export async function assertRealtimeAudioSessionsAllowed({
    keys,
    now = Date.now(),
    redisClient,
}) {
    const limiterKeys = normalizeKeys(keys);
    const windowMs = getWindowMs();
    const maxSessions = getLimit();
    const useSharedStore =
        Boolean(redisClient) ||
        (process.env.NODE_ENV !== "test" &&
            Boolean(process.env.REDIS_CONNECTION_STRING));

    if (useSharedStore) {
        try {
            await assertSharedSessionsAllowed({
                keys: limiterKeys,
                now,
                windowMs,
                maxSessions,
                redisClient,
            });
            return;
        } catch (error) {
            if (error?.status === 429) throw error;
            console.error("Realtime audio shared rate limit failed:", error);
            throw createRateLimitUnavailableError(error);
        }
    }

    assertLocalSessionsAllowed({
        keys: limiterKeys,
        now,
        windowMs,
        maxSessions,
    });
}

export async function assertRealtimeAudioSessionAllowed({
    key,
    now = Date.now(),
}) {
    await assertRealtimeAudioSessionsAllowed({ keys: [key], now });
}

export function clearRealtimeAudioSessionBucketsForTests() {
    if (process.env.NODE_ENV === "test") sessionBuckets.clear();
}
