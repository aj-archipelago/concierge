/** @jest-environment node */
jest.mock("bullmq", () => ({ Queue: jest.fn(() => ({ add: jest.fn() })) }));
jest.mock("../redis.mjs", () => ({ getRedisConnection: () => ({}) }));
jest.mock("../../models/task.mjs", () => ({
    __esModule: true,
    default: { create: jest.fn(), findById: jest.fn() },
}));
const { createBackgroundTask } = require("../tasks.js");
const Task = require("../../models/task.mjs").default;
const { Queue } = require("bullmq");

test.each(["edit", "extend"])(
    "invalid Seedance %s is rejected before writing a task or queue job",
    async (mode) => {
        await expect(
            createBackgroundTask({
                userId: "user",
                type: "media-generation",
                metadata: {
                    model: "replicate-seedance-2.5",
                    settings: {
                        models: {
                            "replicate-seedance-2.5": { generationMode: mode },
                        },
                    },
                },
            }),
        ).rejects.toMatchObject({
            status: 400,
            code: "REFERENCE_VIDEO_REQUIRED",
        });
        expect(Task.create).not.toHaveBeenCalled();
        expect(Task.findById).not.toHaveBeenCalled();
        expect(Queue.mock.results[0].value.add).not.toHaveBeenCalled();
    },
);
