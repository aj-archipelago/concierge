import { getFilePreviewUrl } from "../FileManager";

describe("getFilePreviewUrl", () => {
    it("keeps blob-backed text previews on the raw URL for text-proxy", () => {
        const blobUrl =
            "https://customerstorage.blob.core.windows.net/cortexfiles-dev/uploads/report.md?sig=token";

        expect(
            getFilePreviewUrl({
                url: blobUrl,
                filename: "report.md",
                mimeType: "text/markdown",
            }),
        ).toBe(blobUrl);
    });
});
