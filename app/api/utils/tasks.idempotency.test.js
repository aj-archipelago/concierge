/** @jest-environment node */
import { createBackgroundTask } from "./tasks.js";
import Task from "../models/task.mjs";
const mockAdd = jest.fn();
jest.mock("bullmq", () => ({
    Queue: jest.fn(() => ({ add: (...args) => mockAdd(...args) })),
}));
jest.mock("./redis.mjs", () => ({ getRedisConnection: () => ({}) }));
jest.mock("../models/task.mjs", () => ({
    __esModule: true,
    default: {
        create: jest.fn(),
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
        findByIdAndUpdate: jest.fn(),
    },
}));
const options = {
    userId: "user-a",
    type: "media-generation",
    metadata: { prompt: "A newsroom" },
    invokedFrom: { source: "applet_sdk", appletId: "applet-a" },
    idempotencyKey: "widget-background-v1:atmosphere",
};
let rows, jobs;
beforeEach(() => {
    jest.clearAllMocks();
    rows = new Map();
    jobs = new Map();
    Task.findById.mockImplementation(async (id) =>
        rows.has(String(id)) ? { ...rows.get(String(id)) } : null,
    );
    Task.findOneAndUpdate.mockImplementation(async ({ _id }, update) => {
        if (!rows.has(_id)) rows.set(_id, { _id, ...update.$setOnInsert });
        return { ...rows.get(_id) };
    });
    Task.findByIdAndUpdate.mockImplementation(async (id, update) => {
        Object.assign(rows.get(String(id)), update);
    });
    Task.create.mockImplementation(async (data) => {
        const row = { _id: "ordinary-task", ...data };
        rows.set(row._id, row);
        return row;
    });
    mockAdd.mockImplementation(async (_name, data, opts) => {
        const id = opts.jobId || "ordinary-job";
        if (!jobs.has(id)) jobs.set(id, { id, data, opts });
        return jobs.get(id);
    });
});
afterEach(() => jest.useRealTimers());
it("gives concurrent callers one task ID and one retained BullMQ job ID", async () => {
    const results = await Promise.all(
        Array.from({ length: 20 }, () => createBackgroundTask(options)),
    );
    expect(new Set(results.map((x) => x.taskId)).size).toBe(1);
    expect(rows.size).toBe(1);
    expect(jobs.size).toBe(1);
    expect([...jobs.values()][0].opts).toMatchObject({
        jobId: results[0].taskId,
        removeOnComplete: false,
        removeOnFail: false,
    });
});
it.each(["completed", "failed", "cancelled", "abandoned", "in_progress"])(
    "reuses a %s task without submitting work",
    async (status) => {
        const first = await createBackgroundTask(options);
        const row = rows.get(first.taskId);
        row.status = status;
        mockAdd.mockClear();
        const second = await createBackgroundTask({
            ...options,
            metadata: { prompt: "Changed prompt" },
        });
        expect(second.taskId).toBe(first.taskId);
        expect(mockAdd).not.toHaveBeenCalled();
        expect(row.metadata.prompt).toBe("A newsroom");
    },
);
it("separates keys, users and applets", async () => {
    await createBackgroundTask(options);
    await createBackgroundTask({ ...options, userId: "user-b" });
    await createBackgroundTask({
        ...options,
        invokedFrom: { ...options.invokedFrom, appletId: "applet-b" },
    });
    await createBackgroundTask({ ...options, idempotencyKey: "another-image" });
    expect(jobs.size).toBe(4);
});
it("recovers a crash after task creation without replacing the task or prompt", async () => {
    mockAdd.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(createBackgroundTask(options)).rejects.toThrow(
        "Redis unavailable",
    );
    const id = [...rows.keys()][0];
    const result = await createBackgroundTask({
        ...options,
        metadata: { prompt: "Different prompt" },
    });
    expect(result.taskId).toBe(id);
    expect(rows.size).toBe(1);
    expect(jobs.get(id).data.metadata.prompt).toBe("A newsroom");
});
it("recovers an enqueue whose database acknowledgement was lost", async () => {
    jest.useFakeTimers();
    Task.findByIdAndUpdate.mockRejectedValue(new Error("DB unavailable"));
    const pending = createBackgroundTask(options).catch((e) => e);
    await jest.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(Error);
    const id = [...jobs.keys()][0];
    Task.findByIdAndUpdate.mockResolvedValue(null);
    expect((await createBackgroundTask(options)).taskId).toBe(id);
    expect(jobs.size).toBe(1);
    expect(mockAdd.mock.calls.every(([, , opts]) => opts.jobId === id)).toBe(
        true,
    );
});
it("does not reserve a task when the active-task limit rejects new work", async () => {
    await expect(
        createBackgroundTask({
            ...options,
            beforeCreate: async () => {
                throw new Error("Limited");
            },
        }),
    ).rejects.toThrow("Limited");
    expect(rows.size).toBe(0);
    expect(mockAdd).not.toHaveBeenCalled();
});
it("keeps ordinary media generation independently queued with normal retention", async () => {
    await createBackgroundTask({ ...options, idempotencyKey: undefined });
    expect(Task.create).toHaveBeenCalled();
    expect(mockAdd.mock.calls[0][2]).toEqual({
        timeout: 300000,
        removeOnComplete: { age: 604800 },
        removeOnFail: { age: 604800 },
    });
});

it("isolates databases while allowing credential rotation", async () => {
    const original = process.env.MONGO_URI;
    try {
        process.env.MONGO_URI =
            "mongodb://first:secret@host/db-a?replicaSet=one";
        const first = await createBackgroundTask(options);
        process.env.MONGO_URI =
            "mongodb://rotated:secret2@host/db-a?replicaSet=two";
        expect((await createBackgroundTask(options)).taskId).toBe(first.taskId);
        process.env.MONGO_URI = "mongodb://rotated:secret2@host/db-b";
        expect((await createBackgroundTask(options)).taskId).not.toBe(
            first.taskId,
        );
    } finally {
        if (original === undefined) delete process.env.MONGO_URI;
        else process.env.MONGO_URI = original;
    }
});
