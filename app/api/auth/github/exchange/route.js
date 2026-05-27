import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";

export const dynamic = "force-dynamic";

const MCP_GITHUB_URL = "https://api.githubcopilot.com/mcp/";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

/**
 * POST /api/auth/github/exchange
 * Exchanges a GitHub authorization code for tokens using PKCE
 * and saves them to the user's MCP server configuration.
 *
 * Body: { code: string, redirectUri: string }
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

        const { code, redirectUri } = await request.json();
        if (!code || !redirectUri) {
            return NextResponse.json(
                { error: "Missing code or redirectUri" },
                { status: 400 },
            );
        }

        const pending = user.mcpOAuthPending;
        if (
            !pending?.codeVerifier ||
            !pending?.clientId ||
            pending?.provider !== "github"
        ) {
            return NextResponse.json(
                {
                    error: "No pending GitHub MCP OAuth flow found. Please start the connection again.",
                },
                { status: 400 },
            );
        }

        // Exchange authorization code for access token using PKCE + client_secret
        // (GitHub OAuth Apps require client_secret even with PKCE)
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;
        if (!clientSecret) {
            return NextResponse.json(
                {
                    error: "GitHub OAuth is not configured (missing GITHUB_CLIENT_SECRET)",
                },
                { status: 500 },
            );
        }

        const tokenRes = await fetch(GITHUB_TOKEN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                client_id: pending.clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: pending.redirectUri,
                code_verifier: pending.codeVerifier,
            }),
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) {
            console.error("GitHub MCP token exchange failed:", tokenData);
            return NextResponse.json(
                {
                    error:
                        tokenData.error_description ||
                        tokenData.error ||
                        "Token exchange failed",
                },
                { status: 400 },
            );
        }

        const accessToken = tokenData.access_token;
        if (!accessToken) {
            return NextResponse.json(
                { error: "No access token received" },
                { status: 400 },
            );
        }

        // Save to user's MCP servers
        const mcpServers = { ...(user.mcpServers || {}) };
        mcpServers.github = {
            type: "streamable-http",
            url: MCP_GITHUB_URL,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            refreshToken: tokenData.refresh_token,
            expiresAt: tokenData.expires_in
                ? Date.now() + tokenData.expires_in * 1000
                : undefined,
        };

        user.mcpServers = mcpServers;
        user.markModified("mcpServers");
        // Clean up pending OAuth data
        user.mcpOAuthPending = undefined;
        user.markModified("mcpOAuthPending");
        await user.save();

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("GitHub OAuth exchange error:", err);
        return NextResponse.json(
            { error: err.message || "Exchange failed" },
            { status: 500 },
        );
    }
}
