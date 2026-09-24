export const RUN_PREVIEW_LENGTH = 260;

export function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

export function stringifyRunOutput(value) {
    if (value === undefined || value === null || value === "") {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export function getRunOutput(run) {
    return (
        stringifyRunOutput(run?.data?.summary) ||
        stringifyRunOutput(run?.statusText) ||
        stringifyRunOutput(run?.error)
    );
}

export function isFailedRun(run) {
    return run?.status === "failed" || run?.status === "abandoned";
}

export function getRunFailureDetails(run) {
    return [
        ...new Set(
            [run?.error, run?.statusText, run?.data?.summary]
                .map(stringifyRunOutput)
                .filter(Boolean),
        ),
    ].join("\n\n");
}

export function truncatePreview(text, maxLength = RUN_PREVIEW_LENGTH) {
    const normalized = String(text || "")
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized) return "";
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength).trim()}...`;
}

export function hasHtmlOutput(run) {
    if (run?.outputExpiredAt) return false;
    return Boolean(
        run?.automation?.htmlOutputPath || run?.automation?.hasHtmlOutput,
    );
}
