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
        findOneAndUpdate: jest.fn(),
    },
}));

jest.mock("../../chats/persistence.js", () => ({
    prepareMessagesForPersistence: jest.fn((messages) => ({
        messages,
        messageStorageBytes: 0,
    })),
}));

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
