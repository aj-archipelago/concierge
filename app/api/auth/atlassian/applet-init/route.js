import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import {
    getTrustedMcpRedirectOrigin,
    normalizeAtlassianMcpRedirectUri,
} from "../../../utils/mcpRedirectUri";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize";
const SCOPES = [
    "offline_access",
    "read:me",
    "read:jira-work",
    "write:jira-work",
    "read:confluence-content.all",
    "write:confluence-content",
].join(" ");

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
 * POST /api/auth/atlassian/applet-init
 * Builds a 3LO (three-legged OAuth) authorization URL for Atlassian.
 *
 * Unlike mcp-init which goes through the MCP OAuth 2.1 flow (tokens
 * scoped to the MCP protocol only), this endpoint produces a standard
 * Atlassian 3LO auth URL whose tokens grant direct Jira/Confluence
 * REST API access — required by applets that call the Jira API.
 *
 * Body: { redirectUri: string }
 * Returns: { authorizeUrl: string, state: string }
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

        const clientId = process.env.NEXT_PUBLIC_ATLASSIAN_CLIENT_ID;
        if (!clientId) {
            return NextResponse.json(
                { error: "Atlassian OAuth is not configured" },
                { status: 500 },
            );
        }

        const redirectUri = normalizeAtlassianMcpRedirectUri(
            rawRedirect,
            request,
        );
        if (!hasTrustedRedirectOrigin(redirectUri, request)) {
            return NextResponse.json(
                { error: "Invalid OAuth redirect URI" },
                { status: 400 },
            );
        }

        const state = `applet_${crypto.randomBytes(16).toString("hex")}`;

        const authUrl = new URL(ATLASSIAN_AUTH_URL);
        authUrl.searchParams.set("audience", "api.atlassian.com");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("scope", SCOPES);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("state", state);

        return NextResponse.json({
            authorizeUrl: authUrl.toString(),
            state,
        });
    } catch (err) {
        console.error("Applet Atlassian OAuth init error:", err);
        return NextResponse.json(
            { error: err.message || "Init failed" },
            { status: 500 },
        );
    }
}
