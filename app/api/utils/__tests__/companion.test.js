/** @jest-environment node */
import {
    companionAdmin,
    localMcpConfigForUser,
    requireCompanionOrigin,
} from "../companion";
import { buildMcpAgentConfigForUser } from "../mcp-agent-config";

describe("local companion authorization", () => {
    const originalEnv = process.env;
    const originalFetch = global.fetch;
    beforeEach(() => {
        process.env = {
            ...originalEnv,
            CORTEX_COMPANION_RELAY_URL: "https://relay.example",
            COMPANION_ADMIN_KEY: "server-only-secret",
            COMPANION_OWNER_NAMESPACE: "concierge-tenant-one",
        };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                config: {
                    local: {
                        type: "local-companion",
                        token: "scoped-grant",
                        deviceId: "mac",
                        serverId: "premiere",
                    },
                },
            }),
        });
        jest.spyOn(console, "log").mockImplementation(() => {});
    });
    afterEach(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it("derives the owner from the signed-in user and deployment namespace", async () => {
        await companionAdmin({ _id: "alice" }, "pair", {
            code: "ABCDEF123456",
            owner: "bob",
        });
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe("https://relay.example/v1/admin/pair");
        expect(JSON.parse(options.body)).toEqual({
            code: "ABCDEF123456",
            owner: "concierge-tenant-one:alice",
        });
        expect(options.headers.Authorization).toBe("Bearer server-only-secret");
        expect(options.redirect).toBe("error");
    });
    it("rejects a missing user and cross-origin pairing", async () => {
        await expect(
            companionAdmin({ userId: "nodb" }, "pair"),
        ).rejects.toThrow();
        expect(() =>
            requireCompanionOrigin({
                url: "https://concierge.example/api",
                headers: new Headers({ origin: "https://evil.example" }),
            }),
        ).toThrow();
        expect(() =>
            requireCompanionOrigin({
                url: "https://concierge.example/api",
                headers: new Headers({ origin: "https://concierge.example" }),
            }),
        ).not.toThrow();
        expect(global.fetch).not.toHaveBeenCalled();
    });
    it("does not issue grants for unattended work", async () => {
        expect(
            await localMcpConfigForUser({ _id: "alice" }, { headless: true }),
        ).toEqual({});
        expect(global.fetch).not.toHaveBeenCalled();
    });
    it("replaces customer-supplied local configs with an owner-scoped relay grant", async () => {
        const user = {
            _id: "alice",
            mcpServers: {
                forged: { type: "local-companion", token: "other-user-token" },
                remote: { type: "streamable-http", url: "https://mcp.example" },
            },
        };
        const result = JSON.parse(
            (await buildMcpAgentConfigForUser(user)).mcpConfig,
        );
        expect(result.forged).toBeUndefined();
        expect(result.remote.url).toBe("https://mcp.example");
        expect(result.local.token).toBe("scoped-grant");
        global.fetch.mockClear();
        const headless = JSON.parse(
            (await buildMcpAgentConfigForUser(user, { headless: true }))
                .mcpConfig,
        );
        expect(headless.local).toBeUndefined();
        expect(headless.forged).toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe("browser setup handoff", () => {
    const originalEnv = process.env;
    const originalFetch = global.fetch;
    afterEach(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
    });
    it("derives the site and account server-side and puts only the opaque ticket in the link", async () => {
        const { createCompanionHandoff } = await import("../companion");
        process.env = {
            ...originalEnv,
            CORTEX_COMPANION_RELAY_URL: "https://relay.example",
            COMPANION_ADMIN_KEY: "server-key",
            COMPANION_OWNER_NAMESPACE: "tenant",
            CONCIERGE_PUBLIC_URL: "https://concierge.example",
        };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ticket: "opaque-ticket", expiresIn: 600 }),
        });
        const result = await createCompanionHandoff(
            { _id: "alice", username: "alice@example.com" },
            {
                url: "http://internal/api",
                headers: new Headers({ origin: "https://concierge.example" }),
            },
            {
                kind: "server",
                name: "Private",
                url: "http://localhost:3001",
                token: "secret",
            },
        );
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body).toMatchObject({
            owner: "tenant:alice",
            account: "alice@example.com",
            site: "https://concierge.example",
            intent: { token: "secret" },
        });
        expect(new URL(result.deepLink).searchParams.get("site")).toBe(
            "https://concierge.example",
        );
        expect(result.deepLink).not.toContain("alice");
        expect(result.deepLink).not.toContain("secret");
        expect(result.deepLink).not.toContain("localhost");
    });
});
