/** @jest-environment node */
import { executeTask, CortexRequestTracker } from "./task-executor.mjs";
import Task from "../models/task.mjs";
import { getClient } from "../../../jobs/graphql.mjs";
import { loadTaskDefinition } from "../../../src/utils/task-loader.mjs";
import { isTaskCancellationRequested } from "./task-liveness.mjs";
jest.mock("../models/task.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock("./storage-grants.mjs", () => ({ grantsEnabled: () => false }));
jest.mock("../../../jobs/graphql.mjs", () => ({
    getClient: jest.fn(),
    SUBSCRIPTIONS: { REQUEST_PROGRESS: {} },
}));
jest.mock("../../../jobs/logger.js", () => ({
    Logger: jest.fn(() => ({ log: jest.fn() })),
}));
jest.mock("../../../src/utils/task-loader.mjs", () => ({
    loadTaskDefinition: jest.fn(),
}));
jest.mock("./task-utils.mjs", () => ({
    copyTaskToChatMessage: jest.fn(),
    RESULT_DATA_REQUIRED_TASK_TYPES: new Set(["automation-run"]),
}));
jest.mock("./task-liveness.mjs", () => ({
    markTaskLive: jest.fn().mockResolvedValue({}),
    clearTaskLive: jest.fn().mockResolvedValue(),
    clearTaskCancellation: jest.fn().mockResolvedValue(),
    isTaskCancellationRequested: jest.fn(),
    TASK_LIVE_RENEW_INTERVAL_MS: 5000,
}));
let row, client, handler, sink;
beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    row = { _id: "task", status: "pending" };
    Task.findOne.mockImplementation(() => {
        const result = Promise.resolve(row);
        result.select = () =>
            Promise.resolve(
                ["pending", "in_progress"].includes(row.status) ? row : null,
            );
        return result;
    });
    Task.findOneAndUpdate.mockImplementation(async (_query, update) => {
        if (!["pending", "in_progress"].includes(row.status)) return null;
        Object.assign(row, update);
        return row;
    });
    client = {
        stop: jest.fn(),
        subscribe: () => ({
            subscribe: (receiver) => {
                sink = receiver;
                return { unsubscribe: jest.fn() };
            },
        }),
    };
    getClient.mockResolvedValue(client);
    handler = {
        startRequest: jest.fn().mockResolvedValue("request"),
        handleCompletion: jest.fn(async () => ({ result: "done" })),
        handleError: jest.fn(),
        cancelRequest: jest.fn(),
    };
    loadTaskDefinition.mockResolvedValue(handler);
    isTaskCancellationRequested.mockResolvedValue(false);
});
afterEach(() => jest.useRealTimers());
const data = {
    taskId: "task",
    userId: "user",
    type: "automation-run",
    metadata: {},
};
it("cleans up heartbeat and client when synchronous digest work finishes", async () => {
    handler.startRequest.mockResolvedValue(undefined);
    await executeTask({ ...data, type: "build-digest" }, { id: "job" });
    expect(row.status).toBe("completed");
    expect(client.stop).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});
it.each(["automation-run", "assistant-run"])(
    "total deadline interrupts %s startup and aborts its signal",
    async (type) => {
        let signal;
        handler.startRequest.mockImplementation((job) => {
            signal = job.signal;
            return new Promise(() => {});
        });
        const running = executeTask(
            { ...data, type },
            {
                id: "job",
                backgroundDeadline: Date.now() + 1000,
            },
        ).catch((e) => e);
        await jest.advanceTimersByTimeAsync(1001);
        expect((await running).message).toContain("total runtime");
        expect(signal.aborted).toBe(true);
        expect(handler.cancelRequest).toHaveBeenCalledTimes(1);
        expect(row.status).toBe("failed");
        expect(jest.getTimerCount()).toBe(0);
    },
);
it("cancellation interrupts digest startup instead of waiting for a subscription", async () => {
    handler.startRequest.mockImplementation(
        (job) =>
            new Promise((_, reject) =>
                job.signal.addEventListener("abort", () =>
                    reject(job.signal.reason),
                ),
            ),
    );
    isTaskCancellationRequested.mockResolvedValue(true);
    const running = executeTask(
        { ...data, type: "build-digest" },
        { id: "job" },
    ).catch((e) => e);
    await jest.advanceTimersByTimeAsync(5001);
    expect((await running).message).toBe("Task cancelled");
    expect(row.status).toBe("cancelled");
    expect(jest.getTimerCount()).toBe(0);
});
it("serializes duplicate completion events to exactly one output save", async () => {
    const running = executeTask(data, { id: "job" });
    await jest.advanceTimersByTimeAsync(1);
    const event = {
        data: {
            requestProgress: {
                progress: 1,
                data: JSON.stringify({ result: "done" }),
            },
        },
    };
    sink.next(event);
    sink.next(event);
    await running;
    expect(handler.handleCompletion).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("completed");
    expect(jest.getTimerCount()).toBe(0);
});
it("ordinary progress does not extend the absolute deadline", async () => {
    const controller = new AbortController();
    const tracker = new CortexRequestTracker(
        { data, id: "job", deadline: Date.now() + 1000, controller },
        client,
        { log: jest.fn() },
    );
    const result = tracker.promise.catch((e) => e);
    tracker.startBoundedLifecycle();
    await jest.advanceTimersByTimeAsync(800);
    tracker.resetIdleTimeout();
    await jest.advanceTimersByTimeAsync(201);
    expect((await result).message).toContain("total runtime");
    expect(controller.signal.aborted).toBe(true);
});

it("does not start or cancel a task that already completed", async () => {
    row.status = "completed";
    await executeTask(data, { id: "job" });
    expect(handler.startRequest).not.toHaveBeenCalled();
    expect(handler.cancelRequest).not.toHaveBeenCalled();
    expect(client.stop).toHaveBeenCalledTimes(1);
});
