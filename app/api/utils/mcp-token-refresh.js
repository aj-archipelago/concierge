const DEFAULT_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const ATLASSIAN_3LO_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const ATLASSIAN_MCP_TOKEN_URL = "https://cf.mcp.atlassian.com/v1/token";

function serverExpiresWithin(serverConfig, now, refreshWindowMs) {
    const expiresAt = serverConfig?.expiresAt;
    return typeof expiresAt === "number" && expiresAt <= now + refreshWindowMs;
}

function buildRefreshedServerConfig(serverConfig, tokenData, now) {
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
        throw new Error("Token refresh did not return an access token");
    }

    return {
        ...serverConfig,
        headers: {
            ...(serverConfig.headers || {}),
            Authorization: `Bearer ${accessToken}`,
        },
        refreshToken: tokenData.refresh_token || serverConfig.refreshToken,
        expiresAt: tokenData.expires_in
            ? now + tokenData.expires_in * 1000
            : undefined,
    };
}

async function readTokenResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
        throw new Error(
            data.error_description || data.error || "Token refresh failed",
        );
    }
    return data;
}

async function refreshAtlassianMcpToken(serverConfig) {
    const body = {
        grant_type: "refresh_token",
        refresh_token: serverConfig.refreshToken,
        client_id: serverConfig.mcpClientId,
    };

    if (serverConfig.url) {
        body.resource = serverConfig.url;
    }

    const response = await fetch(ATLASSIAN_MCP_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: new URLSearchParams(body).toString(),
    });

    return readTokenResponse(response);
}

async function refreshAtlassian3loToken(serverConfig) {
    const clientId = process.env.NEXT_PUBLIC_ATLASSIAN_CLIENT_ID;
    const clientSecret = process.env.ATLASSIAN_CLIENT_CREDENTIAL;
    if (!clientId || !clientSecret) {
        throw new Error("Atlassian OAuth is not configured");
    }

    const response = await fetch(ATLASSIAN_3LO_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            grant_type: "refresh_token",
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: serverConfig.refreshToken,
        }),
    });

    return readTokenResponse(response);
}

function isAtlassianUrl(url) {
    try {
        const { hostname } = new URL(url);
        return (
            hostname === "atlassian.com" || hostname.endsWith(".atlassian.com")
        );
    } catch {
        return false;
    }
}

export function isMcpServerExpiring(
    serverConfig,
    { now = Date.now(), refreshWindowMs = DEFAULT_REFRESH_WINDOW_MS } = {},
) {
    return serverExpiresWithin(serverConfig, now, refreshWindowMs);
}

export async function refreshMcpServerConfig(
    serverKey,
    serverConfig,
    { now = Date.now(), logPrefix = "[MCP:refresh]" } = {},
) {
    if (!serverConfig?.refreshToken) {
        return {
            refreshed: false,
            reason: "missing_refresh_token",
            config: serverConfig,
        };
    }

    const normalizedKey = String(serverKey || "").toLowerCase();
    const isAtlassian =
        normalizedKey === "atlassian" ||
        normalizedKey === "atlassian_api" ||
        isAtlassianUrl(serverConfig.url);

    if (!isAtlassian) {
        return {
            refreshed: false,
            reason: "unsupported_server",
            config: serverConfig,
        };
    }

    try {
        const tokenData = serverConfig.mcpClientId
            ? await refreshAtlassianMcpToken(serverConfig)
            : await refreshAtlassian3loToken(serverConfig);
        const config = buildRefreshedServerConfig(serverConfig, tokenData, now);
        console.log(
            `${logPrefix} refreshed ${serverKey} token; expiresAt=${config.expiresAt ? new Date(config.expiresAt).toISOString() : "none"}`,
        );
        return { refreshed: true, config };
    } catch (error) {
        console.warn(
            `${logPrefix} failed to refresh ${serverKey} token: ${error.message}`,
        );
        return {
            refreshed: false,
            reason: "refresh_failed",
            error,
            config: serverConfig,
        };
    }
}

export async function refreshExpiringMcpServersForUser(
    user,
    {
        logPrefix = "[MCP:refresh]",
        refreshWindowMs = DEFAULT_REFRESH_WINDOW_MS,
        now = Date.now(),
    } = {},
) {
    const mcpServers =
        user?.mcpServers && typeof user.mcpServers === "object"
            ? { ...user.mcpServers }
            : {};
    const refreshedServers = [];
    const unavailableServers = [];
    let modified = false;

    for (const [serverKey, serverConfig] of Object.entries(mcpServers)) {
        if (serverKey === "atlassian_api") {
            continue;
        }

        if (!isMcpServerExpiring(serverConfig, { now, refreshWindowMs })) {
            continue;
        }

        const result = await refreshMcpServerConfig(serverKey, serverConfig, {
            now,
            logPrefix,
        });
        if (result.refreshed) {
            mcpServers[serverKey] = result.config;
            refreshedServers.push(serverKey);
            modified = true;
        } else {
            unavailableServers.push({
                serverKey,
                reason: result.reason,
                message: result.error?.message,
            });
        }
    }

    if (modified && user) {
        user.mcpServers = mcpServers;
        user.markModified?.("mcpServers");
        await user.save?.();
    }

    return {
        mcpServers,
        refreshedServers,
        unavailableServers,
    };
}
