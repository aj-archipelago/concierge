/** @jest-environment node */
import { getClient } from "../graphql.mjs";
import { runDigestQuery } from "./async-query.js";

jest.mock("../graphql.mjs", () => ({
    getClient: jest.fn(),
    SUBSCRIPTIONS: { REQUEST_PROGRESS: "progress" },
    MUTATIONS: { CANCEL_REQUEST: "cancel" },
}));

const requestId = "e08c856a-4681-49a6-9ac2-3324ff1e9a79";
let observer;
let client;
let unsubscribe;
let logger;
const start = () =>
    runDigestQuery({
        query: "agent",
        field: "sys_entity_agent",
        variables: { model: "chosen-model" },
        timeoutMs: 300_000,
        logger,
    });

beforeEach(() => {
    jest.useFakeTimers();
    unsubscribe = jest.fn();
    logger = { log: jest.fn() };
    client = {
        query: jest.fn().mockResolvedValue({
            data: { sys_entity_agent: { result: requestId } },
        }),
        subscribe: jest.fn(() => ({
            subscribe: (handlers) => {
                observer = handlers;
                return { unsubscribe };
            },
        })),
        mutate: jest.fn().mockResolvedValue({}),
        stop: jest.fn(),
    };
    getClient.mockResolvedValue(client);
});
afterEach(() => {
    jest.useRealTimers();
});

it.each([
    [
        "provider failure",
        (o) =>
            o.next({
                data: {
                    requestProgress: {
                        progress: 1,
                        data: '"partial"',
                        error: "Provider unavailable",
                    },
                },
            }),
        "Provider unavailable",
    ],
    [
        "socket failure",
        (o) => o.error(new Error("Socket closed")),
        "Socket closed",
    ],
    ["early completion", (o) => o.complete(), "ended before completion"],
    [
        "GraphQL error",
        (o) => o.next({ errors: [{ message: "Rejected" }] }),
        "subscription failed",
    ],
    [
        "invalid JSON",
        (o) =>
            o.next({
                data: { requestProgress: { progress: 1, data: "not JSON" } },
            }),
        "invalid or empty",
    ],
    [
        "empty response",
        (o) =>
            o.next({ data: { requestProgress: { progress: 1, data: '""' } } }),
        "invalid or empty",
    ],
])("rejects %s and releases the subscription", async (_name, emit, message) => {
    const pending = start();
    const failed = pending.catch((error) => error);
    await jest.advanceTimersByTimeAsync(0);
    emit(observer);
    expect(await failed).toEqual(
        expect.objectContaining({ message: expect.stringContaining(message) }),
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { requestId } }),
    );
    expect(client.stop).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});

it("bounds the wait and cancels without replaying the agent", async () => {
    const pending = start();
    const failed = pending.catch((error) => error);
    await jest.advanceTimersByTimeAsync(300_001);
    expect(await failed).toEqual(
        expect.objectContaining({
            message: expect.stringContaining("timed out"),
        }),
    );
    observer.next({
        data: { requestProgress: { progress: 1, data: '"late"' } },
    });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.mutate).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});

it("does not let cancellation failure replace the original error", async () => {
    client.mutate.mockRejectedValue(new Error("Cancellation unavailable"));
    const pending = start();
    const failed = pending.catch((error) => error);
    await jest.advanceTimersByTimeAsync(0);
    observer.error(new Error("Socket closed"));
    expect(await failed).toEqual(
        expect.objectContaining({
            message: expect.stringContaining("Socket closed"),
        }),
    );
    expect(jest.getTimerCount()).toBe(0);
});

it("aborts an unresponsive registration request", async () => {
    client.query.mockImplementation(
        ({ context }) =>
            new Promise((_resolve, reject) => {
                context.fetchOptions.signal.addEventListener("abort", () =>
                    reject(new Error("Registration aborted")),
                );
            }),
    );
    const pending = start();
    const failed = pending.catch((error) => error);
    await jest.advanceTimersByTimeAsync(30_001);
    expect(await failed).toEqual(
        expect.objectContaining({
            message: expect.stringContaining("Registration aborted"),
        }),
    );
    expect(client.subscribe).not.toHaveBeenCalled();
    expect(client.mutate).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});

it.each([
    { data: { sys_entity_agent: { result: "report instead of request ID" } } },
    { data: { sys_entity_agent: { result: requestId, errors: ["rejected"] } } },
    { errors: [{ message: "rejected" }] },
])("rejects invalid registration responses", async (response) => {
    client.query.mockResolvedValue(response);
    await expect(start()).rejects.toThrow();
    expect(client.subscribe).not.toHaveBeenCalled();
    expect(client.stop).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});

it("logs only a redacted message, request ID, and elapsed time", async () => {
    const error = new Error(
        "Failed https://example.test/graphql?cortex-api-key=test-secret",
    );
    error.response = {
        body: "private response",
        url: "https://example.test/?token=test-secret",
    };
    client.query.mockRejectedValue(error);
    await expect(start()).rejects.not.toThrow("test-secret");
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(
        /test-secret|private response/,
    );
    expect(JSON.stringify(logger.log.mock.calls)).toContain("elapsedMs=");
});

it("bypasses the cache and preserves the selected model", async () => {
    const pending = start();
    await jest.advanceTimersByTimeAsync(0);
    observer.next({
        data: {
            requestProgress: { progress: 0.5, error: "recoverable tool error" },
        },
    });
    observer.next({
        data: { requestProgress: { progress: 1, data: '"report"' } },
    });
    await expect(pending).resolves.toMatchObject({ result: "report" });
    expect(client.query).toHaveBeenCalledWith(
        expect.objectContaining({
            fetchPolicy: "no-cache",
            variables: { async: true, model: "chosen-model" },
        }),
    );
    expect(client.mutate).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});
