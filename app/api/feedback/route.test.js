/** @jest-environment node */
import Feedback from "../models/feedback";
import { getCurrentUser } from "../utils/auth";
import { POST } from "./route";
jest.mock("../models/feedback", () => ({ create: jest.fn() }));
jest.mock("../utils/auth", () => ({ getCurrentUser: jest.fn() }));

const webhook =
    "https://chat.googleapis.com/v1/spaces/feedback-test/messages?key=test&token=secret-test";
const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const flush = () => new Promise((resolve) => setImmediate(resolve));
function request(body) {
    return {
        json: async () => body,
        headers: new Headers({
            host: "concierge.test",
            "x-forwarded-proto": "https",
        }),
    };
}
function payload(call = 0) {
    return JSON.parse(fetch.mock.calls[call][1].body);
}
beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    process.env.GOOGLE_CHAT_FEEDBACK_WEBHOOK_URL = webhook;
    process.env.GOOGLE_CHAT_WORKER_WEBHOOK_URL =
        "https://chat.googleapis.com/v1/spaces/worker-test/messages?key=test&token=worker";
    process.env.GOOGLE_CHAT_NOTIFICATION_ENV = "test";
    delete process.env.NEXT_PUBLIC_APP_URL;
    getCurrentUser.mockResolvedValue({
        _id: "user-1",
        name: "Hammad",
        username: "hammad@example.com",
    });
    Feedback.create.mockImplementation(async (data) => ({
        _id: "feedback-1",
        ...data,
    }));
});
afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    for (const key of [
        "GOOGLE_CHAT_FEEDBACK_WEBHOOK_URL",
        "GOOGLE_CHAT_WORKER_WEBHOOK_URL",
        "GOOGLE_CHAT_NOTIFICATION_ENV",
        "NEXT_PUBLIC_APP_URL",
    ]) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
    jest.restoreAllMocks();
});
it("persists feedback and posts its image, context and admin link only to the feedback space", async () => {
    const response = await POST(
        request({
            message: "  Screenshot failed  ",
            category: "bug",
            screenshot: "https://files.test/screenshot.jpg",
            pageUrl: "https://concierge.test/chat",
            userAgent: "Jest",
        }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        success: true,
        feedbackId: "feedback-1",
    });
    await flush();
    expect(Feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
            message: "Screenshot failed",
            category: "bug",
            source: "user",
            user: "user-1",
        }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(webhook);
    const message = payload();
    expect(message.text).toContain("(test)");
    expect(message.text).toContain(
        "https://concierge.test/admin/feedback?selected=feedback-1",
    );
    const widgets = message.cardsV2[0].card.sections[0].widgets;
    expect(widgets).toContainEqual({
        image: {
            imageUrl: "https://files.test/screenshot.jpg",
            altText: "Feedback image",
        },
    });
    expect(widgets).toContainEqual({
        buttonList: {
            buttons: [
                {
                    text: "View in admin",
                    onClick: {
                        openLink: {
                            url: "https://concierge.test/admin/feedback?selected=feedback-1",
                        },
                    },
                },
            ],
        },
    });
});
it("responds after persistence while a fresh SAS image waits in the background", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-11T12:00:00Z"));
    const response = await POST(
        request({
            message: "Fresh image",
            screenshot:
                "https://files.test/image.jpg?st=2026-09-11T12%3A00%3A00Z",
        }),
    );
    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects empty or unauthenticated submissions without notifying", async () => {
    expect((await POST(request({ message: " " }))).status).toBe(400);
    getCurrentUser.mockResolvedValue(null);
    expect((await POST(request({ message: "hello" }))).status).toBe(401);
    expect(Feedback.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});
it("does not notify when persistence fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    Feedback.create.mockRejectedValue(new Error("Database offline"));
    expect((await POST(request({ message: "hello" }))).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
});
it("preserves saved feedback if Chat fails and never logs the webhook or provider body", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    fetch.mockRejectedValue(new Error(webhook));
    const response = await POST(request({ message: "Saved despite timeout" }));
    await flush();
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-test");
    expect(log).toHaveBeenCalledWith(
        "Feedback Google Chat notification failed",
        { name: "GoogleChatNotificationError", status: null },
    );
});
it("falls back to plain text with the admin link when Google rejects the rich card", async () => {
    fetch
        .mockResolvedValueOnce({ ok: false, status: 400 })
        .mockResolvedValueOnce({ ok: true, status: 200 });
    expect(
        (
            await POST(
                request({
                    message: "Image rejected",
                    screenshot: "https://files.test/image.jpg",
                }),
            )
        ).status,
    ).toBe(200);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(payload(0).cardsV2).toBeDefined();
    expect(payload(1)).toEqual({
        text: expect.stringContaining("/admin/feedback?selected=feedback-1"),
    });
});
it("preserves agent and Arabic feedback and escapes user-controlled card markup", async () => {
    await POST(
        request({
            message: "مرحبا <b>test</b> & <users/all>",
            source: "agent",
            category: "other",
        }),
    );
    await flush();
    expect(Feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: "agent" }),
    );
    const widgets = payload().cardsV2[0].card.sections[0].widgets;
    expect(widgets[0].textParagraph.text).toContain("<b>Source:</b> Agent");
    expect(widgets[1].textParagraph.text).toBe(
        "مرحبا &lt;b&gt;test&lt;/b&gt; &amp; &lt;users/all&gt;",
    );
});
it("keeps feedback in admin without falling back to Slack when the Chat hook is missing", async () => {
    delete process.env.GOOGLE_CHAT_FEEDBACK_WEBHOOK_URL;
    jest.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(request({ message: "Saved" }))).status).toBe(200);
    await flush();
    expect(fetch).not.toHaveBeenCalled();
});
