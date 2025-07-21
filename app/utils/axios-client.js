import axios from "axios";

// Create base axios instance
const axiosInstance = axios.create();

// Track authentication state
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) {
            reject(error);
        } else {
            resolve(token);
        }
    });

    failedQueue = [];
};

// Function to check if we're running in Azure App Service
const isAzureAppService = () => {
    return (
        typeof window !== "undefined" &&
        (window.location.hostname.includes("azurewebsites.net") ||
            window.location.hostname.includes("azure.com") ||
            process.env.NODE_ENV === "production")
    );
};

// Function to trigger proper authentication refresh
const triggerAuthRefresh = () => {
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

        // Redirect to local auth endpoint
        const currentUrl = window.location.href;
        const localAuthUrl = `${window.location.origin}/api/auth/local?post_login_redirect_url=${encodeURIComponent(currentUrl)}`;

        window.location.href = localAuthUrl;
    }
};

// Function to check if authentication headers are present and valid
const checkAuthHeaders = () => {
    if (typeof window === "undefined") return true;

    // Make a lightweight request to check auth status
    return new Promise((resolve) => {
        fetch("/api/auth/status", {
            method: "HEAD",
            credentials: "include",
        })
            .then((response) => {
                resolve(response.ok);
            })
            .catch(() => {
                resolve(false);
            });
    });
};

// Add interceptors only for client-side
if (typeof window !== "undefined") {
    // Request interceptor to check auth before making requests
    axiosInstance.interceptors.request.use(
        async (config) => {
            // Skip auth check for auth-related endpoints to avoid infinite loops
            if (
                config.url?.includes("/.auth/") ||
                config.url?.includes("/api/auth/") ||
                config.url?.includes("/auth/login")
            ) {
                return config;
            }

            // Check if we're already refreshing
            if (isRefreshing) {
                return new Promise((resolve) => {
                    failedQueue.push({ resolve: () => resolve(config) });
                });
            }

            // Check if we're currently on the login page
            if (
                typeof window !== "undefined" &&
                window.location.pathname === "/auth/login"
            ) {
                return config;
            }

            // Check authentication status (both local and production)
            const isAuthenticated = await checkAuthHeaders();
            if (!isAuthenticated) {
                isRefreshing = true;
                triggerAuthRefresh();
                return Promise.reject(new Error("Authentication required"));
            }

            return config;
        },
        (error) => {
            return Promise.reject(error);
        },
    );

    // Response interceptor
    axiosInstance.interceptors.response.use(
        function (response) {
            // Check if response is HTML (usually means auth redirect)
            if (response.headers["content-type"]?.includes("text/html")) {
                triggerAuthRefresh();
                return Promise.reject(
                    new Error("Authentication redirect detected"),
                );
            }
            return response;
        },
        async function (error) {
            const originalRequest = error.config;

            // Handle 401 Unauthorized errors
            if (error.response?.status === 401 && !originalRequest._retry) {
                if (isRefreshing) {
                    return new Promise((resolve, reject) => {
                        failedQueue.push({
                            resolve: () =>
                                resolve(axiosInstance(originalRequest)),
                            reject: (err) => reject(err),
                        });
                    });
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    triggerAuthRefresh();
                    return Promise.reject(error);
                } catch (refreshError) {
                    processQueue(refreshError, null);
                    return Promise.reject(refreshError);
                } finally {
                    isRefreshing = false;
                }
            }

            return Promise.reject(error);
        },
    );
}

// Function to handle auth redirect after successful authentication
const handleAuthRedirect = () => {
    if (typeof window === "undefined") return;

    const redirectUrl = sessionStorage.getItem("auth_redirect_url");
    if (redirectUrl) {
        sessionStorage.removeItem("auth_redirect_url");
        window.location.href = redirectUrl;
    }
};

// Export the handleAuthRedirect function for use in components
export { handleAuthRedirect };

export default axiosInstance;
