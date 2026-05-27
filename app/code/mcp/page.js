"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function postOAuthResult(message) {
    // The popup is opened with noopener (see openOAuthPopup in useMcpServers)
    // so window.opener is null. Signal completion over a same-origin
    // BroadcastChannel that the parent listens on.
    if (typeof BroadcastChannel !== "undefined") {
        try {
            const channel = new BroadcastChannel("mcp-oauth");
            channel.postMessage(message);
            channel.close();
        } catch {
            // ignore — the parent will fall back to its own retry/refresh
        }
    } else if (window.opener) {
        // Fallback for browsers without BroadcastChannel.
        window.opener.postMessage(message, window.location.origin);
    }
    window.close();
}

function CustomMcpCallbackContent() {
    const searchParams = useSearchParams();
    const [status, setStatus] = useState("Connecting MCP server...");

    useEffect(() => {
        const code = searchParams.get("code");
        const state = searchParams.get("state");
        const error = searchParams.get("error");

        if (error) {
            const msg =
                error === "access_denied" ? "Authorization was denied" : error;
            setStatus(`Error: ${msg}`);
            postOAuthResult({
                type: "mcp-oauth-complete",
                success: false,
                error: msg,
            });
            return;
        }

        if (!code || !state?.startsWith("custom_mcp_")) {
            const msg = "Invalid callback parameters";
            setStatus(`Error: ${msg}`);
            postOAuthResult({
                type: "mcp-oauth-complete",
                success: false,
                error: msg,
            });
            return;
        }

        fetch("/api/auth/mcp/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, state }),
        })
            .then((res) => res.json())
            .then((data) => {
                const type = data.serverId
                    ? `${data.serverId}-oauth-complete`
                    : "mcp-oauth-complete";
                if (data.success) {
                    postOAuthResult({ type, success: true });
                    return;
                }

                setStatus(`Error: ${data.error || "Connection failed"}`);
                postOAuthResult({
                    type,
                    success: false,
                    error: data.error,
                });
            })
            .catch((err) => {
                setStatus(`Error: ${err.message || "Connection failed"}`);
                postOAuthResult({
                    type: "mcp-oauth-complete",
                    success: false,
                    error: err.message,
                });
            });
    }, [searchParams]);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <p className="text-gray-600">{status}</p>
        </div>
    );
}

export default function CustomMcpCallbackPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">
                    <p className="text-gray-600">Connecting MCP server...</p>
                </div>
            }
        >
            <CustomMcpCallbackContent />
        </Suspense>
    );
}
