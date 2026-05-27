import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import {
    exchangeMcpOAuthCode,
    isCustomMcpOAuthState,
} from "../../../utils/mcpOAuth";

export const dynamic = "force-dynamic";

function isExpired(pending) {
    return (
        typeof pending?.expiresAt === "number" && pending.expiresAt < Date.now()
    );
}

/**
 * POST /api/auth/mcp/exchange
 * Exchanges a custom MCP OAuth 2.1 authorization code and stores the resulting
 * bearer token on the user's custom MCP server config.
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

        const { code, state } = await request.json();
        if (!code || !isCustomMcpOAuthState(state)) {
            return NextResponse.json(
                { error: "Missing or invalid OAuth callback parameters" },
                { status: 400 },
            );
        }

        const pending = user.mcpOAuthPending;
        if (
            pending?.provider !== "custom-mcp" ||
            pending?.state !== state ||
            !pending?.serverId ||
            !pending?.clientId ||
            !pending?.codeVerifier ||
            !pending?.tokenEndpoint
        ) {
            return NextResponse.json(
                {
                    error: "No pending custom MCP OAuth flow found. Please start the connection again.",
                },
                { status: 400 },
            );
        }
        if (isExpired(pending)) {
            user.mcpOAuthPending = undefined;
            user.markModified("mcpOAuthPending");
            await user.save();
            return NextResponse.json(
                {
                    error: "OAuth flow expired. Please start the connection again.",
                },
                { status: 400 },
            );
        }

        const tokenData = await exchangeMcpOAuthCode({ pending, code });
        const accessToken = tokenData.access_token;
        if (!accessToken) {
            return NextResponse.json(
                { error: "No access token received" },
                { status: 400 },
            );
        }

        const mcpServers = { ...(user.mcpServers || {}) };
        const existing = mcpServers[pending.serverId] || {};
        const nextConfig = {
            ...existing,
            type: existing.type || "streamable-http",
            url: existing.url || pending.resourceUrl,
            headers: {
                ...(existing.headers || {}),
                Authorization: `Bearer ${accessToken}`,
            },
            authType: "oauth2",
            refreshToken: tokenData.refresh_token,
            expiresAt: tokenData.expires_in
                ? Date.now() + tokenData.expires_in * 1000
                : undefined,
            mcpClientId: pending.clientId,
            oauthIssuer: pending.issuer,
            oauthScope: tokenData.scope,
        };

        mcpServers[pending.serverId] = nextConfig;
        user.mcpServers = mcpServers;
        user.markModified("mcpServers");
        user.mcpOAuthPending = undefined;
        user.markModified("mcpOAuthPending");
        await user.save();

        return NextResponse.json({
            success: true,
            serverId: pending.serverId,
        });
    } catch (error) {
        console.error("Custom MCP OAuth exchange error:", error);
        return NextResponse.json(
            { error: error.message || "MCP OAuth exchange failed" },
            { status: 400 },
        );
    }
}
