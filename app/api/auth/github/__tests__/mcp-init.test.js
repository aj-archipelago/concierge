/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

import { POST } from "../mcp-init/route";
import { getCurrentUser } from "../../../utils/auth";

function makeRequest(redirectUri) {
    return {
        url: new URL("/api/auth/github/mcp-init", redirectUri).toString(),
        headers: new Headers({
            host: new URL(redirectUri).host,
            "x-forwarded-proto": "https",
        }),
        json: jest.fn().mockResolvedValue({ redirectUri }),
    };
}

function makeUser() {
    return {
        _id: "user-1",
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
    };
}

describe("POST /api/auth/github/mcp-init", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GITHUB_CLIENT_ID = "Ov23ExistingOAuth";
        process.env.GITHUB_CLIENT_SECRET = "oauth-secret";
        process.env.GITHUB_APP_ID = "unused-app-id";
        delete process.env.GITHUB_APP_PRIVATE_KEY;
        process.env.GITHUB_CLIENT_ID_ALT = "alt-client";
        process.env.GITHUB_OAUTH_ALT_DOMAIN = "concierge.example.com";
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it.each([
        "https://concierge.example.net/code/github",
        "https://concierge.example.com/code/github",
    ])(
        "uses the existing OAuth client and scopes for %s",
        async (redirectUri) => {
            const user = makeUser();
            getCurrentUser.mockResolvedValue(user);

            const response = await POST(makeRequest(redirectUri));

            expect(response.status).toBe(200);
            const body = await response.json();
            const authorizeUrl = new URL(body.authorizeUrl);
            expect(authorizeUrl.searchParams.get("client_id")).toBe(
                "Ov23ExistingOAuth",
            );
            expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
                redirectUri,
            );
            expect(user.mcpOAuthPending).toMatchObject({
                provider: "github",
                clientId: "Ov23ExistingOAuth",
                redirectUri,
            });
            expect(authorizeUrl.searchParams.get("scope")).toBe(
                "repo read:org read:user user:email read:packages",
            );
            expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe(
                "S256",
            );
            expect(user.mcpOAuthPending.credentialSet).toBeUndefined();
            expect(user.markModified).toHaveBeenCalledWith("mcpOAuthPending");
            expect(user.save).toHaveBeenCalled();
        },
    );
    it("rejects a missing OAuth client before saving a pending flow", async () => {
        const user = makeUser();
        getCurrentUser.mockResolvedValue(user);
        delete process.env.GITHUB_CLIENT_ID;
        const response = await POST(
            makeRequest("https://concierge.example.net/code/github"),
        );
        expect(response.status).toBe(500);
        expect(user.save).not.toHaveBeenCalled();
    });
});
