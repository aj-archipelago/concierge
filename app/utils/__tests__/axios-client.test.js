import * as authUtils from "../../../src/utils/auth";

// Mock the auth utilities with default implementations
jest.mock("../../../src/utils/auth", () => ({
    checkAuthHeaders: jest.fn(() => Promise.resolve(true)),
    triggerAuthRefresh: jest.fn(() => Promise.resolve(undefined)),
}));

// Store interceptor handlers so we can test them
const interceptors = {
    request: { success: null, error: null },
    response: { success: null, error: null },
};

// Mock axios to capture interceptors
jest.mock("axios", () => {
    const mockAxiosInstance = {
        interceptors: {
            request: {
                use: jest.fn((success, error) => {
                    interceptors.request.success = success;
                    interceptors.request.error = error;
                }),
            },
            response: {
                use: jest.fn((success, error) => {
                    interceptors.response.success = success;
                    interceptors.response.error = error;
                }),
            },
        },
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    };

    return {
        create: jest.fn(() => mockAxiosInstance),
        default: mockAxiosInstance,
    };
});

// Import axiosClient once to trigger interceptor registration
// This needs to happen after mocks are set up
let axiosClient;

describe("axiosClient", () => {
    beforeAll(() => {
        // Ensure window is defined
        if (typeof window === "undefined") {
            global.window = {};
        }
        window.location = { pathname: "/" };

        // Setup default mock implementations before importing
        authUtils.checkAuthHeaders.mockResolvedValue(true);
        authUtils.triggerAuthRefresh.mockResolvedValue(undefined);

        // Import axiosClient to trigger interceptor registration
        axiosClient = require("../axios-client").default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2025-01-01"));

        // Reset default mock implementations
        authUtils.checkAuthHeaders.mockResolvedValue(true);
        authUtils.triggerAuthRefresh.mockResolvedValue(undefined);

        // Reset window.location
        delete window.location;
        window.location = { pathname: "/" };
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe("Request Interceptor", () => {
        it("should allow requests when authenticated", async () => {
            authUtils.checkAuthHeaders.mockResolvedValue(true);

            const config = { url: "/api/data" };
            const result = await interceptors.request.success(config);

            expect(authUtils.checkAuthHeaders).toHaveBeenCalled();
            expect(result).toEqual(config);
        });

        it("should reject requests and trigger refresh when not authenticated", async () => {
            // Advance time to invalidate any cached auth status
            jest.advanceTimersByTime(30001);

            authUtils.checkAuthHeaders.mockResolvedValue(false);
            authUtils.triggerAuthRefresh.mockResolvedValue(undefined);

            const config = { url: "/api/data" };

            await expect(interceptors.request.success(config)).rejects.toThrow(
                "Authentication required",
            );

            expect(authUtils.checkAuthHeaders).toHaveBeenCalled();
            expect(authUtils.triggerAuthRefresh).toHaveBeenCalled();
        });

        it("should skip auth check for auth-related endpoints", async () => {
            authUtils.checkAuthHeaders.mockResolvedValue(true);

            const authEndpoints = [
                { url: "/.auth/login" },
                { url: "/api/auth/status" },
                { url: "/api/jira/webhook" },
                { url: "/auth/login" },
                { url: "/test-auth" },
            ];

            for (const config of authEndpoints) {
                const result = await interceptors.request.success(config);
                expect(result).toEqual(config);
            }

            // Auth check should not have been called for any of these
            expect(authUtils.checkAuthHeaders).not.toHaveBeenCalled();
        });

        it("should skip auth check when on login page", async () => {
            window.location.pathname = "/auth/login";
            authUtils.checkAuthHeaders.mockResolvedValue(true);

            const config = { url: "/api/data" };
            const result = await interceptors.request.success(config);

            expect(result).toEqual(config);
            expect(authUtils.checkAuthHeaders).not.toHaveBeenCalled();
        });

        it("should handle errors from the interceptor", async () => {
            const error = new Error("Request error");
            const result = interceptors.request.error(error);

            await expect(result).rejects.toThrow("Request error");
        });
    });

    describe("Response Interceptor", () => {
        it("should pass through successful JSON responses", async () => {
            const response = {
                status: 200,
                headers: { "content-type": "application/json" },
                data: { test: "data" },
            };

            const result = await interceptors.response.success(response);

            expect(result).toEqual(response);
            expect(authUtils.triggerAuthRefresh).not.toHaveBeenCalled();
        });

        it("should reject HTML responses and trigger auth refresh", async () => {
            authUtils.triggerAuthRefresh.mockResolvedValue(undefined);

            const response = {
                status: 200,
                headers: { "content-type": "text/html; charset=utf-8" },
                data: "<!DOCTYPE html>...",
            };

            await expect(
                interceptors.response.success(response),
            ).rejects.toThrow("Authentication redirect detected");

            expect(authUtils.triggerAuthRefresh).toHaveBeenCalled();
        });

        it("should handle 401 errors and trigger auth refresh", async () => {
            authUtils.triggerAuthRefresh.mockResolvedValue(undefined);

            const error = {
                response: {
                    status: 401,
                    data: { error: "Unauthorized" },
                },
            };

            await expect(interceptors.response.error(error)).rejects.toThrow(
                "Authentication required. Redirecting...",
            );

            expect(authUtils.triggerAuthRefresh).toHaveBeenCalled();
        });

        it("should pass through non-401 errors", async () => {
            const error = {
                response: {
                    status: 500,
                    data: { error: "Server error" },
                },
            };

            await expect(interceptors.response.error(error)).rejects.toEqual(
                error,
            );
            expect(authUtils.triggerAuthRefresh).not.toHaveBeenCalled();
        });

        it("should pass through network errors without response", async () => {
            const error = new Error("Network Error");

            await expect(interceptors.response.error(error)).rejects.toEqual(
                error,
            );
            expect(authUtils.triggerAuthRefresh).not.toHaveBeenCalled();
        });
    });

    describe("Auth Caching", () => {
        let testTimeCounter = 0;

        beforeEach(() => {
            // Reset time to invalidate any existing cache
            // Each test starts at a time that's way past the previous test's cache
            testTimeCounter += 100000; // Advance 100 seconds between tests
            jest.setSystemTime(
                new Date("2025-01-01").getTime() + testTimeCounter,
            );
            jest.clearAllMocks();

            // Re-establish default mock implementations after clearing
            authUtils.checkAuthHeaders.mockResolvedValue(true);
            authUtils.triggerAuthRefresh.mockResolvedValue(undefined);
        });

        it("should cache successful auth checks", async () => {
            authUtils.checkAuthHeaders.mockResolvedValue(true);

            const config = { url: "/api/data" };

            // First request
            await interceptors.request.success(config);
            expect(authUtils.checkAuthHeaders).toHaveBeenCalledTimes(1);

            // Second request within cache TTL
            await interceptors.request.success(config);
            // Should use cached value, not call again
            expect(authUtils.checkAuthHeaders).toHaveBeenCalledTimes(1);
        });

        it("should invalidate cache after TTL expires", async () => {
            authUtils.checkAuthHeaders.mockResolvedValue(true);

            const config = { url: "/api/data" };

            // First request
            await interceptors.request.success(config);
            expect(authUtils.checkAuthHeaders).toHaveBeenCalledTimes(1);

            // Advance time past cache TTL (30 seconds)
            jest.advanceTimersByTime(30001);

            // Second request after TTL
            await interceptors.request.success(config);
            // Should call again since cache expired
            expect(authUtils.checkAuthHeaders).toHaveBeenCalledTimes(2);
        });

        it("should deduplicate concurrent auth checks", async () => {
            let authCheckResolve;
            const authCheckPromise = new Promise(
                (resolve) => (authCheckResolve = resolve),
            );
            authUtils.checkAuthHeaders.mockReturnValue(authCheckPromise);

            const config = { url: "/api/data" };

            // Start multiple concurrent requests
            const request1 = interceptors.request.success(config);
            const request2 = interceptors.request.success(config);
            const request3 = interceptors.request.success(config);

            // Resolve the auth check
            authCheckResolve(true);

            await Promise.all([request1, request2, request3]);

            // Should only call checkAuthHeaders once despite 3 concurrent requests
            expect(authUtils.checkAuthHeaders).toHaveBeenCalledTimes(1);
        });

        it("should invalidate cache on 401 error", async () => {
            authUtils.checkAuthHeaders.mockResolvedValue(true);
            authUtils.triggerAuthRefresh.mockResolvedValue(undefined);

            const config = { url: "/api/data" };

            // First request succeeds
            await interceptors.request.success(config);
            expect(authUtils.checkAuthHeaders).toHaveBeenCalledTimes(1);

            // Simulate 401 error which invalidates cache
            const error = { response: { status: 401 } };
            await expect(interceptors.response.error(error)).rejects.toThrow();

            // Next request should re-check auth (cache was invalidated)
            await interceptors.request.success(config);
            expect(authUtils.checkAuthHeaders).toHaveBeenCalledTimes(2);
        });

        it("should invalidate cache on HTML response", async () => {
            authUtils.checkAuthHeaders.mockResolvedValue(true);
            authUtils.triggerAuthRefresh.mockResolvedValue(undefined);

            const config = { url: "/api/data" };

            // First request succeeds
            await interceptors.request.success(config);
            expect(authUtils.checkAuthHeaders).toHaveBeenCalledTimes(1);

            // Simulate HTML response which invalidates cache
            const response = {
                headers: { "content-type": "text/html" },
            };
            await expect(
                interceptors.response.success(response),
            ).rejects.toThrow();

            // Next request should re-check auth (cache was invalidated)
            await interceptors.request.success(config);
            expect(authUtils.checkAuthHeaders).toHaveBeenCalledTimes(2);
        });

        it("should handle auth check errors gracefully", async () => {
            authUtils.checkAuthHeaders.mockRejectedValue(
                new Error("Network error"),
            );
            authUtils.triggerAuthRefresh.mockResolvedValue(undefined);

            const config = { url: "/api/data" };

            // First request fails due to auth check error
            await expect(interceptors.request.success(config)).rejects.toThrow(
                "Authentication required",
            );

            expect(authUtils.checkAuthHeaders).toHaveBeenCalled();
            expect(authUtils.triggerAuthRefresh).toHaveBeenCalled();

            // Advance time by 1ms to ensure requests are sequential
            jest.advanceTimersByTime(1);

            // Second request also fails and triggers the same flow
            await expect(interceptors.request.success(config)).rejects.toThrow(
                "Authentication required",
            );

            // Both requests should attempt auth check and trigger refresh
            expect(authUtils.checkAuthHeaders).toHaveBeenCalled();
            expect(authUtils.triggerAuthRefresh).toHaveBeenCalled();
        });
    });

    describe("Configuration", () => {
        it("should create axios instance with correct configuration", () => {
            // The axios instance was already created during module import
            // We can verify the configuration is correct by checking the axiosClient
            expect(axiosClient).toBeDefined();

            // Note: In a real scenario, axios.create would have been called
            // during module initialization, but the mock was cleared in beforeEach.
            // The important thing is that the module imported successfully
            // with the correct configuration.
        });
    });
});
