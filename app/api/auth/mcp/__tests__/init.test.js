/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../../utils/mcpOAuth", () => ({
    buildMcpAuthorizationUrl: jest.fn(
        () => "https://auth.example.com/authorize?mocked=1",
    ),
    createMcpOAuthState: jest.fn(() => "custom_mcp_state_abc"),
    createPkcePair: jest.fn(() => ({
        codeVerifier: "verifier-abc",
        codeChallenge: "challenge-abc",
    })),
    discoverMcpOAuthMetadata: jest.fn(),
    isAllowedMcpOAuthRedirectUri: jest.fn(),
    registerMcpOAuthClient: jest.fn(),
}));

import { POST } from "../init/route";
import { getCurrentUser } from "../../../utils/auth";
import {
    discoverMcpOAuthMetadata,
    isAllowedMcpOAuthRedirectUri,
    registerMcpOAuthClient,
} from "../../../utils/mcpOAuth";

function makeRequest({
    body,
    host = "concierge.example.com",
    proto = "https",
}) {
    return {
        json: jest.fn().mockResolvedValue(body),
        headers: {
            get: (name) => {
                if (name === "x-forwarded-host") return host;
                if (name === "host") return host;
                if (name === "x-forwarded-proto") return proto;
                return null;
            },
        },
    };
}

function makeUser(overrides = {}) {
    return {
        _id: "user-1",
        mcpServers: {
            "custom-foo": { url: "https://mcp.example.com/mcp" },
        },
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
        ...overrides,
    };
}

describe("POST /api/auth/mcp/init", () => {
    const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.NEXT_PUBLIC_APP_URL = "https://concierge.example.com";
        isAllowedMcpOAuthRedirectUri.mockReturnValue(true);
        discoverMcpOAuthMetadata.mockResolvedValue({
            resourceUrl: "https://mcp.example.com/mcp",
            issuer: "https://auth.example.com",
            authorizationEndpoint: "https://auth.example.com/authorize",
            tokenEndpoint: "https://auth.example.com/token",
            registrationEndpoint: "https://auth.example.com/register",
        });
        registerMcpOAuthClient.mockResolvedValue({
            client_id: "dynamic-client-id",
        });
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
    });

    it("returns 401 when there is no authenticated user", async () => {
        getCurrentUser.mockResolvedValue(null);

        const res = await POST(
            makeRequest({
                body: {
                    serverId: "custom-foo",
                    redirectUri: "https://concierge.example.com/code/mcp",
                },
            }),
        );

        expect(res.status).toBe(401);
    });

    it("rejects non-custom serverId values", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        const res = await POST(
            makeRequest({
                body: {
                    serverId: "github",
                    redirectUri: "https://concierge.example.com/code/mcp",
                },
            }),
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
            error: "A custom serverId is required",
        });
    });

    it("rejects missing redirectUri", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        const res = await POST(
            makeRequest({
                body: { serverId: "custom-foo" },
            }),
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "Missing redirectUri" });
    });

    it("rejects redirect URIs whose path is not allowed", async () => {
        getCurrentUser.mockResolvedValue(makeUser());
        isAllowedMcpOAuthRedirectUri.mockReturnValue(false);

        const res = await POST(
            makeRequest({
                body: {
                    serverId: "custom-foo",
                    redirectUri: "https://concierge.example.com/code/other",
                },
            }),
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
            error: "Invalid MCP OAuth redirect URI",
        });
    });

    it("rejects redirect URIs whose origin does not match the request host when NEXT_PUBLIC_APP_URL is unset", async () => {
        // With NEXT_PUBLIC_APP_URL set, normalizeMcpRedirectUri rewrites the
        // origin to the trusted one, so an attacker URL is harmless. With it
        // unset, normalizeMcpRedirectUri preserves the client-provided origin
        // — the new origin check is what stops the OAuth code from being
        // delivered to attacker.com.
        delete process.env.NEXT_PUBLIC_APP_URL;
        getCurrentUser.mockResolvedValue(makeUser());

        const res = await POST(
            makeRequest({
                host: "concierge.example.com",
                body: {
                    serverId: "custom-foo",
                    redirectUri: "https://attacker.com/code/mcp",
                },
            }),
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
            error: "Invalid MCP OAuth redirect URI",
        });
        expect(discoverMcpOAuthMetadata).not.toHaveBeenCalled();
    });

    it("returns 404 when the user has no matching MCP server", async () => {
        getCurrentUser.mockResolvedValue(makeUser({ mcpServers: {} }));

        const res = await POST(
            makeRequest({
                body: {
                    serverId: "custom-foo",
                    redirectUri: "https://concierge.example.com/code/mcp",
                },
            }),
        );

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({
            error: "Custom MCP server not found",
        });
    });

    it("propagates metadata discovery failures as a 400", async () => {
        getCurrentUser.mockResolvedValue(makeUser());
        discoverMcpOAuthMetadata.mockRejectedValue(
            new Error("could not reach .well-known"),
        );

        const res = await POST(
            makeRequest({
                body: {
                    serverId: "custom-foo",
                    redirectUri: "https://concierge.example.com/code/mcp",
                },
            }),
        );

        expect(res.status).toBe(400);
    });

    it("persists pending state and returns the authorize URL on success", async () => {
        const user = makeUser();
        getCurrentUser.mockResolvedValue(user);

        const res = await POST(
            makeRequest({
                body: {
                    serverId: "custom-foo",
                    redirectUri: "https://concierge.example.com/code/mcp",
                },
            }),
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toEqual({
            authorizeUrl: "https://auth.example.com/authorize?mocked=1",
            state: "custom_mcp_state_abc",
        });
        expect(user.mcpOAuthPending).toMatchObject({
            provider: "custom-mcp",
            serverId: "custom-foo",
            clientId: "dynamic-client-id",
            codeVerifier: "verifier-abc",
            redirectUri: "https://concierge.example.com/code/mcp",
            state: "custom_mcp_state_abc",
            tokenEndpoint: "https://auth.example.com/token",
        });
        expect(typeof user.mcpOAuthPending.expiresAt).toBe("number");
        expect(user.markModified).toHaveBeenCalledWith("mcpOAuthPending");
        expect(user.save).toHaveBeenCalled();
    });
});
