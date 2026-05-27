export function redactUrlForLog(value) {
    if (!value || typeof value !== "string") return value;
    try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}${url.pathname}${url.search ? "?***REDACTED***" : ""}`;
    } catch {
        return value.replace(
            /(subscription-key=|sig=|token=|api[_-]?key=|password=)[^&\s"']+/gi,
            "$1***REDACTED***",
        );
    }
}

export function redactSensitiveText(value) {
    return String(value || "")
        .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 ***REDACTED***")
        .replace(/\b(Basic)\s+[A-Za-z0-9+/=]+/gi, "$1 ***REDACTED***")
        .replace(/\bAKIA[0-9A-Z]{16}\b/g, "***REDACTED_AWS_KEY***")
        .replace(
            /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
            "***REDACTED_JWT***",
        )
        .replace(/https?:\/\/[^\s"'<>]+/g, (rawUrl) => redactUrlForLog(rawUrl))
        .replace(
            /(subscription-key=|sig=|token=|api[_-]?key=|password=)[^&\s"']+/gi,
            "$1***REDACTED***",
        );
}

export function redactObjectForLog(value) {
    if (!value || typeof value !== "object") {
        return typeof value === "string" ? redactSensitiveText(value) : value;
    }
    if (Array.isArray(value))
        return value.map((item) => redactObjectForLog(item));

    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
            if (typeof item === "string") {
                return [key, redactSensitiveText(item)];
            }
            return [key, redactObjectForLog(item)];
        }),
    );
}
