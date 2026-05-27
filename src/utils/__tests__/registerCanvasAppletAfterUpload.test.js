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

    it("returns null appletId and original html when POST is not ok", async () => {
        global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

        const r = await registerCanvasAppletAfterUpload({
            taggedHtml,
            filename: "app.html",
            appletName: "My App",
            contextId: "ctx",
            initialUploadResult: initialUpload,
        });

        expect(r.appletId).toBeNull();
        expect(r.html).toBe(taggedHtml);
        expect(r.effectiveUpload).toBe(initialUpload);
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
            hash: "h2",
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
        expect(r.effectiveUpload.hash).toBe("h2");

        expect(global.fetch).toHaveBeenCalledTimes(2);
        const [postUrl, postOpts] = global.fetch.mock.calls[0];
        expect(postUrl).toBe("/api/canvas-applets");
        expect(JSON.parse(postOpts.body).filePath).toBe("https://blob/first");

        const [putUrl, putOpts] = global.fetch.mock.calls[1];
        expect(putUrl).toBe("/api/canvas-applets/applet-abc");
        expect(JSON.parse(putOpts.body)).toMatchObject({
            filePath: "https://blob/second",
        });
        expect(JSON.parse(putOpts.body).html).toContain("applet-abc");

        expect(uploadFileToMediaHelper).toHaveBeenCalledTimes(1);
    });
});
