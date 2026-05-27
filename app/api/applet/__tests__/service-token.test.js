/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../../utils/auth.js", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../access.js", () => ({
    validateAppletAccess: jest.fn(() => null),
}));

jest.mock("../../models/applet.js", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(() => ({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            }),
        })),
        updateOne: jest.fn(),
    },
}));

import { POST } from "../service-token/route.js";
import { getCurrentUser } from "../../utils/auth.js";

function makeRequest(body) {
    return {
        json: jest.fn().mockResolvedValue(body),
    };
}

function makeUser(mcpServers) {
    return {
        _id: "user-1",
        mcpServers,
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
    };
}

describe("POST /api/applet/service-token", () => {
    const originalFetch = global.fetch;
    const originalEnv = process.env;

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "warn").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
        process.env = {
            ...originalEnv,
            NEXT_PUBLIC_ATLASSIAN_CLIENT_ID: "atlassian-client",
            ATLASSIAN_CLIENT_CREDENTIAL: "atlassian-credential",
        };
    });

    afterEach(() => {
        global.fetch = originalFetch;
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    it("refreshes the Atlassian service-token alias without overwriting MCP credentials", async () => {
        const now = Date.now();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                access_token: "rest-new-token",
                refresh_token: "rest-new-refresh",
                expires_in: 3600,
            }),
        });
        const user = makeUser({
            atlassian: {
                type: "streamable-http",
                url: "https://mcp.atlassian.com/v1/mcp",
                headers: {
                    Authorization: "Bearer mcp-token",
                    "X-Atlassian-Cloud-Id": "cloud-1",
                },
                cloudId: "cloud-1",
                refreshToken: "mcp-refresh",
                mcpClientId: "mcp-client",
                expiresAt: now + 3600,
            },
            atlassian_api: {
                type: "streamable-http",
                url: "https://mcp.atlassian.com/v1/mcp",
                headers: {
                    Authorization: "Bearer rest-old-token",
                },
                cloudId: "cloud-1",
                refreshToken: "rest-refresh",
                expiresAt: now - 1000,
            },
        });
        getCurrentUser.mockResolvedValue(user);

        const response = await POST(
            makeRequest({
                service: "atlassian",
                appletId: "507f191e810c19729de860ea",
            }),
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.token).toBe("Bearer rest-new-token");
        expect(global.fetch).toHaveBeenCalledWith(
            "https://auth.atlassian.com/oauth/token",
            expect.objectContaining({
                method: "POST",
                body: expect.stringContaining("rest-refresh"),
            }),
        );
        expect(user.mcpServers.atlassian.headers.Authorization).toBe(
            "Bearer mcp-token",
        );
        expect(user.mcpServers.atlassian.refreshToken).toBe("mcp-refresh");
        expect(user.mcpServers.atlassian_api.headers.Authorization).toBe(
            "Bearer rest-new-token",
        );
        expect(user.mcpServers.atlassian_api.refreshToken).toBe(
            "rest-new-refresh",
        );
        expect(user.markModified).toHaveBeenCalledWith("mcpServers");
        expect(user.save).toHaveBeenCalled();
    });
});
