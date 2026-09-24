import Redis from "ioredis";
import { createHash, randomUUID } from "node:crypto";

// The model pathway times out at ten minutes. Keep a longer lease so a lost
// web process cannot immediately start the same model request again.
export const WIDGET_GENERATION_LEASE_MS = 15 * 60 * 1000;
const STATE_TTL_SECONDS = 24 * 60 * 60;

const CLAIM = `
local raw = redis.call('GET', KEYS[1])
local now = tonumber(ARGV[1])
local state = raw and cjson.decode(raw) or nil
if state and state.status == 'running' and state.expiresAt > now then
    return cjson.encode({status='running'})
end
if state and state.source == ARGV[2] then
    if state.status == 'ready' then return raw end
    if ARGV[3] ~= 'retry' then
        if state.status == 'running' then
            return cjson.encode({status='failed', code='WIDGET_INTERRUPTED'})
        end
        if state.status == 'failed' then return raw end
    end
end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if redis.call('ZCARD', KEYS[2]) >= 2 then
    if ARGV[3] == 'retry' then
        redis.call('SET', KEYS[1], cjson.encode({status='queued', source=ARGV[2]}), 'EX', ARGV[6])
    end
    return cjson.encode({status='queued'})
end
local next = {status='running', source=ARGV[2], token=ARGV[4], expiresAt=now+tonumber(ARGV[5])}
redis.call('SET', KEYS[1], cjson.encode(next), 'EX', ARGV[6])
redis.call('ZADD', KEYS[2], next.expiresAt, ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[6])
return cjson.encode({status='claimed', token=ARGV[4]})
`;

const FINISH = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local state = cjson.decode(raw)
if state.token ~= ARGV[1] then return 0 end
state.status = ARGV[2]
if ARGV[2] == 'ready' then state.html = ARGV[3] else state.code = ARGV[3] end
redis.call('SET', KEYS[1], cjson.encode(state), 'EX', ARGV[4])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
`;

export function widgetGenerationNamespace(
    uri = process.env.MONGO_URI || "local",
) {
    // Blue and production may share Redis. Ignore credentials when identifying
    // the database so a password rotation does not reset the coordination keys.
    const database = uri.replace(/\/\/[^/]*@/, "//").split("?")[0];
    return `home-widgets:${createHash("sha256").update(database).digest("hex").slice(0, 24)}`;
}

export function createWidgetGenerationCoordinator(
    redis,
    { namespace = widgetGenerationNamespace(), now = Date.now } = {},
) {
    const keys = (id) => [
        `{${namespace}}:applet:${id}`,
        `{${namespace}}:slots`,
    ];
    return {
        async claim(id, source, retry = false) {
            return JSON.parse(
                await redis.eval(
                    CLAIM,
                    2,
                    ...keys(id),
                    now(),
                    source,
                    retry ? "retry" : "auto",
                    randomUUID(),
                    WIDGET_GENERATION_LEASE_MS,
                    STATE_TTL_SECONDS,
                ),
            );
        },
        async finish(id, token, status, value) {
            const result = await redis.eval(
                FINISH,
                2,
                ...keys(id),
                token,
                status,
                value,
                STATE_TTL_SECONDS,
            );
            if (Number(result) !== 1)
                throw new Error("Widget generation ownership lost");
        },
    };
}

let coordinator;
export function getWidgetGenerationCoordinator() {
    if (!coordinator) {
        const redis = new Redis(
            process.env.REDIS_CONNECTION_STRING || "redis://localhost:6379",
            {
                maxRetriesPerRequest: 1,
                connectTimeout: 5000,
                commandTimeout: 5000,
            },
        );
        redis.on("error", () => {}); // Callers report the failed operation without connection secrets.
        coordinator = createWidgetGenerationCoordinator(redis);
    }
    return coordinator;
}
