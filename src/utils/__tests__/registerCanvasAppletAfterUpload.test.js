import { registerCanvasAppletAfterUpload } from "../registerCanvasAppletAfterUpload";
import { uploadFileToMediaHelper } from "../fileUploadUtils";

jest.mock("../fileUploadUtils", () => ({
    uploadFileToMediaHelper: jest.fn(),
}));

jest.mock("../storageTargets", () => ({
    createAppletGlobalStorageTarget: jest.fn(() => ({})),
}));

describe("registerCanvasAppletAfterUpload", () => {
    const taggedHtml =
        '<head><meta name="concierge-type" content="applet"></head><body></body>';
    const initialUpload = {
        url: "https://blob/first",
        hash: "h1",
        displayFilename: "app.html",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it("preserves registry error and uploaded file for recovery", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: async () => ({
                error: "Workspace file not found for this applet link",
            }),
        });
        await expect(
            registerCanvasAppletAfterUpload({
                taggedHtml,
                filename: "app.html",
                appletName: "My App",
                contextId: "ctx",
                initialUploadResult: initialUpload,
            }),
        ).rejects.toMatchObject({
            message: "Workspace file not found for this applet link",
            status: 404,
            appletId: null,
            effectiveUpload: initialUpload,
        });
        expect(uploadFileToMediaHelper).not.toHaveBeenCalled();
    });

    it("POSTs applet, re-uploads with applet-id meta, and PUTs final html", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ _id: "applet-abc" }),
            })
            .mockResolvedValueOnce({ ok: true });

        uploadFileToMediaHelper.mockResolvedValueOnce({
            url: "https://blob/second",
            displayFilename: "app.html",
            name: "/workspace/app.html",
        });

        const r = await registerCanvasAppletAfterUpload({
            taggedHtml,
            filename: "app.html",
            appletName: "My App",
            contextId: "ctx",
            initialUploadResult: initialUpload,
        });

        expect(r.appletId).toBe("applet-abc");
        expect(r.html).toContain('name="applet-id"');
        expect(r.html).toContain('content="applet-abc"');
        expect(r.effectiveUpload.url).toBe("https://blob/second");
        expect(r.effectiveUpload.hash).toBeUndefined();

        expect(global.fetch).toHaveBeenCalledTimes(2);
        const [postUrl, postOpts] = global.fetch.mock.calls[0];
        expect(postUrl).toBe("/api/canvas-applets");
        expect(JSON.parse(postOpts.body)).toEqual({
            name: "My App",
            filePath: "https://blob/first",
        });

        const [putUrl, putOpts] = global.fetch.mock.calls[1];
        expect(putUrl).toBe("/api/canvas-applets/applet-abc");
        expect(JSON.parse(putOpts.body)).toMatchObject({
            filePath: "https://blob/second",
            saveVersion: true,
        });
        expect(JSON.parse(putOpts.body).html).toContain("applet-abc");

        expect(uploadFileToMediaHelper).toHaveBeenCalledTimes(1);
    });

    it("rejects when the registered applet HTML cannot be saved", async () => {
        const errorSpy = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ _id: "applet-abc" }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 413,
                json: async () => ({ error: "Version too large" }),
            });

        uploadFileToMediaHelper.mockResolvedValueOnce({
            url: "https://blob/second",
        });

        await expect(
            registerCanvasAppletAfterUpload({
                taggedHtml,
                filename: "app.html",
                appletName: "My App",
                contextId: "ctx",
                initialUploadResult: initialUpload,
            }),
        ).rejects.toMatchObject({
            message: "Version too large",
            appletId: "applet-abc",
            effectiveUpload: { url: "https://blob/second" },
        });
        expect(errorSpy).toHaveBeenCalled();
    });
});
