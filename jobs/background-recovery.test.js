/** @jest-environment node */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Task from "../app/api/models/task.mjs";
import Digest from "../app/api/models/digest.mjs";
import { enqueueDigestBlock } from "../app/api/utils/digest-dispatch.mjs";
import { createBackgroundTask } from "../app/api/utils/tasks.js";
import { reconcileBackgroundTasks } from "./background-reconcile.mjs";
const mockAdd = jest.fn();
const mockGetJob = jest.fn();
jest.mock("bullmq", () => ({
    Queue: jest.fn(() => ({
        add: (...args) => mockAdd(...args),
        getJob: (...args) => mockGetJob(...args),
    })),
}));
jest.mock("../app/api/utils/redis.mjs", () => ({
    getRedisConnection: () => ({}),
}));
jest.mock("../app/api/utils/task-liveness.mjs", () => ({
    getTaskLiveState: async () => null,
}));
let server, owner, block, jobs;
const logger = { log: jest.fn() };
beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(server.getUri());
});
afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
});
beforeEach(async () => {
    await Promise.all([Task.deleteMany({}), Digest.deleteMany({})]);
    jest.clearAllMocks();
    jobs = new Map();
    owner = new mongoose.Types.ObjectId();
    const digest = await Digest.create({
        owner,
        blocks: [
            {
                title: "Brief",
                prompt: "Arabic news",
                content: "last good",
                generationKey: "v1",
            },
        ],
    });
    block = digest.blocks[0];
    mockAdd.mockImplementation(async (_name, data, opts) => {
        if (!jobs.has(opts.jobId))
            jobs.set(opts.jobId, {
                id: opts.jobId,
                data,
                opts,
                getState: async () => "waiting",
            });
        return jobs.get(opts.jobId);
    });
    mockGetJob.mockImplementation(async (id) => jobs.get(id));
});
it("coalesces concurrent manual and scheduled refreshes without clearing the last result", async () => {
    await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
            enqueueDigestBlock(owner, block._id, { slot: `slot-${i}` }),
        ),
    );
    expect(jobs.size).toBe(1);
    expect(await Task.countDocuments({ status: "pending" })).toBe(1);
    const saved = await Digest.findOne({ owner });
    expect(saved.blocks[0].content).toBe("last good");
    expect(String(saved.blocks[0].taskId)).toBe([...jobs.keys()][0]);
});
it("recovers a lost Redis acknowledgement using one job id", async () => {
    const add = mockAdd.getMockImplementation();
    mockAdd.mockImplementationOnce(async (...args) => {
        await add(...args);
        throw new Error("Lost acknowledgement");
    });
    await expect(
        enqueueDigestBlock(owner, block._id, { slot: "slot" }),
    ).rejects.toThrow("Lost acknowledgement");
    expect(await Task.countDocuments({ dispatchPending: true })).toBe(1);
    await reconcileBackgroundTasks(logger);
    expect(jobs.size).toBe(1);
    expect(await Task.countDocuments({ dispatchPending: true })).toBe(0);
});
it("recovers a crash before the card marker was saved", async () => {
    const task = await Task.create({
        owner,
        type: "build-digest",
        status: "pending",
        dispatchPending: true,
        metadata: {
            blockId: String(block._id),
            prompt: block.prompt,
            generationKey: "v1",
        },
    });
    await reconcileBackgroundTasks(logger);
    const digest = await Digest.findOne({ owner });
    expect(String(digest.blocks[0].taskId)).toBe(String(task._id));
    expect(jobs.size).toBe(1);
});
it("does not dispatch an obsolete prompt recovered from the outbox", async () => {
    await Task.create({
        owner,
        type: "build-digest",
        status: "pending",
        dispatchPending: true,
        metadata: {
            blockId: String(block._id),
            prompt: "old prompt",
            generationKey: "old",
        },
    });
    await reconcileBackgroundTasks(logger);
    expect(jobs.size).toBe(0);
    expect(await Task.countDocuments({ status: "cancelled" })).toBe(1);
});
it("keeps bounded receipts for seven days while Mongo preserves idempotency after removal", async () => {
    const options = {
        userId: owner,
        type: "automation-run",
        idempotencyKey: "schedule:slot",
        metadata: {},
    };
    const result = await createBackgroundTask(options);
    expect(jobs.get(String(result.taskId)).opts.removeOnComplete).toEqual({
        age: 604800,
    });
    await Task.updateOne({ _id: result.taskId }, { status: "completed" });
    jobs.clear();
    await createBackgroundTask(options);
    expect(jobs.size).toBe(0);
});
it("marks a proven legacy orphan abandoned but leaves a queued job pending", async () => {
    const orphan = await Task.create({
        owner,
        type: "automation-run",
        status: "pending",
    });
    const queued = await Task.create({
        owner,
        type: "automation-run",
        status: "pending",
        jobId: "present",
    });
    await Task.updateMany(
        {},
        { updatedAt: new Date(Date.now() - 3600000) },
        { timestamps: false },
    );
    jobs.set("present", { getState: async () => "waiting" });
    await reconcileBackgroundTasks(logger);
    expect((await Task.findById(orphan._id)).status).toBe("abandoned");
    expect((await Task.findById(queued._id)).status).toBe("pending");
    expect(mockAdd).not.toHaveBeenCalled();
});

it("does not cancel a task claimed by a worker during dispatch preparation", async () => {
    const result = await createBackgroundTask({
        userId: owner,
        type: "build-digest",
        idempotencyKey: "claim-race",
        metadata: {},
        beforeEnqueue: async (task) => {
            await Task.updateOne(
                { _id: task._id },
                { executionStartedAt: new Date() },
            );
            return false;
        },
    });
    expect((await Task.findById(result.taskId)).status).toBe("pending");
    expect(mockAdd).not.toHaveBeenCalled();
});
