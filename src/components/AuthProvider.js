"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
    isAzureAppService,
    triggerAuthRefresh,
    checkAuthHeaders,
} from "../utils/auth";

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

    // Handle auth return from Azure App Service or local auth
    useEffect(() => {
        const handleAuthReturn = async () => {
            // Skip if searchParams is not available (test environment)
            if (!searchParams) {
                return;
            }

            // Check if we're returning from authentication
            const authReturn = searchParams.get("auth_return");
            const redirectUrl = searchParams.get("redirect_uri");

            if (authReturn === "success" && redirectUrl) {
                setIsAuthenticating(true);

                try {
                    // Verify authentication was successful
                    const isAuthenticated = await checkAuthHeaders();
                    if (isAuthenticated) {
                        // Clean up the URL parameters to prevent re-running this effect
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.delete("auth_return");
                        newUrl.searchParams.delete("redirect_uri");
                        window.history.replaceState({}, "", newUrl.toString());

                        // Redirect to the original URL
                        window.location.href = redirectUrl;
                    } else {
                        setAuthError("Authentication failed");
                    }
                } catch (error) {
                    console.error("Auth return verification failed:", error);
                    setAuthError("Authentication verification failed");
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

    // Function to trigger authentication refresh
    const refreshAuth = () => {
        setIsAuthenticating(true);
        setAuthError(null);

        // Only run browser-specific code if window is available
        if (typeof window === "undefined") {
            setIsAuthenticating(false);
            return;
        }

        // Use the centralized triggerAuthRefresh function
        triggerAuthRefresh();
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
