/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((body, init) => ({ body, init })),
    },
}));

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

import { getCurrentUser } from "../../../utils/auth";
import { POST } from "./route";

function makeRequest(body, headers = {}) {
    const headerMap = new Map(
        Object.entries({
            host: "concierge.test",
            "x-forwarded-proto": "https",
            ...headers,
        }),
    );

    return {
        json: jest.fn().mockResolvedValue(body),
        headers: {
            get: jest.fn((name) => headerMap.get(name)),
        },
    };
}

describe("POST /api/auth/github/mcp-init", () => {
    const originalClientId = process.env.GITHUB_CLIENT_ID;
    const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.NEXT_PUBLIC_APP_URL;
        process.env.GITHUB_CLIENT_ID = "github-client-id";
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            mcpOAuthPending: null,
            markModified: jest.fn(),
            save: jest.fn(),
        });
    });

    afterEach(() => {
        process.env.GITHUB_CLIENT_ID = originalClientId;
        process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    });

    it("rejects redirect URIs on an unrelated origin", async () => {
        const response = await POST(
            makeRequest({ redirectUri: "https://attacker.test/code/github" }),
        );

        expect(response.init).toEqual({ status: 400 });
        expect(response.body).toEqual({
            error: "Invalid MCP OAuth redirect URI",
        });
    });

    it("stores PKCE state and returns a GitHub authorization URL", async () => {
        const user = {
            _id: "user-1",
            markModified: jest.fn(),
            save: jest.fn(),
        };
        getCurrentUser.mockResolvedValue(user);

        const response = await POST(
            makeRequest({ redirectUri: "https://concierge.test/code/github" }),
        );

        expect(response.body.authorizeUrl).toContain(
            "https://github.com/login/oauth/authorize?",
        );
        expect(response.body.authorizeUrl).toContain(
            "client_id=github-client-id",
        );
        expect(user.mcpOAuthPending).toEqual(
            expect.objectContaining({
                provider: "github",
                clientId: "github-client-id",
                redirectUri: "https://concierge.test/code/github",
                state: expect.stringMatching(/^github_mcp_/),
            }),
        );
        expect(user.markModified).toHaveBeenCalledWith("mcpOAuthPending");
        expect(user.save).toHaveBeenCalled();
    });
});
