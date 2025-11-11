import axios from "axios";
import { triggerAuthRefresh, checkAuthHeaders } from "../../src/utils/auth";

// Create axios instance
const axiosInstance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "",
    timeout: 300000,
    withCredentials: true,
});

// Cache for auth status checks to avoid redundant HEAD requests
// Cache TTL: 30 seconds (balances request batching with timely auth state detection)
// For Entra Auth: sessions last hours, headers are stable, but we want to detect
// logout/session expiry within ~30 seconds
//
// Race condition handling: If a token expires after the cache is set (e.g., expires
// 10s after cache, but cache is valid for 30s), the cached "authenticated=true" will
// be used until the cache expires. However, when the actual API request is made with
// expired auth, the server will return 401, which is caught by the response interceptor
// below. The interceptor invalidates the cache and triggers auth refresh, so the next
// request will re-check auth status. This means at most one request may fail with 401
// before recovery, which is acceptable for the performance benefit of caching.
const AUTH_CACHE_TTL = 30000; // 30 seconds
let authCache = {
    isAuthenticated: null,
    timestamp: null,
    pendingCheck: null, // Promise for in-flight checks
};

// Function to get cached auth status or perform a new check
const getCachedAuthStatus = async () => {
    const now = Date.now();

    // If there's a pending check, wait for it instead of starting a new one
    if (authCache.pendingCheck) {
        return authCache.pendingCheck;
    }

    // If cache is valid, return cached result
    if (
        authCache.isAuthenticated !== null &&
        authCache.timestamp !== null &&
        now - authCache.timestamp < AUTH_CACHE_TTL
    ) {
        return authCache.isAuthenticated;
    }

    // Start a new check and cache the promise
    authCache.pendingCheck = checkAuthHeaders()
        .then((isAuthenticated) => {
            authCache.isAuthenticated = isAuthenticated;
            authCache.timestamp = Date.now();
            authCache.pendingCheck = null;
            return isAuthenticated;
        })
        .catch((error) => {
            authCache.pendingCheck = null;
            // On error, assume not authenticated to be safe
            authCache.isAuthenticated = false;
            authCache.timestamp = Date.now();
            return false;
        });

    return authCache.pendingCheck;
};

// Function to invalidate auth cache (call when we get 401 or auth errors)
const invalidateAuthCache = () => {
    authCache.isAuthenticated = null;
    authCache.timestamp = null;
    authCache.pendingCheck = null;
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

            // Check authentication status using cached check
            const isAuthenticated = await getCachedAuthStatus();
            if (!isAuthenticated) {
                invalidateAuthCache(); // Clear cache before triggering refresh
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
                invalidateAuthCache(); // Clear cache on auth redirect
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
                invalidateAuthCache(); // Clear cache on 401
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
