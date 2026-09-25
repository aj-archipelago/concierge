/** @jest-environment node */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import Redis from "ioredis";
import Task from "../app/api/models/task.mjs";
import { getTaskLiveState } from "../app/api/utils/task-liveness.mjs";
import {
    ACQUIRE_ASSISTANT,
    RELEASE_ASSISTANT,
    ACQUIRE_BACKGROUND,
    RELEASE_BACKGROUND,
    processWithBackgroundAdmission,
} from "./background-admission.mjs";
import { publishTaskScaleMetric } from "./task-scale-monitor.js";
let mockRedis, server, directory;
jest.mock("../app/api/utils/redis.mjs", () => ({
    getRedisConnection: () => mockRedis,
}));
jest.mock("../app/api/models/task.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock("../app/api/utils/task-liveness.mjs", () => ({
    getTaskLiveState: jest.fn(),
}));
beforeAll(async () => {
    directory = await mkdtemp(`${tmpdir()}/background-budget-`);
    server = spawn("redis-server", [
        "--port",
        "0",
        "--unixsocket",
        `${directory}/redis.sock`,
        "--save",
        "",
        "--appendonly",
        "no",
    ]);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.stdout.on("data", (chunk) => {
            if (
                String(chunk)
                    .toLowerCase()
                    .includes("ready to accept connections")
            )
                resolve();
        });
        server.once("exit", (code) =>
            reject(new Error(`Redis exited ${code}`)),
        );
    });
    mockRedis = new Redis({
        path: `${directory}/redis.sock`,
        maxRetriesPerRequest: null,
    });
}, 15000);
afterAll(async () => {
    await mockRedis?.quit();
    server?.kill();
    await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
    jest.clearAllMocks();
    await mockRedis.flushdb();
});
const acquire = (owner, token, ttl = 60000) =>
    mockRedis.eval(
        ACQUIRE_BACKGROUND,
        2,
        "runs",
        `owner:${owner}`,
        token,
        6,
        ttl,
    );
it("admits exactly six across competing replicas and one per owner", async () => {
    const results = await Promise.all(
        Array.from({ length: 40 }, (_, i) => acquire(i, `lease-${i}`)),
    );
    expect(results.filter(Boolean)).toHaveLength(6);
    expect(await acquire(0, "second")).toBe(0);
    expect(
        await mockRedis.eval(
            RELEASE_BACKGROUND,
            2,
            "runs",
            "owner:0",
            "wrong-token",
        ),
    ).toBe(0);
    expect(await mockRedis.zcard("runs")).toBe(6);
    await mockRedis.eval(RELEASE_BACKGROUND, 2, "runs", "owner:0", "lease-0");
    expect(await acquire(40, "replacement")).toBeGreaterThan(0);
});
it("recovers expired leases without an old worker releasing its successor", async () => {
    await acquire("one", "old", 20);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(await acquire("one", "new")).toBeGreaterThan(0);
    expect(
        await mockRedis.eval(RELEASE_BACKGROUND, 2, "runs", "owner:one", "old"),
    ).toBe(0);
    expect(await mockRedis.get("owner:one")).toBe("new");
});
it("interactive jobs bypass the background budget and database reads", async () => {
    const execute = jest.fn().mockResolvedValue("interactive");
    const job = { data: { type: "transcribe" } };
    expect(await processWithBackgroundAdmission(job, "token", execute)).toBe(
        "interactive",
    );
    expect(Task.findById).not.toHaveBeenCalled();
});
it("defers a busy owner without executing or consuming a retry", async () => {
    await mockRedis.set("background:runs:owner:user", "other", "PX", 60000);
    Task.findById.mockResolvedValue({
        _id: "task",
        owner: "user",
        status: "pending",
    });
    const job = {
        id: "job",
        data: { taskId: "task", userId: "user", type: "build-digest" },
        moveToDelayed: jest.fn(),
    };
    const execute = jest.fn();
    await expect(
        processWithBackgroundAdmission(job, "lock", execute),
    ).rejects.toThrow("bullmq:movedToDelayed");
    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), "lock");
    expect(execute).not.toHaveBeenCalled();
    expect(Task.findById).not.toHaveBeenCalled();
});
it("does not replay a started agent after a crash", async () => {
    Task.findById.mockResolvedValue({
        _id: "task",
        owner: "user",
        status: "in_progress",
        executionStartedAt: new Date(),
    });
    getTaskLiveState.mockResolvedValue(null);
    const execute = jest.fn();
    await processWithBackgroundAdmission(
        { data: { taskId: "task", userId: "user", type: "automation-run" } },
        "lock",
        execute,
    );
    expect(execute).not.toHaveBeenCalled();
    expect(Task.findOneAndUpdate.mock.calls[0][1].$set.status).toBe(
        "abandoned",
    );
});
it("counts admission-deferred backlog but excludes ordinary future jobs and paused queues", async () => {
    const future = (Date.now() + 60000) * 4096;
    await mockRedis.zadd(
        "bull:task:delayed",
        future,
        "background",
        future,
        "future",
    );
    await mockRedis.zadd(
        "background:runs:waiting",
        Date.now(),
        "background",
        Date.now(),
        "ghost",
    );
    let sample = await publishTaskScaleMetric(mockRedis, { intervalMs: 0 });
    expect(sample.demand).toBe(1);
    expect(sample.backgroundWaiting).toBe(1);
    await mockRedis.hset("bull:task:meta", "paused", "1");
    sample = await publishTaskScaleMetric(mockRedis, { intervalMs: 0 });
    expect(sample.demand).toBe(0);
});

it.each([false, true])(
    "serves interactive work with full background budgets (include assistants: %s)",
    async (includeAssistants) => {
        const { Queue, Worker } = await import("bullmq");
        const queue = new Queue("task", { connection: mockRedis });
        const rows = new Map();
        let release, interactiveDone;
        const held = new Promise((resolve) => {
            release = resolve;
        });
        const interactive = new Promise((resolve) => {
            interactiveDone = resolve;
        });
        let active = 0,
            maxActive = 0;
        Task.findById.mockImplementation(async (id) => rows.get(String(id)));
        Task.findOneAndUpdate.mockImplementation(async ({ _id }, update) => {
            const row = rows.get(String(_id));
            Object.assign(row, update.$set);
            return row;
        });
        const worker = new Worker(
            "task",
            (job, token) =>
                processWithBackgroundAdmission(job, token, async (data) => {
                    if (data.type === "transcribe") {
                        interactiveDone();
                        return;
                    }
                    active++;
                    maxActive = Math.max(maxActive, active);
                    await held;
                    rows.get(data.taskId).status = "completed";
                    active--;
                }),
            { connection: mockRedis, concurrency: 20 },
        );
        try {
            for (let i = 0; i < (includeAssistants ? 48 : 24); i++) {
                const type =
                    includeAssistants && i % 2
                        ? "assistant-run"
                        : "build-digest";
                const id = `task-${i}`;
                rows.set(id, {
                    _id: id,
                    owner: `owner-${i}`,
                    status: "pending",
                    type,
                });
                await queue.add(
                    "task",
                    {
                        taskId: id,
                        userId: `owner-${i}`,
                        type,
                        assistantRootId: `flow-${i}`,
                    },
                    { jobId: id, priority: 10 },
                );
            }
            const expected = includeAssistants ? 18 : 6;
            const limit = Date.now() + 5000;
            while (active < expected && Date.now() < limit)
                await new Promise((resolve) => setTimeout(resolve, 10));
            expect(active).toBe(expected);
            await queue.add("task", { type: "transcribe" });
            let timer;
            try {
                await Promise.race([
                    interactive,
                    new Promise((_, reject) => {
                        timer = setTimeout(
                            () =>
                                reject(
                                    new Error(
                                        "Interactive task waited for background completion",
                                    ),
                                ),
                            3000,
                        );
                    }),
                ]);
            } finally {
                clearTimeout(timer);
            }
            expect(active).toBe(expected);
            expect(maxActive).toBe(expected);
        } finally {
            await worker.pause(true);
            release();
            await worker.close();
            await queue.close();
        }
    },
);

it.each([
    [false, "automation-run"],
    [true, "automation-run"],
    [false, "assistant-run"],
    [true, "assistant-run"],
])(
    "releases a parked turn and admits its continuation (reply already received: %s, type: %s)",
    async (alreadyResumed, type) => {
        const row = {
            _id: "task",
            owner: "user",
            status: "pending",
            assistantTurn: 0,
            executionStartedAt: null,
        };
        Task.findById.mockImplementation(async () => row);
        Task.findOneAndUpdate.mockImplementation(async (_filter, update) => {
            Object.assign(row, update.$set);
            return row;
        });
        const job = {
            id: "first",
            data: {
                taskId: "task",
                userId: "user",
                type,
                assistantRootId: "root",
                assistantTurn: 0,
            },
        };
        await processWithBackgroundAdmission(job, "lock", async () => {
            row.status = "waiting";
            if (alreadyResumed) {
                Object.assign(row, {
                    status: "pending",
                    assistantTurn: 1,
                    executionStartedAt: null,
                });
            }
            return { assistantWaiting: true };
        });
        expect(
            await mockRedis.exists(
                type === "assistant-run"
                    ? "background:assistants:task:task"
                    : "background:runs:owner:user",
            ),
        ).toBe(0);
        Object.assign(row, {
            status: "pending",
            assistantTurn: 1,
            executionStartedAt: null,
        });
        const execute = jest.fn(async () => {
            row.status = "completed";
        });
        await processWithBackgroundAdmission(
            { ...job, id: "next", data: { ...job.data, assistantTurn: 1 } },
            "lock",
            execute,
        );
        expect(execute).toHaveBeenCalledTimes(1);
        expect(row.status).toBe("completed");
    },
);

it("ignores an old queue receipt without abandoning the current assistant turn", async () => {
    Task.findById.mockResolvedValue({
        _id: "task",
        owner: "user",
        status: "pending",
        assistantTurn: 1,
        executionStartedAt: null,
    });
    const execute = jest.fn();
    await processWithBackgroundAdmission(
        {
            id: "old",
            data: {
                taskId: "task",
                userId: "user",
                type: "automation-run",
                assistantTurn: 0,
            },
        },
        "lock",
        execute,
    );
    expect(execute).not.toHaveBeenCalled();
    expect(Task.findOneAndUpdate).not.toHaveBeenCalled();
    expect(await mockRedis.exists("background:runs:owner:user")).toBe(0);
});

const assistantKeys = (owner, workflow, task) => [
    "background:assistants:active",
    `background:assistants:owner:${owner}`,
    `background:assistants:workflow:${workflow}`,
    `background:assistants:task:${task}`,
];
const acquireAssistant = (owner, workflow, task, token = task, ttl = 60000) =>
    mockRedis.eval(
        ACQUIRE_ASSISTANT,
        4,
        ...assistantKeys(owner, workflow, task),
        token,
        12,
        4,
        4,
        ttl,
    );
it("admits twelve out of 1000 competing assistant runs across replicas", async () => {
    const results = await Promise.all(
        Array.from({ length: 1000 }, (_, i) =>
            acquireAssistant(`owner-${i}`, `flow-${i}`, `task-${i}`),
        ),
    );
    expect(results.filter(Boolean)).toHaveLength(12);
    expect(await mockRedis.zcard("background:assistants:active")).toBe(12);
});
it("limits each user and workflow to four while other users can progress", async () => {
    for (let i = 0; i < 4; i++)
        expect(
            await acquireAssistant("owner", `flow-${i}`, `a-${i}`),
        ).toBeGreaterThan(0);
    expect(await acquireAssistant("owner", "new-flow", "a-5")).toBe(0);
    for (let i = 0; i < 4; i++)
        expect(
            await acquireAssistant(`other-${i}`, "one-flow", `b-${i}`),
        ).toBeGreaterThan(0);
    expect(await acquireAssistant("other-5", "one-flow", "b-5")).toBe(0);
    expect(
        await acquireAssistant("independent", "independent-flow", "c"),
    ).toBeGreaterThan(0);
});
it("expired assistant leases recover without allowing an old worker to release a successor", async () => {
    await acquireAssistant("owner", "flow", "task", "old", 20);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(
        await acquireAssistant("owner", "flow", "task", "new"),
    ).toBeGreaterThan(0);
    expect(
        await mockRedis.eval(
            RELEASE_ASSISTANT,
            4,
            ...assistantKeys("owner", "flow", "task"),
            "old",
        ),
    ).toBe(0);
    expect(await mockRedis.get("background:assistants:task:task")).toBe("new");
});
it("defers assistant work without reading Mongo, consuming a retry, or blocking interactive execution", async () => {
    for (let i = 0; i < 4; i++)
        await acquireAssistant("user", "flow", `task-${i}`);
    const job = {
        id: "deferred",
        data: {
            type: "assistant-run",
            taskId: "deferred",
            userId: "user",
            assistantRootId: "flow",
        },
        moveToDelayed: jest.fn(),
    };
    const execute = jest.fn();
    await expect(
        processWithBackgroundAdmission(job, "lock", execute),
    ).rejects.toThrow("bullmq:movedToDelayed");
    expect(Task.findById).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalled();
    await processWithBackgroundAdmission(
        { data: { type: "transcribe" } },
        "lock",
        execute,
    );
    expect(execute).toHaveBeenCalledTimes(1);
});
it("quarantines assistant capacity on uncertain failure until its lease expires", async () => {
    const row = {
        _id: "task",
        owner: "user",
        status: "pending",
        assistantTurn: 0,
    };
    Task.findById.mockResolvedValue(row);
    Task.findOneAndUpdate.mockResolvedValue(row);
    await expect(
        processWithBackgroundAdmission(
            {
                id: "run",
                data: {
                    type: "assistant-run",
                    taskId: "task",
                    userId: "user",
                    assistantRootId: "flow",
                },
            },
            "lock",
            async () => {
                throw new Error("worker disconnected");
            },
        ),
    ).rejects.toThrow("worker disconnected");
    expect(await mockRedis.zcard("background:assistants:active")).toBe(1);
    expect(
        await mockRedis.pttl("background:assistants:task:task"),
    ).toBeGreaterThan(20 * 60 * 1000);
});
