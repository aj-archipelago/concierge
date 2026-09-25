import {
    getDownloadUrl,
    getChatArtifactDownloadUrl,
    getMediaPlaybackUrl,
} from "../fileDownloadUtils";

describe("signed download URLs", () => {
    const base =
        "https://examplefiles.blob.core.windows.net/files/streamed-rose.jpeg";

    it("uses the completed signature after partial URLs have rendered", () => {
        const complete = `${base}?sv=2026-02-06&sp=r&sig=synthetic%2Bsignature%3D`;
        for (const source of [
            base,
            `${base}?sv`,
            `${base}?sv=`,
            `${base}?sv=2026-02-06&sp=r&sig=synthetic`,
            complete,
        ]) {
            const target = new URL(getDownloadUrl(source), "http://localhost");
            expect(target.searchParams.get("url")).toBe(source);
        }
    });

    it("uses a refreshed link for the same stored image", () => {
        const expired = `${base}?se=2020-01-01&sig=expired`;
        const refreshed = `${base}?se=2030-01-01&sig=refreshed`;
        getDownloadUrl(expired);
        const target = new URL(getDownloadUrl(refreshed), "http://localhost");
        expect(target.searchParams.get("url")).toBe(refreshed);
    });
});

describe("getChatArtifactDownloadUrl", () => {
    it.each(["pdf", "docx", "html", "zip"])(
        "routes stored %s artifacts to attachment downloads",
        (extension) => {
            const url = `https://storage.googleapis.com/files/report.${extension}?X-Goog-Signature=expired`;
            const target = new URL(
                getChatArtifactDownloadUrl(url),
                "http://localhost",
            );
            expect(target.pathname).toBe("/api/image-proxy");
            expect(target.searchParams.get("url")).toBe(url);
            expect(target.searchParams.get("download")).toBe("1");
        },
    );

    it("keeps existing scoped proxy parameters and does not double-wrap links", () => {
        const url =
            "/api/image-proxy?blobPath=chats%2Fchat-1%2Freport.pdf&contextId=ctx-1&fileScope=chat";
        const download = getChatArtifactDownloadUrl(url);
        const target = new URL(download, "http://localhost");
        expect(target.searchParams.get("blobPath")).toBe(
            "chats/chat-1/report.pdf",
        );
        expect(target.searchParams.get("contextId")).toBe("ctx-1");
        expect(target.searchParams.get("fileScope")).toBe("chat");
        expect(getChatArtifactDownloadUrl(download)).toBe(download);
    });
});

describe("getMediaPlaybackUrl", () => {
    it("proxies storage origins supported by image-proxy", () => {
        const url =
            "https://examplefiles.blob.core.windows.net/files/video.mp4?sig=test";

        expect(getMediaPlaybackUrl(url)).toBe(
            `/api/image-proxy?url=${encodeURIComponent(url)}`,
        );
    });

    it("keeps unsupported Azure storage origins direct", () => {
        const url =
            "https://externalaccount.blob.core.windows.net/files/video.mp4?sig=test";

        expect(getMediaPlaybackUrl(url)).toBe(url);
    });
});
