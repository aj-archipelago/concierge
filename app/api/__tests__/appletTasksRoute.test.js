/**
 * @jest-environment node
 */

import { GET } from "../applet/tasks/[id]/route";

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../models/task.mjs", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

jest.mock("../utils/task-utils.mjs", () => ({
    checkAndUpdateAbandonedTask: jest.fn(),
    syncTaskWithBullMQJob: jest.fn(),
}));

jest.mock("../applet/access.js", () => ({
    validateAppletAccess: jest.fn(),
}));

jest.mock("../applet/sdk-guard.js", () => ({
    APPLET_SDK_LIMITS: {
        read: { concurrent: 20, maxPerWindow: 120, windowMs: 60000 },
    },
    withAppletSdkGuard: jest.fn(({ run }) => run()),
}));

const { getCurrentUser } = require("../utils/auth");
const Task = require("../models/task.mjs").default;
const {
    checkAndUpdateAbandonedTask,
    syncTaskWithBullMQJob,
} = require("../utils/task-utils.mjs");
const { validateAppletAccess } = require("../applet/access.js");
const { withAppletSdkGuard } = require("../applet/sdk-guard.js");

const appletId = "507f191e810c19729de860ea";
const taskId = "507f191e810c19729de860eb";

function createRequest() {
    return {
        url: `https://concierge.example/api/applet/tasks/${taskId}?appletId=${appletId}`,
    };
}

describe("GET /api/applet/tasks/[id]", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: "user-1" });
        validateAppletAccess.mockResolvedValue(null);
        syncTaskWithBullMQJob.mockImplementation((task) =>
            Promise.resolve({ ...task, status: "running" }),
        );
        checkAndUpdateAbandonedTask.mockImplementation((task) =>
            Promise.resolve({ ...task, checked: true }),
        );
    });

    test("only reads SDK tasks created by the requesting applet", async () => {
        const task = {
            _id: taskId,
            owner: "user-1",
            status: "running",
            progress: 0.4,
            type: "transcribe",
            metadata: {
                contextId: "internal-context",
                url: "https://example.com/video.mp4",
            },
            jobId: "job-1",
            cortexRequestId: "cortex-request-1",
            invokedFrom: {
                source: "applet_sdk",
                appletId,
            },
        };
        Task.findOne.mockResolvedValue(task);

        const response = await GET(createRequest(), {
            params: { id: taskId },
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(Task.findOne).toHaveBeenCalledWith({
            _id: taskId,
            owner: "user-1",
            "invokedFrom.source": "applet_sdk",
            "invokedFrom.appletId": appletId,
        });
        expect(withAppletSdkGuard).toHaveBeenCalledWith(
            expect.objectContaining({
                appletId,
                userId: "user-1",
                api: "tasks.get",
            }),
        );
        expect(data).toMatchObject({
            _id: taskId,
            taskId,
            status: "running",
            progress: 0.4,
            type: "transcribe",
        });
        expect(data).not.toHaveProperty("metadata");
        expect(data).not.toHaveProperty("owner");
        expect(data).not.toHaveProperty("jobId");
        expect(data).not.toHaveProperty("cortexRequestId");
        expect(data).not.toHaveProperty("invokedFrom");
    });

    test("returns completed media task text directly on task.data", async () => {
        const task = {
            _id: taskId,
            owner: "user-1",
            status: "completed",
            progress: 1,
            type: "subtitle-translate",
            data: {
                data: "1\n00:00:00,000 --> 00:00:02,000\nصباح الخير.",
            },
            invokedFrom: {
                source: "applet_sdk",
                appletId,
            },
        };
        Task.findOne.mockResolvedValue(task);
        checkAndUpdateAbandonedTask.mockImplementation((value) =>
            Promise.resolve(value),
        );

        const response = await GET(createRequest(), {
            params: { id: taskId },
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data).toBe("1\n00:00:00,000 --> 00:00:02,000\nصباح الخير.");
    });

    test("preserves structured task data when it is not a wrapped text result", async () => {
        const task = {
            _id: taskId,
            owner: "user-1",
            status: "completed",
            progress: 1,
            type: "custom",
            data: {
                items: [{ text: "one" }],
            },
            invokedFrom: {
                source: "applet_sdk",
                appletId,
            },
        };
        Task.findOne.mockResolvedValue(task);
        checkAndUpdateAbandonedTask.mockImplementation((value) =>
            Promise.resolve(value),
        );

        const response = await GET(createRequest(), {
            params: { id: taskId },
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data).toEqual({
            items: [{ text: "one" }],
        });
    });

    test("returns task status text without exposing private task fields", async () => {
        const task = {
            _id: taskId,
            owner: "user-1",
            status: "failed",
            progress: 0.2,
            type: "transcribe",
            statusText: "Media service rejected the source URL.",
            error: "Media service rejected the source URL.",
            invokedFrom: {
                source: "applet_sdk",
                appletId,
            },
        };
        Task.findOne.mockResolvedValue(task);
        checkAndUpdateAbandonedTask.mockImplementation((value) =>
            Promise.resolve(value),
        );

        const response = await GET(createRequest(), {
            params: { id: taskId },
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe("failed");
        expect(data.statusText).toBe("Media service rejected the source URL.");
        expect(data.error).toBe("Media service rejected the source URL.");
        expect(data).not.toHaveProperty("metadata");
        expect(data).not.toHaveProperty("owner");
    });

    test("omits absent task status details", async () => {
        const task = {
            _id: taskId,
            owner: "user-1",
            status: "in_progress",
            progress: 0.5,
            type: "transcribe",
            invokedFrom: {
                source: "applet_sdk",
                appletId,
            },
        };
        Task.findOne.mockResolvedValue(task);
        syncTaskWithBullMQJob.mockImplementation((value) =>
            Promise.resolve(value),
        );
        checkAndUpdateAbandonedTask.mockImplementation((value) =>
            Promise.resolve(value),
        );

        const response = await GET(createRequest(), {
            params: { id: taskId },
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe("in_progress");
        expect(data.progress).toBe(0.5);
        expect(data).not.toHaveProperty("statusText");
        expect(data).not.toHaveProperty("error");
    });

    test("returns 404 when a task is outside the applet SDK scope", async () => {
        Task.findOne.mockResolvedValue(null);

        const response = await GET(createRequest(), {
            params: { id: taskId },
        });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toBe("task not found");
        expect(syncTaskWithBullMQJob).not.toHaveBeenCalled();
        expect(checkAndUpdateAbandonedTask).not.toHaveBeenCalled();
    });

    test("returns 400 for malformed task ids before querying Mongo", async () => {
        const response = await GET(createRequest(), {
            params: { id: "not-an-object-id" },
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("taskId must be a valid ObjectId");
        expect(Task.findOne).not.toHaveBeenCalled();
        expect(getCurrentUser).not.toHaveBeenCalled();
    });
});
