/**
 * @jest-environment node
 */

import { buildMcpAgentConfigForUser } from "../mcp-agent-config.js";
import { refreshMcpServerConfig } from "../mcp-token-refresh.js";

function makeUser(mcpServers) {
    return {
        _id: "user-1",
        userId: "user-1",
        mcpServers,
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
    };
}

describe("buildMcpAgentConfigForUser", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it("passes connected MCP servers and excludes service-token aliases", async () => {
        const user = makeUser({
            atlassian: {
                type: "streamable-http",
                url: "https://mcp.atlassian.com/v1/mcp",
                headers: {
                    Authorization: "Bearer jira-token",
                    "X-Atlassian-Cloud-Id": "cloud-1",
                },
                cloudId: "cloud-1",
            },
            atlassian_api: {
                type: "streamable-http",
                url: "https://mcp.atlassian.com/v1/mcp",
                headers: {
                    Authorization: "Bearer jira-token",
                },
            },
        });

        const config = await buildMcpAgentConfigForUser(user, {
            logPrefix: "[test]",
        });
        const mcpConfig = JSON.parse(config.mcpConfig);
        const availableServers = JSON.parse(config.mcpAvailableServers);

        expect(mcpConfig.atlassian).toMatchObject({
            url: "https://mcp.atlassian.com/v1/mcp",
            cloudId: "cloud-1",
        });
        expect(mcpConfig.atlassian_api).toBeUndefined();
        expect(availableServers.map((server) => server.id)).toEqual([
            "slack",
            "github",
        ]);
    });

    it("resolves and persists the Atlassian cloud ID when missing", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([
                {
                    id: "resolved-cloud",
                    name: "Example Jira",
                },
            ]),
        });
        const user = makeUser({
            atlassian: {
                type: "streamable-http",
                url: "https://mcp.atlassian.com/v1/mcp",
                headers: {
                    Authorization: "Bearer jira-token",
                },
            },
        });

        const config = await buildMcpAgentConfigForUser(user, {
            logPrefix: "[test]",
        });
        const atlassian = JSON.parse(config.mcpConfig).atlassian;

        expect(global.fetch).toHaveBeenCalledWith(
            "https://api.atlassian.com/oauth/token/accessible-resources",
            {
                headers: {
                    Authorization: "Bearer jira-token",
                },
            },
        );
        expect(atlassian.cloudId).toBe("resolved-cloud");
        expect(atlassian.headers["X-Atlassian-Cloud-Id"]).toBe(
            "resolved-cloud",
        );
        expect(user.markModified).toHaveBeenCalledWith("mcpServers");
        expect(user.save).toHaveBeenCalled();
    });

    it("refreshes expiring Atlassian MCP tokens without overwriting the service-token alias", async () => {
        const now = Date.now();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                access_token: "new-token",
                refresh_token: "new-refresh",
                expires_in: 3600,
            }),
        });
        const user = makeUser({
            atlassian: {
                type: "streamable-http",
                url: "https://mcp.atlassian.com/v1/mcp",
                headers: {
                    Authorization: "Bearer old-token",
                    "X-Atlassian-Cloud-Id": "cloud-1",
                },
                cloudId: "cloud-1",
                refreshToken: "old-refresh",
                mcpClientId: "mcp-client-1",
                expiresAt: now - 1000,
            },
            atlassian_api: {
                type: "streamable-http",
                url: "https://mcp.atlassian.com/v1/mcp",
                headers: {
                    Authorization: "Bearer rest-token",
                },
                refreshToken: "rest-refresh",
                expiresAt: now - 1000,
            },
        });

        const config = await buildMcpAgentConfigForUser(user, {
            logPrefix: "[test]",
        });
        const atlassian = JSON.parse(config.mcpConfig).atlassian;

        expect(global.fetch).toHaveBeenCalledWith(
            "https://cf.mcp.atlassian.com/v1/token",
            expect.objectContaining({
                method: "POST",
                body: expect.stringContaining("grant_type=refresh_token"),
            }),
        );
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(atlassian.headers.Authorization).toBe("Bearer new-token");
        expect(atlassian.refreshToken).toBe("new-refresh");
        expect(atlassian.expiresAt).toBeGreaterThan(now);
        expect(config.refreshedMcpServers).toContain("atlassian");
        expect(user.mcpServers.atlassian_api.headers.Authorization).toBe(
            "Bearer rest-token",
        );
        expect(user.mcpServers.atlassian_api.refreshToken).toBe("rest-refresh");
        expect(user.save).toHaveBeenCalled();
    });

    it("omits unrefreshable expired servers and available server tools in headless mode", async () => {
        const user = makeUser({
            atlassian: {
                type: "streamable-http",
                url: "https://mcp.atlassian.com/v1/mcp",
                headers: {
                    Authorization: "Bearer old-token",
                },
                expiresAt: Date.now() - 1000,
            },
        });

        const config = await buildMcpAgentConfigForUser(user, {
            logPrefix: "[test]",
            headless: true,
        });

        expect(config.mcpConfig).toBeNull();
        expect(config.mcpAvailableServers).toBeNull();
        expect(config.unavailableMcpServers).toEqual([
            {
                serverKey: "atlassian",
                reason: "missing_refresh_token",
                message: undefined,
            },
        ]);
        expect(user.save).not.toHaveBeenCalled();
    });
});

describe("refreshMcpServerConfig", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it("does not treat lookalike Atlassian hosts as refreshable", async () => {
        global.fetch = jest.fn();

        const result = await refreshMcpServerConfig(
            "custom",
            {
                url: "https://atlassian.com.evil.example/v1/mcp",
                refreshToken: "refresh-token",
                mcpClientId: "mcp-client-1",
            },
            { logPrefix: "[test]" },
        );

        expect(result).toMatchObject({
            refreshed: false,
            reason: "unsupported_server",
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("refreshes proper Atlassian subdomains", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                access_token: "new-token",
                refresh_token: "new-refresh",
                expires_in: 3600,
            }),
        });

        const result = await refreshMcpServerConfig(
            "custom",
            {
                url: "https://mcp.atlassian.com/v1/mcp",
                refreshToken: "refresh-token",
                mcpClientId: "mcp-client-1",
            },
            { now: 1000, logPrefix: "[test]" },
        );

        expect(result.refreshed).toBe(true);
        expect(result.config.headers.Authorization).toBe("Bearer new-token");
        expect(global.fetch).toHaveBeenCalledWith(
            "https://cf.mcp.atlassian.com/v1/token",
            expect.any(Object),
        );
    });
});
