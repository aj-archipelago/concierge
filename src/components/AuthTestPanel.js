"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, AlertCircle } from "lucide-react";

export const AuthTestPanel = () => {
    const [isExpiring, setIsExpiring] = useState(false);
    const [message, setMessage] = useState("");

    const expireToken = async () => {
        setIsExpiring(true);
        setMessage("");

        try {
            // Clear the local auth token by setting it to expire immediately
            const response = await fetch("/api/auth/local?action=logout", {
                method: "GET",
                credentials: "include",
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
                    Token Expiration Test
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Click the button below to expire your current authentication
                    token and test the re-authentication flow.
                </p>

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

                {message && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded">
                        <AlertCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                            {message}
                        </span>
                    </div>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400">
                    <p>
                        <strong>Purpose:</strong> This page simulates token
                        expiration for testing authentication flows.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};
