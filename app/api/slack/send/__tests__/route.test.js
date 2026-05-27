/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

import { POST } from "../route";
import { getCurrentUser } from "../../../utils/auth";

function makeRequest(body) {
    return {
        json: jest.fn().mockResolvedValue(body),
    };
}

function makeUser(overrides = {}) {
    return {
        _id: "user-1",
        name: "Alex",
        email: "alex@example.com",
        profilePicture: "https://example.com/avatar.png",
        mcpServers: {
            slack: {
                type: "streamable-http",
                url: "https://mcp.slack.com/mcp",
                headers: { Authorization: "Bearer xoxp-user" },
                botToken: "xoxb-bot-123",
            },
        },
        ...overrides,
    };
}

function mockSlackFetch(handlers) {
    return jest.fn(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = url.replace("https://slack.com/api/", "").split("?")[0];
        const handler = handlers[method];
        if (!handler) {
            throw new Error(`Unexpected Slack call: ${method}`);
        }
        const result = await handler(url);
        return {
            ok: true,
            json: async () => result,
        };
    });
}

describe("POST /api/slack/send", () => {
    let originalFetch;

    beforeEach(() => {
        jest.clearAllMocks();
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("returns 401 when there is no authenticated user", async () => {
        getCurrentUser.mockResolvedValue(null);

        const res = await POST(makeRequest({ to: "C123", text: "hi" }));

        expect(res.status).toBe(401);
    });

    it("returns 400 when 'to' is missing", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        const res = await POST(makeRequest({ text: "hi" }));

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/to/);
    });

    it("returns 400 when 'text' is missing", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        const res = await POST(makeRequest({ to: "C123" }));

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/text/);
    });

    it("returns 400 when Slack is not connected with a bot token", async () => {
        getCurrentUser.mockResolvedValue(
            makeUser({
                mcpServers: {
                    slack: {
                        type: "streamable-http",
                        url: "https://mcp.slack.com/mcp",
                        headers: { Authorization: "Bearer xoxp-user" },
                    },
                },
            }),
        );

        const res = await POST(makeRequest({ to: "C123", text: "hi" }));

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/bot scope/i);
    });

    it("posts directly when 'to' is a channel ID", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        let postedBody;
        global.fetch = mockSlackFetch({
            "chat.postMessage": () => {
                return { ok: true, ts: "1.0", channel: "C123" };
            },
        });

        const realFetch = global.fetch;
        global.fetch = jest.fn(async (input, init) => {
            postedBody = init?.body ? JSON.parse(init.body) : null;
            return realFetch(input, init);
        });

        const res = await POST(
            makeRequest({ to: "C123ABC", text: "hello world" }),
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.channel).toBe("C123");

        expect(postedBody.channel).toBe("C123ABC");
        expect(postedBody.text).toContain("Alex via Concierge");
        expect(postedBody.blocks).toHaveLength(2);
        expect(postedBody.blocks[0].type).toBe("context");
        expect(postedBody.blocks[0].elements).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "image",
                    image_url: "https://example.com/avatar.png",
                }),
                expect.objectContaining({
                    type: "mrkdwn",
                    text: "*Sent by Alex via Concierge*",
                }),
            ]),
        );
        expect(postedBody.blocks[1]).toEqual({
            type: "section",
            text: { type: "mrkdwn", text: "hello world" },
        });
    });

    it("opens DM when 'to' is a user ID", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        const calls = [];
        global.fetch = jest.fn(async (input, init) => {
            const url = input.toString();
            const method = url
                .replace("https://slack.com/api/", "")
                .split("?")[0];
            calls.push({ method, body: init?.body && JSON.parse(init.body) });
            const responses = {
                "conversations.open": {
                    ok: true,
                    channel: { id: "D999" },
                },
                "chat.postMessage": {
                    ok: true,
                    ts: "1.0",
                    channel: "D999",
                },
            };
            return { ok: true, json: async () => responses[method] };
        });

        const res = await POST(makeRequest({ to: "U7777777", text: "hi" }));

        expect(res.status).toBe(200);
        expect(calls.map((call) => call.method)).toEqual([
            "conversations.open",
            "chat.postMessage",
        ]);
        expect(calls[0].body).toEqual({ users: "U7777777" });
        expect(calls[1].body.channel).toBe("D999");
    });

    it("looks up by email, opens DM, then posts when 'to' is an email", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        const calls = [];
        global.fetch = jest.fn(async (input, init) => {
            const url = input.toString();
            const method = url
                .replace("https://slack.com/api/", "")
                .split("?")[0];
            calls.push({
                method,
                url,
                body: init?.body && JSON.parse(init.body),
            });
            const responses = {
                "users.lookupByEmail": {
                    ok: true,
                    user: { id: "U42" },
                },
                "conversations.open": {
                    ok: true,
                    channel: { id: "D42" },
                },
                "chat.postMessage": {
                    ok: true,
                    ts: "1.0",
                    channel: "D42",
                },
            };
            return { ok: true, json: async () => responses[method] };
        });

        const res = await POST(
            makeRequest({ to: "casey@example.com", text: "ping" }),
        );

        expect(res.status).toBe(200);
        expect(calls.map((call) => call.method)).toEqual([
            "users.lookupByEmail",
            "conversations.open",
            "chat.postMessage",
        ]);
        expect(calls[0].url).toContain("email=casey%40example.com");
        expect(calls[1].body).toEqual({ users: "U42" });
        expect(calls[2].body.channel).toBe("D42");
    });

    it("includes thread_ts when threadTs is provided", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        let postedBody;
        global.fetch = jest.fn(async (input, init) => {
            postedBody = init?.body && JSON.parse(init.body);
            return {
                ok: true,
                json: async () => ({ ok: true, ts: "2.0", channel: "C1" }),
            };
        });

        const res = await POST(
            makeRequest({
                to: "C111",
                text: "reply",
                threadTs: "1700000000.000100",
            }),
        );

        expect(res.status).toBe(200);
        expect(postedBody.thread_ts).toBe("1700000000.000100");
    });

    it("surfaces actionable Slack errors as 400 with the error code", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ ok: false, error: "channel_not_found" }),
        }));

        const res = await POST(makeRequest({ to: "C404", text: "hi" }));

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.slackError).toBe("channel_not_found");
        expect(body.error).toMatch(/channel_not_found/);
    });

    it("returns 500 for unexpected Slack errors", async () => {
        getCurrentUser.mockResolvedValue(makeUser());

        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ ok: false, error: "internal_error" }),
        }));

        const res = await POST(makeRequest({ to: "C111", text: "hi" }));

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toMatch(/Failed/);
    });
});
