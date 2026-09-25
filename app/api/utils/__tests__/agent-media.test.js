/** @jest-environment node */
import { executeMediaTool } from "../agent-media.js";
import { getClient } from "../cortex-client.js";
import { createBackgroundTask } from "../tasks.js";
import { checkMediaFile } from "../media-service-utils.js";
import { validatePublicMediaUrl } from "../publicMediaUrlValidation.js";
import { GET } from "../../tasks/[id]/route.js";
import Task from "../../models/task.mjs";
import File from "../../models/file.js";
import MediaItem from "../../models/media-item.mjs";
import { buildMediaVariables } from "../../../../src/utils/mediaGenerationVariables.js";

jest.mock("../../../../src/graphql", () => ({
    SYS_MODEL_METADATA: "metadata",
}));
jest.mock("../cortex-client.js", () => ({ getClient: jest.fn() }));
jest.mock("../tasks.js", () => ({
    createBackgroundTask: jest.fn(),
    getBackgroundTaskId: jest.fn(() => "a".repeat(24)),
}));
jest.mock("../agent-tool-capabilities.mjs", () => ({
    withAssistantDispatchLock: jest.fn((scope, action) => action()),
}));
jest.mock("../../tasks/[id]/route.js", () => ({ GET: jest.fn() }));
jest.mock("../media-service-utils.js", () => ({ checkMediaFile: jest.fn() }));
jest.mock("../publicMediaUrlValidation.js", () => ({
    validatePublicMediaUrl: jest.fn(),
}));
jest.mock("../../models/task.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));
jest.mock("../../models/media-item.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock("../../models/file.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));

const taskId = "a".repeat(24);
const user = { _id: "user", contextId: "user-context" };
const model = {
    modelId: "video-model",
    displayName: "Video Model",
    category: "video",
    mediaDefaults: {
        inputImages: [0, 2],
        inputVideos: [0, 1],
        inputAudio: [0, 1],
        duration: 5,
    },
    availableDurations: [5, 10],
    availableResolutions: ["720p", "1080p"],
    referenceImageRoles: ["start_frame", "end_frame"],
    referenceImageRoleLimits: { start_frame: [0, 1], end_frame: [0, 1] },
    mediaToggles: ["generateAudio"],
    mediaControls: [{ key: "seed", type: "integer", min: 0 }],
    mediaDefaultOverrides: [
        { when: { duration: 10 }, mediaOptions: { resolution: ["720p"] } },
    ],
};
let metadata;
let persisted;
const call = (args) =>
    executeMediaTool({
        user,
        entity: { id: "assistant" },
        binding: { chatId: "chat" },
        operationId: "call",
        args,
    });
const generate = (args = {}) =>
    call({
        operation: "generate",
        model: model.modelId,
        prompt: "A scene",
        requestKey: "scene-v1",
        ...args,
    });

beforeEach(() => {
    jest.clearAllMocks();
    metadata = [model];
    persisted = null;
    getClient.mockReturnValue({
        query: jest.fn(async () => ({
            data: {
                sys_model_metadata: {
                    result: JSON.stringify({ models: metadata }),
                },
            },
        })),
    });
    Task.findOne.mockImplementation(async () => persisted);
    MediaItem.findOne.mockReturnValue({ lean: async () => null });
    File.findOne.mockReturnValue({ lean: async () => null });
    validatePublicMediaUrl.mockResolvedValue({ ok: true });
    checkMediaFile.mockResolvedValue({
        url: "https://files.example/image.png",
        gcs: "gs://owned/image.png",
        blobPath: "media/image.png",
        hash: "file-hash",
    });
    createBackgroundTask.mockImplementation(async (options) => {
        persisted = {
            _id: taskId,
            status: "pending",
            metadata: options.metadata,
        };
        await options.beforeEnqueue(persisted);
        persisted.jobId = taskId;
        return { taskId };
    });
    GET.mockImplementation(async () =>
        Response.json({ status: persisted?.status || "pending", progress: 0 }),
    );
});

test("search is bounded, excludes unavailable/deprecated models, and does not include schemas", async () => {
    metadata = Array.from({ length: 12 }, (_, i) => ({
        ...model,
        modelId: `model-${i}`,
    }));
    metadata.push(
        { ...model, modelId: "old", isDeprecated: true },
        { ...model, modelId: "offline", isAvailable: false },
        { modelId: "chat", category: "chat" },
    );
    const result = await call({ operation: "search", category: "video" });
    expect(result.total).toBe(12);
    expect(result.models).toHaveLength(8);
    expect(result.nextOffset).toBe(8);
    expect(result.models[0]).not.toHaveProperty("controls");
    expect(
        (await call({ operation: "search", offset: 8 })).models,
    ).toHaveLength(4);
    expect(createBackgroundTask).not.toHaveBeenCalled();
});

test("describe returns only the chosen model and resolves conditional settings", async () => {
    const result = await call({
        operation: "describe",
        model: model.modelId,
        settings: { duration: 10 },
    });
    expect(
        result.controls
            .find((c) => c.key === "resolution")
            .options.map((o) => o.value),
    ).toEqual(["720p"]);
    expect(result.imageRoleLimits.start_frame).toEqual([0, 1]);
    expect(createBackgroundTask).not.toHaveBeenCalled();
});

test("generation queues the exact model and parameters and creates its pending item before dispatch", async () => {
    const result = await generate({
        settings: {
            duration: 10,
            resolution: "720p",
            generateAudio: false,
            seed: 0,
            outputQuality: 0,
        },
        references: [
            {
                type: "image",
                blobPath: "media/input.png",
                role: "start_frame",
                contextId: "other",
            },
        ],
        outputFolder: "media/project",
    });
    expect(result.taskId).toBe(taskId);
    expect(result.mediaTask).toEqual({
        taskId,
        type: "video",
        model: "video-model",
        name: "Video Model",
    });
    const queued = createBackgroundTask.mock.calls[0][0];
    expect(queued).toMatchObject({
        userId: user._id,
        type: "media-generation",
        invokedFrom: { chatId: "chat" },
        metadata: {
            outputFolder: "media/project",
            inputImageRole: "start_frame",
            inputImageHash: "file-hash",
            model: model.modelId,
        },
    });
    const variables = buildMediaVariables(
        model.modelId,
        queued.metadata.prompt,
        queued.metadata.settings.models[model.modelId],
        [queued.metadata.inputImageUrl],
        [queued.metadata.inputImageRole],
    );
    expect(variables).toMatchObject({
        model: model.modelId,
        duration: 10,
        resolution: "720p",
        generateAudio: false,
        seed: 0,
        inputImageRoles: ["start_frame"],
    });
    expect(checkMediaFile.mock.calls[0][0].storageTarget.contextId).toBe(
        user.contextId,
    );
    expect(MediaItem.findOneAndUpdate).toHaveBeenCalledWith(
        { user: user._id, taskId },
        expect.objectContaining({
            $setOnInsert: expect.objectContaining({
                status: "pending",
                taskId,
                type: "video",
            }),
        }),
        expect.objectContaining({ upsert: true }),
    );
});

test("a repeated request key reuses its task and a changed request fails", async () => {
    await generate();
    expect(await generate()).toMatchObject({
        taskId,
        mediaTask: { taskId, type: "video", model: "video-model" },
    });
    expect(createBackgroundTask).toHaveBeenCalledTimes(1);
    await expect(generate({ prompt: "Another scene" })).rejects.toThrow(
        "different generation",
    );
});

test("a retry recovers enqueue after a saved task without a queue receipt", async () => {
    createBackgroundTask.mockImplementationOnce(async ({ metadata }) => {
        persisted = { _id: taskId, status: "pending", metadata };
        throw new Error("queue unavailable");
    });
    await expect(generate()).rejects.toThrow("queue unavailable");
    await generate();
    const calls = createBackgroundTask.mock.calls;
    expect(calls[0][0].idempotencyKey).toBe(calls[1][0].idempotencyKey);
});

test.each([
    { model: "unknown" },
    { requestKey: "" },
    { outputFolder: "../other" },
    { references: [null] },
    { settings: { endpoint: "https://evil.test" } },
    { settings: { generateAudio: "false" } },
    { settings: { seed: -1 } },
    { settings: { duration: 10, resolution: "1080p" } },
    {
        references: [
            { type: "image", url: "https://example.com/x", role: "invalid" },
        ],
    },
    {
        references: Array.from({ length: 3 }, () => ({
            type: "image",
            url: "https://example.com/x",
        })),
    },
    {
        references: Array.from({ length: 2 }, () => ({
            type: "image",
            role: "start_frame",
            url: "https://example.com/x",
        })),
    },
])("rejects invalid generation before enqueue: %j", async (args) => {
    await expect(generate(args)).rejects.toMatchObject({ status: 400 });
    expect(createBackgroundTask).not.toHaveBeenCalled();
});

test("file IDs are owner scoped and arbitrary private URLs are rejected", async () => {
    await expect(
        generate({ references: [{ type: "image", fileId: "b".repeat(24) }] }),
    ).rejects.toMatchObject({ status: 404 });
    expect(File.findOne).toHaveBeenCalledWith({
        _id: "b".repeat(24),
        owner: user._id,
    });
    validatePublicMediaUrl.mockResolvedValue({
        ok: false,
        error: "url must be public",
    });
    await expect(
        generate({
            references: [{ type: "image", url: "http://localhost/private" }],
        }),
    ).rejects.toThrow("public");
    expect(createBackgroundTask).not.toHaveBeenCalled();
});

test("GCS models use the resolved owned URL; raw GCS URLs cannot bypass public URL validation", async () => {
    metadata = [{ ...model, preferredUrlFormat: "gcs" }];
    await generate({ references: [{ type: "image", hash: "owned-hash" }] });
    expect(createBackgroundTask.mock.calls[0][0].metadata.inputImageUrl).toBe(
        "gs://owned/image.png",
    );
});

test("promptless reference modes and multiple audio references preserve their worker contract", async () => {
    metadata = [
        {
            ...model,
            mediaDefaults: { inputImages: [0, 0], inputAudio: [0, 10] },
            mediaInputModes: [
                { promptRequired: false, requires: { inputAudio: [1, 10] } },
            ],
        },
    ];
    await generate({
        prompt: "",
        references: [
            { type: "audio", blobPath: "first.wav" },
            { type: "audio", blobPath: "second.wav" },
        ],
    });
    expect(
        createBackgroundTask.mock.calls[0][0].metadata.inputAudios,
    ).toHaveLength(2);
    expect(
        MediaItem.findOneAndUpdate.mock.calls[0][1].$setOnInsert.prompt,
    ).toBeTruthy();
});

test("status exposes all saved outputs without metadata and cannot read another user's task", async () => {
    await expect(call({ operation: "status", taskId })).rejects.toMatchObject({
        status: 404,
    });
    expect(Task.findOne).toHaveBeenCalledWith({
        _id: taskId,
        owner: user._id,
        type: "media-generation",
    });
    persisted = { _id: taskId, status: "completed" };
    MediaItem.findOne.mockReturnValue({
        lean: async () => ({
            _id: "media-id",
            status: "completed",
            providerMetadata: { secret: "internal" },
            outputFiles: [
                {
                    url: "https://files.example/1.png",
                    blobPath: "media/1.png",
                    hash: "one",
                },
                {
                    url: "https://files.example/2.png",
                    blobPath: "media/2.png",
                    hash: "two",
                },
            ],
        }),
    });
    const result = await call({ operation: "status", taskId });
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[1].hash).toBe("two");
    expect(result).not.toHaveProperty("providerMetadata");
    expect(createBackgroundTask).not.toHaveBeenCalled();
});

test("status can wait for completion and returns the final refreshed result", async () => {
    jest.useFakeTimers();
    persisted = { _id: taskId, status: "pending" };
    GET.mockResolvedValueOnce(
        Response.json({ status: "in_progress", progress: 0.5 }),
    ).mockResolvedValueOnce(
        Response.json({
            status: "completed",
            progress: 1,
            data: { url: "https://files.example/result.png", hash: "result" },
        }),
    );
    try {
        const pending = call({ operation: "status", taskId, waitSeconds: 2 });
        await jest.advanceTimersByTimeAsync(2000);
        expect(await pending).toMatchObject({
            status: "completed",
            outputs: [{ hash: "result" }],
        });
        expect(GET).toHaveBeenCalledTimes(2);
    } finally {
        jest.useRealTimers();
    }
});

test("reordered settings reuse the same request receipt", async () => {
    await generate({ settings: { duration: 5, resolution: "720p" } });
    await generate({ settings: { resolution: "720p", duration: 5 } });
    expect(createBackgroundTask).toHaveBeenCalledTimes(1);
});
