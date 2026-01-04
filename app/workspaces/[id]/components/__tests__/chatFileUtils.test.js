/**
 * @jest-environment node
 */

import {
    deleteFileFromCloud,
    checkFileUrlExists,
    createFilePlaceholder,
    purgeFile,
    purgeFiles,
} from "../chatFileUtils";

// Mock fetch
global.fetch = jest.fn();
global.window = { location: { origin: "http://localhost:3000" } };

// Mock translation function
const mockT = (key, params) => {
    if (params) {
        return key.replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] || "");
    }
    return key;
};

describe("chatFileUtils", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    describe("deleteFileFromCloud", () => {
        it("should delete file from cloud successfully", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            await deleteFileFromCloud("hash123");

            expect(global.fetch).toHaveBeenCalledWith(
                "http://localhost:3000/api/files/delete?hash=hash123",
                { method: "DELETE" },
            );
        });

        it("should handle missing hash gracefully", async () => {
            await deleteFileFromCloud(null);
            await deleteFileFromCloud(undefined);

            expect(global.fetch).not.toHaveBeenCalled();
        });

        it("should handle deletion errors gracefully", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
                text: jest.fn().mockResolvedValue("File not found"),
            });

            const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
            await deleteFileFromCloud("hash123");

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe("checkFileUrlExists", () => {
        it("should return true when file exists", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ exists: true }),
            });

            const result = await checkFileUrlExists(
                "https://example.com/file.pdf",
            );

            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith("/api/files/check-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: "https://example.com/file.pdf" }),
            });
        });

        it("should return false when file does not exist", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ exists: false }),
            });

            const result = await checkFileUrlExists(
                "https://example.com/missing.pdf",
            );

            expect(result).toBe(false);
        });

        it("should return false for invalid URL", async () => {
            const result = await checkFileUrlExists(null);
            expect(result).toBe(false);
        });
    });

    describe("createFilePlaceholder", () => {
        it("should create placeholder with correct structure", () => {
            const fileObj = {
                type: "file",
                originalFilename: "test.pdf",
            };

            const placeholder = JSON.parse(
                createFilePlaceholder(fileObj, mockT),
            );

            expect(placeholder.type).toBe("text");
            expect(placeholder.hideFromClient).toBe(true);
            expect(placeholder.isDeletedFile).toBe(true);
            expect(placeholder.deletedFilename).toBe("test.pdf");
            expect(placeholder.originalFileType).toBe("file");
        });

        it("should use filename parameter when provided", () => {
            const fileObj = { type: "image_url" };
            const placeholder = JSON.parse(
                createFilePlaceholder(fileObj, mockT, "custom-name.jpg"),
            );

            expect(placeholder.deletedFilename).toBe("custom-name.jpg");
        });

        it("should fallback to fileObj filename", () => {
            const fileObj = {
                type: "file",
                filename: "fallback.pdf",
            };

            const placeholder = JSON.parse(
                createFilePlaceholder(fileObj, mockT),
            );

            expect(placeholder.deletedFilename).toBe("fallback.pdf");
        });
    });

    describe("purgeFile", () => {
        const mockFileObj = {
            type: "file",
            hash: "hash123",
            url: "https://example.com/file.pdf",
            originalFilename: "test.pdf",
        };

        const mockApolloClient = {};
        const mockUpdateChatHook = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };

        it("should purge file from cloud, memory, and chat", async () => {
            global.fetch.mockResolvedValueOnce({ ok: true });

            const messages = [
                {
                    id: "msg1",
                    payload: [JSON.stringify(mockFileObj)],
                },
            ];

            const result = await purgeFile({
                fileObj: mockFileObj,
                apolloClient: mockApolloClient,
                contextId: "ctx1",
                contextKey: "key1",
                chatId: "chat1",
                messages,
                updateChatHook: mockUpdateChatHook,
                t: mockT,
            });

            expect(result.cloudDeleted).toBe(true);
            expect(result.userFileCollectionRemoved).toBe(true);
            expect(result.chatUpdated).toBe(true);
            expect(mockUpdateChatHook.mutateAsync).toHaveBeenCalled();
        });

        it("should skip cloud deletion when skipCloudDelete is true", async () => {
            const result = await purgeFile({
                fileObj: mockFileObj,
                apolloClient: mockApolloClient,
                contextId: "ctx1",
                contextKey: "key1",
                skipCloudDelete: true,
                t: mockT,
            });

            expect(result.cloudDeleted).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it("should skip file collection update when skipUserFileCollection is true", async () => {
            global.fetch.mockResolvedValueOnce({ ok: true });

            const result = await purgeFile({
                fileObj: mockFileObj,
                skipUserFileCollection: true,
                t: mockT,
            });

            expect(result.userFileCollectionRemoved).toBe(false);
        });

        it("should handle files without hash", async () => {
            const fileWithoutHash = {
                type: "file",
                url: "https://example.com/file.pdf",
            };

            const result = await purgeFile({
                fileObj: fileWithoutHash,
                t: mockT,
            });

            expect(result.cloudDeleted).toBe(false);
        });

        it("should return error for invalid file object", async () => {
            const result = await purgeFile({
                fileObj: { type: "invalid" },
                t: mockT,
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("Invalid file object");
        });

        it("should match files by hash, url, gcs, or image_url", async () => {
            global.fetch.mockResolvedValueOnce({ ok: true });

            const messages = [
                {
                    id: "msg1",
                    payload: [
                        JSON.stringify({
                            type: "file",
                            hash: "hash123",
                        }),
                    ],
                },
                {
                    id: "msg2",
                    payload: [
                        JSON.stringify({
                            type: "image_url",
                            image_url: { url: "https://example.com/img.jpg" },
                        }),
                    ],
                },
            ];

            const fileObj1 = { type: "file", hash: "hash123" };

            await purgeFile({
                fileObj: fileObj1,
                chatId: "chat1",
                messages,
                updateChatHook: mockUpdateChatHook,
                t: mockT,
            });

            expect(mockUpdateChatHook.mutateAsync).toHaveBeenCalled();
            const updatedMessages =
                mockUpdateChatHook.mutateAsync.mock.calls[0][0].messages;
            const placeholder1 = JSON.parse(updatedMessages[0].payload[0]);
            expect(placeholder1.isDeletedFile).toBe(true);
        });
    });

    describe("purgeFiles", () => {
        const mockFileObjs = [
            {
                type: "file",
                hash: "hash1",
                url: "https://example.com/file1.pdf",
                originalFilename: "file1.pdf",
            },
            {
                type: "image_url",
                hash: "hash2",
                url: "https://example.com/image.jpg",
                originalFilename: "image.jpg",
            },
        ];

        const mockApolloClient = {};
        const mockUpdateChatHook = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };

        it("should purge multiple files efficiently", async () => {
            global.fetch
                .mockResolvedValueOnce({ ok: true })
                .mockResolvedValueOnce({ ok: true });

            const messages = [
                {
                    id: "msg1",
                    payload: [
                        JSON.stringify(mockFileObjs[0]),
                        JSON.stringify(mockFileObjs[1]),
                    ],
                },
            ];

            const result = await purgeFiles({
                fileObjs: mockFileObjs,
                apolloClient: mockApolloClient,
                contextId: "ctx1",
                contextKey: "key1",
                chatId: "chat1",
                messages,
                updateChatHook: mockUpdateChatHook,
                t: mockT,
            });

            expect(result.cloudDeleted).toBe(2);
            expect(result.userFileCollectionRemoved).toBe(true);
            expect(result.chatUpdated).toBe(true);
            // Should only update chat once for all files
            expect(mockUpdateChatHook.mutateAsync).toHaveBeenCalledTimes(1);
        });

        it("should handle single file in array", async () => {
            global.fetch.mockResolvedValueOnce({ ok: true });

            const result = await purgeFiles({
                fileObjs: [mockFileObjs[0]],
                apolloClient: mockApolloClient,
                contextId: "ctx1",
                contextKey: "key1",
                t: mockT,
            });

            expect(result.cloudDeleted).toBe(1);
        });

        it("should handle files without hash", async () => {
            const filesWithoutHash = [
                {
                    type: "file",
                    url: "https://example.com/file.pdf",
                },
            ];

            const result = await purgeFiles({
                fileObjs: filesWithoutHash,
                t: mockT,
            });

            expect(result.cloudDeleted).toBe(0);
        });

        it("should return error for invalid input", async () => {
            const result = await purgeFiles({
                fileObjs: [],
                t: mockT,
            });

            expect(result.success).toBe(false);
        });

        it("should use getFilename function when provided", async () => {
            global.fetch.mockResolvedValueOnce({ ok: true });

            const getFilename = jest.fn(
                (file) => `custom-${file.originalFilename}`,
            );

            const messages = [
                {
                    id: "msg1",
                    payload: [JSON.stringify(mockFileObjs[0])],
                },
            ];

            await purgeFiles({
                fileObjs: [mockFileObjs[0]],
                chatId: "chat1",
                messages,
                updateChatHook: mockUpdateChatHook,
                getFilename,
                t: mockT,
            });

            expect(getFilename).toHaveBeenCalled();
            const updatedMessages =
                mockUpdateChatHook.mutateAsync.mock.calls[0][0].messages;
            const placeholder = JSON.parse(updatedMessages[0].payload[0]);
            expect(placeholder.deletedFilename).toBe("custom-file1.pdf");
        });

        it("should skip already deleted files (hideFromClient)", async () => {
            global.fetch.mockResolvedValueOnce({ ok: true });

            const messages = [
                {
                    id: "msg1",
                    payload: [
                        JSON.stringify({
                            type: "file",
                            hash: "hash1",
                            hideFromClient: true,
                        }),
                    ],
                },
            ];

            await purgeFiles({
                fileObjs: [mockFileObjs[0]],
                chatId: "chat1",
                messages,
                updateChatHook: mockUpdateChatHook,
                t: mockT,
            });

            const updatedMessages =
                mockUpdateChatHook.mutateAsync.mock.calls[0][0].messages;
            // Should not modify already deleted files
            const payload = JSON.parse(updatedMessages[0].payload[0]);
            expect(payload.hideFromClient).toBe(true);
        });
    });
});
