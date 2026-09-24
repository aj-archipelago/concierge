/**
 * @jest-environment jsdom
 */
import { reauthenticateCustomMcpServer } from "../customMcpReauthentication";

describe("custom MCP reauthentication", () => {
    let channel;
    let popup;
    const state = "custom_mcp_synthetic_state";
    const originalChannel = global.BroadcastChannel;

    beforeEach(() => {
        jest.useFakeTimers();
        channel = { close: jest.fn(), onmessage: null };
        global.BroadcastChannel = jest.fn(() => channel);
        popup = {
            closed: false,
            close: jest.fn(),
            location: { replace: jest.fn() },
        };
        jest.spyOn(window, "open").mockReturnValue(popup);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                authorizeUrl: "https://auth.example.com/authorize",
                state,
            }),
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
        global.BroadcastChannel = originalChannel;
    });

    async function start() {
        const pending = reauthenticateCustomMcpServer("custom-example");
        await jest.advanceTimersByTimeAsync(0);
        return { pending };
    }

    test("uses the owned-server init route and accepts only the matching state, server, and origin", async () => {
        const { pending } = await start();
        expect(fetch).toHaveBeenCalledWith(
            "/api/auth/mcp/init",
            expect.objectContaining({
                body: JSON.stringify({
                    serverId: "custom-example",
                    redirectUri: `${window.location.origin}/code/mcp`,
                }),
            }),
        );
        expect(popup.opener).toBeNull();
        expect(popup.location.replace).toHaveBeenCalledWith(
            "https://auth.example.com/authorize",
        );
        const completion = {
            type: "custom-example-oauth-complete",
            state,
            success: true,
        };
        channel.onmessage({ data: { ...completion, state: "unrelated" } });
        channel.onmessage({
            data: { ...completion, type: "custom-other-oauth-complete" },
        });
        channel.onmessage({
            origin: "https://untrusted.example",
            data: completion,
        });
        expect(channel.close).not.toHaveBeenCalled();
        channel.onmessage({ origin: window.location.origin, data: completion });
        await expect(pending).resolves.toMatchObject({
            success: true,
            data: { requiresNewMessage: true },
        });
        expect(channel.close).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    test("reports access denial and closes listeners", async () => {
        const { pending } = await start();
        channel.onmessage({
            data: {
                type: "mcp-oauth-complete",
                state,
                success: false,
                error: "Authorization was denied",
            },
        });
        await expect(pending).resolves.toMatchObject({
            success: false,
            error: "Authorization was denied",
        });
        expect(channel.close).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    test("does not treat popup cancellation as success", async () => {
        const { pending } = await start();
        popup.closed = true;
        await jest.advanceTimersByTimeAsync(1000);
        await expect(pending).resolves.toMatchObject({ success: false });
        expect(jest.getTimerCount()).toBe(0);
    });

    test("reports a blocked popup", async () => {
        window.open.mockReturnValue(null);
        await expect(
            reauthenticateCustomMcpServer("custom-example"),
        ).resolves.toMatchObject({
            success: false,
            error: expect.stringContaining("blocked"),
        });
        expect(channel.close).toHaveBeenCalledTimes(1);
    });

    test("times out without claiming the connection was restored", async () => {
        const { pending } = await start();
        await jest.advanceTimersByTimeAsync(240000);
        await expect(pending).resolves.toMatchObject({
            success: false,
            error: expect.stringContaining("timed out"),
        });
        expect(jest.getTimerCount()).toBe(0);
    });

    test("never opens a provider for a server the init route rejects", async () => {
        fetch.mockResolvedValue({
            ok: false,
            json: async () => ({ error: "Custom MCP server not found" }),
        });
        await expect(
            reauthenticateCustomMcpServer("custom-missing"),
        ).rejects.toThrow("Custom MCP server not found");
        expect(window.open).not.toHaveBeenCalled();
    });
});
