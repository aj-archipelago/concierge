/**
 * @jest-environment node
 */

import {
    buildMcpAuthorizationUrl,
    discoverMcpOAuthMetadata,
    isAllowedMcpOAuthRedirectUri,
    registerMcpOAuthClient,
} from "../mcpOAuth.js";

function jsonResponse(data, status = 200) {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => JSON.stringify(data),
    };
}

describe("mcpOAuth utilities", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it("discovers OAuth metadata through protected resource metadata", async () => {
        global.fetch = jest.fn((url) => {
            if (
                url ===
                "https://mcp.example.com/.well-known/oauth-protected-resource/mcp"
            ) {
                return Promise.resolve(
                    jsonResponse({
                        authorization_servers: ["https://auth.example.com"],
                    }),
                );
            }
            if (
                url ===
                "https://auth.example.com/.well-known/oauth-authorization-server"
            ) {
                return Promise.resolve(
                    jsonResponse({
                        issuer: "https://auth.example.com",
                        authorization_endpoint:
                            "https://auth.example.com/authorize",
                        token_endpoint: "https://auth.example.com/token",
                        registration_endpoint:
                            "https://auth.example.com/register",
                    }),
                );
            }
            return Promise.resolve(jsonResponse({}, 404));
        });

        const metadata = await discoverMcpOAuthMetadata(
            "https://mcp.example.com/mcp",
        );

        expect(metadata).toMatchObject({
            resourceUrl: "https://mcp.example.com/mcp",
            issuer: "https://auth.example.com",
            authorizationEndpoint: "https://auth.example.com/authorize",
            tokenEndpoint: "https://auth.example.com/token",
            registrationEndpoint: "https://auth.example.com/register",
        });
    });

    it("requires dynamic client registration metadata", async () => {
        global.fetch = jest.fn((url) => {
            if (
                url ===
                "https://mcp.example.com/.well-known/oauth-authorization-server"
            ) {
                return Promise.resolve(
                    jsonResponse({
                        authorization_endpoint:
                            "https://mcp.example.com/authorize",
                        token_endpoint: "https://mcp.example.com/token",
                    }),
                );
            }
            return Promise.resolve(jsonResponse({}, 404));
        });

        await expect(
            discoverMcpOAuthMetadata("https://mcp.example.com/mcp"),
        ).rejects.toThrow("registration_endpoint");
    });

    it("registers a public OAuth client dynamically", async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve(jsonResponse({ client_id: "dynamic-client-id" })),
        );

        const registration = await registerMcpOAuthClient(
            {
                registrationEndpoint: "https://auth.example.com/register",
            },
            "https://concierge.example.com/code/mcp",
        );

        expect(registration.client_id).toBe("dynamic-client-id");
        const [, options] = global.fetch.mock.calls[0];
        expect(JSON.parse(options.body)).toMatchObject({
            redirect_uris: ["https://concierge.example.com/code/mcp"],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
        });
    });

    it("builds an authorization URL with PKCE and resource indicator", () => {
        const url = new URL(
            buildMcpAuthorizationUrl({
                metadata: {
                    authorizationEndpoint: "https://auth.example.com/authorize",
                    resourceUrl: "https://mcp.example.com/mcp",
                },
                clientId: "dynamic-client-id",
                redirectUri: "https://concierge.example.com/code/mcp",
                codeChallenge: "challenge",
                state: "custom_mcp_state",
            }),
        );

        expect(url.searchParams.get("client_id")).toBe("dynamic-client-id");
        expect(url.searchParams.get("code_challenge")).toBe("challenge");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("resource")).toBe(
            "https://mcp.example.com/mcp",
        );
    });

    it("only allows the shared MCP callback path", () => {
        expect(
            isAllowedMcpOAuthRedirectUri("https://concierge.example.com/code/mcp"),
        ).toBe(true);
        expect(
            isAllowedMcpOAuthRedirectUri(
                "https://concierge.example.com/code/jira",
            ),
        ).toBe(false);
    });
});
