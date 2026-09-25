import {
    computeTotalTokens,
    getUsageCostDetails,
    getUsageCostStatus,
} from "./usageMetrics";

const COLUMNS = [
    "interval_utc",
    "api_key_id",
    "api_key_label",
    "requests",
    "input_tokens",
    "output_tokens",
    "cache_write_tokens",
    "cache_read_tokens",
    "total_tokens",
    "estimated_cost_usd",
    "cost_status",
    "unpriced_requests",
    "unpriced_models",
];

function escapeCsvValue(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildIntervalUsageCsv(
    rows,
    { apiKeyId, apiKeyLabel, pricingMap },
) {
    return [
        COLUMNS.join(","),
        ...rows.map((row) => {
            const details = getUsageCostDetails(row, pricingMap);
            return [
                row._id || "",
                apiKeyId || "",
                apiKeyLabel || "",
                row.requests || 0,
                row.input_tokens || 0,
                row.output_tokens || 0,
                row.cache_creation_input_tokens || 0,
                row.cache_read_input_tokens || 0,
                computeTotalTokens(row),
                details.cost == null ? "" : details.cost.toFixed(6),
                getUsageCostStatus(details),
                details.unpricedRequests,
                details.unpricedModels.join("; "),
            ]
                .map(escapeCsvValue)
                .join(",");
        }),
    ].join("\n");
}
