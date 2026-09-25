export function companionSettings() {
    const relayUrl = process.env.CORTEX_COMPANION_RELAY_URL;
    const key = process.env.COMPANION_ADMIN_KEY;
    const namespace = process.env.COMPANION_OWNER_NAMESPACE;
    if (!relayUrl || !key || !namespace) return null;
    const url = new URL(relayUrl);
    if (
        url.protocol !== "https:" &&
        !(
            process.env.NODE_ENV !== "production" &&
            url.protocol === "http:" &&
            ["127.0.0.1", "localhost"].includes(url.hostname)
        )
    ) {
        throw new Error("Companion relay must use HTTPS");
    }
    if (
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
    )
        throw new Error("Invalid companion relay origin");
    return { relayUrl: url.origin, key, namespace };
}

export async function companionAdmin(user, action, data = {}) {
    const settings = companionSettings();
    if (!settings) throw new Error("Companion connections are not enabled");
    if (!user?._id || user.userId === "nodb")
        throw new Error("Sign in to connect a computer");
    if (
        ![
            "devices",
            "pair",
            "revoke",
            "config",
            "handoff",
            "handoff-status",
        ].includes(action)
    )
        throw new Error("Invalid companion action");
    const response = await fetch(`${settings.relayUrl}/v1/admin/${action}`, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.key}`,
        },
        body: JSON.stringify({
            ...data,
            owner: `${settings.namespace}:${user._id}`,
        }),
    });
    const result = await response.json();
    if (!response.ok)
        throw Object.assign(
            new Error("Could not update the computer connection"),
            { status: response.status },
        );
    return result;
}

export async function createCompanionHandoff(user, request, intent) {
    requireCompanionOrigin(request);
    const site = new URL(process.env.CONCIERGE_PUBLIC_URL || request.url)
        .origin;
    const result = await companionAdmin(user, "handoff", {
        site,
        account: user?.username || user?.name || "",
        intent,
    });
    const deepLink = new URL("concierge-companion://connect");
    deepLink.searchParams.set("site", site);
    deepLink.searchParams.set("ticket", result.ticket);
    return { deepLink: deepLink.href, expiresIn: result.expiresIn };
}

export async function localMcpConfigForUser(user, { headless = false } = {}) {
    if (headless || !companionSettings() || !user?._id) return {};
    try {
        return (await companionAdmin(user, "config")).config || {};
    } catch {
        console.warn(
            "[Companion] Local tools are unavailable for this request",
        );
        return {};
    }
}

export function requireCompanionOrigin(request) {
    const expected = new URL(process.env.CONCIERGE_PUBLIC_URL || request.url)
        .origin;
    if (request.headers.get("origin") !== expected)
        throw Object.assign(new Error("Same-origin request required"), {
            status: 403,
        });
}
