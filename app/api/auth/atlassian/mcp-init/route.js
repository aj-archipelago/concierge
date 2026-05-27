import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import {
    getTrustedMcpRedirectOrigin,
    normalizeAtlassianMcpRedirectUri,
} from "../../../utils/mcpRedirectUri";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const MCP_REGISTER_URL = "https://cf.mcp.atlassian.com/v1/register";
const MCP_AUTHORIZE_URL = "https://mcp.atlassian.com/v1/authorize";

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
 * POST /api/auth/atlassian/mcp-init
 * Performs MCP OAuth 2.1 initialization:
 * 1. Dynamic client registration with the Atlassian MCP server
 * 2. PKCE code_verifier/code_challenge generation
 * 3. Returns the authorization URL for the frontend to open
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

        const body = await request.json();
        const rawRedirect = body.redirectUri;
        if (!rawRedirect) {
            return NextResponse.json(
                { error: "Missing redirectUri" },
                { status: 400 },
            );
        }

        const redirectUri = normalizeAtlassianMcpRedirectUri(
            rawRedirect,
            request,
        );
        if (!hasTrustedRedirectOrigin(redirectUri, request)) {
            return NextResponse.json(
                { error: "Invalid MCP OAuth redirect URI" },
                { status: 400 },
            );
        }

        // Step 1: Dynamic Client Registration (RFC 7591)
        const regRes = await fetch(MCP_REGISTER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_name: "Concierge MCP Client",
                redirect_uris: [redirectUri],
                grant_types: ["authorization_code", "refresh_token"],
                response_types: ["code"],
                token_endpoint_auth_method: "none",
            }),
        });

        const regData = await regRes.json();
        if (!regRes.ok || !regData.client_id) {
            console.error("MCP client registration failed:", regData);
            return NextResponse.json(
                { error: "MCP client registration failed", details: regData },
                { status: 400 },
            );
        }

        console.log("MCP client registered");

        // Step 2: Generate PKCE parameters
        const codeVerifier = crypto.randomBytes(32).toString("base64url");
        const codeChallenge = crypto
            .createHash("sha256")
            .update(codeVerifier)
            .digest("base64url");

        // Step 3: Store PKCE + client registration in user doc for the exchange step
        user.mcpOAuthPending = {
            clientId: regData.client_id,
            codeVerifier,
            redirectUri,
            createdAt: Date.now(),
        };
        user.markModified("mcpOAuthPending");
        await user.save();

        // Step 4: Build the authorization URL
        const state = crypto.randomBytes(16).toString("hex");
        const authUrl = new URL(MCP_AUTHORIZE_URL);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("client_id", regData.client_id);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        authUrl.searchParams.set("state", `mcp21_${state}`);

        return NextResponse.json({
            authorizeUrl: authUrl.toString(),
            state: `mcp21_${state}`,
        });
    } catch (err) {
        console.error("MCP OAuth init error:", err);
        return NextResponse.json(
            { error: err.message || "MCP init failed" },
            { status: 500 },
        );
    }
}
