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
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("authentication", () => {
        test("should reject unauthenticated requests", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue(null);

            const req = createMockRequest(
                "https://ajcortexfilestorage.blob.core.windows.net/file.csv",
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

        test("should accept Azure blob storage URLs", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve("col1,col2\nval1,val2"),
                headers: new Map([["content-type", "text/csv"]]),
            });

            const req = createMockRequest(
                "https://ajcortexfilestorage.blob.core.windows.net/files/data.csv",
            );
            const response = await GET(req);

            expect(response.status).toBe(200);
            expect(global.fetch).toHaveBeenCalledWith(
                "https://ajcortexfilestorage.blob.core.windows.net/files/data.csv",
            );
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
                "https://ajcortexfilestorage.blob.core.windows.net/file.csv",
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
                "https://ajcortexfilestorage.blob.core.windows.net/missing.csv",
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
