/** @jest-environment node */
import { notifyWorkerAlert } from "./worker-notification.mjs";
jest.mock("bullmq", () => ({ Queue: jest.fn() }));
jest.mock("./redis.mjs", () => ({ getRedisConnection: jest.fn(() => ({})) }));
jest.mock("./worker-notification.mjs", () => ({
    notifyWorkerAlert: jest.fn(),
}));
let QueueMonitor;
beforeAll(() => {
    const on = jest.spyOn(process, "on").mockReturnValue(process);
    try {
        ({ QueueMonitor } = require("./queue-monitor.mjs"));
        expect(
            on.mock.calls.filter(([event]) =>
                ["SIGTERM", "SIGINT", "exit"].includes(event),
            ),
        ).toEqual([]);
    } finally {
        on.mockRestore();
    }
});
beforeEach(() => jest.clearAllMocks());
it.each([false, true])(
    "advances cooldown only when worker delivery succeeds (%s)",
    async (delivered) => {
        const monitor = Object.create(QueueMonitor.prototype);
        const queue = {
            isPaused: jest.fn().mockResolvedValue(false),
            getActiveCount: jest.fn().mockResolvedValue(0),
            toKey: (key) => `bull:task:${key}`,
            getJobCounts: jest.fn().mockResolvedValue({}),
            getJobs: jest.fn().mockResolvedValue([]),
        };
        monitor.queues = new Map([["task", queue]]);
        monitor.redis = {
            get: jest.fn().mockResolvedValue(null),
            zcount: jest.fn(async (key) => (key.endsWith("completed") ? 9 : 3)),
            set: jest.fn().mockResolvedValue("OK"),
        };
        notifyWorkerAlert.mockResolvedValue(delivered);
        await monitor.checkQueues();
        expect(queue.getJobs).toHaveBeenCalledWith(
            ["waiting", "prioritized"],
            0,
            99,
            true,
        );
        expect(monitor.redis.zcount).toHaveBeenCalledTimes(2);
        expect(notifyWorkerAlert).toHaveBeenCalledWith({
            queueName: "task",
            failureRate: 0.25,
            pendingJobs: null,
            threshold: 0.2,
        });
        expect(monitor.redis.set).toHaveBeenCalledTimes(delivered ? 1 : 0);
    },
);

it.each([false, true])(
    "reports an old waiting job without needing completions (paused=%s)",
    async (paused) => {
        const now = Date.now();
        const monitor = Object.create(QueueMonitor.prototype);
        const queue = {
            isPaused: jest.fn().mockResolvedValue(paused),
            toKey: (key) => `bull:task:${key}`,
            getJobCounts: jest.fn().mockResolvedValue({ waiting: 1 }),
            getActiveCount: jest.fn().mockResolvedValue(2),
            getJobs: jest.fn(async (states) =>
                states.includes("waiting")
                    ? [{ timestamp: now - 6 * 60 * 1000 }]
                    : [],
            ),
        };
        monitor.queues = new Map([["task", queue]]);
        monitor.redis = {
            get: jest.fn().mockResolvedValue(null),
            zcount: jest.fn().mockResolvedValue(0),
            set: jest.fn(),
        };
        notifyWorkerAlert.mockResolvedValue(true);
        await monitor.checkQueues();
        expect(notifyWorkerAlert.mock.calls).toEqual(
            paused
                ? []
                : [
                      [
                          expect.objectContaining({
                              pendingJobs: 1,
                              oldestWaitingJobAgeMs: expect.any(Number),
                          }),
                      ],
                  ],
        );
    },
);
