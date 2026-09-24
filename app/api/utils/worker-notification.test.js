/** @jest-environment node */
import {
    buildWorkerMessage,
    notifyWorkerAlert,
} from "./worker-notification.mjs";
const hook =
    "https://chat.googleapis.com/v1/spaces/worker-test/messages?key=test&token=test";
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    process.env.GOOGLE_CHAT_WORKER_WEBHOOK_URL = hook;
    process.env.GOOGLE_CHAT_FEEDBACK_WEBHOOK_URL =
        "https://chat.googleapis.com/v1/spaces/feedback-test/messages?key=test&token=test";
});
afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    for (const key of [
        "GOOGLE_CHAT_WORKER_WEBHOOK_URL",
        "GOOGLE_CHAT_FEEDBACK_WEBHOOK_URL",
    ]) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
});
it("posts queue failures only to the worker feed with counts and environment", async () => {
    expect(
        await notifyWorkerAlert({
            queueName: "task",
            failureRate: 0.25,
            environment: "dev",
            containerAppName: "concierge-workers-dev",
        }),
    ).toBe(true);
    expect(fetch.mock.calls[0][0]).toBe(hook);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain("(dev)");
    expect(body.text).toContain("25.00%");
    const details =
        body.cardsV2[0].card.sections[0].widgets[0].textParagraph.text;
    expect(details).toContain("20.00%");
    expect(details).toContain("10 minutes");
    expect(details).toContain("concierge-workers-dev");
});
it("formats pending-job alerts separately from failure alerts", () => {
    const payload = buildWorkerMessage({
        queueName: "digest-build",
        pendingJobs: 12,
        oldestWaitingJobAgeMs: 360000,
    });
    expect(payload.text).toContain("12 pending jobs");
    expect(JSON.stringify(payload)).not.toContain("Failure Rate");
    expect(JSON.stringify(payload)).toContain("360 seconds");
});
it("returns false on rejected delivery so monitoring does not consume the cooldown", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    fetch.mockResolvedValue({ ok: false, status: 429 });
    expect(
        await notifyWorkerAlert({ queueName: "task", failureRate: 0.5 }),
    ).toBe(false);
});
it("never falls back to the feedback space when the worker hook is missing", async () => {
    delete process.env.GOOGLE_CHAT_WORKER_WEBHOOK_URL;
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(
        await notifyWorkerAlert({ queueName: "task", failureRate: 0.5 }),
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
});
