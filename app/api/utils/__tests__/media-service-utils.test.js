/**
 * @jest-environment node
 */

jest.mock("../../../../config", () => ({
    endpoints: {
        mediaHelperDirect: jest.fn(() => "http://media-helper.test"),
    },
}));

const {
    checkMediaFile,
    deleteMediaFile,
    readBlobContent,
} = require("../media-service-utils.js");

describe("media-service-utils identifier fallbacks", () => {
    const originalFetch = global.fetch;
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const config = require("../../../../config");

    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
        config.endpoints.mediaHelperDirect.mockReturnValue(
            "http://media-helper.test",
        );
        console.log = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();
    });

    afterAll(() => {
        global.fetch = originalFetch;
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
    });

    it("checkMediaFile tries blobPath before hash fallback", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    url: "https://example.com/file.pdf",
                    hash: "hash123",
                }),
            });

        const result = await checkMediaFile({
            blobPath: "global/file.pdf",
            hash: "hash123",
            contextId: "ctx123",
        });

        expect(result).toEqual({
            url: "https://example.com/file.pdf",
            hash: "hash123",
        });
        expect(global.fetch).toHaveBeenCalledTimes(2);

        const firstUrl = new URL(global.fetch.mock.calls[0][0]);
        expect(global.fetch.mock.calls[0][1]).toMatchObject({
            cache: "no-store",
        });
        expect(firstUrl.searchParams.get("blobPath")).toBe("global/file.pdf");
        expect(firstUrl.searchParams.get("hash")).toBeNull();
        expect(firstUrl.searchParams.get("checkHash")).toBeNull();

        const secondUrl = new URL(global.fetch.mock.calls[1][0]);
        expect(global.fetch.mock.calls[1][1]).toMatchObject({
            cache: "no-store",
        });
        expect(secondUrl.searchParams.get("blobPath")).toBeNull();
        expect(secondUrl.searchParams.get("hash")).toBe("hash123");
        expect(secondUrl.searchParams.get("checkHash")).toBe("true");
    });

    it("deleteMediaFile retries with hash after blobPath miss", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
                text: async () => "blob missing",
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ deleted: true }),
            });

        const result = await deleteMediaFile({
            blobPath: "global/file.pdf",
            hash: "hash123",
            contextId: "ctx123",
        });

        expect(result).toEqual({ deleted: true });
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[0][1]).toMatchObject({
            method: "DELETE",
        });

        const firstUrl = new URL(global.fetch.mock.calls[0][0]);
        expect(firstUrl.searchParams.get("blobPath")).toBe("global/file.pdf");
        expect(firstUrl.searchParams.get("hash")).toBeNull();

        const secondUrl = new URL(global.fetch.mock.calls[1][0]);
        expect(secondUrl.searchParams.get("blobPath")).toBeNull();
        expect(secondUrl.searchParams.get("hash")).toBe("hash123");
    });

    it("deleteMediaFile can skip hash fallback after blobPath miss", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: "Not Found",
            text: async () => "blob missing",
        });

        const result = await deleteMediaFile({
            blobPath: "global/file.pdf",
            hash: "hash123",
            fallbackToHash: false,
            contextId: "ctx123",
        });

        expect(result).toBeNull();
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const url = new URL(global.fetch.mock.calls[0][0]);
        expect(url.searchParams.get("blobPath")).toBe("global/file.pdf");
        expect(url.searchParams.get("hash")).toBeNull();
    });

    it("readBlobContent bypasses fetch cache for CFH lookup and signed blob read", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ url: "https://signed.example/file.html" }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>published</html>",
            });

        const result = await readBlobContent("applets/v1.html", {
            kind: "applet-global",
            userContextId: "ctx123",
        });

        expect(result).toBe("<html>published</html>");
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[0][1]).toMatchObject({
            cache: "no-store",
        });
        expect(global.fetch.mock.calls[1]).toEqual([
            "https://signed.example/file.html",
            { cache: "no-store" },
        ]);
    });
});
