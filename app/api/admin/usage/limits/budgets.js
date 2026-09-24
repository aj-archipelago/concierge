export const DEFAULT_WEEKLY_USD = null;
export function getDefaultWeeklyUsd(
    value = process.env.CORTEX_DEFAULT_WEEKLY_COST_USD,
) {
    if (
        value == null ||
        String(value).trim() === "" ||
        String(value).trim().toLowerCase() === "unlimited"
    )
        return DEFAULT_WEEKLY_USD;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0)
        throw new Error(
            "CORTEX_DEFAULT_WEEKLY_COST_USD must be a nonnegative number or unlimited",
        );
    return amount;
}
const WEEK_MS = 7 * 86_400_000;
export function describeBudget(policy, usage = null, now = new Date()) {
    const anchor = policy.anchorAt ? +new Date(policy.anchorAt) : null;
    const start =
        anchor == null
            ? null
            : anchor +
              Math.max(0, Math.floor((+now - anchor) / WEEK_MS)) * WEEK_MS;
    return {
        apiKeyId: policy._id,
        weeklyUsd: policy.weeklyUsd,
        periodId:
            start == null
                ? null
                : `${policy._id}:${new Date(start).toISOString()}`,
        periodStart: start == null ? null : new Date(start).toISOString(),
        resetAt: start == null ? null : new Date(start + WEEK_MS).toISOString(),
        spentUsd: usage ? (usage.spentMicros || 0) / 1_000_000 : null,
        requests: usage ? usage.requests || 0 : null,
        fallbackRequests: usage?.fallbackRequests || 0,
        hasSnapshot: Boolean(usage),
        snapshotAt: usage?.snapshotAt
            ? new Date(usage.snapshotAt).toISOString()
            : null,
        policyUpdatedAt: policy.updatedAt
            ? new Date(policy.updatedAt).toISOString()
            : null,
    };
}
export function validateLimitUpdate(body) {
    if (
        !body ||
        typeof body.apiKeyId !== "string" ||
        !/^[a-f0-9]{12}$/.test(body.apiKeyId)
    )
        return false;
    return (
        body.weeklyUsd === null ||
        (typeof body.weeklyUsd === "number" &&
            Number.isFinite(body.weeklyUsd) &&
            body.weeklyUsd >= 0 &&
            body.weeklyUsd <= 1_000_000 &&
            Math.abs(body.weeklyUsd * 100 - Math.round(body.weeklyUsd * 100)) <
                0.000001)
    );
}
