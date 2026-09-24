/** @jest-environment node */
import { PollingMonitor } from "./polling-monitor.mjs";

test("monitor does not overlap checks, restart after close, or exit the process", async () => {
    jest.useFakeTimers();
    const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
    let finish;
    const monitor = new PollingMonitor();
    monitor.check = jest.fn(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    try {
        monitor.startMonitoring();
        monitor.startMonitoring();
        await Promise.resolve();
        jest.advanceTimersByTime(60000);
        expect(monitor.check).toHaveBeenCalledTimes(1);
        let closed = false;
        const closing = monitor.close().then(() => {
            closed = true;
        });
        await Promise.resolve();
        expect(closed).toBe(false);
        finish();
        await closing;
        monitor.startMonitoring();
        jest.advanceTimersByTime(60000);
        expect(monitor.check).toHaveBeenCalledTimes(1);
        expect(exit).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    } finally {
        exit.mockRestore();
        jest.useRealTimers();
    }
});
