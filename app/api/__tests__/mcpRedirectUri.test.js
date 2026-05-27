/**
 * @jest-environment node
 */

import { normalizeAtlassianMcpRedirectUri } from "../utils/mcpRedirectUri.js";

describe("normalizeAtlassianMcpRedirectUri", () => {
    const origPublic = process.env.NEXT_PUBLIC_APP_URL;
    const origBase = process.env.NEXT_PUBLIC_BASE_PATH;

    afterEach(() => {
        process.env.NEXT_PUBLIC_APP_URL = origPublic;
        process.env.NEXT_PUBLIC_BASE_PATH = origBase;
    });

    function mockRequest(host, proto) {
        return {
            headers: {
                get: (name) => {
                    if (name === "x-forwarded-host") {
                        return null;
                    }
                    if (name === "host") {
                        return host;
                    }
                    if (name === "x-forwarded-proto") {
                        return proto;
                    }
                    return null;
                },
            },
        };
    }

    test("keeps absolute URI when NEXT_PUBLIC_APP_URL is unset", () => {
        delete process.env.NEXT_PUBLIC_APP_URL;
        delete process.env.NEXT_PUBLIC_BASE_PATH;
        expect(
            normalizeAtlassianMcpRedirectUri("http://localhost:3000/code/jira"),
        ).toBe("http://localhost:3000/code/jira");
    });

    test("repairs null/code/jira using NEXT_PUBLIC_APP_URL", () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://concierge.example.com";
        delete process.env.NEXT_PUBLIC_BASE_PATH;
        expect(normalizeAtlassianMcpRedirectUri("null/code/jira")).toBe(
            "https://concierge.example.com/code/jira",
        );
    });

    test("repairs null/code/jira using request Host when env unset", () => {
        delete process.env.NEXT_PUBLIC_APP_URL;
        delete process.env.NEXT_PUBLIC_BASE_PATH;
        expect(
            normalizeAtlassianMcpRedirectUri(
                "null/code/jira",
                mockRequest("localhost:3000", "http"),
            ),
        ).toBe("http://localhost:3000/code/jira");
    });

    test("rewrites origin using NEXT_PUBLIC_APP_URL", () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://concierge.example.com";
        delete process.env.NEXT_PUBLIC_BASE_PATH;
        expect(
            normalizeAtlassianMcpRedirectUri("http://localhost:3000/code/jira"),
        ).toBe("https://concierge.example.com/code/jira");
    });

    test("prepends NEXT_PUBLIC_BASE_PATH when path omits it", () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://concierge.example.com";
        process.env.NEXT_PUBLIC_BASE_PATH = "/concierge";
        expect(
            normalizeAtlassianMcpRedirectUri("http://localhost:3000/code/jira"),
        ).toBe("https://concierge.example.com/concierge/code/jira");
    });
});
