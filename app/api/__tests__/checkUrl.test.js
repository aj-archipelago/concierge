/**
 * @jest-environment node
 */

import { POST } from "../files/check-url/route";

jest.mock("../utils/auth.js", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../utils/file-route-utils.js", () => ({
    resolveAuthorizedMediaRouting: jest.fn(),
}));

jest.mock("../utils/media-service-utils.js", () => ({
    checkMediaFile: jest.fn(),
}));

global.fetch = jest.fn();

describe("check-url API", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("rejects unauthenticated requests", async () => {
        const { getCurrentUser } = require("../utils/auth.js");
        getCurrentUser.mockResolvedValue(null);

        const response = await POST(createMockRequest({ url: "https://x" }));
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    test("resolves a canonical file by hash without requiring the stale URL", async () => {
        const { getCurrentUser } = require("../utils/auth.js");
        const {
            resolveAuthorizedMediaRouting,
        } = require("../utils/file-route-utils.js");
        const { checkMediaFile } = require("../utils/media-service-utils.js");

        getCurrentUser.mockResolvedValue({
            _id: "mongo-user-1",
            contextId: "user-context-1",
        });
        resolveAuthorizedMediaRouting.mockResolvedValue({
            storageTarget: {
                kind: "chat",
                contextId: "user-context-1",
                userContextId: "user-context-1",
                chatId: "chat-123",
                fileScope: "chat",
            },
            routingParams: {
                contextId: "user-context-1",
                userId: "user-context-1",
                chatId: "chat-123",
                fileScope: "chat",
            },
        });
        checkMediaFile.mockResolvedValue({
            url: "https://example.com/fresh.pdf",
            blobPath: "chats/chat-123/hash123_file.pdf",
            hash: "hash123",
        });

        const response = await POST(
            createMockRequest({
                hash: "hash123",
                chatId: "chat-123",
                fileScope: "chat",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(resolveAuthorizedMediaRouting).toHaveBeenCalledWith({
            user: {
                _id: "mongo-user-1",
                contextId: "user-context-1",
            },
            routingInput: {
                contextId: undefined,
                userId: undefined,
                workspaceId: undefined,
                chatId: "chat-123",
                fileScope: "chat",
            },
        });
        expect(checkMediaFile).toHaveBeenCalledWith({
            blobPath: null,
            hash: "hash123",
            storageTarget: {
                kind: "chat",
                contextId: "user-context-1",
                userContextId: "user-context-1",
                chatId: "chat-123",
                fileScope: "chat",
            },
        });
        expect(data).toEqual({
            exists: true,
            source: "canonical",
            file: {
                url: "https://example.com/fresh.pdf",
                blobPath: "chats/chat-123/hash123_file.pdf",
                hash: "hash123",
            },
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test("falls back to probing the raw URL when canonical lookup misses", async () => {
        const { getCurrentUser } = require("../utils/auth.js");
        const {
            resolveAuthorizedMediaRouting,
        } = require("../utils/file-route-utils.js");
        const { checkMediaFile } = require("../utils/media-service-utils.js");

        getCurrentUser.mockResolvedValue({
            _id: "mongo-user-1",
            contextId: "user-context-1",
        });
        resolveAuthorizedMediaRouting.mockResolvedValue({
            storageTarget: {
                kind: "chat",
                contextId: "user-context-1",
            },
            routingParams: {
                contextId: "user-context-1",
                fileScope: "chat",
            },
        });
        checkMediaFile.mockResolvedValue(null);
        global.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
        });

        const response = await POST(
            createMockRequest({
                url: "https://customerstorage.blob.core.windows.net/files/test.pdf",
                hash: "hash123",
                chatId: "chat-123",
                fileScope: "chat",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(checkMediaFile).toHaveBeenCalledTimes(2);
        expect(checkMediaFile).toHaveBeenNthCalledWith(2, {
            hash: "hash123",
        });
        expect(data).toEqual({
            exists: true,
            source: "url",
        });
        expect(global.fetch).toHaveBeenCalledWith(
            "https://customerstorage.blob.core.windows.net/files/test.pdf",
            expect.objectContaining({
                method: "HEAD",
                redirect: "follow",
            }),
        );
    });

    test("derives blobPath and hash from old URL-only payloads before probing raw URL", async () => {
        const { getCurrentUser } = require("../utils/auth.js");
        const {
            resolveAuthorizedMediaRouting,
        } = require("../utils/file-route-utils.js");
        const { checkMediaFile } = require("../utils/media-service-utils.js");

        getCurrentUser.mockResolvedValue({
            _id: "mongo-user-1",
            contextId: "user-context-1",
        });
        resolveAuthorizedMediaRouting.mockResolvedValue({
            storageTarget: {
                kind: "chat",
                contextId: "user-context-1",
                userContextId: "user-context-1",
                chatId: "chat-123",
                fileScope: "chat",
            },
        });
        checkMediaFile.mockResolvedValue({
            url: "https://example.com/fresh.pdf",
            blobPath: "chats/chat-123/abc123_file.pdf",
            hash: "abc123",
        });

        const response = await POST(
            createMockRequest({
                url: "https://customerstorage.blob.core.windows.net/cortexfiles-user-context-1/chats/chat-123/abc123_file.pdf?sv=old&sig=expired",
                chatId: "chat-123",
                fileScope: "chat",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(checkMediaFile).toHaveBeenCalledWith({
            blobPath: "chats/chat-123/abc123_file.pdf",
            hash: "abc123",
            storageTarget: expect.objectContaining({
                kind: "chat",
                chatId: "chat-123",
            }),
        });
        expect(data).toEqual({
            exists: true,
            source: "canonical",
            file: {
                url: "https://example.com/fresh.pdf",
                blobPath: "chats/chat-123/abc123_file.pdf",
                hash: "abc123",
            },
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test("resolves legacy hash-map files before probing stale URL", async () => {
        const { getCurrentUser } = require("../utils/auth.js");
        const {
            resolveAuthorizedMediaRouting,
        } = require("../utils/file-route-utils.js");
        const { checkMediaFile } = require("../utils/media-service-utils.js");

        getCurrentUser.mockResolvedValue({
            _id: "mongo-user-1",
            contextId: "user-context-1",
        });
        resolveAuthorizedMediaRouting.mockResolvedValue({
            storageTarget: {
                kind: "chat",
                contextId: "user-context-1",
                userContextId: "user-context-1",
                chatId: "chat-123",
                fileScope: "chat",
            },
        });
        checkMediaFile.mockResolvedValueOnce(null).mockResolvedValueOnce({
            url: "https://example.com/legacy-fresh.pdf",
            shortLivedUrl: "https://example.com/legacy-short.pdf",
            blobPath: "abc123_old.pdf",
            hash: "abc123",
        });

        const response = await POST(
            createMockRequest({
                url: "https://customerstorage.blob.core.windows.net/cortexfiles-user-context-1/chats/chat-123/abc123_old.pdf?sv=old&sig=expired",
                chatId: "chat-123",
                fileScope: "chat",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(checkMediaFile).toHaveBeenNthCalledWith(1, {
            blobPath: "chats/chat-123/abc123_old.pdf",
            hash: "abc123",
            storageTarget: expect.objectContaining({
                kind: "chat",
                chatId: "chat-123",
            }),
        });
        expect(checkMediaFile).toHaveBeenNthCalledWith(2, {
            hash: "abc123",
        });
        expect(data).toEqual({
            exists: true,
            source: "legacy-hash",
            file: {
                url: "https://example.com/legacy-fresh.pdf",
                shortLivedUrl: "https://example.com/legacy-short.pdf",
                blobPath: "abc123_old.pdf",
                hash: "abc123",
            },
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test("normalizes stale CFH blobPath from the resolved file URL", async () => {
        const { getCurrentUser } = require("../utils/auth.js");
        const {
            resolveAuthorizedMediaRouting,
        } = require("../utils/file-route-utils.js");
        const { checkMediaFile } = require("../utils/media-service-utils.js");

        getCurrentUser.mockResolvedValue({
            _id: "mongo-user-1",
            contextId: "user-context-1",
        });
        resolveAuthorizedMediaRouting.mockResolvedValue({
            storageTarget: {
                kind: "chat",
                contextId: "user-context-1",
                userContextId: "user-context-1",
                chatId: "chat-123",
                fileScope: "chat",
            },
        });
        checkMediaFile.mockResolvedValue({
            url: "https://customerstorage.blob.core.windows.net/cortexfiles/chats/chat-123/mod63eq7-act.jpeg?sv=fresh&sig=token",
            shortLivedUrl:
                "https://customerstorage.blob.core.windows.net/cortexfiles/chats/chat-123/mod63eq7-act.jpeg?sv=short&sig=token",
            blobPath: "mod63eq7-act.jpeg",
            hash: "af67fc86281c4eb0",
        });

        const response = await POST(
            createMockRequest({
                hash: "af67fc86281c4eb0",
                blobPath: "mod63eq7-act.jpeg",
                chatId: "chat-123",
                fileScope: "chat",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({
            exists: true,
            source: "canonical",
            file: {
                url: "https://customerstorage.blob.core.windows.net/cortexfiles/chats/chat-123/mod63eq7-act.jpeg?sv=fresh&sig=token",
                shortLivedUrl:
                    "https://customerstorage.blob.core.windows.net/cortexfiles/chats/chat-123/mod63eq7-act.jpeg?sv=short&sig=token",
                blobPath: "chats/chat-123/mod63eq7-act.jpeg",
                hash: "af67fc86281c4eb0",
            },
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test("requires at least one identifier", async () => {
        const { getCurrentUser } = require("../utils/auth.js");
        getCurrentUser.mockResolvedValue({
            _id: "mongo-user-1",
            contextId: "user-context-1",
        });

        const response = await POST(createMockRequest({}));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe(
            "At least one of url, hash, or blobPath is required",
        );
    });
});

function createMockRequest(body) {
    return {
        json: async () => body,
    };
}
