"use client";

import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConnectJiraButton({ clientSecret, onTokenChange }) {
    // read parameter code from querystring
    const searchParams = useSearchParams();
    const [code, setCode] = useState(searchParams.get("code"));
    const router = useRouter();

    const clientId = process.env.NEXT_PUBLIC_ATLASSIAN_CLIENT_ID;

    const tokenUrl = "https://auth.atlassian.com/oauth/token";
    const [token, setToken] = useState(null);
    const [refreshToken, setRefreshToken] = useState(null);
    const [error, setError] = useState(null);
    const [redirectUri, setRedirectUri] = useState("");

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
        // Sometimes JIRA returns 500, so we have to retry
        let attemptCount = 0;
        const retryCount = 3;

        while (attemptCount < retryCount) {
            try {
                await axios.get(
                    "https://api.atlassian.com/oauth/token/accessible-resources",
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    },
                );
            }
            catch (error) {
                if (error.response.status === 401) {
                    // token is bad
                    throw error;
                }

                attemptCount++;
                // sleep for 1 second
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    };

    const renewToken = async (refreshToken) => {
        try {
            const response = await axios.post(tokenUrl, {
                grant_type: "refresh_token",
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                redirect_uri: redirectUri,
                scope: "offline_access",
            });

            const { data } = response;
            accessToken = data.access_token;

            // we have new tokes now
            setToken(accessToken);
            localStorage.setItem("jira_access_token", accessToken);
            onTokenChange(accessToken);
            if (data.refresh_token) {
                setRefreshToken(data.refresh_token);
                localStorage.setItem("jira_refresh_token", data.refresh_token);
            }
        } catch (error) {
            console.warn("Error refreshing token", error);
            setError(error);
            onTokenChange(null);
            setToken(null);
            setRefreshToken(null);
        }
    };

    useEffect(() => {
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
            // if code is present, this is a callback from Jira, exchange the
            // code for a token
            axios.post(tokenUrl, {
                grant_type: "authorization_code",
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri,
                scope: "offline_access",
            }).then((response) => {
                const { data } = response;

                if (data.access_token) {
                    setToken(data.access_token);
                    onTokenChange(data.access_token);
                    localStorage.setItem("jira_access_token", data.access_token);

                    if (data.refresh_token) {
                        setRefreshToken(data.refresh_token);
                        localStorage.setItem("jira_refresh_token", data.refresh_token);
                    }
                }
            }).catch((error) => {
                console.warn('error', error);
                setError(error?.response?.data?.error_description || error?.response?.data?.error || error?.toString() || error?.message || error?.response?.data?.error_description || error?.response?.data?.error || error?.response?.data || error?.toString());
                onTokenChange(null);
                setToken(null);
                setRefreshToken(null);
            });

            setCode(null);
            // remove code from querystring
            router.push(`/code/jira/create`);
        }

    }, [code, token, refreshToken, redirectUri]);

    const isConnectedToJira = () => !!token;

    if (!isConnectedToJira()) {
        const connectionUri = new URL("https://auth.atlassian.com/authorize");
        connectionUri.searchParams.append("audience", "api.atlassian.com");
        connectionUri.searchParams.append("client_id", clientId);
        connectionUri.searchParams.append("scope", "read:me read:jira-work write:jira-work");
        connectionUri.searchParams.append("redirect_uri", redirectUri);
        connectionUri.searchParams.append("response_type", "code");
        connectionUri.searchParams.append("prompt", "consent");
        connectionUri.searchParams.append("state", "jira");

        return (
            <div className="mb-4">
                <div className="flex justify-end">
                    <a
                        className="lb-success"
                        href={connectionUri.toString()}
                    >
                        Connect to Jira
                    </a>
                </div>
                {error && (
                    <div className="text-red-500 text-sm text-end mt-2">
                        <p>
                            An error occurred:{" "}
                            {error.message || error.toString()}
                        </p>
                    </div>
                )}
            </div>
        );
    } else {
        return (
            <div className="mb-4">
                <div className="flex">
                    <button
                        className="lb-danger"
                        onClick={() => {
                            if (window.confirm("Are you sure?")) {
                                setToken(null);
                                setRefreshToken(null);
                                onTokenChange(null);
                                localStorage.removeItem("jira_access_token");
                                localStorage.removeItem("jira_refresh_token");
                            }
                        }}
                    >
                        Disconnect from Jira
                    </button>
                </div>
            </div>
        );
    }
}
