import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth.js";
import { MCP_PRESETS } from "../../../../src/utils/mcpPresets.js";
import { fetchAtlassianCloudIdFromAuthorization } from "../../utils/atlassianCloudId.js";
import { refreshMcpServerConfig } from "../../utils/mcp-token-refresh.js";
import { validateAppletAccess } from "../access.js";
import { APPLET_SDK_LIMITS, withAppletSdkGuard } from "../sdk-guard.js";

export const dynamic = "force-dynamic";

const ALLOWED_SERVICES = ["atlassian", "github", "slack"];

// Map public service names to their mcpServers storage key.
// Atlassian uses "atlassian_api" (Jira page 3LO tokens with API access)
// rather than "atlassian" (MCP tokens without direct API access).
const SERVICE_STORAGE_KEY = {
    atlassian: "atlassian_api",
};

/**
 * Build OAuth connect info from the MCP preset for a service.
 * Returned to the client so the SDK can auto-initiate the OAuth flow.
 *
 * Atlassian uses the 3LO (three-legged OAuth) flow here instead of
 * MCP OAuth 2.1 because applets need direct Jira REST API access
 * (cloudId lookup, issue queries, etc.) which requires scopes like
 * read:jira-work that MCP tokens don't carry.
 */
function getConnectInfo(service) {
    if (service === "atlassian") {
        return {
            service: "atlassian",
            mcpOAuthInit: "/api/auth/atlassian/applet-init",
            mcpOAuthRedirect: "/code/jira",
        };
    }
    const preset = MCP_PRESETS[service];
    if (!preset) return undefined;
    const info = { service: preset.id };
    if (preset.mcpOAuthInit) {
        info.mcpOAuthInit = preset.mcpOAuthInit;
        info.mcpOAuthRedirect = preset.mcpOAuthRedirect;
    } else if (preset.oauthUrl) {
        info.oauthUrl = preset.oauthUrl;
    }
    return info;
}

/**
 * POST /api/applet/service-token
 * Returns an access token for a connected service.
 * Used by applets (via ConciergeSDK.services.getAccessToken) to call
 * external APIs directly.
 *
 * Body: { service: "atlassian" | "github" | "slack", appletId: string }
 * Returns: { token, service, expiresAt?, metadata? }
 */
export async function POST(request) {
    try {
        const user = await getCurrentUser(false);
        if (!user?._id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { service, appletId } = await request.json();

        if (!service || typeof service !== "string") {
            return NextResponse.json(
                { error: "service is required" },
                { status: 400 },
            );
        }
        if (!appletId || typeof appletId !== "string") {
            return NextResponse.json(
                { error: "appletId is required" },
                { status: 400 },
            );
        }

        if (!ALLOWED_SERVICES.includes(service)) {
            return NextResponse.json(
                {
                    error: `Unknown service: ${service}. Allowed: ${ALLOWED_SERVICES.join(", ")}`,
                },
                { status: 400 },
            );
        }

        const accessError = await validateAppletAccess(appletId, user);
        if (accessError) {
            return accessError;
        }

        return await withAppletSdkGuard({
            appletId,
            userId: user._id,
            api: "services.getAccessToken",
            limits: APPLET_SDK_LIMITS.serviceToken,
            run: async () => getServiceTokenResponse({ user, service }),
        });
    } catch (error) {
        console.error("Error in applet service-token:", error);
        return NextResponse.json(
            { error: "Failed to get service token" },
            { status: 500 },
        );
    }
}

async function getServiceTokenResponse({ user, service }) {
    const mcpServers = user.mcpServers || {};
    const storageKey = SERVICE_STORAGE_KEY[service] || service;
    const serverConfig = mcpServers[storageKey];

    if (!serverConfig) {
        return NextResponse.json(
            {
                error: `${service} is not connected.`,
                code: "SERVICE_NOT_CONNECTED",
                connectInfo: getConnectInfo(service),
            },
            { status: 404 },
        );
    }

    let serviceConfig = serverConfig;
    let authorization =
        serviceConfig.headers?.Authorization ||
        serviceConfig.headers?.authorization;

    if (!authorization) {
        return NextResponse.json(
            {
                error: `${service} has no access token. The user may need to reconnect.`,
                code: "NO_TOKEN",
                connectInfo: getConnectInfo(service),
            },
            { status: 404 },
        );
    }

    // Auto-refresh expired Atlassian tokens
    if (
        serviceConfig.expiresAt &&
        typeof serviceConfig.expiresAt === "number" &&
        serviceConfig.expiresAt <= Date.now()
    ) {
        if (service === "atlassian" && serviceConfig.refreshToken) {
            const refreshed = await refreshMcpServerConfig(
                storageKey,
                serviceConfig,
                { logPrefix: "[MCP:service-token]" },
            );
            if (refreshed.refreshed) {
                const newConfig = refreshed.config;
                // Persist refreshed tokens
                const updatedServers = { ...mcpServers };
                updatedServers[storageKey] = newConfig;
                user.mcpServers = updatedServers;
                user.markModified("mcpServers");
                await user.save();

                serviceConfig = newConfig;
                authorization = serviceConfig.headers.Authorization;
            } else {
                return NextResponse.json(
                    {
                        error: `${service} token has expired and could not be refreshed.`,
                        code: "TOKEN_EXPIRED",
                        connectInfo: getConnectInfo(service),
                    },
                    { status: 401 },
                );
            }
        } else {
            return NextResponse.json(
                {
                    error: `${service} token has expired.`,
                    code: "TOKEN_EXPIRED",
                    connectInfo: getConnectInfo(service),
                },
                { status: 401 },
            );
        }
    }

    if (service === "atlassian" && authorization && !serviceConfig.cloudId) {
        const cloudId =
            await fetchAtlassianCloudIdFromAuthorization(authorization);
        if (cloudId) {
            const newConfig = { ...serviceConfig, cloudId };
            const updatedServers = { ...mcpServers };
            updatedServers[storageKey] = newConfig;
            user.mcpServers = updatedServers;
            user.markModified("mcpServers");
            await user.save();
            serviceConfig = newConfig;
        }
    }

    if (!authorization || typeof authorization !== "string") {
        return NextResponse.json(
            {
                error: `${service} has no access token. The user may need to reconnect.`,
                code: "NO_TOKEN",
                connectInfo: getConnectInfo(service),
            },
            { status: 404 },
        );
    }

    // Build metadata with service-specific fields the applet needs
    const metadata = {};
    if (service === "atlassian") {
        if (!serviceConfig.cloudId) {
            return NextResponse.json(
                {
                    error: `Could not determine your Jira site. Please reconnect your Atlassian account.`,
                    code: "TOKEN_EXPIRED",
                    connectInfo: getConnectInfo(service),
                },
                { status: 401 },
            );
        }
        metadata.cloudId = serviceConfig.cloudId;
        metadata.baseUrl = `https://api.atlassian.com/ex/jira/${serviceConfig.cloudId}`;
    }

    return NextResponse.json({
        service,
        token: authorization,
        expiresAt: serviceConfig.expiresAt || null,
        metadata,
    });
}
