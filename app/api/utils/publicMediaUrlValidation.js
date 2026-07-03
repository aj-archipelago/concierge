import { lookup as lookupHost } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const PUBLIC_MEDIA_URL_ERROR = "url must be a public http(s) URL";
const DNS_LOOKUP_TIMEOUT_MS = 3000;
const REDIRECT_CHECK_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 5;
const PRIVATE_IPV4_RANGES = [
    (n) => n[0] === 10,
    (n) => n[0] === 172 && n[1] >= 16 && n[1] <= 31,
    (n) => n[0] === 192 && n[1] === 168,
    (n) => n[0] === 127,
    (n) => n[0] === 169 && n[1] === 254,
    (n) => n[0] === 0,
    (n) => n[0] === 100 && n[1] >= 64 && n[1] <= 127,
    (n) => n[0] === 192 && n[1] === 0 && n[2] === 0,
    (n) => n[0] === 192 && n[1] === 0 && n[2] === 2,
    (n) => n[0] === 192 && n[1] === 88 && n[2] === 99,
    (n) => n[0] === 198 && n[1] >= 18 && n[1] <= 19,
    (n) => n[0] === 198 && n[1] === 51 && n[2] === 100,
    (n) => n[0] === 203 && n[1] === 0 && n[2] === 113,
    (n) => n[0] >= 224,
];
const BLOCKED_HOSTNAMES = new Set([
    "localhost",
    "ip6-localhost",
    "ip6-loopback",
    "metadata.google.internal",
]);

function invalid() {
    return { ok: false, error: PUBLIC_MEDIA_URL_ERROR };
}

function parseIpv4(host) {
    const parts = host.split(".");
    if (parts.length !== 4) return null;
    const nums = parts.map((part) => Number(part));
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return null;
    }
    return nums;
}

function normalizeHostname(hostname) {
    let host = String(hostname || "")
        .trim()
        .toLowerCase();
    if (host.startsWith("[") && host.endsWith("]")) {
        host = host.slice(1, -1);
    }
    return host;
}

function isBlockedIpv4(host) {
    const nums = parseIpv4(host);
    if (!nums) return false;
    return PRIVATE_IPV4_RANGES.some((fn) => fn(nums));
}

function isBlockedIpv6(host) {
    if (host === "::1" || host === "::") return true;
    const firstHextet = parseInt(host.split(":")[0], 16);
    const secondHextet = parseInt(host.split(":")[1] || "0", 16);
    if (!Number.isFinite(firstHextet)) {
        return true;
    }
    if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) {
        return true;
    }
    if (host.startsWith("fc") || host.startsWith("fd")) {
        return true;
    }

    if (host.startsWith("::ffff:")) {
        const mapped = host.slice("::ffff:".length);
        if (parseIpv4(mapped)) {
            return isBlockedIpv4(mapped);
        }
        const hextets = mapped.split(":");
        if (hextets.length !== 2) return true;
        const hi = parseIpv6Hextet(hextets[0]);
        const lo = parseIpv6Hextet(hextets[1]);
        if (hi == null || lo == null) return true;
        return isBlockedIpv4(
            [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join(
                ".",
            ),
        );
    }

    if (firstHextet === 0x2001 && secondHextet === 0x0db8) return true;
    if (firstHextet < 0x2000 || firstHextet > 0x3fff) return true;

    return false;
}

function parseIpv6Hextet(value) {
    if (!value || value.length > 4) return null;
    for (const char of value) {
        const code = char.charCodeAt(0);
        const isDigit = code >= 48 && code <= 57;
        const isLowerHex = code >= 97 && code <= 102;
        if (!isDigit && !isLowerHex) return null;
    }
    const parsed = parseInt(value, 16);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) {
        return null;
    }
    return parsed;
}

function lookupHostWithTimeout(hostname) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(
            () => reject(new Error("DNS lookup timed out")),
            DNS_LOOKUP_TIMEOUT_MS,
        );
        timeoutId.unref?.();
    });

    return Promise.race([
        lookupHost(hostname, {
            all: true,
            verbatim: true,
        }),
        timeout,
    ]).finally(() => clearTimeout(timeoutId));
}

function isBlockedAddress(address) {
    const host = normalizeHostname(address);
    const family = isIP(host);
    if (family === 4) return isBlockedIpv4(host);
    if (family === 6) return isBlockedIpv6(host);
    return false;
}

async function resolvePublicAddresses(hostname) {
    const host = normalizeHostname(hostname);
    const family = isIP(host);

    if (family) {
        return isBlockedAddress(host) ? null : [{ address: host, family }];
    }

    let addresses;
    try {
        addresses = await lookupHostWithTimeout(host);
    } catch {
        return null;
    }

    if (
        !Array.isArray(addresses) ||
        addresses.length === 0 ||
        addresses.some(({ address }) => isBlockedAddress(address))
    ) {
        return null;
    }

    return addresses;
}

function isBlockedHostname(hostname) {
    const host = normalizeHostname(hostname);
    if (!host) return true;
    if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
        return true;
    }
    return isBlockedAddress(host);
}

async function validateParsedPublicUrl(parsed) {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
    }
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
        return null;
    }

    const hostname = normalizeHostname(parsed.hostname);
    if (isBlockedHostname(hostname)) {
        return null;
    }

    const addresses = await resolvePublicAddresses(hostname);
    if (!addresses) {
        return null;
    }

    return { parsed, addresses };
}

function requestRedirectTarget(parsed, address) {
    return new Promise((resolve, reject) => {
        const request =
            parsed.protocol === "https:" ? httpsRequest : httpRequest;
        const req = request(
            {
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port,
                path: `${parsed.pathname}${parsed.search}`,
                method: "GET",
                headers: {
                    Range: "bytes=0-0",
                    "User-Agent": "Concierge media URL validator",
                },
                lookup: (_hostname, _options, callback) => {
                    callback(null, address.address, address.family);
                },
            },
            (res) => {
                const statusCode = res.statusCode || 0;
                const location = res.headers?.location || null;
                res.resume?.();
                res.destroy?.();
                resolve({ statusCode, location });
            },
        );

        req.on("error", reject);
        req.setTimeout?.(REDIRECT_CHECK_TIMEOUT_MS, () => {
            req.destroy(new Error("URL redirect validation timed out"));
        });
        req.end();
    });
}

async function resolveRedirectChain(parsed, addresses) {
    let current = parsed;
    let currentAddresses = addresses;

    for (
        let redirectCount = 0;
        redirectCount <= MAX_REDIRECTS;
        redirectCount++
    ) {
        let response;
        try {
            response = await requestRedirectTarget(
                current,
                currentAddresses[0],
            );
        } catch {
            return null;
        }

        if (response.statusCode < 300 || response.statusCode >= 400) {
            return current;
        }

        if (!response.location || redirectCount === MAX_REDIRECTS) {
            return null;
        }

        let next;
        try {
            next = new URL(response.location, current);
        } catch {
            return null;
        }

        const validation = await validateParsedPublicUrl(next);
        if (!validation) {
            return null;
        }

        current = validation.parsed;
        currentAddresses = validation.addresses;
    }

    return null;
}

export async function validatePublicMediaUrl(url, options = {}) {
    if (typeof url !== "string" || !url.trim()) {
        return invalid();
    }

    let parsed;
    try {
        parsed = new URL(url.trim());
    } catch {
        return invalid();
    }

    const validation = await validateParsedPublicUrl(parsed);
    if (!validation) {
        return invalid();
    }

    if (options.validateRedirects) {
        const finalUrl = await resolveRedirectChain(
            validation.parsed,
            validation.addresses,
        );
        if (!finalUrl) {
            return invalid();
        }
        parsed = finalUrl;
    }

    return { ok: true, url: parsed.toString() };
}

export { PUBLIC_MEDIA_URL_ERROR };
