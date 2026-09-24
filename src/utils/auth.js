// Centralized authentication utilities
import config from "../../config";

// Function to check if we're running in Azure App Service
export const isAzureAppService = () => {
    if (typeof window === "undefined") return false;

    const hostname = window.location.hostname;
    return (
        hostname === "azurewebsites.net" ||
        hostname.endsWith(".azurewebsites.net") ||
        hostname === "azure.com" ||
        hostname.endsWith(".azure.com") ||
        // Custom Azure domains opt in explicitly; production can run anywhere.
        process.env.NEXT_PUBLIC_AUTH_USE_EASY_AUTH === "true"
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

export function isAuthFlowPath(pathname = "") {
    return (
        pathname === "/auth/login" ||
        pathname.startsWith("/auth/login?") ||
        pathname === "/api/auth/local" ||
        pathname.startsWith("/api/auth/local/")
    );
}

/**
 * Restrict post-login redirects to same-origin app paths.
 * Returns a relative path (with search/hash) or "/".
 */
export function sanitizeAppRedirect(rawRedirect, origin) {
    const fallback = "/";
    if (!rawRedirect || typeof rawRedirect !== "string") {
        return fallback;
    }

    const trimmed = rawRedirect.trim();
    if (
        !trimmed ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("\\\\") ||
        [...trimmed].some((ch) => ch.charCodeAt(0) < 32)
    ) {
        return fallback;
    }

    let originUrl;
    try {
        originUrl = new URL(origin);
    } catch {
        return fallback;
    }

    let resolved;
    try {
        resolved = trimmed.startsWith("/")
            ? new URL(trimmed, originUrl)
            : new URL(trimmed);
    } catch {
        return fallback;
    }

    if (resolved.origin !== originUrl.origin || resolved.username) {
        return fallback;
    }

    const { pathname } = resolved;
    if (
        pathname === "/auth/login" ||
        pathname.startsWith("/auth/login/") ||
        pathname.startsWith("/api/auth/local") ||
        pathname.startsWith("/.auth/login")
    ) {
        return fallback;
    }

    return `${pathname}${resolved.search}${resolved.hash}` || fallback;
}

// Function to trigger proper authentication refresh
export const triggerAuthRefresh = async () => {
    if (typeof window === "undefined") return;

    if (isAuthFlowPath(window.location.pathname)) {
        return;
    }

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
