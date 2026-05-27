import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import { fetchAtlassianCloudIdFromAccessToken } from "../../../utils/atlassianCloudId";

export const dynamic = "force-dynamic";

const MCP_ATLASSIAN_URL = "https://mcp.atlassian.com/v1/mcp";
const MCP_TOKEN_URL = "https://cf.mcp.atlassian.com/v1/token";

/**
 * POST /api/auth/atlassian/exchange
 * Exchanges an Atlassian authorization code for tokens and saves them
 * to the user's MCP server configuration.
 *
 * Supports two flows:
 * - MCP OAuth 2.1 (isMcp21=true): Uses PKCE + MCP token endpoint
 * - Legacy 3LO (default): Uses standard Atlassian OAuth
 *
 * Body: { code: string, redirectUri: string, isMcp21?: boolean }
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

        const { code, redirectUri, isMcp21 } = await request.json();
        if (!code || !redirectUri) {
            return NextResponse.json(
                { error: "Missing code or redirectUri" },
                { status: 400 },
            );
        }

        let accessToken;
        let refreshToken;
        let expiresIn;

        if (isMcp21) {
            // MCP OAuth 2.1 flow: use PKCE + MCP token endpoint
            const pending = user.mcpOAuthPending;
            if (!pending?.codeVerifier || !pending?.clientId) {
                return NextResponse.json(
                    {
                        error: "No pending MCP OAuth flow found. Please start the connection again.",
                    },
                    { status: 400 },
                );
            }

            console.log("MCP 2.1 token exchange started");

            const tokenRes = await fetch(MCP_TOKEN_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    code,
                    redirect_uri: pending.redirectUri,
                    client_id: pending.clientId,
                    code_verifier: pending.codeVerifier,
                }).toString(),
            });

            const tokenData = await tokenRes.json();
            if (!tokenRes.ok) {
                console.error("MCP 2.1 token exchange failed:", tokenData);
                return NextResponse.json(
                    { error: "MCP token exchange failed", details: tokenData },
                    { status: 400 },
                );
            }

            accessToken = tokenData.access_token;
            refreshToken = tokenData.refresh_token;
            expiresIn = tokenData.expires_in;

            console.log(
                `MCP 2.1 token received: hasAccess=${!!accessToken}, hasRefresh=${!!refreshToken}, expiresIn=${expiresIn}`,
            );
        } else {
            // Legacy 3LO flow
            const clientId = process.env.NEXT_PUBLIC_ATLASSIAN_CLIENT_ID;
            const clientSecret = process.env.JIRA_CLIENT_SECRET;

            if (!clientId || !clientSecret) {
                return NextResponse.json(
                    { error: "Atlassian OAuth is not configured" },
                    { status: 500 },
                );
            }

            const tokenRes = await fetch(
                "https://auth.atlassian.com/oauth/token",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        grant_type: "authorization_code",
                        client_id: clientId,
                        client_secret: clientSecret,
                        code,
                        redirect_uri: redirectUri,
                        scope: "offline_access",
                    }),
                },
            );

            const tokenData = await tokenRes.json();
            if (!tokenRes.ok) {
                console.error("Atlassian token exchange failed:", tokenData);
                return NextResponse.json(
                    {
                        error: "Failed to exchange authorization code",
                        details: tokenData,
                    },
                    { status: 400 },
                );
            }

            accessToken = tokenData.access_token;
            refreshToken = tokenData.refresh_token;
            expiresIn = tokenData.expires_in;
        }

        if (!accessToken) {
            return NextResponse.json(
                { error: "No access token received" },
                { status: 400 },
            );
        }

        const pending = user.mcpOAuthPending;
        const cloudId = await fetchAtlassianCloudIdFromAccessToken(accessToken);
        console.log(
            `[MCP:exchange] cloudId resolution: ${cloudId ? "found" : "missing"} | flow=${isMcp21 ? "mcp21" : "3lo"}`,
        );

        const serverPayload = {
            type: "streamable-http",
            url: MCP_ATLASSIAN_URL,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...(cloudId ? { "X-Atlassian-Cloud-Id": cloudId } : {}),
            },
            refreshToken: refreshToken,
            expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
            mcpClientId: isMcp21 ? pending?.clientId : undefined,
            ...(cloudId ? { cloudId } : {}),
        };

        const mcpServers = { ...(user.mcpServers || {}) };
        // Same connection is used for MCP tools and applet service-token
        // (/api/applet/service-token reads atlassian_api). MCP OAuth 2.1
        // previously wrote only "atlassian", so the applet never saw the token.
        mcpServers.atlassian = serverPayload;
        mcpServers.atlassian_api = serverPayload;

        user.mcpServers = mcpServers;
        // Clean up pending OAuth data
        if (isMcp21) {
            user.mcpOAuthPending = undefined;
            user.markModified("mcpOAuthPending");
        }
        await user.save();

        console.log(
            `Atlassian MCP config saved (flow=${isMcp21 ? "mcp21" : "3lo"})`,
        );

        return NextResponse.json({ success: true, accessToken, refreshToken });
    } catch (err) {
        console.error("Atlassian OAuth exchange error:", err);
        return NextResponse.json(
            { error: err.message || "Exchange failed" },
            { status: 500 },
        );
    }
}
