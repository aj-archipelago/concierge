export const TOKEN_COLUMNS = ["input_tokens", "output_tokens"];

const THIRTY_DAY_WINDOW = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getUsageValue(row, column) {
    const value = row?.[column];
    return Number.isFinite(value) ? value : 0;
}

function computeBucketCost(row, pricing) {
    if (!pricing) return null;

    const inputCost =
        (getUsageValue(row, "input_tokens") / 1_000_000) * (pricing.input || 0);
    const outputCost =
        (getUsageValue(row, "output_tokens") / 1_000_000) *
        (pricing.output || 0);
    const cacheWriteCost =
        (getUsageValue(row, "cache_creation_input_tokens") / 1_000_000) *
        (pricing.cacheWrite || 0);
    const cacheReadCost =
        (getUsageValue(row, "cache_read_input_tokens") / 1_000_000) *
        (pricing.cacheRead || 0);

    return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

function getModelName(row) {
    if (typeof row?._id === "string") return row._id;
    if (typeof row?._id?.model === "string") return row._id.model;
    if (typeof row?.model === "string") return row.model;
    return null;
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
    if (Number.isFinite(row?.total_tokens)) {
        return row.total_tokens;
    }

    return TOKEN_COLUMNS.reduce(
        (total, column) => total + getUsageValue(row, column),
        0,
    );
}

export function computeUsageCost(row, pricingMap) {
    if (!row || !pricingMap) return null;

    if (Array.isArray(row.model_breakdown) && row.model_breakdown.length > 0) {
        let totalCost = 0;
        let matchedModels = 0;

        for (const modelRow of row.model_breakdown) {
            const pricing = pricingMap[getModelName(modelRow)];
            const modelCost = computeBucketCost(modelRow, pricing);

            if (modelCost == null) continue;

            totalCost += modelCost;
            matchedModels += 1;
        }

        return matchedModels > 0 ? totalCost : null;
    }

    const pricing = pricingMap[getModelName(row)];
    return computeBucketCost(row, pricing);
}

export function getWindowDays(startDate, endDate) {
    if (!startDate || !endDate) return THIRTY_DAY_WINDOW;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return THIRTY_DAY_WINDOW;
    }

    return Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY),
    );
}

export function computeRunRate(cost, startDate, endDate) {
    if (cost == null || Number.isNaN(cost)) return null;

    return (cost / getWindowDays(startDate, endDate)) * THIRTY_DAY_WINDOW;
}
