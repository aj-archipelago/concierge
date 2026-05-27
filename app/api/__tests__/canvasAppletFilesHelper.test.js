/**
 * @jest-environment node
 */

import {
    buildWorkspacePathFromBlobPath,
    extractBlobPathFromWorkspacePath,
    extractBlobPathFromUrl,
    isCanvasAppletHtmlFile,
    resolveCanvasAppletFileByWorkspacePath,
} from "../canvas-applets/files";

jest.mock("../utils/media-service-utils", () => ({
    checkMediaFile: jest.fn(),
}));

describe("canvas applet file helpers", () => {
    test("extractBlobPathFromUrl returns the blob path from a storage URL", () => {
        expect(
            extractBlobPathFromUrl(
                "https://example.blob.core.windows.net/container/applets/weather.html",
            ),
        ).toBe("applets/weather.html");
    });

    test("buildWorkspacePathFromBlobPath returns the editable workspace path", () => {
        expect(buildWorkspacePathFromBlobPath("applets/weather.html")).toBe(
            "/workspace/files/applets/weather.html",
        );
    });

    test("extractBlobPathFromWorkspacePath returns the linked blob path", () => {
        expect(
            extractBlobPathFromWorkspacePath(
                "/workspace/files/applets/weather.html",
            ),
        ).toBe("applets/weather.html");
    });

    test("isCanvasAppletHtmlFile accepts html files by mime type", () => {
        expect(
            isCanvasAppletHtmlFile({
                mimeType: "text/html",
                displayFilename: "weather.bin",
            }),
        ).toBe(true);
    });

    test("isCanvasAppletHtmlFile accepts html files by filename fallback", () => {
        expect(
            isCanvasAppletHtmlFile({
                mimeType: "application/octet-stream",
                displayFilename: "weather.HTML",
            }),
        ).toBe(true);
    });

    test("isCanvasAppletHtmlFile rejects non-html files", () => {
        expect(
            isCanvasAppletHtmlFile({
                mimeType: "application/octet-stream",
                displayFilename: "weather.txt",
                blobPath: "applets/weather.txt",
            }),
        ).toBe(false);
    });

    test("resolveCanvasAppletFileByWorkspacePath resolves the linked html file via media helper", async () => {
        const { checkMediaFile } = require("../utils/media-service-utils");
        checkMediaFile.mockResolvedValue({
            url: "https://example.blob.core.windows.net/container/applets/weather.html",
            mimeType: "text/html",
        });

        const result = await resolveCanvasAppletFileByWorkspacePath(
            "/workspace/files/applets/weather.html",
            { contextId: "ctx" },
        );

        expect(checkMediaFile).toHaveBeenCalledWith({
            blobPath: "applets/weather.html",
            userId: "ctx",
        });
        expect(result).toEqual({
            url: "https://example.blob.core.windows.net/container/applets/weather.html",
            mimeType: "text/html",
            blobPath: "applets/weather.html",
        });
    });

    test("resolveCanvasAppletFileByWorkspacePath returns null when media helper misses", async () => {
        const { checkMediaFile } = require("../utils/media-service-utils");
        checkMediaFile.mockResolvedValue(null);

        const result = await resolveCanvasAppletFileByWorkspacePath(
            "/workspace/files/applets/weather.html",
            { contextId: "ctx" },
        );

        expect(result).toBeNull();
    });
});
