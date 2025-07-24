"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authError, setAuthError] = useState(null);
    const searchParams = useSearchParams();

    // Handle auth redirect after successful authentication
    useEffect(() => {
        const handleAuthReturn = () => {
            // Check if we're returning from an auth flow
            // Add null check for searchParams to handle test environment
            if (!searchParams) return;

            const isAuthReturn = searchParams.get("auth_return");
            const hasAuthHeaders = searchParams.get("auth_headers");

            if (isAuthReturn || hasAuthHeaders) {
                setIsAuthenticating(true);

                // Only run browser-specific code if window is available
                if (typeof window !== "undefined") {
                    // Clear the auth parameters from URL
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.delete("auth_return");
                    newUrl.searchParams.delete("auth_headers");

                    // Handle the redirect if we have a stored URL
                    const redirectUrl =
                        sessionStorage.getItem("auth_redirect_url");
                    if (redirectUrl) {
                        sessionStorage.removeItem("auth_redirect_url");
                        window.location.href = redirectUrl;
                    }

                    // Update the URL without the auth parameters
                    window.history.replaceState({}, "", newUrl.toString());
                }

                setIsAuthenticating(false);
            }
        };

        handleAuthReturn();
    }, [searchParams]);

    // Check authentication status on mount
    useEffect(() => {
        // Skip auth check in local development to avoid constant 401 errors
        if (!isAzureAppService()) {
            return;
        }

        // Skip if window is not available (test environment)
        if (typeof window === "undefined") {
            return;
        }

        const checkAuthStatus = async () => {
            try {
                const response = await fetch("/api/auth/status", {
                    method: "HEAD",
                    credentials: "include",
                });

                if (!response.ok) {
                    setAuthError("Authentication required");
                } else {
                    setAuthError(null);
                }
            } catch (error) {
                console.error("Auth check failed:", error);
                setAuthError("Authentication check failed");
            }
        };

        checkAuthStatus();
    }, []);

    // Function to check if we're in Azure App Service environment
    const isAzureAppService = () => {
        return (
            typeof window !== "undefined" &&
            window.location.hostname.includes(".azurewebsites.net")
        );
    };

    // Function to trigger authentication refresh
    const refreshAuth = () => {
        setIsAuthenticating(true);
        setAuthError(null);

        // Only run browser-specific code if window is available
        if (typeof window === "undefined") {
            setIsAuthenticating(false);
            return;
        }

        // Check if we're in Azure App Service or local development
        if (isAzureAppService()) {
            // Redirect to Azure App Service auth endpoint
            const currentUrl = window.location.href;
            const authUrl = `${window.location.origin}/.auth/login/aad?post_login_redirect_url=${encodeURIComponent(currentUrl)}`;

            // Store the current URL to return to after auth
            sessionStorage.setItem("auth_redirect_url", currentUrl);

            window.location.href = authUrl;
        } else {
            // For local development, use mock authentication
            console.warn("Using mock authentication for local development");

            // Redirect to mock auth endpoint
            const currentUrl = window.location.href;
            const mockAuthUrl = `${window.location.origin}/api/auth/mock?redirect_uri=${encodeURIComponent(currentUrl)}`;

            window.location.href = mockAuthUrl;
        }
    };

    // Function to clear auth error
    const clearAuthError = () => {
        setAuthError(null);
    };

    const value = {
        isAuthenticating,
        authError,
        refreshAuth,
        clearAuthError,
    };

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
};
