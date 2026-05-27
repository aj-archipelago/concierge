/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../../utils/mcpOAuth", () => ({
    exchangeMcpOAuthCode: jest.fn(),
    isCustomMcpOAuthState: jest.fn(
        (state) => typeof state === "string" && state.startsWith("custom_mcp_"),
    ),
}));

import { POST } from "../exchange/route";
import { getCurrentUser } from "../../../utils/auth";
import { exchangeMcpOAuthCode } from "../../../utils/mcpOAuth";

function makeRequest(body) {
    return {
        json: jest.fn().mockResolvedValue(body),
    };
}

function validPending(overrides = {}) {
    return {
        provider: "custom-mcp",
        serverId: "custom-foo",
        clientId: "dynamic-client-id",
        codeVerifier: "verifier-abc",
        redirectUri: "https://concierge.example.com/code/mcp",
        state: "custom_mcp_state_abc",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        resourceUrl: "https://mcp.example.com/mcp",
        issuer: "https://auth.example.com",
        tokenEndpoint: "https://auth.example.com/token",
        ...overrides,
    };
}

function makeUser(overrides = {}) {
    return {
        _id: "user-1",
        mcpServers: {
            "custom-foo": {
                type: "streamable-http",
                url: "https://mcp.example.com/mcp",
            },
        },
        mcpOAuthPending: validPending(),
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
        ...overrides,
    };
}

describe("POST /api/auth/mcp/exchange", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 401 when there is no authenticated user", async () => {
        getCurrentUser.mockResolvedValue(null);

        const res = await POST(
            makeRequest({ code: "abc", state: "custom_mcp_state_abc" }),
        );

        expect(res.status).toBe(401);
    });

    it("rejects missing code", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        const res = await POST(makeRequest({ state: "custom_mcp_state_abc" }));

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
            error: "Missing or invalid OAuth callback parameters",
        });
    });

    it("rejects state values that do not look like a custom MCP state", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        const res = await POST(
            makeRequest({ code: "abc", state: "not_our_state" }),
        );

        expect(res.status).toBe(400);
    });

    it("returns 400 when there is no pending OAuth flow on the user", async () => {
        getCurrentUser.mockResolvedValue(
            makeUser({ mcpOAuthPending: undefined }),
        );

        const res = await POST(
            makeRequest({ code: "abc", state: "custom_mcp_state_abc" }),
        );

        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/No pending custom MCP/);
    });

    it("returns 400 when the state does not match the pending flow", async () => {
        getCurrentUser.mockResolvedValue(
            makeUser({
                mcpOAuthPending: validPending({ state: "custom_mcp_other" }),
            }),
        );

        const res = await POST(
            makeRequest({ code: "abc", state: "custom_mcp_state_abc" }),
        );

        expect(res.status).toBe(400);
    });

    it("clears the pending state and returns 400 when expired", async () => {
        const user = makeUser({
            mcpOAuthPending: validPending({ expiresAt: Date.now() - 1 }),
        });
        getCurrentUser.mockResolvedValue(user);

        const res = await POST(
            makeRequest({ code: "abc", state: "custom_mcp_state_abc" }),
        );

        expect(res.status).toBe(400);
        expect(user.mcpOAuthPending).toBeUndefined();
        expect(user.markModified).toHaveBeenCalledWith("mcpOAuthPending");
        expect(user.save).toHaveBeenCalled();
        expect(exchangeMcpOAuthCode).not.toHaveBeenCalled();
    });

    it("returns 400 when the token endpoint errors", async () => {
        getCurrentUser.mockResolvedValue(makeUser());
        exchangeMcpOAuthCode.mockRejectedValue(new Error("invalid_grant"));

        const res = await POST(
            makeRequest({ code: "abc", state: "custom_mcp_state_abc" }),
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid_grant" });
    });

    it("returns 400 when the token endpoint omits an access_token", async () => {
        getCurrentUser.mockResolvedValue(makeUser());
        exchangeMcpOAuthCode.mockResolvedValue({});

        const res = await POST(
            makeRequest({ code: "abc", state: "custom_mcp_state_abc" }),
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "No access token received" });
    });

    it("persists oauth2 server config and clears pending on success", async () => {
        const user = makeUser();
        getCurrentUser.mockResolvedValue(user);
        exchangeMcpOAuthCode.mockResolvedValue({
            access_token: "the-access-token",
            refresh_token: "the-refresh-token",
            expires_in: 3600,
            scope: "mcp.read mcp.write",
        });

        const before = Date.now();
        const res = await POST(
            makeRequest({ code: "abc", state: "custom_mcp_state_abc" }),
        );
        const after = Date.now();

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            success: true,
            serverId: "custom-foo",
        });

        const persisted = user.mcpServers["custom-foo"];
        expect(persisted).toMatchObject({
            type: "streamable-http",
            url: "https://mcp.example.com/mcp",
            authType: "oauth2",
            refreshToken: "the-refresh-token",
            mcpClientId: "dynamic-client-id",
            oauthIssuer: "https://auth.example.com",
            oauthScope: "mcp.read mcp.write",
            headers: { Authorization: "Bearer the-access-token" },
        });
        expect(persisted.expiresAt).toBeGreaterThanOrEqual(
            before + 3600 * 1000,
        );
        expect(persisted.expiresAt).toBeLessThanOrEqual(after + 3600 * 1000);

        expect(user.mcpServers["custom-foo"]).toBe(persisted);
        expect(user.mcpOAuthPending).toBeUndefined();
        expect(user.markModified).toHaveBeenCalledWith("mcpServers");
        expect(user.markModified).toHaveBeenCalledWith("mcpOAuthPending");
        expect(user.save).toHaveBeenCalled();
    });

    it("omits expiresAt when the token response has no expires_in", async () => {
        const user = makeUser();
        getCurrentUser.mockResolvedValue(user);
        exchangeMcpOAuthCode.mockResolvedValue({
            access_token: "the-access-token",
        });

        const res = await POST(
            makeRequest({ code: "abc", state: "custom_mcp_state_abc" }),
        );

        expect(res.status).toBe(200);
        const persisted = user.mcpServers["custom-foo"];
        expect(persisted.expiresAt).toBeUndefined();
    });
});
