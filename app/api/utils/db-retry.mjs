const DEFAULT_MAX_DB_RETRY_DELAY_MS = 30_000;
const RETRY_AFTER_PATTERN = /RetryAfterMs=(\d+)/i;

function getErrorMessage(error) {
    if (!error) return "";
    if (typeof error === "string") return error;
    return error.message || error.errmsg || error.toString?.() || "";
}

function getCosmosRetryAfterMs(error) {
    const directValue =
        error?.RetryAfterMs ??
        error?.retryAfterMs ??
        error?.retryAfterMS ??
        error?.retryAfter;
    const directNumber = Number(directValue);
    if (Number.isFinite(directNumber) && directNumber >= 0) {
        return directNumber;
    }

    const match = getErrorMessage(error).match(RETRY_AFTER_PATTERN);
    if (!match) return null;

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isCosmosRateLimitError(error) {
    const message = getErrorMessage(error);
    return (
        error?.code === 16500 ||
        message.includes("Error=16500") ||
        message.includes("TooManyRequests") ||
        message.includes("Request rate is large")
    );
}

function getDbRetryDelayMs(
    error,
    fallbackDelayMs,
    maxDelayMs = DEFAULT_MAX_DB_RETRY_DELAY_MS,
) {
    const retryAfterMs = getCosmosRetryAfterMs(error);
    const baseDelayMs =
        isCosmosRateLimitError(error) && retryAfterMs !== null
            ? Math.max(retryAfterMs, fallbackDelayMs)
            : fallbackDelayMs;
    const jitterMaxMs = Math.min(250, Math.max(25, baseDelayMs * 0.1));
    const jitterMs = Math.floor(Math.random() * jitterMaxMs);
    return Math.min(baseDelayMs + jitterMs, maxDelayMs);
}

function formatDbErrorForLog(error) {
    const message = getErrorMessage(error);
    if (!message) return String(error);

    const retryAfterMs = getCosmosRetryAfterMs(error);
    if (isCosmosRateLimitError(error)) {
        return `Cosmos rate limited request${
            retryAfterMs !== null ? ` (RetryAfterMs=${retryAfterMs})` : ""
        }`;
    }

    return message;
}

export {
    formatDbErrorForLog,
    getCosmosRetryAfterMs,
    getDbRetryDelayMs,
    isCosmosRateLimitError,
};
