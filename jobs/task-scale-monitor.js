import { getRedisConnection } from "../app/api/utils/redis.mjs";
import { PollingMonitor } from "../app/api/utils/polling-monitor.mjs";

export const TASK_SCALE_LIST = "bull:task:autoscaling:work";
export const TASK_SCALE_SNAPSHOT = "bull:task:autoscaling:snapshot";
export const TASKS_PER_REPLICA = 20;
export const MAX_WORKER_REPLICAS = 12;

// ACA's supported Redis scaler can only read LLEN of one list. Publish a
// bounded list of anonymous counters, never task data. Reading BullMQ state and
// replacing the metric in one script avoids double counting a wait->active move
// or exposing a temporary zero. Only these two autoscaling keys are written.
const SAMPLE = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local previous = tonumber(redis.call('HGET', KEYS[2], 'sampledAt') or '0')
if now - previous < tonumber(ARGV[2]) then return nil end
local prefix = ARGV[1]
local paused = redis.call('HEXISTS', prefix .. 'meta', 'paused')
local active = redis.call('LLEN', prefix .. 'active')
local waiting = redis.call('LLEN', prefix .. 'wait')
local prioritized = redis.call('ZCARD', prefix .. 'prioritized')
local due = redis.call('ZCOUNT', prefix .. 'delayed', '-inf', (now + 1) * 4096 - 1)
local runnable = 0
if paused == 0 then runnable = waiting + prioritized + due end
-- Admission-deferred work is ready work, even while waiting for its budget.
-- Inspect at most one replica ceiling of markers and verify each against the
-- queue so stale markers never keep idle replicas alive.
local backgroundWaiting = 0
if paused == 0 then
  local members = redis.call('ZRANGE', 'background:runs:waiting', 0, tonumber(ARGV[3]))
  for _, id in ipairs(members) do
    local score = redis.call('ZSCORE', prefix .. 'delayed', id)
    if score and tonumber(score) > (now + 1) * 4096 - 1 then
      backgroundWaiting = backgroundWaiting + 1
    elseif not score then
      redis.call('ZREM', 'background:runs:waiting', id)
    end
  end
end
local demand = active + runnable + backgroundWaiting
local metric = math.min(demand, tonumber(ARGV[3]))
redis.call('DEL', KEYS[1])
for i = 1, metric do redis.call('RPUSH', KEYS[1], '1') end
redis.call('HSET', KEYS[2], 'sampledAt', now, 'active', active,
    'waiting', waiting, 'prioritized', prioritized, 'due', due,
    'paused', paused, 'demand', demand, 'metric', metric, 'backgroundWaiting', backgroundWaiting)
return {now, active, waiting, prioritized, due, paused, demand, metric, backgroundWaiting}
`;

export async function publishTaskScaleMetric(
    redis,
    { prefix = "bull:task:", intervalMs = 10000 } = {},
) {
    const sample = await redis.eval(
        SAMPLE,
        2,
        `${prefix}autoscaling:work`,
        `${prefix}autoscaling:snapshot`,
        prefix,
        intervalMs,
        TASKS_PER_REPLICA * MAX_WORKER_REPLICAS,
    );
    if (!sample) return null;
    const keys = [
        "sampledAt",
        "active",
        "waiting",
        "prioritized",
        "due",
        "paused",
        "demand",
        "metric",
        "backgroundWaiting",
    ];
    return Object.fromEntries(keys.map((key, i) => [key, sample[i]]));
}

export class TaskScaleMonitor extends PollingMonitor {
    async check() {
        const sample = await publishTaskScaleMetric(getRedisConnection());
        if (sample)
            console.log(
                JSON.stringify({ event: "task_scale_metric", ...sample }),
            );
    }
}
