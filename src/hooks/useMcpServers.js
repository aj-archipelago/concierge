"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MCP_PRESETS } from "../utils/mcpPresets";

function toErrorMessage(err, fallback = "Something went wrong") {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === "string" && err) return err;
    return fallback;
}

async function readErrorMessage(res, fallback) {
    try {
        const data = await res.json();
        if (data && typeof data.error === "string") return data.error;
    } catch {
        // response wasn't JSON — fall through
    }
    return fallback;
}

function openOAuthPopup(url) {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    // noopener,noreferrer prevents the third-party OAuth provider page from
    // navigating or otherwise manipulating the parent window via window.opener
    // (reverse-tabnabbing). Completion is signaled via BroadcastChannel
    // ("mcp-oauth") instead of window.opener.postMessage — see the listener
    // in useMcpServers and the publisher in app/code/mcp/page.js.
    return window.open(
        url,
        "mcp-oauth",
        `width=${width},height=${height},left=${left},top=${top},noopener,noreferrer`,
    );
}

export function useMcpServers({ autoFetch = true } = {}) {
    const [mcpServers, setMcpServers] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchMcpServers = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch("/api/users/me/mcp-servers");
            if (!res.ok) throw new Error("Failed to fetch MCP servers");
            const data = await res.json();
            setMcpServers(data || {});
        } catch (err) {
            setError(toErrorMessage(err, "Failed to fetch MCP servers"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (autoFetch) {
            fetchMcpServers();
        }
    }, [autoFetch, fetchMcpServers]);

    // Listen for OAuth completion events from popup windows. The MCP popup is
    // opened with noopener (see openOAuthPopup) so it cannot postMessage back
    // through window.opener — it broadcasts on the "mcp-oauth" channel
    // instead. The window message listener stays for other OAuth flows in the
    // app that still rely on window.opener.postMessage.
    useEffect(() => {
        const handleMessage = (event) => {
            const type = event?.data?.type;
            if (type && type.endsWith("-oauth-complete")) {
                fetchMcpServers();
            }
        };
        window.addEventListener("message", handleMessage);

        let channel = null;
        if (typeof BroadcastChannel !== "undefined") {
            channel = new BroadcastChannel("mcp-oauth");
            channel.onmessage = (event) => {
                const type = event?.data?.type;
                if (type && type.endsWith("-oauth-complete")) {
                    fetchMcpServers();
                }
            };
        }

        return () => {
            window.removeEventListener("message", handleMessage);
            if (channel) channel.close();
        };
    }, [fetchMcpServers]);

    const hasBearerToken = useCallback((serverConfig) => {
        // Support sanitized format (hasAuth flag) from server
        if (serverConfig?.hasAuth) return true;
        // Fallback: check raw headers (backward compat)
        const authHeader = serverConfig?.headers?.Authorization;
        return (
            typeof authHeader === "string" &&
            authHeader.trim().toLowerCase().startsWith("bearer ")
        );
    }, []);

    const isTokenExpired = useCallback((serverConfig) => {
        const expiresAt = serverConfig?.expiresAt;
        if (!expiresAt || typeof expiresAt !== "number") return false;
        return expiresAt <= Date.now();
    }, []);

    const getConnectionStatus = useCallback(
        (serverConfig) => {
            if (!serverConfig) return "disconnected";
            if (!hasBearerToken(serverConfig)) return "disconnected";
            if (isTokenExpired(serverConfig)) return "expired";
            return "connected";
        },
        [hasBearerToken, isTokenExpired],
    );

    const initMcpOAuth = useCallback(
        async (initEndpoint, redirectUri, body = {}) => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(initEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ redirectUri, ...body }),
                });
                const data = await res.json();
                if (!res.ok || !data.authorizeUrl) {
                    setError(data.error || "Failed to initialize MCP OAuth");
                    return null;
                }
                return data.authorizeUrl;
            } catch (err) {
                setError(toErrorMessage(err, "Failed to initialize MCP OAuth"));
                return null;
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    const handleConnectPreset = useCallback(
        async (presetId) => {
            const preset = MCP_PRESETS[presetId];
            if (!preset) return;

            if (preset.authType === "token") {
                return { action: "show-token-input", presetId };
            }

            let url;
            if (preset.authType === "oauth2" && preset.mcpOAuthInit) {
                const redirectUri = `${window.location.origin}${preset.mcpOAuthRedirect}`;
                url = await initMcpOAuth(preset.mcpOAuthInit, redirectUri);
                if (!url) return;
            } else if (preset.oauthUrl) {
                url = preset.oauthUrl;
            } else {
                return;
            }

            openOAuthPopup(url);
        },
        [initMcpOAuth],
    );

    const handleConnectCustomServer = useCallback(
        async (serverId) => {
            if (!serverId?.startsWith("custom-")) return;

            const redirectUri = `${window.location.origin}/code/mcp`;
            const url = await initMcpOAuth("/api/auth/mcp/init", redirectUri, {
                serverId,
            });
            if (!url) return;

            openOAuthPopup(url);
        },
        [initMcpOAuth],
    );

    const handleSaveToken = useCallback(async (presetId, token) => {
        const preset = MCP_PRESETS[presetId];
        if (!preset || !token?.trim()) return;

        try {
            setLoading(true);
            setError(null);
            const res = await fetch("/api/users/me/mcp-servers", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    serverId: presetId,
                    config: {
                        type: preset.type,
                        url: preset.url,
                        headers: {
                            Authorization: `Bearer ${token.trim()}`,
                        },
                    },
                }),
            });
            if (!res.ok) {
                throw new Error(
                    await readErrorMessage(res, "Failed to save token"),
                );
            }
            const data = await res.json();
            setMcpServers(data || {});
        } catch (err) {
            setError(toErrorMessage(err, "Failed to save token"));
        } finally {
            setLoading(false);
        }
    }, []);

    const handleAddCustomServer = useCallback(
        async ({
            name,
            url,
            token,
            type = "streamable-http",
            connectWithOAuth = false,
        }) => {
            if (!name?.trim() || !url?.trim()) {
                setError("Name and URL are required");
                return null;
            }

            const trimmedName = name.trim();

            let parsedUrl;
            try {
                parsedUrl = new URL(url.trim());
            } catch {
                setError("Invalid URL");
                return null;
            }
            if (!/^https?:$/.test(parsedUrl.protocol)) {
                setError("URL must use http or https");
                return null;
            }

            const slug = trimmedName
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "");
            if (!slug) {
                setError("Name must contain alphanumeric characters");
                return null;
            }

            let serverId = `custom-${slug}`;
            const existingIds = new Set(Object.keys(mcpServers));
            let suffix = 2;
            while (existingIds.has(serverId)) {
                serverId = `custom-${slug}-${suffix++}`;
            }

            const headers = {};
            if (token?.trim()) {
                headers.Authorization = `Bearer ${token.trim()}`;
            }

            try {
                setLoading(true);
                setError(null);
                const res = await fetch("/api/users/me/mcp-servers", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        serverId,
                        config: {
                            type,
                            url: parsedUrl.toString(),
                            name: trimmedName,
                            headers,
                            authType: token?.trim() ? "bearer" : undefined,
                        },
                    }),
                });
                if (!res.ok) {
                    throw new Error(
                        await readErrorMessage(res, "Failed to add server"),
                    );
                }
                const data = await res.json();
                setMcpServers(data || {});
                if (connectWithOAuth) {
                    await handleConnectCustomServer(serverId);
                }
                return { serverId };
            } catch (err) {
                setError(toErrorMessage(err, "Failed to add server"));
                return null;
            } finally {
                setLoading(false);
            }
        },
        [mcpServers, handleConnectCustomServer],
    );

    const handleRemoveServer = useCallback(async (serverId) => {
        try {
            const res = await fetch(`/api/users/me/mcp-servers/${serverId}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                throw new Error(
                    await readErrorMessage(res, "Failed to remove server"),
                );
            }
            const data = await res.json();
            setMcpServers(data || {});
        } catch (err) {
            setError(toErrorMessage(err, "Failed to remove server"));
        }
    }, []);

    const configuredConnections = useMemo(
        () =>
            Object.keys(mcpServers).map((serverId) => {
                const config = mcpServers[serverId];
                const preset = MCP_PRESETS[serverId];
                return {
                    serverId,
                    config,
                    preset,
                    displayName:
                        preset?.name ||
                        config?.name ||
                        serverId.replace(/^custom-/, ""),
                    status: getConnectionStatus(config),
                };
            }),
        [mcpServers, getConnectionStatus],
    );

    return {
        mcpServers,
        loading,
        error,
        configuredConnections,
        fetchMcpServers,
        getConnectionStatus,
        handleConnectPreset,
        handleConnectCustomServer,
        handleSaveToken,
        handleAddCustomServer,
        handleRemoveServer,
    };
}
