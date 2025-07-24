"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, AlertCircle, User } from "lucide-react";

export const AuthTestPanel = () => {
    const [isExpiring, setIsExpiring] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
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
                    "Token expired successfully. You will be redirected to login.",
                );
                // Redirect to login page after a short delay
                setTimeout(() => {
                    window.location.href = "/auth/login";
                }, 1500);
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
                        className="w-full flex items-center gap-2"
                    >
                        {isExpiring ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Expiring Token...
                            </>
                        ) : (
                            <>
                                <Clock className="h-4 w-4" />
                                Expire Current Token
                            </>
                        )}
                    </Button>
                </div>

                {message && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded">
                        <AlertCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                        <span className="text-sm text-blue-700 dark:text-blue-300">
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
                                    {authStatus.localAuth.hasToken ? "Token Present" : "No Token"}
                                    {authStatus.localAuth.hasUser && (
                                        <span> • User: {authStatus.localAuth.user}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400">
                    <p>
                        <strong>Purpose:</strong> This panel simulates
                        authentication scenarios for testing.
                    </p>
                    <p className="mt-1">
                        <strong>Local vs Entra:</strong> Tests both local
                        development and production authentication flows.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};
