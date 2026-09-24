/** @jest-environment node */
import { enqueueDueAutomation } from "../automation-scheduler.js";
import Automation from "../../app/api/models/automation.js";
import {
    requireColleague,
    colleagueRequest,
} from "../../app/api/utils/colleagues.js";
import { createBackgroundTask } from "../../app/api/utils/tasks.js";
jest.mock("bullmq", () => ({ Queue: jest.fn(() => ({})), Worker: jest.fn() }));
jest.mock("../../app/api/utils/redis.mjs", () => ({
    getRedisConnection: jest.fn(() => ({})),
}));
jest.mock("../db-connection.js", () => ({ ensureDbConnection: jest.fn() }));
jest.mock("../background-reconcile.mjs", () => ({
    reconcileBackgroundTasks: jest.fn(),
}));
jest.mock("../colleague-delivery.js", () => ({
    deliverColleagueMessages: jest.fn(),
}));
jest.mock("../../app/api/models/automation.js", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        findOneAndUpdate: jest.fn(),
        findByIdAndUpdate: jest.fn(),
    },
}));
jest.mock("../../app/api/models/user.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn(async () => ({ contextId: "user" })) },
}));
jest.mock("../../app/api/utils/colleagues.js", () => ({
    requireColleague: jest.fn(),
    colleagueRequest: jest.fn(),
}));
jest.mock("../../app/api/utils/tasks.js", () => ({
    createBackgroundTask: jest.fn(),
}));
jest.mock("../../app/api/automations/utils.js", () => ({
    AUTOMATION_TASK_TYPE: "automation-run",
    calculateNextRunAt: () => new Date("2026-09-12T10:01:00Z"),
    hasActiveAutomationRun: jest.fn(async () => false),
}));
const logger = { log: jest.fn() };
let automation;
beforeEach(() => {
    jest.clearAllMocks();
    automation = {
        _id: "task",
        owner: "owner",
        entityId: "colleague",
        enabled: true,
        schedule: { frequency: "files", watchPath: "/workspace/inbox" },
        nextRunAt: new Date("2026-09-12T10:00:00Z"),
        schedulerLockedAt: new Date(),
        schedulerLockToken: "token",
    };
    Automation.findOneAndUpdate.mockImplementation(async () => automation);
    requireColleague.mockResolvedValue({ id: "colleague", status: "active" });
    colleagueRequest.mockResolvedValue({ fingerprint: "new" });
    createBackgroundTask.mockResolvedValue({});
});
const run = () => enqueueDueAutomation(automation, logger);
const expectAdvanced = (fields) =>
    expect(Automation.findOneAndUpdate).toHaveBeenCalledWith(
        {
            _id: "task",
            schedulerLockToken: automation.schedulerLockToken,
            nextRunAt: automation.nextRunAt,
        },
        {
            $set: expect.objectContaining({
                nextRunAt: new Date("2026-09-12T10:01:00Z"),
                ...fields,
            }),
            $unset: { schedulerLockedAt: 1, schedulerLockToken: 1 },
        },
        { new: true, timestamps: true },
    );
it("establishes an initial baseline without invoking a model", async () => {
    await run();
    expect(createBackgroundTask).not.toHaveBeenCalled();
    expectAdvanced({ watchFingerprint: "new", watchCandidate: "new" });
});
it("waits for changed files to settle across observations", async () => {
    automation.watchFingerprint = "old";
    await run();
    expect(createBackgroundTask).not.toHaveBeenCalled();
    expectAdvanced({ watchCandidate: "new" });
});
it("enqueues a settled change before committing its fingerprint", async () => {
    automation.watchFingerprint = "old";
    automation.watchCandidate = "new";
    await run();
    expect(createBackgroundTask).toHaveBeenCalledWith(
        expect.objectContaining({
            userId: "owner",
            type: "automation-run",
            idempotencyKey: "schedule:task:2026-09-12T10:00:00.000Z",
            metadata: expect.objectContaining({ trigger: "files" }),
        }),
    );
    expectAdvanced({ watchFingerprint: "new", watchCandidate: "new" });
});
it("does not launch paused colleagues or wake sleeping workspaces", async () => {
    requireColleague.mockRejectedValueOnce(new Error("Colleague is paused"));
    await run();
    expect(createBackgroundTask).not.toHaveBeenCalled();
    requireColleague.mockResolvedValue({ id: "colleague" });
    colleagueRequest.mockResolvedValue({ skipped: true });
    await run();
    expect(createBackgroundTask).not.toHaveBeenCalled();
});
it("retries enqueue failure without consuming the slot or file change", async () => {
    automation.watchFingerprint = "old";
    automation.watchCandidate = "new";
    createBackgroundTask.mockRejectedValueOnce(new Error("Queue unavailable"));
    await expect(run()).rejects.toThrow("Queue unavailable");
    expect(Automation.findOneAndUpdate).toHaveBeenLastCalledWith(
        {
            _id: "task",
            schedulerLockToken: automation.schedulerLockToken,
            nextRunAt: automation.nextRunAt,
        },
        { $set: {}, $unset: { schedulerLockedAt: 1, schedulerLockToken: 1 } },
        { new: true, timestamps: true },
    );
});
it("preserves ordinary automation scheduling", async () => {
    automation.entityId = null;
    automation.schedule.frequency = "daily";
    await run();
    expect(requireColleague).not.toHaveBeenCalled();
    expect(createBackgroundTask).toHaveBeenCalledWith(
        expect.objectContaining({
            metadata: expect.objectContaining({ trigger: "scheduled" }),
        }),
    );
});
it("clears an abandoned change candidate when files return to baseline", async () => {
    automation.watchFingerprint = "old";
    automation.watchCandidate = "temporary";
    colleagueRequest.mockResolvedValue({ fingerprint: "old" });
    await run();
    expect(createBackgroundTask).not.toHaveBeenCalled();
    expectAdvanced({ watchFingerprint: "old", watchCandidate: "old" });
});
