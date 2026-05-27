/**
 * @jest-environment node
 */

import { POST } from "../files/rename/route";

jest.mock("../../../config", () => ({
    endpoints: {
        mediaHelperDirect: jest.fn(() => "http://media-helper.test"),
    },
}));

jest.mock("../utils/auth.js", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../utils/file-route-utils.js", () => ({
    resolveAuthorizedMediaRouting: jest.fn(),
}));

describe("rename file API", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                blobPath: "media/Example Article Demo/demo.png",
                url: "https://example.test/demo.png",
            }),
        });

        const { getCurrentUser } = require("../utils/auth.js");
        getCurrentUser.mockResolvedValue({
            _id: "mongo-user-1",
            contextId: "user-context-1",
        });

        const {
            resolveAuthorizedMediaRouting,
        } = require("../utils/file-route-utils.js");
        resolveAuthorizedMediaRouting.mockResolvedValue({
            routingParams: {
                userId: "user-context-1",
                fileScope: "media",
            },
        });
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    test("forwards targetBlobPath for folder moves", async () => {
        const response = await POST(
            createMockRequest({
                blobPath: "users/user-context-1/media/demo.png",
                newFilename: "Example Article Demo/demo.png",
                targetBlobPath: "media/Example Article Demo/demo.png",
                userId: "user-context-1",
                fileScope: "media",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const helperUrl = new URL(global.fetch.mock.calls[0][0]);
        expect(helperUrl.searchParams.get("rename")).toBe("true");
        expect(helperUrl.searchParams.get("blobPath")).toBe(
            "users/user-context-1/media/demo.png",
        );
        expect(helperUrl.searchParams.get("newFilename")).toBe(
            "Example Article Demo/demo.png",
        );
        expect(helperUrl.searchParams.get("targetBlobPath")).toBe(
            "media/Example Article Demo/demo.png",
        );
        expect(helperUrl.searchParams.get("userId")).toBe("user-context-1");
        expect(helperUrl.searchParams.get("fileScope")).toBe("media");
    });

    test("does not fall back to hash rename for targetBlobPath folder moves", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
                text: async () => "missing",
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ blobPath: "wrong/path/demo.png" }),
            });

        const response = await POST(
            createMockRequest({
                blobPath: "users/user-context-1/media/demo.png",
                hash: "hash-demo",
                newFilename: "Example Article Demo/demo.png",
                targetBlobPath: "media/Example Article Demo/demo.png",
                userId: "user-context-1",
                fileScope: "media",
            }),
        );

        expect(response.status).toBe(404);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const helperUrl = new URL(global.fetch.mock.calls[0][0]);
        expect(helperUrl.searchParams.get("blobPath")).toBe(
            "users/user-context-1/media/demo.png",
        );
        expect(helperUrl.searchParams.get("hash")).toBeNull();
    });

    test("requires blobPath for targetBlobPath folder moves", async () => {
        const response = await POST(
            createMockRequest({
                hash: "hash-demo",
                newFilename: "Example Article Demo/demo.png",
                targetBlobPath: "media/Example Article Demo/demo.png",
                userId: "user-context-1",
                fileScope: "media",
            }),
        );

        expect(response.status).toBe(400);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

function createMockRequest(body) {
    return {
        json: async () => body,
    };
}
