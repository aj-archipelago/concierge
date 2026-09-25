/** @jest-environment node */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Automation from "../app/api/models/automation.js";
import { createBackgroundTask } from "../app/api/utils/tasks.js";
import {
    claimAutomationDispatch,
    releaseAutomationDispatch,
} from "../app/api/utils/automation-dispatch-lock.mjs";
import {
    enqueueDueAutomation,
    enqueueDueAutomations,
} from "./automation-scheduler.js";
jest.mock("bullmq", () => ({ Queue: jest.fn(() => ({})), Worker: jest.fn() }));
jest.mock("../app/api/utils/redis.mjs", () => ({
    getRedisConnection: () => ({}),
}));
jest.mock("./background-reconcile.mjs", () => ({
    reconcileBackgroundTasks: jest.fn(),
}));
jest.mock("./colleague-delivery.js", () => ({
    deliverColleagueMessages: jest.fn(),
}));
jest.mock("../app/api/utils/tasks.js", () => ({
    createBackgroundTask: jest.fn(),
}));
jest.mock("../app/api/automations/utils.js", () => ({
    AUTOMATION_TASK_TYPE: "automation-run",
    hasActiveAutomationRun: jest.fn(async () => false),
    calculateNextRunAt: (_schedule, _zone, now) =>
        new Date(now.getTime() + 3600000),
}));
let server, row;
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
    await Automation.deleteMany({});
    jest.clearAllMocks();
    row = await Automation.create({
        owner: new mongoose.Types.ObjectId(),
        name: "Test",
        slug: "test",
        path: "automations/test",
        enabled: true,
        nextRunAt: new Date(Date.now() - 60000),
        schedule: { frequency: "hourly" },
    });
    createBackgroundTask.mockResolvedValue({ taskId: "task" });
});
it("two replicas enqueue a due slot once and advance only after enqueue", async () => {
    createBackgroundTask.mockImplementation(async () => {
        const current = await Automation.findById(row._id);
        expect(current.nextRunAt).toEqual(row.nextRunAt);
        return { taskId: "task" };
    });
    await Promise.all(
        Array.from({ length: 10 }, () => enqueueDueAutomation(row, logger)),
    );
    expect(createBackgroundTask).toHaveBeenCalledTimes(1);
    const current = await Automation.findById(row._id);
    expect(current.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(current.schedulerLockedAt).toBeNull();
});
it("an interrupted enqueue retains the same idempotency key on retry", async () => {
    createBackgroundTask.mockRejectedValueOnce(
        new Error("Lost acknowledgement"),
    );
    await expect(enqueueDueAutomation(row, logger)).rejects.toThrow(
        "Lost acknowledgement",
    );
    expect((await Automation.findById(row._id)).nextRunAt).toEqual(
        row.nextRunAt,
    );
    await enqueueDueAutomation(row, logger);
    expect(createBackgroundTask.mock.calls[0][0].idempotencyKey).toBe(
        createBackgroundTask.mock.calls[1][0].idempotencyKey,
    );
});
it("a manual dispatcher and scheduler cannot own the same automation", async () => {
    const manual = await claimAutomationDispatch(row._id);
    await enqueueDueAutomation(row, logger);
    expect(createBackgroundTask).not.toHaveBeenCalled();
    await releaseAutomationDispatch(manual);
    await enqueueDueAutomation(row, logger);
    expect(createBackgroundTask).toHaveBeenCalledTimes(1);
});
it("an expired lock cannot release its successor's claim", async () => {
    const old = await claimAutomationDispatch(row._id);
    await Automation.updateOne(
        { _id: row._id },
        { schedulerLockedAt: new Date(Date.now() - 11 * 60000) },
    );
    const next = await claimAutomationDispatch(row._id);
    expect(await releaseAutomationDispatch(old, { enabled: false })).toBeNull();
    expect((await Automation.findById(row._id)).schedulerLockedAt).toEqual(
        next.schedulerLockedAt,
    );
});
it("repairs a missing schedule without inventing catch-up runs", async () => {
    await Automation.updateOne({ _id: row._id }, { nextRunAt: null });
    await enqueueDueAutomations(logger);
    expect(createBackgroundTask).not.toHaveBeenCalled();
    expect(
        (await Automation.findById(row._id)).nextRunAt.getTime(),
    ).toBeGreaterThan(Date.now());
});

it("does not overwrite a schedule edited while enqueue was in flight", async () => {
    const editedNext = new Date(Date.now() + 86400000);
    createBackgroundTask.mockImplementation(async () => {
        await Automation.updateOne({ _id: row._id }, { nextRunAt: editedNext });
        return { taskId: "task" };
    });
    await enqueueDueAutomation(row, logger);
    expect((await Automation.findById(row._id)).nextRunAt).toEqual(editedNext);
});
