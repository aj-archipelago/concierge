/** @jest-environment node */
import {
    sendGoogleChatMessage,
    googleChatErrorSummary,
} from "./google-chat-webhook.mjs";
const hook =
    "https://chat.googleapis.com/v1/spaces/test/messages?key=test&token=secret";
const originalFetch = global.fetch;
beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
});
afterEach(() => {
    global.fetch = originalFetch;
});
it("bounds delivery time and refuses redirects", async () => {
    expect(await sendGoogleChatMessage(hook, { text: "test" })).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
        hook,
        expect.objectContaining({
            method: "POST",
            redirect: "error",
            signal: expect.any(AbortSignal),
        }),
    );
});
it("rejects non-Google URLs and incomplete credentials without sending", async () => {
    for (const value of [
        "https://chat.googleapis.com.evil.test/v1/spaces/a/messages?key=k&token=t",
        "http://chat.googleapis.com/v1/spaces/a/messages?key=k&token=t",
        "https://chat.googleapis.com/v1/spaces/a/messages",
        "invalid",
    ]) {
        await expect(
            sendGoogleChatMessage(value, { text: "test" }),
        ).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
});
it.each([401, 403, 429, 500, 503])(
    "does not treat HTTP %s as delivery or blindly retry",
    async (status) => {
        fetch.mockResolvedValue({ ok: false, status });
        await expect(
            sendGoogleChatMessage(hook, { cardsV2: [] }, "fallback"),
        ).rejects.toMatchObject({ status });
        expect(fetch).toHaveBeenCalledTimes(1);
    },
);
it("redacts credentials and response bodies from diagnostics", () => {
    expect(
        googleChatErrorSummary({
            message: hook,
            response: { data: hook },
            status: 400,
        }),
    ).toEqual({ name: "GoogleChatNotificationError", status: 400 });
});
