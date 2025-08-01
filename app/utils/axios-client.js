import axios from "axios";
import { triggerAuthRefresh, checkAuthHeaders } from "../../src/utils/auth";

// Create axios instance
const axiosInstance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "",
    timeout: 30000,
    withCredentials: true,
});

// Add interceptors only for client-side
if (typeof window !== "undefined") {
    // Request interceptor to check auth before making requests
    axiosInstance.interceptors.request.use(
        async (config) => {
            // Skip auth check for auth-related endpoints to avoid infinite loops
            if (
                config.url?.includes("/.auth/") ||
                config.url?.includes("/api/auth/") ||
                config.url?.includes("/api/jira/") ||
                config.url?.includes("/auth/login") ||
                config.url?.includes("/test-auth")
            ) {
                return config;
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
                await triggerAuthRefresh();
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
        async function (response) {
            // Check if response is HTML (usually means auth redirect)
            if (response.headers["content-type"]?.includes("text/html")) {
                await triggerAuthRefresh();
                return Promise.reject(
                    new Error("Authentication redirect detected"),
                );
            }
            return response;
        },
        async function (error) {
            // Handle 401 Unauthorized errors
            if (error.response?.status === 401) {
                // Trigger the refresh and await it - for token refresh, this might succeed silently
                await triggerAuthRefresh();
                return Promise.reject(
                    new Error("Authentication required. Redirecting..."),
                );
            }

            return Promise.reject(error);
        },
    );
}

export default axiosInstance;
