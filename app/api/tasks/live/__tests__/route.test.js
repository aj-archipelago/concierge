/**
 * @jest-environment node
 */

jest.mock("../../../models/task.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        countDocuments: jest.fn(),
    },
}));

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../../utils/task-utils.mjs", () => ({
    checkAndUpdateAbandonedTask: jest.fn(async (task) => task),
    syncTaskWithBullMQJob: jest.fn(async (task) => task),
}));

const Task = require("../../../models/task.mjs").default;
const { getCurrentUser } = require("../../../utils/auth");
const {
    checkAndUpdateAbandonedTask,
    syncTaskWithBullMQJob,
} = require("../../../utils/task-utils.mjs");
const { GET } = require("../route");

function mockActiveFind(items) {
    const query = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn(async () => items),
    };
    Task.find.mockReturnValueOnce(query);
    return query;
}

describe("GET /api/tasks/live", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: "user-1" });
        Task.countDocuments.mockResolvedValue(1);
    });

    it("returns active tasks and requested tracked tasks", async () => {
        const activeTask = {
            _id: "6a341847166f97b043f4534b",
            owner: "user-1",
            inboxKind: "task",
            type: "media-generation",
            status: "in_progress",
            progress: 0.5,
        };
        const trackedTask = {
            _id: "6a341847166f97b043f4534c",
            owner: "user-1",
            inboxKind: "task",
            type: "transcribe",
            status: "completed",
            progress: 1,
        };
        mockActiveFind([activeTask]);
        Task.find.mockResolvedValueOnce([trackedTask]);

        const response = await GET(
            new Request(
                "http://localhost/api/tasks/live?ids=6a341847166f97b043f4534c,not-valid",
            ),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.activeTaskCount).toBe(1);
        expect(body.tasks).toEqual([
            expect.objectContaining({
                _id: "6a341847166f97b043f4534b",
                inboxKind: "task",
                status: "in_progress",
            }),
            expect.objectContaining({
                _id: "6a341847166f97b043f4534c",
                inboxKind: "task",
                status: "completed",
            }),
        ]);
        expect(Task.find).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                owner: "user-1",
                status: { $in: ["pending", "in_progress"] },
            }),
        );
        expect(Task.find).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                _id: { $in: ["6a341847166f97b043f4534c"] },
                dismissed: { $ne: true },
                owner: "user-1",
            }),
        );
        expect(syncTaskWithBullMQJob).toHaveBeenCalledWith(activeTask);
        expect(checkAndUpdateAbandonedTask).toHaveBeenCalledWith(activeTask);
        expect(syncTaskWithBullMQJob).not.toHaveBeenCalledWith(trackedTask);
    });
});
