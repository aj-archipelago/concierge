export const TOKEN_COLUMNS = [
    "input_tokens",
    "output_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
];

const THIRTY_DAY_WINDOW = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The auto-review deployment runs GPT-5.6 Luna. Share its configured rate card
// instead of duplicating prices; explicit deployment prices take precedence.
const PRICING_MODEL_ALIASES = { "codex-auto-review": "gpt-5.6-luna" };

function getUsageValue(row, column) {
    const value = row?.[column];
    return Number.isFinite(value) ? value : 0;
}

function computeBucketCost(row, pricing) {
    if (!pricing) return { cost: null, complete: false };
    if (
        !Number.isFinite(row?.unbucketed_requests) &&
        computeTotalTokens(row) >
            TOKEN_COLUMNS.reduce(
                (sum, field) => sum + getUsageValue(row, field),
                0,
            )
    )
        return { cost: null, complete: false };
    const rates = {
        input_tokens: "input",
        output_tokens: "output",
        cache_creation_input_tokens: "cacheWrite",
        cache_read_input_tokens: "cacheRead",
    };
    let cost = 0;
    let pricedTokens = 0;
    let complete = true;
    for (const [field, rate] of Object.entries(rates)) {
        const tokens = getUsageValue(row, field);
        if (tokens <= 0) continue;
        if (!Number.isFinite(pricing[rate]) || pricing[rate] < 0) {
            complete = false;
            continue;
        }
        pricedTokens += tokens;
        cost += (tokens / 1_000_000) * pricing[rate];
    }
    return { cost: !complete && !pricedTokens ? null : cost, complete };
}

function getModelName(row) {
    if (typeof row?._id === "string") return row._id;
    if (typeof row?._id?.model === "string") return row._id.model;
    if (typeof row?.model === "string") return row.model;
    return null;
}

function resolvePricing(model, pricingMap) {
    if (pricingMap?.[model]) return pricingMap[model];
    const aliasPricing = pricingMap?.[PRICING_MODEL_ALIASES[model]];
    if (aliasPricing) return aliasPricing;
    // Provider usage can name a dated OpenAI snapshot while metadata names the
    // base model. This dashboard estimates at current prices, including here.
    // An exact snapshot price always wins; never guess across model families.
    const baseModel = model?.match(
        /^(gpt-[a-z\d.-]+|o\d[a-z\d.-]*)-\d{4}-\d{2}-\d{2}$/i,
    )?.[1];
    return baseModel ? pricingMap?.[baseModel] : undefined;
}

export function buildPricingMap(models) {
    const map = {};
    if (!models) return map;

    for (const model of models) {
        if (!model.pricing) continue;
        if (model.modelId) map[model.modelId] = model.pricing;
        if (model.emulateOpenAIChatModel) {
            map[model.emulateOpenAIChatModel] = model.pricing;
        }
        if (Array.isArray(model.pricingAliases)) {
            for (const alias of model.pricingAliases) {
                if (typeof alias === "string" && alias) {
                    map[alias] = model.pricing;
                }
            }
        }
    }

    return map;
}

export function computeTotalTokens(row) {
    if (Number.isFinite(row?.metered_tokens)) return row.metered_tokens;
    if (TOKEN_COLUMNS.some((column) => Number.isFinite(row?.[column]))) {
        return TOKEN_COLUMNS.reduce(
            (sum, column) => sum + getUsageValue(row, column),
            0,
        );
    }
    return Number.isFinite(row?.total_tokens) ? row.total_tokens : 0;
}

export function getUsageCostDetails(row, pricingMap) {
    const rows = row?.model_breakdown?.length ? row.model_breakdown : [row];
    let cost = 0;
    let priced = 0;
    let unpricedRequests = 0;
    const unpricedModels = new Set();
    for (const item of rows) {
        const model = getModelName(item);
        const { cost: amount, complete: bucketsComplete } = computeBucketCost(
            item,
            resolvePricing(model, pricingMap),
        );
        const missingRequests = !bucketsComplete
            ? item?.requests || 0
            : item?.unbucketed_requests || 0;
        if (
            (!bucketsComplete &&
                (computeTotalTokens(item) > 0 || item?.requests > 0)) ||
            missingRequests > 0
        ) {
            unpricedRequests += missingRequests;
            unpricedModels.add(model || "unknown");
        }
        if (
            amount != null &&
            (!bucketsComplete ||
                !missingRequests ||
                item?.requests > missingRequests)
        ) {
            cost += amount;
            priced++;
        }
    }
    return {
        cost: priced || !unpricedModels.size ? cost : null,
        complete: unpricedModels.size === 0,
        unpricedRequests,
        unpricedModels: [...unpricedModels],
    };
}

export function computeUsageCost(row, pricingMap) {
    // Keep the known subtotal useful even when part of the usage is unpriced.
    // Displays and exports must also carry getUsageCostDetails().complete.
    return getUsageCostDetails(row, pricingMap).cost;
}

export function getUsageCostStatus(details) {
    if (details.cost == null) return "unavailable";
    return details.complete ? "estimated" : "partial";
}

export function getUsageDateRange(preset, now = new Date()) {
    const end = new Date(now);
    const start = new Date(now);
    if (preset === "today") start.setUTCHours(0, 0, 0, 0);
    else
        start.setTime(
            +end -
                ({ "7d": 7, "30d": 30, "90d": 90 }[preset] || 7) * MS_PER_DAY,
        );
    return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export function getWindowDays(startDate, endDate) {
    if (!startDate || !endDate) return THIRTY_DAY_WINDOW;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return THIRTY_DAY_WINDOW;
    }

    return Math.max(1 / 86400, (end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function computeRunRate(cost, startDate, endDate) {
    if (cost == null || Number.isNaN(cost)) return null;

    return (cost / getWindowDays(startDate, endDate)) * THIRTY_DAY_WINDOW;
}
