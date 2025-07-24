import axios from "axios";
import { triggerAuthRefresh, checkAuthHeaders } from "../../src/utils/auth";

// Create axios instance
const axiosInstance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "",
    timeout: 30000,
    withCredentials: true,
});

// Track authentication refresh state
let isRefreshing = false;
const failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) {
            reject(error);
        } else {
            resolve(token);
        }
    });

    failedQueue.length = 0;
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
                config.url?.includes("/auth/login") ||
                config.url?.includes("/test-auth")
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

export default axiosInstance;
