// Centralized authentication utilities
import config from "../../config";

// Function to check if we're running in Azure App Service
export const isAzureAppService = () => {
    return (
        typeof window !== "undefined" &&
        (window.location.hostname.includes("azurewebsites.net") ||
            window.location.hostname.includes("azure.com") ||
            process.env.NODE_ENV === "production")
    );
};

// Function to refresh Entra tokens using Azure App Service built-in refresh endpoint
export const refreshEntraTokens = async () => {
    if (typeof window === "undefined") return false;

    try {
        console.log("Attempting to refresh Entra tokens using /.auth/refresh");

        const response = await fetch("/.auth/refresh", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (response.ok) {
            console.log("Token refresh completed successfully.");
            return true;
        } else {
            console.log("Token refresh failed. Status:", response.status);
            return false;
        }
    } catch (error) {
        console.log("Token refresh failed. Error:", error.message);
        return false;
    }
};

// Function to trigger proper authentication refresh
export const triggerAuthRefresh = async () => {
    if (typeof window === "undefined") return;

    // Check if we're in Azure App Service and using Entra auth provider
    if (isAzureAppService() && config.auth?.provider === "entra") {
        console.log(
            "Using Entra auth provider, attempting token refresh first",
        );

        // Try to refresh tokens first
        const refreshSuccessful = await refreshEntraTokens();

        if (refreshSuccessful) {
            // Token refresh successful, no need to redirect
            console.log(
                "Token refresh successful, continuing with current session",
            );
            return;
        }

        console.log("Token refresh failed, falling back to full auth redirect");
    }

    // Fallback to current behavior (redirect) for:
    // 1. Local development
    // 2. When not using Entra auth provider
    // 3. When token refresh fails
    if (isAzureAppService()) {
        // For Azure App Service, redirect to the auth endpoint
        const currentUrl = window.location.href;
        const authUrl = `${window.location.origin}/.auth/login/aad?post_login_redirect_url=${encodeURIComponent(currentUrl)}`;

        // Store the current URL to return to after auth
        sessionStorage.setItem("auth_redirect_url", currentUrl);

        window.location.href = authUrl;
    } else {
        // For local development, use local auth system
        console.log("Using local authentication for local development");

        // Redirect to local auth endpoint (using /api/auth/local consistently)
        const currentUrl = window.location.href;
        const localAuthUrl = `${window.location.origin}/api/auth/local?post_login_redirect_url=${encodeURIComponent(currentUrl)}`;

        window.location.href = localAuthUrl;
    }
};

// Function to check if authentication headers are present and valid
export const checkAuthHeaders = async () => {
    if (typeof window === "undefined") return true;

    try {
        // Make a lightweight request to check auth status
        const response = await fetch("/api/auth/status", {
            method: "HEAD",
            credentials: "include",
        });

        return response.ok;
    } catch (error) {
        console.error("Auth check failed:", error);
        return false;
    }
};
