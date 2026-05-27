"use client";

import axios from "../../../app/utils/axios-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

function postAtlassianOAuthResult(message) {
    if (typeof BroadcastChannel !== "undefined") {
        try {
            const channel = new BroadcastChannel("mcp-oauth");
            channel.postMessage(message);
            channel.close();
        } catch {
            // Fall through to window.opener when available.
        }
    }

    if (window.opener) {
        window.opener.postMessage(message, "*");
    }

    window.close();
}

export default function ConnectJiraButton({ clientSecret, onTokenChange }) {
    // read parameter code and state from querystring
    const searchParams = useSearchParams();
    const [code, setCode] = useState(searchParams.get("code"));
    const state = searchParams.get("state");
    const router = useRouter();
    const { t } = useTranslation();

    const clientId = process.env.NEXT_PUBLIC_ATLASSIAN_CLIENT_ID;

    const [token, setToken] = useState(null);
    const [refreshToken, setRefreshToken] = useState(null);
    const [error, setError] = useState(null);
    const [redirectUri, setRedirectUri] = useState("");
    const [isConnectorCallbackFlow] = useState(
        () =>
            !!searchParams.get("code") &&
            (state === "mcp" ||
                state?.startsWith("mcp21_") ||
                state?.startsWith("applet_")),
    );
    const [callbackStatus, setCallbackStatus] = useState(
        isConnectorCallbackFlow
            ? t("atlassian_oauth_connecting")
            : t("atlassian_oauth_idle"),
    );

    useEffect(() => {
        if (typeof localStorage !== "undefined") {
            setToken(localStorage.getItem("jira_access_token"));
            setRefreshToken(localStorage.getItem("jira_refresh_token"));
        }
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setRedirectUri(window.location.href);
        }
    }, []);

    const getSites = async (token) => {
        // Sometimes Jira returns 500, so we have to retry
        let attemptCount = 0;
        const retryCount = 3;

        while (attemptCount < retryCount) {
            try {
                await axios.get(
                    `/api/jira/auth/accessible-resources?token=${encodeURIComponent(token)}`,
                );
                break;
            } catch (error) {
                if (error.response.status === 401) {
                    // token is bad
                    throw error;
                }

                attemptCount++;
                // sleep for 1 second
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    };

    const renewToken = useCallback(
        async (refreshToken) => {
            try {
                const response = await axios.post("/api/jira/auth/token", {
                    grant_type: "refresh_token",
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refreshToken,
                    redirect_uri: redirectUri,
                    scope: "offline_access",
                });

                const { data } = response;
                const accessToken = data.access_token;

                // we have new tokes now
                setToken(accessToken);
                localStorage.setItem("jira_access_token", accessToken);
                onTokenChange(accessToken);
                if (data.refresh_token) {
                    setRefreshToken(data.refresh_token);
                    localStorage.setItem(
                        "jira_refresh_token",
                        data.refresh_token,
                    );
                }
            } catch (error) {
                console.warn("Error refreshing token", error);
                setError(error);
                onTokenChange(null);
                setToken(null);
                setRefreshToken(null);
            }
        },
        [clientId, clientSecret, onTokenChange, redirectUri],
    );

    // Handle MCP / applet OAuth callback: exchange code server-side, save to DB, notify opener
    // Supports legacy "mcp", "mcp21_*" (MCP OAuth 2.1), and "applet_*" (3LO for applets)
    useEffect(() => {
        const isMcp = state === "mcp";
        const isMcp21 = state?.startsWith("mcp21_");
        const isApplet = state?.startsWith("applet_");
        if (!code || (!isMcp && !isMcp21 && !isApplet)) return;

        setCallbackStatus(t("atlassian_oauth_connecting"));
        const redirectUri = window.location.origin + "/code/jira";
        fetch("/api/auth/atlassian/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, redirectUri, isMcp21 }),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    setCallbackStatus(t("atlassian_oauth_connected"));
                    postAtlassianOAuthResult({
                        type: "atlassian-oauth-complete",
                        success: true,
                    });
                } else if (!data.success) {
                    console.error("MCP Atlassian exchange failed:", data);
                    setCallbackStatus(
                        data.error || t("atlassian_oauth_failed"),
                    );
                    postAtlassianOAuthResult({
                        type: "atlassian-oauth-complete",
                        success: false,
                        error: data.error,
                    });
                }
            })
            .catch((err) => {
                console.error("MCP Atlassian exchange error:", err);
                setCallbackStatus(err.message || t("atlassian_oauth_failed"));
                postAtlassianOAuthResult({
                    type: "atlassian-oauth-complete",
                    success: false,
                    error: err.message,
                });
            });

        setCode(null);
    }, [code, state, t]);

    useEffect(() => {
        // Skip regular Jira flow if this is an MCP or applet callback
        if (
            state === "mcp" ||
            state?.startsWith("mcp21_") ||
            state?.startsWith("applet_")
        )
            return;

        if (!code) {
            // if there's no code, it means that this isn't a callback from Jira.
            // check if there's a token in local storage and verify that its good
            if (token) {
                (async function () {
                    try {
                        await getSites(token);
                        // token is good so pass it to the parent
                        onTokenChange(token);
                    } catch (error) {
                        // token is bad
                        setToken(null);
                        onTokenChange(null);
                        localStorage.removeItem("jira_access_token");

                        // renew the token if we have a refresh token
                        if (refreshToken) {
                            await renewToken(refreshToken);
                        }
                    }
                })();
            }

            return;
        }

        if (code && redirectUri) {
            // Exchange the code via the server-side exchange endpoint.
            // This persists the token to the DB (as atlassian_api) so
            // the applet SDK can access it for direct Jira API calls.
            fetch("/api/auth/atlassian/exchange", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code,
                    redirectUri,
                    isJiraPage: true,
                }),
            })
                .then((res) => res.json())
                .then((data) => {
                    if (data.accessToken) {
                        setToken(data.accessToken);
                        onTokenChange(data.accessToken);
                        localStorage.setItem(
                            "jira_access_token",
                            data.accessToken,
                        );

                        if (data.refreshToken) {
                            setRefreshToken(data.refreshToken);
                            localStorage.setItem(
                                "jira_refresh_token",
                                data.refreshToken,
                            );
                        }
                    } else {
                        console.warn("Jira token exchange failed:", data.error);
                        setError(data.error || "Token exchange failed");
                        onTokenChange(null);
                        setToken(null);
                        setRefreshToken(null);
                    }
                })
                .catch((error) => {
                    console.warn("error", error);
                    setError(error?.message || error?.toString());
                    onTokenChange(null);
                    setToken(null);
                    setRefreshToken(null);
                });

            setCode(null);
            // remove code from querystring
            router.push(`/code/jira/create`);
        }
    }, [
        code,
        state,
        token,
        refreshToken,
        redirectUri,
        onTokenChange,
        renewToken,
        router,
    ]);

    const isConnectedToJira = () => !!token;

    if (isConnectorCallbackFlow) {
        return (
            <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <p className="text-sm text-gray-700 dark:text-gray-200">
                    {callbackStatus}
                </p>
            </div>
        );
    }

    if (!isConnectedToJira()) {
        const connectionUri = new URL("https://auth.atlassian.com/authorize");
        connectionUri.searchParams.append("audience", "api.atlassian.com");
        connectionUri.searchParams.append("client_id", clientId);
        connectionUri.searchParams.append(
            "scope",
            "read:me read:jira-work write:jira-work",
        );
        connectionUri.searchParams.append("redirect_uri", redirectUri);
        connectionUri.searchParams.append("response_type", "code");
        connectionUri.searchParams.append("prompt", "consent");
        connectionUri.searchParams.append("state", "jira");

        return (
            <div className="">
                <div className="flex">
                    <a className="lb-success" href={connectionUri.toString()}>
                        {t("Connect to Jira")}
                    </a>
                </div>
                {error && (
                    <div className="text-red-500 text-sm text-end mt-2">
                        <p>
                            {t("An error occurred")}:{" "}
                            {error.message || error.toString()}
                        </p>
                    </div>
                )}
            </div>
        );
    } else {
        return (
            <div className="">
                <div className="flex">
                    <button
                        className="lb-danger"
                        onClick={() => {
                            if (window.confirm(t("Are you sure?"))) {
                                setToken(null);
                                setRefreshToken(null);
                                onTokenChange(null);
                                localStorage.removeItem("jira_access_token");
                                localStorage.removeItem("jira_refresh_token");
                            }
                        }}
                    >
                        {t("Disconnect from Jira")}
                    </button>
                </div>
            </div>
        );
    }
}
