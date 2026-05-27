"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function postOAuthResult(message) {
    let sent = false;
    if (typeof BroadcastChannel !== "undefined") {
        try {
            const channel = new BroadcastChannel("mcp-oauth");
            channel.postMessage(message);
            channel.close();
            sent = true;
        } catch {
            // fall back below
        }
    }
    if (!sent && window.opener) {
        window.opener.postMessage(message, window.location.origin);
    }
    window.close();
}

function GitHubCallbackContent() {
    const searchParams = useSearchParams();
    const [status, setStatus] = useState("Connecting to GitHub...");

    useEffect(() => {
        const code = searchParams.get("code");
        const state = searchParams.get("state");
        const error = searchParams.get("error");

        if (error) {
            const msg =
                error === "access_denied" ? "Authorization was denied" : error;
            setStatus(`Error: ${msg}`);
            postOAuthResult({
                type: "github-oauth-complete",
                success: false,
                error: msg,
            });
            return;
        }

        if (!code || !state?.startsWith("github_mcp_")) {
            setStatus("Error: Invalid callback parameters");
            return;
        }

        const redirectUri = window.location.origin + "/code/github";

        fetch("/api/auth/github/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, redirectUri }),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    postOAuthResult({
                        type: "github-oauth-complete",
                        success: true,
                    });
                } else if (!data.success) {
                    setStatus(`Error: ${data.error || "Connection failed"}`);
                    postOAuthResult({
                        type: "github-oauth-complete",
                        success: false,
                        error: data.error,
                    });
                }
            })
            .catch((err) => {
                setStatus(`Error: ${err.message || "Connection failed"}`);
                postOAuthResult({
                    type: "github-oauth-complete",
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

export default function GitHubCallbackPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">
                    <p className="text-gray-600">Connecting to GitHub...</p>
                </div>
            }
        >
            <GitHubCallbackContent />
        </Suspense>
    );
}
