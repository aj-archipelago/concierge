/** Reconnect an existing, user-owned custom server through the settings OAuth flow. */
export async function reauthenticateCustomMcpServer(serverKey) {
    if (typeof BroadcastChannel === "undefined") {
        throw new Error(
            "This browser cannot receive the connection result. Reconnect the custom server in Settings > Connections.",
        );
    }

    const response = await fetch("/api/auth/mcp/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            serverId: serverKey,
            redirectUri: `${window.location.origin}/code/mcp`,
        }),
    });
    const init = await response.json();
    if (!response.ok || !init.authorizeUrl || !init.state) {
        throw new Error(init.error || "Failed to initialize custom MCP OAuth");
    }

    const channel = new BroadcastChannel("mcp-oauth");
    const popup = window.open(
        "about:blank",
        `mcp-oauth-${init.state}`,
        "width=600,height=700",
    );
    if (!popup) {
        channel.close();
        return {
            success: false,
            error: "The authentication window was blocked. Allow popups and try again.",
        };
    }
    // Keep a reference for cancel detection without giving the provider an opener.
    popup.opener = null;

    return new Promise((resolve) => {
        let settled = false;
        let timeout;
        let closedCheck;
        const settle = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            clearInterval(closedCheck);
            channel.close();
            popup.close();
            resolve(result);
        };
        channel.onmessage = (event) => {
            if (event.origin && event.origin !== window.location.origin) return;
            const data = event.data;
            if (data?.state !== init.state) return;
            const completed = data.type === `${serverKey}-oauth-complete`;
            const failed =
                data.type === "mcp-oauth-complete" && data.success === false;
            if (!completed && !failed) return;
            if (data.success !== true) {
                settle({
                    success: false,
                    error:
                        data.error ||
                        "Reauthentication did not complete. You can try again.",
                });
                return;
            }
            settle({
                success: true,
                data: {
                    requiresNewMessage: true,
                    description: `Reconnected ${serverKey}. Ask the user to send another message to load the restored tools.`,
                },
            });
        };
        timeout = setTimeout(
            () =>
                settle({
                    success: false,
                    error: "Reauthentication timed out. You can try again.",
                }),
            240000,
        );
        closedCheck = setInterval(() => {
            if (popup.closed)
                settle({
                    success: false,
                    error: "The authentication window closed before completion was confirmed. You can try again.",
                });
        }, 1000);
        try {
            popup.location.replace(init.authorizeUrl);
        } catch {
            settle({
                success: false,
                error: "Unable to open the authentication page. Reconnect in Settings > Connections.",
            });
        }
    });
}
