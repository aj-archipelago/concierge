/**
 * @jest-environment node
 */

jest.mock("../../models/task.mjs", () => ({
    __esModule: true,
    default: {
        aggregate: jest.fn(),
        find: jest.fn(),
        deleteMany: jest.fn(),
        countDocuments: jest.fn(),
        collection: { name: "tasks" },
    },
}));

jest.mock("../../models/notification.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        insertMany: jest.fn(),
        countDocuments: jest.fn(),
        updateMany: jest.fn(),
        collection: { name: "notifications" },
    },
}));

jest.mock("../../models/user-state.mjs", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
}));

jest.mock("../../utils/task-migration.mjs", () => ({
    migrateTasks: jest.fn(),
}));

jest.mock("../../utils/task-utils.mjs", () => ({
    checkAndUpdateAbandonedTask: jest.fn(async (task) => task),
    syncTaskWithBullMQJob: jest.fn(async (task) => task),
}));

jest.mock("../../models/automation.js", () => ({
    __esModule: true,
    default: {
        find: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            lean: jest.fn(async () => []),
        })),
    },
}));

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

const Task = require("../../models/task.mjs").default;
const Notification = require("../../models/notification.mjs").default;
const UserState = require("../../models/user-state.mjs").default;
const { getCurrentUser } = require("../../utils/auth");
const { GET } = require("../route");

function mockFindLean(model, items) {
    const query = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn(async () => items),
    };
    model.find.mockReturnValue(query);
    return query;
}

describe("GET /api/inbox", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: "user-1" });
        UserState.findOne.mockResolvedValue({
            serializedState: JSON.stringify({
                tasksMigrated: true,
                shareNotificationsMigrated: true,
            }),
        });
        UserState.findOneAndUpdate.mockResolvedValue({});
        mockFindLean(Task, [
            {
                _id: "task-1",
                owner: "user-1",
                type: "transcribe",
                status: "completed",
                createdAt: new Date("2026-06-10T12:00:00Z"),
            },
        ]);
        mockFindLean(Notification, [
            {
                _id: "notification-1",
                owner: "user-1",
                type: "resource-shared",
                status: "completed",
                metadata: {
                    entityType: "chat",
                    entityId: "chat-1",
                    entityTitle: "Team standup",
                    sharedByName: "Hammad",
                    role: "viewer",
                    url: "/chat/chat-1",
                },
                createdAt: new Date("2026-06-11T12:00:00Z"),
            },
        ]);
        Notification.countDocuments.mockResolvedValue(1);
        Task.countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    });

    it("returns merged task and notification inbox items", async () => {
        const response = await GET(
            new Request("http://localhost/api/inbox?page=1&limit=10"),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.requests).toHaveLength(2);
        expect(body.requests[0]).toMatchObject({
            _id: "notification-1",
            inboxKind: "notification",
            type: "resource-shared",
            status: "completed",
        });
        expect(body.requests[1]).toMatchObject({
            _id: "task-1",
            inboxKind: "task",
            type: "transcribe",
        });
        expect(body.unreadNotificationCount).toBe(1);
        expect(body.activeTaskCount).toBe(0);
        expect(Task.find).toHaveBeenCalled();
        expect(Notification.find).toHaveBeenCalled();
        expect(Task.aggregate).not.toHaveBeenCalled();
    });
});
