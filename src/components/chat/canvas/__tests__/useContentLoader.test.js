import { act, renderHook, waitFor } from "@testing-library/react";
import { useContentLoader } from "../useContentLoader";

describe("useContentLoader", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("does not spin forever when restored HTML has no content source", async () => {
        const { result } = renderHook(() =>
            useContentLoader({
                url: null,
                inlineContent: undefined,
                isActive: true,
                emptyError: "No HTML content available",
            }),
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(result.current.error).toBe("No HTML content available");
        expect(result.current.content).toBeNull();
    });

    test("does not bump contentKey when a reload returns unchanged HTML", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            statusText: "OK",
            text: async () => "<html>same</html>",
        });

        const { result, rerender } = renderHook(
            ({ reloadKey }) =>
                useContentLoader({
                    url: "https://example.com/applet.html",
                    inlineContent: undefined,
                    isActive: true,
                    reloadKey,
                }),
            { initialProps: { reloadKey: 1 } },
        );

        await waitFor(() => {
            expect(result.current.content).toBe("<html>same</html>");
        });
        const firstContentKey = result.current.contentKey;

        rerender({ reloadKey: 2 });

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });
        expect(result.current.content).toBe("<html>same</html>");
        expect(result.current.contentKey).toBe(firstContentKey);
    });
});

const response = (content) => ({ ok: true, text: async () => content });
const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { promise, resolve };
};

describe("canvas loading lifecycle", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("a late previous-file response cannot replace the selected file", async () => {
        const old = deferred();
        global.fetch
            .mockReturnValueOnce(old.promise)
            .mockResolvedValueOnce(response("new file"));
        const { result, rerender } = renderHook(
            ({ url }) => useContentLoader({ url }),
            { initialProps: { url: "/old" } },
        );
        const oldSignal = global.fetch.mock.calls[0][1].signal;
        rerender({ url: "/new" });
        await waitFor(() => expect(result.current.content).toBe("new file"));
        expect(oldSignal.aborted).toBe(true);
        await act(async () => old.resolve(response("old file")));
        expect(result.current.content).toBe("new file");
    });

    test("inline edits supersede a pending fetch", async () => {
        const pending = deferred();
        global.fetch.mockReturnValue(pending.promise);
        const { result, rerender } = renderHook(
            ({ inlineContent }) =>
                useContentLoader({ url: "/file", inlineContent }),
            { initialProps: { inlineContent: undefined } },
        );
        rerender({ inlineContent: "edited content" });
        await waitFor(() =>
            expect(result.current.content).toBe("edited content"),
        );
        await act(async () => pending.resolve(response("stale content")));
        expect(result.current.content).toBe("edited content");
    });

    test("inactive tabs defer loading and closing aborts the request", async () => {
        const pending = deferred();
        global.fetch.mockReturnValue(pending.promise);
        const { rerender, unmount } = renderHook(
            ({ isActive }) => useContentLoader({ url: "/file", isActive }),
            { initialProps: { isActive: false } },
        );
        expect(global.fetch).not.toHaveBeenCalled();
        rerender({ isActive: true });
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const signal = global.fetch.mock.calls[0][1].signal;
        unmount();
        expect(signal.aborted).toBe(true);
        await act(async () => pending.resolve(response("closed")));
    });

    test("retry performs a fresh authenticated file read after failure", async () => {
        global.fetch
            .mockRejectedValueOnce(new Error("sensitive network detail"))
            .mockResolvedValueOnce(response("recovered"));
        const { result } = renderHook(() =>
            useContentLoader({
                url: "/api/workspace/file?path=game",
                failureError: "Please try again",
            }),
        );
        await waitFor(() =>
            expect(result.current.error).toBe("Please try again"),
        );
        await act(async () => result.current.retry());
        expect(result.current.content).toBe("recovered");
        expect(result.current.error).toBeNull();
    });

    test("resolves a legacy hash-only preview before fetching content", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    exists: true,
                    file: { url: "https://example.com/fresh.html" },
                }),
            })
            .mockResolvedValueOnce(response("hash file"));
        const { result } = renderHook(() =>
            useContentLoader({ fileHash: "saved-hash" }),
        );
        await waitFor(() => expect(result.current.content).toBe("hash file"));
        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            "/api/files/check-url",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ hash: "saved-hash" }),
            }),
        );
    });

    test("retry uses the newly resolved signed URL instead of an expired cached URL", async () => {
        const blob =
            "https://examplefiles.blob.core.windows.net/test/preview.html";
        const lookup = (token) => ({
            ok: true,
            json: async () => ({
                exists: true,
                file: { url: `${blob}?sig=${token}` },
            }),
        });
        global.fetch
            .mockResolvedValueOnce(lookup("expired"))
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValueOnce(lookup("fresh"))
            .mockResolvedValueOnce(response("recovered preview"));
        const { result } = renderHook(() =>
            useContentLoader({ fileHash: "rotating-link" }),
        );
        await waitFor(() => expect(result.current.error).toBeTruthy());
        await act(async () => result.current.retry());
        expect(global.fetch.mock.calls[3][0]).toBe(
            `/api/text-proxy?url=${encodeURIComponent(`${blob}?sig=fresh`)}`,
        );
        expect(result.current.content).toBe("recovered preview");
    });
});
