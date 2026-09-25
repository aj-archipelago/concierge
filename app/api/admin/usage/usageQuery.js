// Read-only usage queries. All dashboard views share one set of aggregates.
export const DAY_MS = 86_400_000;
const SLICE_MS = 7 * DAY_MS;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 128;
const MAX_CACHE_ROWS = 50_000;
const GROUPS = new Set([
    "overview",
    "model",
    "api_key_id",
    "day",
    "hour",
    "15m",
    "model+day",
]);
const FIELDS = [
    "requests",
    "input_tokens",
    "output_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "total_tokens",
    "metered_tokens",
    "unbucketed_requests",
];
const stores = new WeakMap();

export function parseUsageQuery(params, now = new Date()) {
    const endDate = params.get("endDate")
        ? new Date(params.get("endDate"))
        : now;
    const startDate = params.get("startDate")
        ? new Date(params.get("startDate"))
        : new Date(+endDate - 30 * DAY_MS);
    const groupBy = params.get("groupBy") || "model";
    const apiKeyId = params.get("apiKeyId") || null;
    if (
        !Number.isFinite(+startDate) ||
        !Number.isFinite(+endDate) ||
        +startDate >= +endDate ||
        +endDate - +startDate > 90 * DAY_MS ||
        +endDate > +now + 60_000 ||
        !GROUPS.has(groupBy) ||
        (apiKeyId && !/^[a-zA-Z0-9_-]{1,128}$/.test(apiKeyId))
    ) {
        const error = new Error(
            "Invalid usage window or grouping; select a window of up to 90 days ending now or earlier.",
        );
        error.status = 400;
        throw error;
    }
    return { startDate, endDate, groupBy, apiKeyId };
}

function bucketExpression(granularity) {
    if (granularity === "15m") {
        return {
            $dateToString: {
                format: "%Y-%m-%d %H:%M",
                timezone: "UTC",
                date: {
                    $dateFromParts: {
                        year: { $year: "$timestamp" },
                        month: { $month: "$timestamp" },
                        day: { $dayOfMonth: "$timestamp" },
                        hour: { $hour: "$timestamp" },
                        minute: {
                            $subtract: [
                                { $minute: "$timestamp" },
                                { $mod: [{ $minute: "$timestamp" }, 15] },
                            ],
                        },
                    },
                },
            },
        };
    }
    return {
        $dateToString: {
            format: granularity === "hour" ? "%Y-%m-%d %H:00" : "%Y-%m-%d",
            date: "$timestamp",
            timezone: "UTC",
        },
    };
}

export function buildSlicePipeline({
    startDate,
    endDate,
    apiKeyId,
    granularity = "day",
}) {
    const noTokenBuckets = {
        $and: [
            "input_tokens",
            "output_tokens",
            "cache_creation_input_tokens",
            "cache_read_input_tokens",
        ].map((field) => ({ $eq: [{ $ifNull: [`$${field}`, null] }, null] })),
    };
    const match = { timestamp: { $gte: startDate, $lt: endDate } };
    if (apiKeyId) match.api_key_id = apiKeyId;
    return [
        { $match: match },
        {
            $group: {
                _id: {
                    key: "$api_key_id",
                    model: "$model",
                    bucket: bucketExpression(granularity),
                },
                requests: { $sum: 1 },
                input_tokens: { $sum: "$input_tokens" },
                output_tokens: { $sum: "$output_tokens" },
                cache_creation_input_tokens: {
                    $sum: "$cache_creation_input_tokens",
                },
                cache_read_input_tokens: { $sum: "$cache_read_input_tokens" },
                // Fall back per event, not after grouping (mixed legacy records).
                total_tokens: {
                    $sum: {
                        $ifNull: [
                            "$total_tokens",
                            {
                                $add: [
                                    { $ifNull: ["$input_tokens", 0] },
                                    { $ifNull: ["$output_tokens", 0] },
                                ],
                            },
                        ],
                    },
                },
                metered_tokens: {
                    $sum: {
                        $cond: [
                            noTokenBuckets,
                            { $ifNull: ["$total_tokens", 0] },
                            {
                                $add: [
                                    "input_tokens",
                                    "output_tokens",
                                    "cache_creation_input_tokens",
                                    "cache_read_input_tokens",
                                ].map((field) => ({
                                    $ifNull: [`$${field}`, 0],
                                })),
                            },
                        ],
                    },
                },
                // Keep unknown legacy requests separate from known bucket costs.
                unbucketed_requests: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    noTokenBuckets,
                                    {
                                        $gt: [
                                            { $ifNull: ["$total_tokens", 0] },
                                            0,
                                        ],
                                    },
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                latest_event_at: { $max: "$timestamp" },
            },
        },
    ];
}

function add(target, row) {
    for (const field of FIELDS)
        target[field] = (target[field] || 0) + (row[field] || 0);
}

export function groupUsageRows(rows, groupBy) {
    const groups = new Map();
    const breakdowns = new Map();
    for (const row of rows) {
        const id =
            groupBy === "model"
                ? row._id.model
                : groupBy === "api_key_id"
                  ? row._id.key
                  : groupBy === "model+day"
                    ? { model: row._id.model, day: row._id.bucket }
                    : row._id.bucket;
        const key = JSON.stringify(id ?? null);
        if (!groups.has(key)) {
            groups.set(key, { _id: id ?? null });
            breakdowns.set(key, new Map());
        }
        add(groups.get(key), row);
        if (!["model", "model+day"].includes(groupBy)) {
            const models = breakdowns.get(key);
            const model = row._id.model ?? null;
            if (!models.has(model)) models.set(model, { model });
            add(models.get(model), row);
        }
    }
    return [...groups.entries()]
        .map(([key, row]) => {
            const models = breakdowns.get(key);
            return models.size
                ? { ...row, model_breakdown: [...models.values()] }
                : row;
        })
        .sort((a, b) => b.requests - a.requests);
}

function storeFor(collection) {
    if (!stores.has(collection))
        stores.set(collection, {
            cache: new Map(),
            pending: new Map(),
            active: 0,
            waiting: [],
            rows: 0,
        });
    return stores.get(collection);
}

async function limited(store, task) {
    if (store.active >= 2)
        await new Promise((resolve) => store.waiting.push(resolve));
    else store.active++;
    try {
        return await task();
    } finally {
        const next = store.waiting.shift();
        if (next) next();
        else store.active--;
    }
}

async function readSlice(collection, options, deadline) {
    const store = storeFor(collection);
    const key = JSON.stringify(options);
    const cached = store.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;
    if (cached) {
        store.rows -= cached.rows.length;
        store.cache.delete(key);
    }
    if (store.pending.has(key)) return store.pending.get(key);
    const pending = limited(store, async () => {
        let rows;
        for (let attempt = 0; ; attempt++) {
            const remaining = deadline - Date.now();
            if (remaining <= 0)
                throw new Error("Usage query deadline exceeded");
            try {
                // Let Cosmos combine its single-field indexes; a compound hint prevents that.
                rows = await collection
                    .aggregate(buildSlicePipeline(options), {
                        maxTimeMS: Math.min(15_000, remaining),
                    })
                    .toArray();
                break;
            } catch (error) {
                if (![16500, 429].includes(Number(error.code)) || attempt >= 4)
                    throw error;
                const hint =
                    Number(
                        /RetryAfterMs=(\d+)/.exec(error.message || "")?.[1],
                    ) || 0;
                const delay = Math.min(
                    2_000,
                    Math.max(hint, 250 * 2 ** attempt),
                );
                if (Date.now() + delay >= deadline) throw error;
                // Keep the concurrency slot during backoff to reduce pressure.
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        if (rows.length <= MAX_CACHE_ROWS) {
            while (
                store.cache.size &&
                (store.cache.size >= MAX_CACHE_ENTRIES ||
                    store.rows + rows.length > MAX_CACHE_ROWS)
            ) {
                const oldest = store.cache.keys().next().value;
                store.rows -= store.cache.get(oldest).rows.length;
                store.cache.delete(oldest);
            }
            store.cache.set(key, {
                rows,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });
            store.rows += rows.length;
        }
        return rows;
    }).finally(() => store.pending.delete(key));
    store.pending.set(key, pending);
    return pending;
}

export async function queryUsage(collection, options) {
    const { startDate, endDate, groupBy, apiKeyId } = options;
    const granularity = ["hour", "15m"].includes(groupBy) ? groupBy : "day";
    const slices = [];
    // Fixed boundaries allow adjacent requests/windows to reuse historical slices.
    for (let start = +startDate; start < +endDate; ) {
        const end = Math.min(
            (Math.floor(start / SLICE_MS) + 1) * SLICE_MS,
            +endDate,
        );
        slices.push({
            startDate: new Date(start),
            endDate: new Date(end),
            apiKeyId,
            granularity,
        });
        start = end;
    }
    const deadline = Date.now() + 45_000;
    const rows = [];
    // At most two slices in flight, including across simultaneous HTTP requests.
    let cursor = 0;
    let failed = false;
    const worker = async () => {
        while (!failed && cursor < slices.length) {
            const slice = slices[cursor++];
            try {
                rows.push(...(await readSlice(collection, slice, deadline)));
            } catch (error) {
                failed = true;
                throw error;
            }
        }
    };
    const results = await Promise.allSettled([worker(), worker()]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason; // Never return partial totals as a success.
    if (groupBy !== "overview") return groupUsageRows(rows, groupBy);
    return {
        byModel: groupUsageRows(rows, "model"),
        byKey: groupUsageRows(rows, "api_key_id"),
        byDay: groupUsageRows(rows, "day"),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        latestEventAt:
            rows.reduce(
                (latest, row) =>
                    Math.max(latest, +new Date(row.latest_event_at) || 0),
                0,
            ) || null,
        cacheMaxAgeSeconds: CACHE_TTL_MS / 1000,
    };
}
