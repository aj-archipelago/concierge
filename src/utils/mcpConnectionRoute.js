// UX routing only. Each destination validates its own inputs; cloud SSRF rules stay in place.
function localHost(hostname) {
    let host = hostname.toLowerCase();
    const mapped = host.match(/^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/);
    if (mapped) {
        const high = parseInt(mapped[1], 16),
            low = parseInt(mapped[2], 16);
        host = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
    return {
        host,
        local:
            host === "localhost" ||
            host.endsWith(".localhost") ||
            host.endsWith(".local") ||
            (!host.includes(".") && !host.includes(":")) ||
            host === "[::1]" ||
            /^\[f[cd][0-9a-f]{2}:/.test(host) ||
            /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(
                host,
            ),
    };
}

export function usesCompanion(rawUrl) {
    try {
        return localHost(new URL(rawUrl).hostname).local;
    } catch {
        return false;
    }
}
