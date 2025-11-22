"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, AlertCircle, User, Zap } from "lucide-react";
import axiosInstance from "../../app/utils/axios-client";

export const AuthTestPanel = () => {
    const [isExpiring, setIsExpiring] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [isTestingApi, setIsTestingApi] = useState(false);
    const [message, setMessage] = useState("");
    const [authStatus, setAuthStatus] = useState(null);

    const checkAuthStatus = async () => {
        setIsChecking(true);
        setMessage("");

        try {
            const response = await fetch("/api/auth/test", {
                method: "GET",
                credentials: "include",
            });

            if (response.ok) {
                const data = await response.json();
                setAuthStatus(data);
                setMessage("Authentication status checked successfully.");
            } else {
                setMessage("Failed to check authentication status.");
            }
        } catch (error) {
            setMessage("Error checking authentication status.");
            console.error("Error checking auth status:", error);
        } finally {
            setIsChecking(false);
        }
    };

    const expireToken = async () => {
        setIsExpiring(true);
        setMessage("");

        try {
            // Clear the local auth token using the test endpoint
            const response = await fetch("/api/auth/test", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ action: "clear-local-auth" }),
            });

            if (response.ok) {
                setMessage(
                    "Token expired successfully. Now try making an API call to see how the app handles expired authentication.",
                );
                // Refresh auth status to show the change
                await checkAuthStatus();
            } else {
                setMessage("Failed to expire token. Please try again.");
            }
        } catch (error) {
            setMessage("Error expiring token. Please try again.");
            console.error("Error expiring token:", error);
        } finally {
            setIsExpiring(false);
        }
    };

    const testApiCall = async () => {
        setIsTestingApi(true);
        setMessage("");

        try {
            // Use axios client which has authentication interceptors
            // This will trigger the auth refresh flow if token is expired
            const response = await axiosInstance.get("/api/users/me");

            setMessage(
                `API call successful! Status: ${response.status}. User: ${response.data.name || "Unknown"}`,
            );
        } catch (error) {
            if (error.message === "Authentication required") {
                setMessage(
                    "Authentication required! The auth refresh flow should have been triggered. Check for loading overlays or redirects.",
                );
            } else if (error.response?.status === 401) {
                setMessage(
                    `API call returned 401 Unauthorized. The auth refresh flow should have been triggered. Check for loading overlays or redirects.`,
                );
            } else {
                setMessage(
                    `API call failed: ${error.message}. Check the browser console for details.`,
                );
            }
            console.error("API call error:", error);
        } finally {
            setIsTestingApi(false);
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto mt-8">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Authentication Test Panel
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Test authentication flows and token expiration scenarios.
                </p>

                <div className="space-y-3">
                    <Button
                        onClick={checkAuthStatus}
                        disabled={isChecking}
                        variant="outline"
                        className="w-full flex items-center gap-2"
                    >
                        {isChecking ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                                Checking...
                            </>
                        ) : (
                            <>
                                <User className="h-4 w-4" />
                                Check Auth Status
                            </>
                        )}
                    </Button>

                    <Button
                        onClick={expireToken}
                        disabled={isExpiring}
                        variant="outline"
                        className="w-full flex items-center gap-2"
                    >
                        {isExpiring ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                                Expiring Token...
                            </>
                        ) : (
                            <>
                                <Clock className="h-4 w-4" />
                                Expire Current Token
                            </>
                        )}
                    </Button>

                    <Button
                        onClick={testApiCall}
                        disabled={isTestingApi}
                        className="w-full flex items-center gap-2"
                    >
                        {isTestingApi ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Testing API...
                            </>
                        ) : (
                            <>
                                <Zap className="h-4 w-4" />
                                Test API Call (Triggers Auth)
                            </>
                        )}
                    </Button>
                </div>

                {message && (
                    <div className="flex items-center gap-2 p-3 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded">
                        <AlertCircle className="h-4 w-4 text-sky-500 dark:text-sky-400" />
                        <span className="text-sm text-sky-700 dark:text-sky-300">
                            {message}
                        </span>
                    </div>
                )}

                {authStatus && (
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded">
                        <h4 className="font-medium text-sm mb-2">
                            Auth Status:
                        </h4>
                        <div className="text-xs space-y-1">
                            <div>
                                <strong>Authenticated:</strong>{" "}
                                {authStatus.authenticated ? "Yes" : "No"}
                            </div>
                            {authStatus.user && (
                                <div>
                                    <strong>User:</strong>{" "}
                                    {authStatus.user.name} (
                                    {authStatus.user.username})
                                </div>
                            )}
                            {authStatus.azureHeaders?.id && (
                                <div>
                                    <strong>Azure ID:</strong>{" "}
                                    {authStatus.azureHeaders.id}
                                </div>
                            )}
                            {authStatus.localAuth && (
                                <div>
                                    <strong>Local Auth:</strong>{" "}
                                    {authStatus.localAuth.hasToken
                                        ? "Token Present"
                                        : "No Token"}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400">
                    <p>
                        <strong>How to test:</strong>
                    </p>
                    <ol className="list-decimal list-inside mt-1 space-y-1">
                        <li>Check your current auth status</li>
                        <li>Expire your token (stays on this page)</li>
                        <li>Test an API call to see auth refresh in action</li>
                        <li>
                            Watch for redirects, loading states, or error
                            dialogs
                        </li>
                    </ol>
                </div>
            </CardContent>
        </Card>
    );
};
