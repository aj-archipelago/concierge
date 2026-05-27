/**
 * @jest-environment node
 */

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../utils/tasks", () => ({
    createBackgroundTask: jest.fn(),
}));

jest.mock("../../utils/task-utils.mjs", () => ({
    checkAndUpdateAbandonedTask: jest.fn(),
    syncTaskWithBullMQJob: jest.fn(),
    deleteTask: jest.fn(),
}));

jest.mock("../../models/request-progress.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

jest.mock("../../models/task.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
        countDocuments: jest.fn(),
    },
}));

jest.mock("../../models/user-state.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));

jest.mock("../../models/chat.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));

const { getCurrentUser } = require("../../utils/auth");
const { createBackgroundTask } = require("../../utils/tasks");
const { POST } = require("../route");

describe("POST /api/tasks", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, ENABLE_XAI_TRANSCRIBE: "true" };
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            contextId: "server-context",
        });
        createBackgroundTask.mockResolvedValue({
            taskId: "task-1",
            job: { id: "job-1" },
        });
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test("uses the authenticated user's contextId for transcribe tasks", async () => {
        const response = await POST({
            json: async () => ({
                type: "transcribe",
                source: "video_page",
                url: "https://example.com/audio.wav",
                modelOption: "xAI + Gemini",
                contextId: "client-context",
            }),
        });

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-1",
                type: "transcribe",
                metadata: expect.objectContaining({
                    contextId: "server-context",
                    modelOption: "xAI + Gemini",
                }),
                invokedFrom: { source: "video_page", chatId: undefined },
            }),
        );
    });
});
