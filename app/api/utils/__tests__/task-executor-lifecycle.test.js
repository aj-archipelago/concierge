/** @jest-environment node */
jest.mock("../../models/user.mjs", () => ({ __esModule: true, default: {} }));
jest.mock("../storage-grants.mjs", () => ({ grantsEnabled: () => false }));
jest.mock("../../../../jobs/graphql.mjs", () => ({
    SUBSCRIPTIONS: { REQUEST_PROGRESS: {} },
    getClient: jest.fn(),
}));
jest.mock("../../../../jobs/logger.js", () => ({ Logger: jest.fn() }));
jest.mock("../../../../src/utils/task-loader.mjs", () => ({
    loadTaskDefinition: jest.fn(),
}));
jest.mock("../../models/task.mjs", () => ({ __esModule: true, default: {} }));
jest.mock("../task-utils.mjs", () => ({
    copyTaskToChatMessage: jest.fn(),
    RESULT_DATA_REQUIRED_TASK_TYPES: new Set(["media-generation"]),
}));
jest.mock("../task-liveness.mjs", () => ({
    clearTaskCancellation: jest.fn(async () => {}),
    clearTaskLive: jest.fn(async () => {}),
    isTaskCancellationRequested: jest.fn(async () => false),
    markTaskLive: jest.fn(async () => {}),
    TASK_LIVE_RENEW_INTERVAL_MS: 30_000,
}));

const { CortexRequestTracker } = require("../task-executor.mjs");
const { loadTaskDefinition } = require("../../../../src/utils/task-loader.mjs");

function tracker(outputType = "image") {
    let observer;
    const client = {
        subscribe: () => ({
            subscribe: (callbacks) => {
                observer = callbacks;
                return { unsubscribe: jest.fn() };
            },
        }),
    };
    const value = new CortexRequestTracker(
        {
            id: "job",
            data: {
                taskId: "task",
                type: "media-generation",
                metadata: { outputType },
            },
        },
        client,
        {},
    );
    value.updateProgress = jest.fn(async (progress) => progress);
    value.updateRequestStatus = jest.fn(async (status, text, data) => ({
        status,
        data,
    }));
    value.isTaskActive = jest.fn(async () => true);
    return {
        value,
        send: (data) => observer.next({ data: { requestProgress: data } }),
    };
}

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

test("long provider polling followed by duplicate terminal delivery persists media exactly once", async () => {
    const { value, send } = tracker();
    const saved = {
        mediaItems: [
            { id: "saved-video", url: "https://example.com/saved.mp4" },
        ],
    };
    const handleCompletion = jest.fn(async () => saved);
    loadTaskDefinition.mockResolvedValue({ handleCompletion });
    const running = value.run("request");
    for (let minute = 0; minute < 12; minute++) {
        await jest.advanceTimersByTimeAsync(60_000);
        send({
            info: JSON.stringify({
                provider: "replicate",
                status: "processing",
            }),
        });
        await value.waitForPendingProgressUpdates();
    }
    const completion = {
        progress: 1,
        data: JSON.stringify({ url: "https://example.com/provider.mp4" }),
    };
    send(completion);
    send(completion);
    expect(await running).toEqual(saved);
    await value.waitForPendingProgressUpdates();
    expect(handleCompletion).toHaveBeenCalledTimes(1);
    expect(value.updateRequestStatus).toHaveBeenCalledWith(
        "completed",
        null,
        saved,
    );
    expect(jest.getTimerCount()).toBe(0);
});

test("worker lease heartbeats alone do not hide a stalled provider", async () => {
    const { value } = tracker();
    loadTaskDefinition.mockResolvedValue({});
    const running = value.run("request").catch((error) => error);
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(await running).toBeInstanceOf(Error);
    expect(value.updateRequestStatus).toHaveBeenCalledWith(
        "failed",
        expect.stringMatching(/inactivity|overall deadline/),
    );
    expect(jest.getTimerCount()).toBe(0);
});

test("a video can complete after 25 minutes without intermediate progress and saves once", async () => {
    const { value, send } = tracker("video");
    const saved = { mediaItems: [{ id: "long-video" }] };
    const handleCompletion = jest.fn(async () => saved);
    loadTaskDefinition.mockResolvedValue({ handleCompletion });
    const running = value.run("request");
    await jest.advanceTimersByTimeAsync(25 * 60_000);
    expect(value.settled).toBe(false);
    send({
        progress: 1,
        data: JSON.stringify({ url: "https://example.com/video.mp4" }),
    });
    expect(await running).toEqual(saved);
    expect(handleCompletion).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});

test("a silent video still fails after 30 minutes", async () => {
    const { value } = tracker("video");
    loadTaskDefinition.mockResolvedValue({});
    const running = value.run("request").catch((error) => error);
    await jest.advanceTimersByTimeAsync(30 * 60_000);
    expect((await running).message).toMatch(/30 minutes of inactivity/);
    expect(jest.getTimerCount()).toBe(0);
});

test("endless video provider progress stops at the 40 minute overall deadline", async () => {
    const { value, send } = tracker("video");
    loadTaskDefinition.mockResolvedValue({});
    const running = value.run("request").catch((error) => error);
    for (let minute = 0; minute < 40; minute++) {
        send({
            info: JSON.stringify({
                provider: "replicate",
                status: "processing",
            }),
        });
        await value.waitForPendingProgressUpdates();
        await jest.advanceTimersByTimeAsync(60_000);
    }
    expect((await running).message).toMatch(/40 minute overall deadline/);
    expect(jest.getTimerCount()).toBe(0);
});

test("endless provider liveness still reaches the overall deadline", async () => {
    const { value, send } = tracker();
    loadTaskDefinition.mockResolvedValue({});
    const running = value.run("request").catch((error) => error);
    for (let minute = 0; minute < 35; minute++) {
        send({
            info: JSON.stringify({
                provider: "replicate",
                status: "processing",
            }),
        });
        await value.waitForPendingProgressUpdates();
        await jest.advanceTimersByTimeAsync(60_000);
    }
    expect(await running).toBeInstanceOf(Error);
    expect(value.updateRequestStatus).toHaveBeenCalledWith(
        "failed",
        expect.stringMatching(/inactivity|overall deadline/),
    );
    expect(jest.getTimerCount()).toBe(0);
});
