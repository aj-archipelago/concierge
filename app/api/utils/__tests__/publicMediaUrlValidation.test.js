/**
 * @jest-environment node
 */

jest.mock("node:dns/promises", () => ({
    lookup: jest.fn(),
}));
jest.mock("node:http", () => ({
    request: jest.fn(),
}));
jest.mock("node:https", () => ({
    request: jest.fn(),
}));

const { EventEmitter } = require("node:events");
const { lookup } = require("node:dns/promises");
const { request: httpRequest } = require("node:http");
const { request: httpsRequest } = require("node:https");
const { validatePublicMediaUrl } = require("../publicMediaUrlValidation.js");

function mockRequestSequence(requestMock, responses) {
    requestMock.mockImplementation((options, callback) => {
        const response = responses.shift() || { statusCode: 200 };
        const req = new EventEmitter();
        req.setTimeout = jest.fn();
        req.destroy = jest.fn((error) => {
            if (error) req.emit("error", error);
        });
        req.end = jest.fn(() => {
            if (response.error) {
                req.emit("error", response.error);
                return;
            }

            const res = new EventEmitter();
            res.statusCode = response.statusCode;
            res.headers = response.headers || {};
            res.resume = jest.fn();
            res.destroy = jest.fn();
            callback(res);
        });
        return req;
    });
}

describe("validatePublicMediaUrl", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
        process.env = { ...originalEnv, NODE_ENV: "test" };
        lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
        httpRequest.mockReset();
        httpsRequest.mockReset();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test("accepts public http and https URLs outside production", async () => {
        await expect(
            validatePublicMediaUrl("https://example.com/video.mp4"),
        ).resolves.toEqual({
            ok: true,
            url: "https://example.com/video.mp4",
        });
        await expect(
            validatePublicMediaUrl("http://example.com/video.mp4"),
        ).resolves.toEqual({
            ok: true,
            url: "http://example.com/video.mp4",
        });
    });

    test("requires https in production", async () => {
        process.env.NODE_ENV = "production";

        await expect(
            validatePublicMediaUrl("http://example.com/video.mp4"),
        ).resolves.toMatchObject({ ok: false });
        await expect(
            validatePublicMediaUrl("https://example.com/video.mp4"),
        ).resolves.toMatchObject({ ok: true });
    });

    test("rejects literal private, loopback, and link-local hosts", async () => {
        for (const url of [
            "file:///etc/passwd",
            "http://localhost:3000/video.mp4",
            "http://127.0.0.1/video.mp4",
            "http://10.0.0.4/video.mp4",
            "http://169.254.169.254/latest/meta-data",
            "http://192.0.2.10/video.mp4",
            "http://198.51.100.10/video.mp4",
            "http://203.0.113.10/video.mp4",
            "http://224.0.0.1/video.mp4",
            "http://255.255.255.255/video.mp4",
            "http://[::1]/video.mp4",
            "http://[fe80::1]/video.mp4",
            "http://[fe90::1]/video.mp4",
            "http://[febf::1]/video.mp4",
            "http://[ff00::1]/video.mp4",
            "http://[2001:db8::1]/video.mp4",
            "http://[::127.0.0.1]/video.mp4",
            "http://[::10.0.0.4]/video.mp4",
            "http://[::7f00:1]/video.mp4",
            "http://[::ffff:127.0.0.1]/video.mp4",
        ]) {
            await expect(validatePublicMediaUrl(url)).resolves.toMatchObject({
                ok: false,
            });
        }
    });

    test.each(["10.0.0.4", "224.0.0.1", "2001:db8::1", "ff00::1"])(
        "rejects hostnames resolving to non-public address %s",
        async (address) => {
            lookup.mockResolvedValueOnce([
                { address, family: address.includes(":") ? 6 : 4 },
            ]);

            await expect(
                validatePublicMediaUrl("https://media.example/video.mp4"),
            ).resolves.toMatchObject({ ok: false });
        },
    );

    test("does not inherit MCP private URL bypass", async () => {
        process.env.MCP_ALLOW_PRIVATE_URLS = "true";

        await expect(
            validatePublicMediaUrl("http://localhost:3000/video.mp4"),
        ).resolves.toMatchObject({ ok: false });
    });

    test("rejects hostnames when DNS lookup times out", async () => {
        jest.useFakeTimers();
        lookup.mockImplementationOnce(() => new Promise(() => {}));

        const result = validatePublicMediaUrl(
            "https://media.example/video.mp4",
        );
        await jest.advanceTimersByTimeAsync(3000);

        await expect(result).resolves.toMatchObject({ ok: false });
    });

    test("validates public redirects and returns the final URL", async () => {
        mockRequestSequence(httpsRequest, [
            {
                statusCode: 302,
                headers: { location: "https://cdn.example/final.mp4" },
            },
            { statusCode: 200 },
        ]);

        await expect(
            validatePublicMediaUrl("https://media.example/video.mp4", {
                validateRedirects: true,
            }),
        ).resolves.toEqual({
            ok: true,
            url: "https://cdn.example/final.mp4",
        });
        expect(httpsRequest).toHaveBeenCalledTimes(2);
        expect(httpsRequest.mock.calls[0][0]).toMatchObject({
            hostname: "media.example",
            method: "GET",
        });
    });

    test("rejects redirects to private hosts", async () => {
        mockRequestSequence(httpsRequest, [
            {
                statusCode: 302,
                headers: { location: "http://127.0.0.1/latest/meta-data" },
            },
        ]);

        await expect(
            validatePublicMediaUrl("https://media.example/video.mp4", {
                validateRedirects: true,
            }),
        ).resolves.toMatchObject({ ok: false });
        expect(httpsRequest).toHaveBeenCalledTimes(1);
        expect(httpRequest).not.toHaveBeenCalled();
    });

    test("rejects redirect validation network failures", async () => {
        mockRequestSequence(httpsRequest, [
            { error: new Error("connection failed") },
        ]);

        await expect(
            validatePublicMediaUrl("https://media.example/video.mp4", {
                validateRedirects: true,
            }),
        ).resolves.toMatchObject({ ok: false });
    });
});
