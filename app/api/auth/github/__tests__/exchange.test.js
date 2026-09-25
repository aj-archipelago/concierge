/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

import { POST } from "../exchange/route";
import { getCurrentUser } from "../../../utils/auth";

function makeRequest(body) {
    return {
        json: jest.fn().mockResolvedValue(body),
    };
}

function makeUser() {
    return {
        _id: "user-1",
        mcpServers: {},
        mcpOAuthPending: {
            provider: "github",
            clientId: "Ov23ExistingOAuth",
            codeVerifier: "verifier",
            redirectUri: "https://concierge.example.com/code/github",
        },
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
    };
}

describe("POST /api/auth/github/exchange", () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GITHUB_CLIENT_ID = "Ov23ExistingOAuth";
        process.env.GITHUB_CLIENT_SECRET = "oauth-secret";
        delete process.env.GITHUB_APP_PRIVATE_KEY;
        process.env.GITHUB_CLIENT_ID_ALT = "alt-client";
        process.env.GITHUB_CLIENT_SECRET_ALT = "alt-secret";
        global.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({
                access_token: "access-token",
            }),
        });
    });

    afterAll(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
    });

    it("exchanges an OAuth code and saves the user token without App credentials", async () => {
        const user = makeUser();
        getCurrentUser.mockResolvedValue(user);
        const redirectUri = "https://concierge.example.com/code/github";

        const response = await POST(
            makeRequest({ code: "authorization-code", redirectUri }),
        );

        expect(response.status).toBe(200);
        const tokenRequest = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(tokenRequest).toMatchObject({
            client_id: "Ov23ExistingOAuth",
            client_secret: "oauth-secret",
            redirect_uri: redirectUri,
        });
        expect(user.mcpServers.github.githubClientId).toBeUndefined();
        expect(user.mcpServers.github.refreshToken).toBeUndefined();
        expect(user.mcpOAuthPending).toBeUndefined();
        expect(user.save).toHaveBeenCalled();
        expect(user.mcpServers.github.headers.Authorization).toBe(
            "Bearer access-token",
        );
    });
    it("rejects a missing OAuth secret without sending the code", async () => {
        const user = makeUser();
        delete process.env.GITHUB_CLIENT_SECRET;
        getCurrentUser.mockResolvedValue(user);
        const response = await POST(
            makeRequest({
                code: "code",
                redirectUri: user.mcpOAuthPending.redirectUri,
            }),
        );
        expect(response.status).toBe(500);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(user.save).not.toHaveBeenCalled();
    });
    it("uses the pending redirect and verifier for the token exchange", async () => {
        const user = makeUser();
        getCurrentUser.mockResolvedValue(user);
        await POST(
            makeRequest({
                code: "code",
                redirectUri: "https://other.example/code/github",
            }),
        );
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
            redirect_uri: "https://concierge.example.com/code/github",
            code_verifier: "verifier",
        });
    });
});
