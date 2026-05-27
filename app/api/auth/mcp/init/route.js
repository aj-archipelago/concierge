import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import {
    getTrustedMcpRedirectOrigin,
    normalizeMcpRedirectUri,
} from "../../../utils/mcpRedirectUri";
import {
    buildMcpAuthorizationUrl,
    createMcpOAuthState,
    createPkcePair,
    discoverMcpOAuthMetadata,
    isAllowedMcpOAuthRedirectUri,
    registerMcpOAuthClient,
} from "../../../utils/mcpOAuth";

export const dynamic = "force-dynamic";

const PENDING_TTL_MS = 10 * 60 * 1000;

function isCustomServerId(serverId) {
    return typeof serverId === "string" && serverId.startsWith("custom-");
}

/**
 * POST /api/auth/mcp/init
 * Starts OAuth 2.1 for a user-defined MCP server:
 * 1. Discover OAuth server metadata from the stored MCP URL
 * 2. Register Concierge dynamically to obtain a client_id
 * 3. Store PKCE/state for the callback exchange
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

        const { serverId, redirectUri: rawRedirectUri } = await request.json();
        if (!isCustomServerId(serverId)) {
            return NextResponse.json(
                { error: "A custom serverId is required" },
                { status: 400 },
            );
        }
        if (!rawRedirectUri) {
            return NextResponse.json(
                { error: "Missing redirectUri" },
                { status: 400 },
            );
        }

        const redirectUri = normalizeMcpRedirectUri(rawRedirectUri, request);
        if (!isAllowedMcpOAuthRedirectUri(redirectUri)) {
            return NextResponse.json(
                { error: "Invalid MCP OAuth redirect URI" },
                { status: 400 },
            );
        }

        // normalizeMcpRedirectUri preserves the client-provided origin when
        // NEXT_PUBLIC_APP_URL is unset, so the path check above is not enough
        // — without this, a caller could pass "https://attacker.com/code/mcp"
        // and the OAuth code would be delivered to the attacker's origin.
        const trustedOrigin = getTrustedMcpRedirectOrigin(request);
        let redirectOrigin = null;
        try {
            redirectOrigin = new URL(redirectUri).origin;
        } catch {
            redirectOrigin = null;
        }
        if (
            !trustedOrigin ||
            !redirectOrigin ||
            redirectOrigin !== trustedOrigin
        ) {
            return NextResponse.json(
                { error: "Invalid MCP OAuth redirect URI" },
                { status: 400 },
            );
        }

        const serverConfig = user.mcpServers?.[serverId];
        if (!serverConfig?.url) {
            return NextResponse.json(
                { error: "Custom MCP server not found" },
                { status: 404 },
            );
        }

        const metadata = await discoverMcpOAuthMetadata(serverConfig.url);
        const registration = await registerMcpOAuthClient(
            metadata,
            redirectUri,
        );
        const { codeVerifier, codeChallenge } = createPkcePair();
        const state = createMcpOAuthState();

        user.mcpOAuthPending = {
            provider: "custom-mcp",
            serverId,
            clientId: registration.client_id,
            codeVerifier,
            redirectUri,
            state,
            createdAt: Date.now(),
            expiresAt: Date.now() + PENDING_TTL_MS,
            resourceUrl: metadata.resourceUrl,
            issuer: metadata.issuer,
            authorizationEndpoint: metadata.authorizationEndpoint,
            tokenEndpoint: metadata.tokenEndpoint,
            registrationEndpoint: metadata.registrationEndpoint,
        };
        user.markModified("mcpOAuthPending");
        await user.save();

        return NextResponse.json({
            authorizeUrl: buildMcpAuthorizationUrl({
                metadata,
                clientId: registration.client_id,
                redirectUri,
                codeChallenge,
                state,
            }),
            state,
        });
    } catch (error) {
        console.error("Custom MCP OAuth init error:", error);
        return NextResponse.json(
            { error: error.message || "MCP OAuth initialization failed" },
            { status: 400 },
        );
    }
}
