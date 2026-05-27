import crypto from "crypto";
import { validateMcpServerUrl } from "./mcpUrlValidation";

const JSON_HEADERS = { Accept: "application/json" };
const OAUTH_STATE_PREFIX = "custom_mcp_";

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function trimTrailingSlash(value) {
    return value.replace(/\/+$/, "");
}

function validateFetchUrl(rawUrl, label) {
    const result = validateMcpServerUrl(rawUrl);
    if (!result.ok) {
        throw new Error(`${label} is not allowed: ${result.error}`);
    }
    return result.url;
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new Error("OAuth metadata response was not valid JSON");
    }
}

async function fetchJsonIfAvailable(rawUrl, label) {
    const url = validateFetchUrl(rawUrl, label);
    const response = await fetch(url, { headers: JSON_HEADERS });
    if (response.status === 404 || response.status === 405) {
        return null;
    }
    if (!response.ok) {
        return null;
    }

    const data = await readJsonResponse(response);
    return { data, url };
}

function buildProtectedResourceMetadataUrls(resourceUrl) {
    const resource = new URL(resourceUrl);
    const path =
        resource.pathname && resource.pathname !== "/"
            ? trimTrailingSlash(resource.pathname)
            : "";

    return unique([
        `${resource.origin}/.well-known/oauth-protected-resource${path}`,
        `${resource.origin}/.well-known/oauth-protected-resource`,
    ]);
}

function buildAuthorizationServerMetadataUrls(issuerUrl) {
    const issuer = new URL(issuerUrl);
    const issuerNoSlash = trimTrailingSlash(issuer.toString());
    const path =
        issuer.pathname && issuer.pathname !== "/"
            ? trimTrailingSlash(issuer.pathname)
            : "";

    return unique([
        `${issuer.origin}/.well-known/oauth-authorization-server${path}`,
        `${issuer.origin}/.well-known/openid-configuration${path}`,
        `${issuerNoSlash}/.well-known/oauth-authorization-server`,
        `${issuerNoSlash}/.well-known/openid-configuration`,
    ]);
}

function selectAuthorizationServer(protectedResourceMetadata, resourceUrl) {
    const authorizationServers =
        protectedResourceMetadata?.authorization_servers ||
        protectedResourceMetadata?.authorizationServers;

    if (Array.isArray(authorizationServers) && authorizationServers[0]) {
        return authorizationServers[0];
    }

    return new URL(resourceUrl).origin;
}

function requireEndpoint(metadata, key) {
    const value = metadata?.[key];
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`OAuth server metadata is missing ${key}`);
    }
    return value.trim();
}

export function createMcpOAuthState() {
    return `${OAUTH_STATE_PREFIX}${crypto.randomBytes(16).toString("hex")}`;
}

export function isCustomMcpOAuthState(state) {
    return typeof state === "string" && state.startsWith(OAUTH_STATE_PREFIX);
}

export function createPkcePair() {
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

    return { codeVerifier, codeChallenge };
}

export function isAllowedMcpOAuthRedirectUri(redirectUri) {
    try {
        const parsed = new URL(redirectUri);
        return parsed.pathname.replace(/\/+$/, "").endsWith("/code/mcp");
    } catch {
        return false;
    }
}

export async function discoverMcpOAuthMetadata(resourceUrl) {
    const validatedResourceUrl = validateFetchUrl(
        resourceUrl,
        "MCP server URL",
    );

    let protectedResourceMetadata = null;
    let protectedResourceMetadataUrl = null;
    for (const candidate of buildProtectedResourceMetadataUrls(
        validatedResourceUrl,
    )) {
        const result = await fetchJsonIfAvailable(
            candidate,
            "OAuth protected resource metadata URL",
        );
        if (result?.data) {
            protectedResourceMetadata = result.data;
            protectedResourceMetadataUrl = result.url;
            break;
        }
    }

    const issuer = selectAuthorizationServer(
        protectedResourceMetadata,
        validatedResourceUrl,
    );

    let authorizationServerMetadata = null;
    let authorizationServerMetadataUrl = null;
    for (const candidate of buildAuthorizationServerMetadataUrls(issuer)) {
        const result = await fetchJsonIfAvailable(
            candidate,
            "OAuth authorization server metadata URL",
        );
        if (result?.data) {
            authorizationServerMetadata = result.data;
            authorizationServerMetadataUrl = result.url;
            break;
        }
    }

    if (!authorizationServerMetadata) {
        throw new Error(
            "Could not discover OAuth metadata for this MCP server",
        );
    }

    const authorizationEndpoint = validateFetchUrl(
        requireEndpoint(authorizationServerMetadata, "authorization_endpoint"),
        "OAuth authorization endpoint",
    );
    const tokenEndpoint = validateFetchUrl(
        requireEndpoint(authorizationServerMetadata, "token_endpoint"),
        "OAuth token endpoint",
    );
    const registrationEndpoint = validateFetchUrl(
        requireEndpoint(authorizationServerMetadata, "registration_endpoint"),
        "OAuth dynamic client registration endpoint",
    );

    return {
        resourceUrl: validatedResourceUrl,
        issuer: authorizationServerMetadata.issuer || issuer,
        protectedResourceMetadataUrl,
        authorizationServerMetadataUrl,
        authorizationEndpoint,
        tokenEndpoint,
        registrationEndpoint,
    };
}

export async function registerMcpOAuthClient(metadata, redirectUri) {
    const registrationEndpoint = validateFetchUrl(
        metadata.registrationEndpoint,
        "OAuth dynamic client registration endpoint",
    );

    const response = await fetch(registrationEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            client_name: "Concierge MCP Client",
            redirect_uris: [redirectUri],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
        }),
    });

    const data = await readJsonResponse(response);
    if (!response.ok || !data.client_id) {
        throw new Error(
            data.error_description ||
                data.error ||
                "MCP client registration failed",
        );
    }

    return data;
}

export function buildMcpAuthorizationUrl({
    metadata,
    clientId,
    redirectUri,
    codeChallenge,
    state,
}) {
    const authUrl = new URL(metadata.authorizationEndpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("resource", metadata.resourceUrl);
    return authUrl.toString();
}

export async function exchangeMcpOAuthCode({ pending, code }) {
    const tokenEndpoint = validateFetchUrl(
        pending.tokenEndpoint,
        "OAuth token endpoint",
    );

    const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: pending.redirectUri,
            client_id: pending.clientId,
            code_verifier: pending.codeVerifier,
            resource: pending.resourceUrl,
        }).toString(),
    });

    const data = await readJsonResponse(response);
    if (!response.ok || data.error) {
        throw new Error(
            data.error_description || data.error || "MCP token exchange failed",
        );
    }

    return data;
}
