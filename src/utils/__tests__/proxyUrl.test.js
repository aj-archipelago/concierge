import { getTextProxyUrl, TEXT_PROXY_INDICATORS } from "../proxyUrl";

describe("proxyUrl", () => {
    test("uses a generic Azure Blob host suffix for text proxy detection", () => {
        expect(TEXT_PROXY_INDICATORS).toContain(".blob.core.windows.net");
        expect(TEXT_PROXY_INDICATORS).not.toContain(
            ["examplefile", "storage.blob.core.windows.net"].join(""),
        );

        const proxied = getTextProxyUrl(
            "https://customerstorage.blob.core.windows.net/container/file.md?sig=token",
        );

        expect(proxied).toBe(
            "/api/text-proxy?url=https%3A%2F%2Fcustomerstorage.blob.core.windows.net%2Fcontainer%2Ffile.md%3Fsig%3Dtoken",
        );
    });

    test("leaves unrelated public URLs unchanged", () => {
        expect(getTextProxyUrl("https://example.com/file.md")).toBe(
            "https://example.com/file.md",
        );
    });
});
