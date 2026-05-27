/**
 * @jest-environment node
 */

import { GET } from "../image-proxy/route";
import { fetchShortLivedUrl } from "../utils/llm-file-utils.js";

jest.mock("../utils/auth.js", () => ({
    getCurrentUser: jest.fn(() =>
        Promise.resolve({
            _id: "user-1",
            contextId: "ctx-1",
        }),
    ),
}));

jest.mock("../utils/llm-file-utils.js", () => ({
    fetchShortLivedUrl: jest.fn(),
    extractBlobPathFromUrl: jest.fn(() => "media/video.mp4"),
    extractHashFromBlobUrl: jest.fn(() => "hash-1"),
    isAllowedBlobDomain: jest.fn(() => true),
}));

jest.mock("../utils/media-service-utils.js", () => ({
    checkMediaFile: jest.fn(),
}));

jest.mock("../../../src/utils/storageTargets.js", () => ({
    resolveStorageTarget: jest.fn(() => ({ contextId: "ctx-1" })),
}));

describe("image proxy media responses", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.clearAllMocks();
    });

    it("forwards range requests and preserves partial-content headers", async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve(
                new Response("x", {
                    status: 206,
                    headers: {
                        "content-type": "video/mp4",
                        "content-length": "1",
                        "content-range": "bytes 0-0/100",
                        "accept-ranges": "bytes",
                    },
                }),
            ),
        );

        const req = new Request(
            "http://localhost/api/image-proxy?url=https%3A%2F%2Fstorage.example%2Fvideo.mp4",
            {
                headers: {
                    Range: "bytes=0-0",
                },
            },
        );

        const res = await GET(req);

        expect(global.fetch).toHaveBeenCalledWith(
            "https://storage.example/video.mp4",
            {
                redirect: "follow",
                headers: { Range: "bytes=0-0" },
            },
        );
        expect(res.status).toBe(206);
        expect(res.headers.get("content-type")).toBe("video/mp4");
        expect(res.headers.get("content-range")).toBe("bytes 0-0/100");
        expect(res.headers.get("accept-ranges")).toBe("bytes");
    });

    it("keeps range headers when refreshing an expired SAS URL", async () => {
        fetchShortLivedUrl.mockResolvedValue({
            url: "https://storage.example/video.mp4?fresh=sas",
        });
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(new Response("", { status: 403 }))
            .mockResolvedValueOnce(
                new Response("x", {
                    status: 206,
                    headers: {
                        "content-type": "video/mp4",
                        "content-range": "bytes 0-0/100",
                    },
                }),
            );

        const req = new Request(
            "http://localhost/api/image-proxy?url=https%3A%2F%2Fstorage.example%2Fvideo.mp4%3Fstale%3Dsas",
            {
                headers: {
                    Range: "bytes=0-0",
                },
            },
        );

        const res = await GET(req);

        expect(fetchShortLivedUrl).toHaveBeenCalledWith({
            blobPath: "media/video.mp4",
            hash: "hash-1",
            contextId: "ctx-1",
        });
        expect(global.fetch).toHaveBeenLastCalledWith(
            "https://storage.example/video.mp4?fresh=sas",
            {
                redirect: "follow",
                headers: { Range: "bytes=0-0" },
            },
        );
        expect(res.status).toBe(206);
    });
});
