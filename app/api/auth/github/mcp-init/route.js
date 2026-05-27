import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import {
    getTrustedMcpRedirectOrigin,
    normalizeMcpRedirectUri,
} from "../../../utils/mcpRedirectUri";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// GitHub MCP OAuth 2.1 endpoints (discovered from MCP server metadata)
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

// Default scopes recommended by the GitHub MCP server
const DEFAULT_SCOPES = "repo read:org read:user user:email read:packages";

function hasTrustedRedirectOrigin(redirectUri, request) {
    const trustedOrigin = getTrustedMcpRedirectOrigin(request);
    if (!trustedOrigin) return false;

    try {
        return new URL(redirectUri).origin === trustedOrigin;
    } catch {
        return false;
    }
}

/**
 * POST /api/auth/github/mcp-init
 * Performs MCP OAuth 2.1 initialization for the GitHub MCP server:
 * 1. PKCE code_verifier/code_challenge generation
 * 2. Returns the authorization URL for the frontend to open
 *
 * Body: { redirectUri: string }
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

        const { redirectUri: rawRedirectUri } = await request.json();
        if (!rawRedirectUri) {
            return NextResponse.json(
                { error: "Missing redirectUri" },
                { status: 400 },
            );
        }
        const redirectUri = normalizeMcpRedirectUri(rawRedirectUri, request);
        if (!hasTrustedRedirectOrigin(redirectUri, request)) {
            return NextResponse.json(
                { error: "Invalid MCP OAuth redirect URI" },
                { status: 400 },
            );
        }

        const clientId = process.env.GITHUB_CLIENT_ID;
        if (!clientId) {
            return NextResponse.json(
                {
                    error: "GitHub OAuth is not configured (missing GITHUB_CLIENT_ID)",
                },
                { status: 500 },
            );
        }

        // Generate PKCE parameters
        const codeVerifier = crypto.randomBytes(32).toString("base64url");
        const codeChallenge = crypto
            .createHash("sha256")
            .update(codeVerifier)
            .digest("base64url");

        // Store PKCE state in user doc for the exchange step
        const state = `github_mcp_${crypto.randomBytes(16).toString("hex")}`;
        user.mcpOAuthPending = {
            provider: "github",
            clientId,
            codeVerifier,
            redirectUri,
            state,
            createdAt: Date.now(),
        };
        user.markModified("mcpOAuthPending");
        await user.save();

        // Build the authorization URL
        const authUrl = new URL(GITHUB_AUTHORIZE_URL);
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", DEFAULT_SCOPES);
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");

        return NextResponse.json({
            authorizeUrl: authUrl.toString(),
            state,
        });
    } catch (err) {
        console.error("GitHub MCP OAuth init error:", err);
        return NextResponse.json(
            { error: err.message || "MCP init failed" },
            { status: 500 },
        );
    }
}
