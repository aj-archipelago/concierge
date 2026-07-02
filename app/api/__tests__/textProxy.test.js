/**
 * @jest-environment node
 */

import { GET } from "../text-proxy/route";

// Mock auth
jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe("Text Proxy API", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.NODE_ENV = originalNodeEnv;
    });

    describe("authentication", () => {
        test("should reject unauthenticated requests", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue(null);

            const req = createMockRequest(
                "https://customerstorage.blob.core.windows.net/file.csv",
            );
            const response = await GET(req);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBe("Authentication required");
        });
    });

    describe("URL validation", () => {
        beforeEach(() => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue({ _id: "user123" });
        });

        test("should reject requests without URL parameter", async () => {
            const req = createMockRequest(null);
            const response = await GET(req);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe("URL parameter is required");
        });

        test("should reject URLs from non-allowed domains", async () => {
            const req = createMockRequest("https://evil-site.com/malware.csv");
            const response = await GET(req);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.error).toBe("URL is not from an allowed domain");
        });

        test("should accept allowed blob storage URLs", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve("col1,col2\nval1,val2"),
                headers: new Map([["content-type", "text/csv"]]),
            });

            const req = createMockRequest(
                "https://storage.googleapis.com/bucket/files/data.csv",
            );
            const response = await GET(req);

            expect(response.status).toBe(200);
            expect(global.fetch.mock.calls[0][0].toString()).toBe(
                "https://storage.googleapis.com/bucket/files/data.csv",
            );
            expect(global.fetch.mock.calls[0][1]).toEqual({
                cache: "no-store",
                redirect: "manual",
            });
        });

        test("should accept GCS URLs", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve("content"),
                headers: new Map([["content-type", "text/plain"]]),
            });

            const req = createMockRequest(
                "https://storage.googleapis.com/bucket/file.txt",
            );
            const response = await GET(req);

            expect(response.status).toBe(200);
        });

        test("should reject local blob URLs in production", async () => {
            process.env.NODE_ENV = "production";

            const req = createMockRequest(
                "http://localhost:10000/devstoreaccount1/file.txt",
            );
            const response = await GET(req);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.error).toBe("URL is not from an allowed domain");
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test("should reject redirects to non-allowed domains", async () => {
            global.fetch.mockResolvedValue({
                status: 302,
                headers: new Map([
                    ["location", "http://169.254.169.254/latest/meta-data"],
                ]),
            });

            const req = createMockRequest(
                "https://storage.googleapis.com/bucket/files/data.csv",
            );
            const response = await GET(req);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.error).toBe("URL is not from an allowed domain");
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });

    describe("proxying", () => {
        beforeEach(() => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue({ _id: "user123" });
        });

        test("should return file content", async () => {
            const csvContent = "name,value\ntest,123";
            global.fetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(csvContent),
                headers: new Map([["content-type", "text/csv"]]),
            });

            const req = createMockRequest(
                "https://storage.googleapis.com/bucket/file.csv",
            );
            const response = await GET(req);
            const text = await response.text();

            expect(text).toBe(csvContent);
        });

        test("should handle fetch errors", async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            const req = createMockRequest(
                "https://storage.googleapis.com/bucket/missing.csv",
            );
            const response = await GET(req);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toContain("Failed to fetch file");
        });
    });
});

function createMockRequest(url) {
    const searchParams = new URLSearchParams();
    if (url) {
        searchParams.set("url", url);
    }

    return {
        url: `http://localhost:3000/api/text-proxy?${searchParams.toString()}`,
    };
}
