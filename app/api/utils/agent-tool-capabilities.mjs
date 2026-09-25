import { randomBytes, createHash } from "node:crypto";
import { getRedisConnection } from "./redis.mjs";

const TTL = 30 * 60;
export const agentCapabilityKey = (token) =>
    `agent-tools:${createHash("sha256").update(token).digest("hex")}`;

export async function issueAgentToolsToken(user, entityId, redis, source = {}) {
    if (!user?._id || !user.contextId || !entityId) return null;
    redis ||= getRedisConnection();
    const token = randomBytes(32).toString("base64url");
    await redis.set(
        agentCapabilityKey(token),
        JSON.stringify({
            userId: String(user._id),
            contextId: user.contextId,
            entityId,
            ...(source.taskId
                ? { taskId: String(source.taskId), turn: source.turn || 0 }
                : {}),
            ...(source.chatId
                ? {
                      chatId: String(source.chatId),
                      ...(!source.taskId
                          ? {
                                taskId: randomBytes(12).toString("hex"),
                                turn: 0,
                                anchor: true,
                            }
                          : {}),
                  }
                : {}),
        }),
        "EX",
        TTL,
    );
    return token;
}

export async function readAgentToolsToken(token, redis) {
    if (typeof token !== "string" || !/^[\w-]{43}$/.test(token)) return null;
    redis ||= getRedisConnection();
    const value = await redis.get(agentCapabilityKey(token));
    return value ? JSON.parse(value) : null;
}

export async function runAgentToolOnce(
    token,
    callId,
    action,
    redis = getRedisConnection(),
) {
    if (
        typeof callId !== "string" ||
        !/^[\w:-]{8,200}$/.test(callId) ||
        callId.includes("undefined")
    )
        return Response.json(
            { error: "A tool call ID is required" },
            { status: 400 },
        );
    const key = `${agentCapabilityKey(token)}:call:${callId}`;
    const cached = await redis.get(key);
    if (cached) {
        const { status, body } = JSON.parse(cached);
        return Response.json(body, { status });
    }
    if (!(await redis.set(`${key}:lock`, "1", "EX", 120, "NX")))
        return Response.json(
            { error: "This tool call is already in progress" },
            { status: 409 },
        );
    try {
        // A previous holder may have completed between our cache read and lock.
        const completed = await redis.get(key);
        if (completed) {
            const { status, body } = JSON.parse(completed);
            return Response.json(body, { status });
        }
        const response = await action();
        const body = await response.json();
        await redis.set(
            key,
            JSON.stringify({ status: response.status, body }),
            "EX",
            TTL,
        );
        return Response.json(body, { status: response.status });
    } finally {
        await redis.del(`${key}:lock`);
    }
}

// Serialize request creation across chat turns without storing workflow state.
// The lease is short; ownership-checked release cannot delete a later lease.
export async function withAssistantDispatchLock(
    scope,
    action,
    redis = getRedisConnection(),
    { waitMs = 0 } = {},
) {
    const key = `assistant-dispatch:${createHash("sha256").update(scope).digest("hex")}`;
    const token = randomBytes(16).toString("hex");
    const deadline = Date.now() + Math.min(Math.max(waitMs, 0), 30000);
    while (!(await redis.set(key, token, "EX", 120, "NX"))) {
        const remaining = deadline - Date.now();
        if (remaining > 0) {
            await new Promise((resolve) =>
                setTimeout(resolve, Math.min(100, remaining)),
            );
            continue;
        }
        throw Object.assign(
            new Error(
                "A handoff is already being recorded. Check ReadAssistantTasks before sending more work.",
            ),
            { status: 409 },
        );
    }
    try {
        return await action();
    } finally {
        await redis.eval(
            'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
            1,
            key,
            token,
        );
    }
}
