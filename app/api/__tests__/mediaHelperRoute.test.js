/**
 * @jest-environment node
 */

import { DELETE, GET, POST } from "../../media-helper/route";
import { isRequestAuthorized } from "../utils/requestAuthorization";

jest.mock("next/server", () => ({
    NextResponse: {
        json: (data, init = {}) =>
            new Response(JSON.stringify(data), {
                status: init.status || 200,
                headers: { "content-type": "application/json" },
            }),
    },
}));

jest.mock("../utils/requestAuthorization", () => ({
    isRequestAuthorized: jest.fn(),
}));

describe("/media-helper route", () => {
    const originalMediaHelperUrl = process.env.CORTEX_MEDIA_API_URL;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.CORTEX_MEDIA_API_URL =
            "https://media-helper.test/media-helper?subscription-key=secret";
        global.fetch = jest.fn().mockResolvedValue(
            new Response(
                JSON.stringify({ url: "https://file.test/video.mp4" }),
                {
                    status: 201,
                    headers: { "content-type": "application/json" },
                },
            ),
        );
        isRequestAuthorized.mockReturnValue(true);
    });

    afterAll(() => {
        process.env.CORTEX_MEDIA_API_URL = originalMediaHelperUrl;
    });

    test("streams POST bodies to the configured media helper", async () => {
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("file-bytes"));
                controller.close();
            },
        });
        const request = new Request(
            "https://concierge.test/media-helper?hash=file-hash&subscription-key=evil",
            {
                method: "POST",
                headers: {
                    accept: "application/json",
                    "content-type": "multipart/form-data; boundary=test",
                    cookie: "local_auth_token=secret",
                },
                body,
                duplex: "half",
            },
        );

        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const [url, init] = global.fetch.mock.calls[0];
        const target = new URL(url);
        expect(target.origin + target.pathname).toBe(
            "https://media-helper.test/media-helper",
        );
        expect(target.searchParams.get("subscription-key")).toBe("secret");
        expect(target.searchParams.get("hash")).toBe("file-hash");
        expect(init.body).toBe(request.body);
        expect(init.duplex).toBe("half");
        expect(init.signal).toBe(request.signal);
        expect(init.headers.get("content-type")).toBe(
            "multipart/form-data; boundary=test",
        );
        expect(init.headers.has("cookie")).toBe(false);
    });

    test("forwards GET requests without a body", async () => {
        const request = new Request(
            "https://concierge.test/media-helper?hash=file-hash&checkHash=true",
        );

        await GET(request);

        const [url, init] = global.fetch.mock.calls[0];
        const target = new URL(url);
        expect(target.searchParams.get("hash")).toBe("file-hash");
        expect(target.searchParams.get("checkHash")).toBe("true");
        expect(init.body).toBeUndefined();
        expect(init.duplex).toBeUndefined();
    });

    test("keeps method parity for non-upload media-helper calls", async () => {
        const request = new Request(
            "https://concierge.test/media-helper?hash=h",
            {
                method: "DELETE",
            },
        );

        await DELETE(request);

        const [, init] = global.fetch.mock.calls[0];
        expect(init.method).toBe("DELETE");
    });

    test("rejects unauthorized requests before forwarding", async () => {
        isRequestAuthorized.mockReturnValue(false);
        const request = new Request("https://concierge.test/media-helper", {
            method: "POST",
            body: new ReadableStream(),
            duplex: "half",
        });

        const response = await POST(request);

        expect(response.status).toBe(401);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
