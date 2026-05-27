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

describe("POST /api/auth/atlassian/mcp-init", () => {
    const originalFetch = global.fetch;
    const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.NEXT_PUBLIC_APP_URL;
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            markModified: jest.fn(),
            save: jest.fn(),
        });
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                client_id: "atlassian-client-id",
            }),
        });
    });

    afterEach(() => {
        global.fetch = originalFetch;
        process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    });

    it("rejects redirect URIs on an unrelated origin", async () => {
        const response = await POST(
            makeRequest({ redirectUri: "https://attacker.test/code/jira" }),
        );

        expect(response.init).toEqual({ status: 400 });
        expect(response.body).toEqual({
            error: "Invalid MCP OAuth redirect URI",
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("registers Concierge and stores pending PKCE state", async () => {
        const user = {
            _id: "user-1",
            markModified: jest.fn(),
            save: jest.fn(),
        };
        getCurrentUser.mockResolvedValue(user);

        const response = await POST(
            makeRequest({ redirectUri: "https://concierge.test/code/jira" }),
        );

        expect(global.fetch).toHaveBeenCalledWith(
            "https://cf.mcp.atlassian.com/v1/register",
            expect.objectContaining({
                method: "POST",
                body: expect.stringContaining("Concierge MCP Client"),
            }),
        );
        expect(response.body.authorizeUrl).toContain(
            "https://mcp.atlassian.com/v1/authorize?",
        );
        expect(user.mcpOAuthPending).toEqual(
            expect.objectContaining({
                clientId: "atlassian-client-id",
                redirectUri: "https://concierge.test/code/jira",
            }),
        );
        expect(user.markModified).toHaveBeenCalledWith("mcpOAuthPending");
        expect(user.save).toHaveBeenCalled();
    });
});
