export const AUTOMATIONS_LAST_VIEWED_STORAGE_KEY =
    "concierge-automations-last-viewed-at";
export const AUTOMATION_READ_RECEIPTS_STORAGE_KEY =
    "concierge-automation-read-receipts";

export function getAutomationReadReceipts() {
    if (typeof window === "undefined") return {};
    try {
        const value = JSON.parse(
            window.localStorage.getItem(AUTOMATION_READ_RECEIPTS_STORAGE_KEY) ||
                "{}",
        );
        return value && typeof value === "object" && !Array.isArray(value)
            ? value
            : {};
    } catch {
        return {};
    }
}

// Record the result the user saw, so a newer run stays unread.
export function markAutomationRead(automation, currentReceipts = {}) {
    const receipts = getAutomationReadReceipts();
    Object.entries(currentReceipts).forEach(([id, readAt]) => {
        if ((Date.parse(readAt) || 0) > (Date.parse(receipts[id]) || 0)) {
            receipts[id] = readAt;
        }
    });
    if (!automation?._id || !Number.isFinite(Date.parse(automation.lastRunAt)))
        return receipts;
    const previous = Date.parse(receipts[automation._id]) || 0;
    receipts[automation._id] = new Date(
        Math.max(previous, Date.parse(automation.lastRunAt)),
    ).toISOString();
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(
                AUTOMATION_READ_RECEIPTS_STORAGE_KEY,
                JSON.stringify(receipts),
            );
        } catch {
            // Query state still tracks read results when storage is unavailable.
        }
    }
    return receipts;
}

export function getAutomationsLastViewedAt() {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(
            AUTOMATIONS_LAST_VIEWED_STORAGE_KEY,
        );
        if (!raw) return null;
        const parsed = Date.parse(raw);
        return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
    } catch {
        return null;
    }
}

export function markAutomationsViewed(at = new Date()) {
    const iso = new Date(at).toISOString();
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(
                AUTOMATIONS_LAST_VIEWED_STORAGE_KEY,
                iso,
            );
        } catch {
            // ignore storage failures
        }
    }
    return iso;
}

export function isAutomationUnread(
    automation,
    lastViewedAt,
    readReceipts = {},
) {
    if (!automation?.lastRunAt) return false;
    const runAt = Date.parse(automation.lastRunAt);
    if (Number.isNaN(runAt)) return false;
    const viewedAt = Math.max(
        Date.parse(lastViewedAt) || 0,
        Date.parse(readReceipts[automation._id]) || 0,
    );
    return runAt > viewedAt;
}

export function hasUnreadAutomationResults(
    automations,
    lastViewedAt,
    readReceipts = {},
) {
    if (!Array.isArray(automations) || automations.length === 0) {
        return false;
    }
    return automations.some((automation) =>
        isAutomationUnread(automation, lastViewedAt, readReceipts),
    );
}
