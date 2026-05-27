/**
 * Server-side validation for MCP server URLs.
 *
 * Blocks SSRF vectors by rejecting localhost, private IPv4 ranges,
 * link-local, loopback, and cloud metadata endpoints. The MCP server
 * URL is fetched server-side during chat streaming, so an unvalidated
 * URL would let any user reach internal services from the API host.
 *
 * In production, also requires HTTPS. Set MCP_ALLOW_PRIVATE_URLS=true
 * to bypass (e.g. for local dev against a self-hosted MCP server).
 */

const PRIVATE_IPV4_RANGES = [
    // 10.0.0.0/8
    (n) => n[0] === 10,
    // 172.16.0.0/12
    (n) => n[0] === 172 && n[1] >= 16 && n[1] <= 31,
    // 192.168.0.0/16
    (n) => n[0] === 192 && n[1] === 168,
    // 127.0.0.0/8 (loopback)
    (n) => n[0] === 127,
    // 169.254.0.0/16 (link-local, includes 169.254.169.254 metadata)
    (n) => n[0] === 169 && n[1] === 254,
    // 0.0.0.0/8
    (n) => n[0] === 0,
    // 100.64.0.0/10 (CGNAT)
    (n) => n[0] === 100 && n[1] >= 64 && n[1] <= 127,
];

function parseIpv4(host) {
    const parts = host.split(".");
    if (parts.length !== 4) return null;
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return nums;
}

function isBlockedHost(hostname) {
    const host = hostname.toLowerCase();

    // Block obvious localhost aliases
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host === "ip6-localhost" || host === "ip6-loopback") return true;

    // Block IPv6 loopback / link-local / unique-local
    if (host.startsWith("[") && host.endsWith("]")) {
        const v6 = host.slice(1, -1);
        if (v6 === "::1" || v6 === "::") return true;
        if (
            v6.startsWith("fe80:") ||
            v6.startsWith("fc") ||
            v6.startsWith("fd")
        )
            return true;
        // IPv4-mapped IPv6: ::ffff:a.b.c.d (dotted) or ::ffff:HHHH:HHHH (hex,
        // which is what URL.hostname normalizes to). Extract embedded v4.
        const dotted = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
        if (dotted) {
            const nums = parseIpv4(dotted[1]);
            if (nums && PRIVATE_IPV4_RANGES.some((fn) => fn(nums))) return true;
        }
        const hex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
        if (hex) {
            const hi = parseInt(hex[1], 16);
            const lo = parseInt(hex[2], 16);
            const nums = [
                (hi >> 8) & 0xff,
                hi & 0xff,
                (lo >> 8) & 0xff,
                lo & 0xff,
            ];
            if (PRIVATE_IPV4_RANGES.some((fn) => fn(nums))) return true;
        }
        return false;
    }

    const nums = parseIpv4(host);
    if (nums) {
        return PRIVATE_IPV4_RANGES.some((fn) => fn(nums));
    }

    return false;
}

/**
 * Validates an MCP server URL. Returns { ok: true, url } on success or
 * { ok: false, error } on failure.
 */
export function validateMcpServerUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
        return { ok: false, error: "URL is required" };
    }

    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch {
        return { ok: false, error: "Invalid URL" };
    }

    if (!/^https?:$/.test(parsed.protocol)) {
        return { ok: false, error: "URL must use http or https" };
    }

    const allowPrivate = process.env.MCP_ALLOW_PRIVATE_URLS === "true";
    const isProd = process.env.NODE_ENV === "production";

    if (isProd && !allowPrivate && parsed.protocol !== "https:") {
        return { ok: false, error: "URL must use https in production" };
    }

    if (!allowPrivate && isBlockedHost(parsed.hostname)) {
        return {
            ok: false,
            error: "URL host is not allowed (private or loopback address)",
        };
    }

    return { ok: true, url: parsed.toString() };
}
