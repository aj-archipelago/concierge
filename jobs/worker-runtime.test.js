/** @jest-environment node */
import { managedWorker } from "./managed-worker.js";
import { workerRuntime } from "./worker-runtime.js";

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

test("shutdown starts every drain before waiting and closes storage last", async () => {
    const finishes = [deferred(), deferred(), deferred()];
    const workers = finishes.map((done) => ({
        run: jest.fn().mockResolvedValue(),
        close: jest.fn(() => done.promise),
    }));
    const monitor = {
        startMonitoring: jest.fn(),
        close: jest.fn().mockResolvedValue(),
    };
    const disconnect = jest.fn();
    const runtime = workerRuntime({
        workers,
        monitors: [monitor],
        connect: jest.fn(),
        disconnect,
    });
    await runtime.run(jest.fn());
    const closing = runtime.close();
    expect(runtime.close()).toBe(closing);
    workers.forEach((worker) => expect(worker.close).toHaveBeenCalledTimes(1));
    expect(monitor.close).toHaveBeenCalledTimes(1);
    finishes[0].resolve();
    finishes[1].resolve();
    await Promise.resolve();
    expect(disconnect).not.toHaveBeenCalled();
    finishes[2].resolve();
    await closing;
    expect(disconnect).toHaveBeenCalledTimes(1);
    await runtime.run(jest.fn());
    workers.forEach((worker) => expect(worker.run).toHaveBeenCalledTimes(1));
});

test("SIGTERM during database startup prevents later consumers or monitors", async () => {
    const connected = deferred();
    const worker = { run: jest.fn(), close: jest.fn() };
    const monitor = { startMonitoring: jest.fn(), close: jest.fn() };
    const disconnect = jest.fn();
    const runtime = workerRuntime({
        workers: [worker],
        monitors: [monitor],
        connect: () => connected.promise,
        disconnect,
    });
    const starting = runtime.run(jest.fn());
    const closing = runtime.close();
    expect(disconnect).not.toHaveBeenCalled();
    connected.resolve();
    await Promise.all([starting, closing]);
    expect(worker.run).not.toHaveBeenCalled();
    expect(monitor.startMonitoring).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
});

test("consumer starts once and reports a rejected run loop", async () => {
    const running = deferred();
    const worker = {
        on: jest.fn(),
        run: jest.fn(() => running.promise),
        waitUntilReady: jest.fn(),
        close: jest.fn(),
    };
    const create = jest.fn(() => worker);
    const consumer = managedWorker(create);
    const onError = jest.fn();
    await Promise.all([consumer.run(onError), consumer.run(onError)]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(worker.run).toHaveBeenCalledTimes(1);
    const error = new Error("run failed");
    running.reject(error);
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(error);
    await consumer.close();
    await consumer.run(onError);
    expect(create).toHaveBeenCalledTimes(1);
});

test("close during schedule registration cannot create a consumer afterwards", async () => {
    const prepared = deferred();
    const create = jest.fn();
    const consumer = managedWorker(create, () => prepared.promise);
    const starting = consumer.run(jest.fn());
    const closing = consumer.close();
    prepared.resolve();
    await Promise.all([starting, closing]);
    expect(create).not.toHaveBeenCalled();
});

test("a failed drain does not skip other drains or storage cleanup", async () => {
    const disconnect = jest.fn();
    const close = jest.fn();
    const runtime = workerRuntime({
        workers: [
            { close: () => Promise.reject(new Error("close failed")) },
            { close },
        ],
        monitors: [],
        connect: jest.fn(),
        disconnect,
    });
    await expect(runtime.close()).rejects.toThrow("Worker shutdown failed");
    expect(close).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
});
