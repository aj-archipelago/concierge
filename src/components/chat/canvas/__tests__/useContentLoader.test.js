import { renderHook, waitFor } from "@testing-library/react";
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
