const mockGetJob = jest.fn();
const mockGetTaskLiveState = jest.fn();
const mockMergeTaskLiveState = jest.fn((task, liveState) => ({
    ...task,
    live: liveState,
}));
const mockRequestTaskCancellation = jest.fn();
const mockClearTaskCancellation = jest.fn();

jest.mock("bullmq", () => ({
    Queue: jest.fn(() => ({
        getJob: mockGetJob,
        getJobs: jest.fn(async () => []),
    })),
}));

jest.mock("../redis.mjs", () => ({
    getRedisConnection: jest.fn(() => ({})),
}));

jest.mock("../task-liveness.mjs", () => ({
    clearTaskCancellation: mockClearTaskCancellation,
    getTaskLiveState: mockGetTaskLiveState,
    mergeTaskLiveState: mockMergeTaskLiveState,
    requestTaskCancellation: mockRequestTaskCancellation,
    TASK_LIVE_STALE_MS: 45000,
}));

jest.mock("../../models/task.mjs", () => ({
    __esModule: true,
    default: {
        findByIdAndUpdate: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
}));

jest.mock("../../../../src/utils/task-loader.mjs", () => ({
    loadTaskDefinition: jest.fn(async () => null),
}));
jest.mock("../../../../jobs/graphql.mjs", () => ({ getClient: jest.fn() }));
const Task = require("../../models/task.mjs").default;

describe("task utils", () => {
    let checkAndUpdateAbandonedTask;
    let syncTaskWithBullMQJob;

    beforeAll(async () => {
        ({ checkAndUpdateAbandonedTask, syncTaskWithBullMQJob } = await import(
            "../task-utils.mjs"
        ));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetTaskLiveState.mockResolvedValue(null);
        mockGetJob.mockResolvedValue(null);
    });

    test("waiting tasks survive stale heartbeats and completed queue receipts", async () => {
        const task = {
            _id: "task-waiting",
            jobId: "old-job",
            status: "waiting",
            lastHeartbeat: new Date(0),
        };
        mockGetJob.mockResolvedValue({ getState: async () => "completed" });
        expect(await checkAndUpdateAbandonedTask(task)).toBe(task);
        expect(await syncTaskWithBullMQJob(task)).toBe(task);
        expect(Task.findOneAndUpdate).not.toHaveBeenCalled();
        expect(Task.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("a continuation with an interrupted enqueue waits for reconciliation", async () => {
        const task = {
            _id: "continuation",
            status: "pending",
            assistantTurn: 1,
            lastHeartbeat: new Date(0),
        };
        expect(await checkAndUpdateAbandonedTask(task)).toBe(task);
        expect(Task.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test("does not mark cancelled tasks as abandoned", async () => {
        const task = {
            _id: "task-1",
            status: "cancelled",
            lastHeartbeat: new Date(Date.now() - 60000),
        };

        const result = await checkAndUpdateAbandonedTask(task);

        expect(result).toBe(task);
        expect(Task.findByIdAndUpdate).not.toHaveBeenCalled();
        expect(Task.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test.each(["automation-run", "build-digest", "assistant-run"])(
        "queue pickup does not mark %s started before worker admission",
        async (type) => {
            const task = {
                _id: "not-yet-admitted",
                jobId: "job-1",
                type,
                status: "pending",
            };
            mockGetJob.mockResolvedValue({ getState: async () => "active" });

            expect(await syncTaskWithBullMQJob(task)).toBe(task);
            expect(Task.findByIdAndUpdate).not.toHaveBeenCalled();
        },
    );

    test.each(["waiting", "delayed"])(
        "a %s receipt does not reset an admitted task's execution state",
        async (state) => {
            const task = {
                _id: "already-admitted",
                jobId: "job-1",
                type: "automation-run",
                status: "in_progress",
                executionStartedAt: new Date(),
            };
            mockGetJob.mockResolvedValue({ getState: async () => state });

            expect(await syncTaskWithBullMQJob(task)).toBe(task);
            expect(Task.findByIdAndUpdate).not.toHaveBeenCalled();
        },
    );

    test("interactive tasks still reflect queue pickup", async () => {
        const task = {
            _id: "interactive",
            jobId: "job-1",
            type: "media-generation",
            status: "pending",
        };
        const updated = { ...task, status: "in_progress" };
        mockGetJob.mockResolvedValue({ getState: async () => "active" });
        Task.findByIdAndUpdate.mockResolvedValue(updated);

        expect(await syncTaskWithBullMQJob(task)).toBe(updated);
        expect(Task.findByIdAndUpdate).toHaveBeenCalledWith(
            task._id,
            { status: "in_progress" },
            { new: true },
        );
    });

    test("overlays Redis liveness instead of writing Mongo heartbeat state", async () => {
        const task = {
            _id: "task-1",
            status: "in_progress",
            progress: 0.2,
            updatedAt: new Date(Date.now() - 60000),
        };
        const liveState = {
            status: "in_progress",
            progress: 0.7,
            lastSeenAt: new Date().toISOString(),
        };
        mockGetTaskLiveState.mockResolvedValue(liveState);

        const result = await checkAndUpdateAbandonedTask(task);

        expect(mockMergeTaskLiveState).toHaveBeenCalledWith(task, liveState);
        expect(result).toMatchObject({ live: liveState });
        expect(mockGetJob).not.toHaveBeenCalled();
        expect(Task.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test("does not abandon queued tasks without live worker state", async () => {
        const task = {
            _id: "task-1",
            jobId: "job-1",
            status: "pending",
            updatedAt: new Date(Date.now() - 60000),
        };
        mockGetJob.mockResolvedValue({
            getState: jest.fn().mockResolvedValue("waiting"),
        });

        const result = await checkAndUpdateAbandonedTask(task);

        expect(result).toBe(task);
        expect(Task.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test("does not abandon active BullMQ jobs even when the live key is missing", async () => {
        const task = {
            _id: "task-1",
            jobId: "job-1",
            status: "in_progress",
            updatedAt: new Date(Date.now() - 60000),
        };
        mockGetJob.mockResolvedValue({
            getState: jest.fn().mockResolvedValue("active"),
        });

        const result = await checkAndUpdateAbandonedTask(task);

        expect(result).toBe(task);
        expect(Task.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test("does not convert terminal tasks to failed when status text normalizes", async () => {
        const task = {
            _id: "task-1",
            jobId: "job-1",
            type: "transcribe",
            status: "cancelled",
            statusText: "YOUTUBE_VIDEO_ACCESS_DENIED",
            metadata: {
                url: "https://youtu.be/private-video",
            },
        };
        mockGetJob.mockResolvedValue({
            getState: jest.fn().mockResolvedValue("failed"),
            failedReason: "YOUTUBE_VIDEO_ACCESS_DENIED",
        });

        const result = await syncTaskWithBullMQJob(task);

        expect(result).toBe(task);
        expect(Task.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("does not normalize YouTube-looking errors for non-transcribe tasks", async () => {
        const task = {
            _id: "task-1",
            jobId: "job-1",
            type: "media-generation",
            status: "in_progress",
            statusText: "YOUTUBE_VIDEO_ACCESS_DENIED",
            metadata: {
                url: "https://youtu.be/private-video",
            },
        };
        mockGetJob.mockResolvedValue({
            getState: jest.fn().mockResolvedValue("active"),
            failedReason: "",
        });

        const result = await syncTaskWithBullMQJob(task);

        expect(result).toBe(task);
        expect(Task.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test.each(["transcribe", "subtitle-translate"])(
        "marks completed %s jobs without task data as failed",
        async (type) => {
            const task = {
                _id: "task-1",
                jobId: "job-1",
                type,
                status: "in_progress",
                data: null,
                metadata: {},
            };
            const updatedTask = {
                ...task,
                status: "failed",
                statusText:
                    "Task completed without returning result data. Please try again.",
            };
            mockGetJob.mockResolvedValue({
                getState: jest.fn().mockResolvedValue("completed"),
                failedReason: "",
            });
            Task.findByIdAndUpdate.mockResolvedValue(updatedTask);

            const result = await syncTaskWithBullMQJob(task);

            expect(result).toBe(updatedTask);
            expect(Task.findByIdAndUpdate).toHaveBeenCalledWith(
                "task-1",
                {
                    status: "failed",
                    statusText:
                        "Task completed without returning result data. Please try again.",
                },
                { new: true },
            );
        },
    );

    test("allows completed jobs without task data for task types that do not require result data", async () => {
        const task = {
            _id: "task-1",
            jobId: "job-1",
            type: "automation-run",
            status: "in_progress",
            data: null,
            metadata: {},
        };
        const updatedTask = {
            ...task,
            status: "completed",
        };
        mockGetJob.mockResolvedValue({
            getState: jest.fn().mockResolvedValue("completed"),
            failedReason: "",
        });
        Task.findByIdAndUpdate.mockResolvedValue(updatedTask);

        const result = await syncTaskWithBullMQJob(task);

        expect(result).toBe(updatedTask);
        expect(Task.findByIdAndUpdate).toHaveBeenCalledWith(
            "task-1",
            { status: "completed" },
            { new: true },
        );
    });
});

test("cancelling an originating task cancels its active child work under the same owner", async () => {
    const { cancelTask } = await import("../task-utils.mjs");
    const root = {
        _id: "root",
        owner: "owner",
        assistantRootId: "root",
        type: "assistant-run",
        status: "waiting",
    };
    const child = {
        _id: "child",
        owner: "owner",
        assistantRootId: "root",
        type: "assistant-run",
        status: "in_progress",
    };
    Task.findOne.mockImplementation(async ({ _id }) =>
        _id === "root" ? root : child,
    );
    Task.find.mockResolvedValue([child]);
    Task.findOneAndUpdate.mockImplementation(async ({ _id }) => ({
        ...(_id === "root" ? root : child),
        status: "cancelled",
    }));
    await cancelTask("root", "owner");
    expect(Task.find).toHaveBeenCalledWith(
        expect.objectContaining({
            owner: "owner",
            assistantRootId: "root",
            _id: { $ne: "root" },
            status: { $in: ["pending", "in_progress", "waiting"] },
        }),
    );
    expect(mockRequestTaskCancellation).toHaveBeenCalledWith("root");
    expect(mockRequestTaskCancellation).toHaveBeenCalledWith("child");
});
