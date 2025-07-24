// Centralized authentication utilities

// Function to check if we're running in Azure App Service
export const isAzureAppService = () => {
    return (
        typeof window !== "undefined" &&
        (window.location.hostname.includes("azurewebsites.net") ||
            window.location.hostname.includes("azure.com") ||
            process.env.NODE_ENV === "production")
    );
};

// Function to trigger proper authentication refresh
export const triggerAuthRefresh = () => {
    if (typeof window === "undefined") return;

    // Check if we're in Azure App Service or local development
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
