/**
 * @jest-environment node
 */

import { POST } from "../applet/media/route";

const mockQuery = jest.fn();

jest.mock("../../../src/graphql", () => ({
    getClient: () => ({
        query: mockQuery,
    }),
    SYS_MODEL_METADATA: { kind: "Document", definitions: [] },
}));

jest.mock("node:dns/promises", () => ({
    lookup: jest.fn(),
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../models/applet-file", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

jest.mock("../models/file", () => ({
    __esModule: true,
    default: {
        findByIdAndUpdate: jest.fn(),
    },
}));

jest.mock("../models/task.mjs", () => ({
    __esModule: true,
    default: {
        countDocuments: jest.fn(),
    },
}));

jest.mock("../utils/file-resolution-utils", () => ({
    resolveAndHealFile: jest.fn(),
}));

jest.mock("../utils/tasks", () => ({
    createBackgroundTask: jest.fn(),
}));

jest.mock("../applet/access.js", () => ({
    validateAppletAccess: jest.fn(),
}));

jest.mock("../applet/sdk-guard.js", () => ({
    APPLET_SDK_LIMITS: {
        mediaTask: { concurrent: 2, maxPerWindow: 12, windowMs: 60000 },
    },
    withAppletSdkGuard: jest.fn(({ run }) => run()),
}));

const { getCurrentUser } = require("../utils/auth");
const AppletFile = require("../models/applet-file").default;
const File = require("../models/file").default;
const Task = require("../models/task.mjs").default;
const { resolveAndHealFile } = require("../utils/file-resolution-utils");
const { lookup } = require("node:dns/promises");
const { createBackgroundTask } = require("../utils/tasks");
const { validateAppletAccess } = require("../applet/access.js");
const { withAppletSdkGuard } = require("../applet/sdk-guard.js");

const appletId = "507f191e810c19729de860ea";

function createRequest(body, options = {}) {
    const headers = options.headers || {};
    return {
        url: options.url || "http://localhost:3000/api/applet/media",
        headers: {
            get: (name) => headers[name.toLowerCase()] || null,
        },
        json: () =>
            Promise.resolve({
                appletId,
                ...body,
            }),
    };
}

function mockMediaMetadata(models = []) {
    mockQuery.mockResolvedValueOnce({
        data: {
            sys_model_metadata: {
                result: JSON.stringify({ models, redirects: {} }),
            },
        },
    });
}

describe("POST /api/applet/media", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, ENABLE_XAI_TRANSCRIBE: "true" };
        lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            contextId: "server-context",
        });
        validateAppletAccess.mockResolvedValue(null);
        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(null),
        });
        File.findByIdAndUpdate.mockResolvedValue(null);
        Task.countDocuments.mockResolvedValue(0);
        resolveAndHealFile.mockResolvedValue({});
        createBackgroundTask.mockResolvedValue({
            taskId: "task-1",
            job: { id: "job-1" },
        });
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test("enqueues a transcribe task with server user context", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://youtu.be/abc123",
                contextId: "client-context",
                language: "ar",
                responseFormat: "text",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({ taskId: "task-1", jobId: "job-1" });
        expect(createBackgroundTask).toHaveBeenCalledWith({
            userId: "user-1",
            type: "transcribe",
            synchronous: false,
            invokedFrom: {
                source: "applet_sdk",
                appletId,
            },
            metadata: expect.objectContaining({
                url: "https://youtu.be/abc123",
                language: "ar",
                responseFormat: "",
                modelOption: "Gemini",
                contextId: "server-context",
                enforcePublicUrl: false,
                skipUserState: true,
                isYoutube: true,
            }),
        });
        expect(withAppletSdkGuard).toHaveBeenCalledWith(
            expect.objectContaining({
                appletId,
                userId: "user-1",
                api: "media.transcribe",
            }),
        );
        expect(withAppletSdkGuard.mock.invocationCallOrder[0]).toBeLessThan(
            lookup.mock.invocationCallOrder[0],
        );
    });

    test("enqueues a transcribe task from an applet-uploaded fileId", async () => {
        const fileId = "507f191e810c19729de860eb";
        const file = {
            _id: { toString: () => fileId },
            originalName: "clip.mp4",
            mimeType: "video/mp4",
        };
        const populate = jest.fn().mockResolvedValue({ files: [file] });
        AppletFile.findOne.mockReturnValue({ populate });
        resolveAndHealFile.mockResolvedValue({
            accessUrl: "https://files.example/clip.mp4?sig=ok",
        });

        const response = await POST(
            createRequest({
                operation: "transcribe",
                fileId,
                responseFormat: "vtt",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({ taskId: "task-1", jobId: "job-1" });
        expect(AppletFile.findOne).toHaveBeenCalledWith({
            appletId,
            userId: "user-1",
        });
        expect(populate).toHaveBeenCalledWith("files");
        expect(resolveAndHealFile).toHaveBeenCalledWith(
            file,
            expect.objectContaining({
                allowUrlRefresh: false,
            }),
        );
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    url: "https://files.example/clip.mp4?sig=ok",
                    responseFormat: "vtt",
                    modelOption: "xAI + Gemini",
                    contextId: "server-context",
                    enforcePublicUrl: false,
                    skipUserState: true,
                }),
            }),
        );
    });

    test("defaults applet transcription to xAI plus Gemini when available", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://example.com/video.mp4",
                responseFormat: "text",
            }),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    modelOption: "xAI + Gemini",
                    responseFormat: "",
                    wordTimestamped: false,
                    highlightWords: false,
                }),
            }),
        );
    });

    test("forwards transcription subtitle layout options", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://example.com/video.mp4",
                modelOption: "Whisper",
                responseFormat: "vtt",
                wordTimestamped: true,
                maxLineCount: 1,
                maxLineWidth: 35,
                maxWordsPerLine: 3,
            }),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    modelOption: "Whisper",
                    responseFormat: "vtt",
                    wordTimestamped: true,
                    maxLineCount: 1,
                    maxLineWidth: 35,
                    maxWordsPerLine: 3,
                    highlightWords: false,
                }),
            }),
        );
    });

    test("normalizes highlighted words to true word-level mode", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://example.com/video.mp4",
                responseFormat: "vtt",
                maxLineCount: 1,
                maxLineWidth: 35,
                maxWordsPerLine: 3,
                highlightWords: true,
            }),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    modelOption: "xAI + Gemini",
                    responseFormat: "vtt",
                    wordTimestamped: true,
                    maxLineCount: undefined,
                    maxLineWidth: undefined,
                    maxWordsPerLine: undefined,
                    highlightWords: true,
                }),
            }),
        );
    });

    test("defaults word-timestamped applet transcription to xAI plus Gemini when available", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://example.com/video.mp4",
                responseFormat: "vtt",
                wordTimestamped: true,
                highlightWords: true,
            }),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    modelOption: "xAI + Gemini",
                    wordTimestamped: true,
                    highlightWords: true,
                }),
            }),
        );
    });

    test("routes Gemini word-timestamped applet transcription to xAI plus Gemini when available", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://example.com/video.mp4",
                modelOption: "Gemini",
                responseFormat: "vtt",
                wordTimestamped: true,
            }),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    modelOption: "xAI + Gemini",
                    wordTimestamped: true,
                }),
            }),
        );
    });

    test("keeps YouTube transcription on Gemini and drops unsupported word options", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://www.youtube.com/watch?v=abc123",
                responseFormat: "vtt",
                wordTimestamped: true,
                maxLineCount: 1,
                maxLineWidth: 35,
                maxWordsPerLine: 3,
                highlightWords: true,
            }),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    modelOption: "Gemini",
                    wordTimestamped: false,
                    maxWordsPerLine: undefined,
                    highlightWords: false,
                    isYoutube: true,
                }),
            }),
        );
    });

    test("resolves same-applet file content URLs before public URL validation", async () => {
        const fileId = "507f191e810c19729de860ec";
        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [
                    {
                        _id: { toString: () => fileId },
                        originalName: "clip.mp4",
                        mimeType: "video/mp4",
                    },
                ],
            }),
        });
        resolveAndHealFile.mockResolvedValue({
            accessUrl: "https://files.example/clip.mp4?sig=ok",
        });

        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: `http://localhost:3000/api/canvas-applets/${appletId}/files/${fileId}/content`,
            }),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    url: "https://files.example/clip.mp4?sig=ok",
                    enforcePublicUrl: false,
                }),
            }),
        );
    });

    test("resolves applet file content URLs through forwarded proxy origin", async () => {
        const fileId = "507f191e810c19729de860ee";
        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [
                    {
                        _id: { toString: () => fileId },
                        originalName: "clip.mp4",
                        mimeType: "video/mp4",
                    },
                ],
            }),
        });
        resolveAndHealFile.mockResolvedValue({
            accessUrl: "https://files.example/clip.mp4?sig=ok",
        });

        const response = await POST(
            createRequest(
                {
                    operation: "transcribe",
                    url: `http://localhost:3000/api/canvas-applets/${appletId}/files/${fileId}/content`,
                },
                {
                    url: "http://127.0.0.1:3001/api/applet/media",
                    headers: {
                        "x-forwarded-host": "localhost:3000",
                        "x-forwarded-proto": "http",
                    },
                },
            ),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    url: "https://files.example/clip.mp4?sig=ok",
                    enforcePublicUrl: false,
                }),
            }),
        );
    });

    test("rejects resolved file URLs that are not public", async () => {
        const fileId = "507f191e810c19729de860ef";
        AppletFile.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                files: [
                    {
                        _id: { toString: () => fileId },
                        originalName: "clip.mp4",
                        mimeType: "video/mp4",
                    },
                ],
            }),
        });
        resolveAndHealFile.mockResolvedValue({
            accessUrl: "http://127.0.0.1/internal.mp4",
        });

        const response = await POST(
            createRequest({
                operation: "transcribe",
                fileId,
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("url must be a public http(s) URL");
        expect(resolveAndHealFile).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                allowUrlRefresh: false,
            }),
        );
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test("does not treat cross-origin matching paths as applet file refs", async () => {
        const fileId = "507f191e810c19729de860ed";

        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: `https://media.example/api/canvas-applets/${appletId}/files/${fileId}/content`,
            }),
        );

        expect(response.status).toBe(200);
        expect(AppletFile.findOne).not.toHaveBeenCalled();
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    url: `https://media.example/api/canvas-applets/${appletId}/files/${fileId}/content`,
                    enforcePublicUrl: true,
                }),
            }),
        );
    });

    test("rejects malformed encoded applet file URLs as validation errors", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: `http://localhost:3000/api/canvas-applets/${appletId}/files/%E0%A4%A/content`,
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("file URL contains an invalid file ID");
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test("enqueues a subtitle translation task without video page side effects", async () => {
        const response = await POST(
            createRequest({
                operation: "translate-subtitles",
                text: "1\n00:00:00,000 --> 00:00:01,000\nHello",
                to: "Arabic",
                format: "srt",
                name: "Arabic subtitles",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({ taskId: "task-1", jobId: "job-1" });
        expect(createBackgroundTask).toHaveBeenCalledWith({
            userId: "user-1",
            type: "subtitle-translate",
            synchronous: false,
            invokedFrom: {
                source: "applet_sdk",
                appletId,
            },
            metadata: {
                text: "1\n00:00:00,000 --> 00:00:01,000\nHello",
                to: "Arabic",
                format: "srt",
                name: "Arabic subtitles",
                skipUserState: true,
            },
        });
    });

    test("keeps media task results out of Video page state", async () => {
        await POST(
            createRequest({
                operation: "translate-subtitles",
                text: "WEBVTT\n\n00:00.000 --> 00:01.000\nHello",
                to: "Arabic",
                format: "vtt",
                persistToVideoPage: true,
            }),
        );

        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    skipUserState: true,
                }),
            }),
        );
    });

    test("keeps SDK media tasks async even when a client asks for synchronous execution", async () => {
        createBackgroundTask.mockResolvedValueOnce({
            taskId: "task-2",
            job: { id: "job-2" },
        });

        const response = await POST(
            createRequest({
                operation: "translate-subtitles",
                text: "1\n00:00:00,000 --> 00:00:01,000\nHello",
                to: "Arabic",
                synchronous: true,
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({ taskId: "task-2", jobId: "job-2" });
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({ synchronous: false }),
        );
    });

    test("accepts VTT cues with settings for subtitle translation", async () => {
        const response = await POST(
            createRequest({
                operation: "translate-subtitles",
                text: "WEBVTT\n\n00:00.000 --> 00:01.000 align:start\nHello",
                to: "Arabic",
                format: "vtt",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({ taskId: "task-1", jobId: "job-1" });
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "subtitle-translate",
                metadata: expect.objectContaining({
                    format: "vtt",
                }),
            }),
        );
    });

    test("enqueues a media generation task with media page settings and references", async () => {
        mockMediaMetadata([
            {
                modelId: "image-model",
                displayName: "Image Model",
                category: "image",
                isDefault: true,
                isAvailable: true,
                mediaDefaults: {
                    aspectRatio: "1:1",
                },
            },
        ]);

        const response = await POST(
            createRequest({
                operation: "create-media",
                prompt: "Make a poster",
                displayPrompt: "Poster",
                model: "image-model",
                outputType: "image",
                settings: {
                    models: {
                        "image-model": {
                            aspectRatio: "16:9",
                        },
                    },
                },
                quality: "high",
                seed: 123,
                outputFolder: "\\/applets//assets\\demo//",
                inputImages: [
                    {
                        url: "https://example.com/source.png",
                        role: "reference",
                        blobPath: "media/source.png",
                        hash: "hash-1",
                    },
                ],
                inputTags: ["poster", "demo"],
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({ taskId: "task-1", jobId: "job-1" });
        expect(createBackgroundTask).toHaveBeenCalledWith({
            userId: "user-1",
            type: "media-generation",
            synchronous: false,
            invokedFrom: {
                source: "applet_sdk",
                appletId,
            },
            metadata: expect.objectContaining({
                prompt: "Make a poster",
                displayPrompt: "Poster",
                outputType: "image",
                model: "image-model",
                outputFolder: "applets/assets/demo",
                inputImageUrl: "https://example.com/source.png",
                inputImageRole: "reference",
                inputImageBlobPath: "media/source.png",
                inputImageHash: "hash-1",
                inputTags: ["poster", "demo"],
                skipUserState: true,
                settings: {
                    models: {
                        "image-model": {
                            aspectRatio: "16:9",
                            quality: "high",
                            seed: 123,
                        },
                    },
                },
            }),
        });
        expect(withAppletSdkGuard).toHaveBeenCalledWith(
            expect.objectContaining({
                appletId,
                userId: "user-1",
                api: "media.create",
            }),
        );
    });

    test("defaults media generation to the requested media kind model", async () => {
        mockMediaMetadata([
            {
                modelId: "image-model",
                category: "image",
                isDefault: true,
                isAvailable: true,
            },
            {
                modelId: "speech-model",
                category: "tts",
                isAvailable: true,
            },
        ]);

        const response = await POST(
            createRequest({
                operation: "create-media",
                prompt: "Say hello",
                outputType: "audio",
                mediaKind: "tts",
                voiceName: "Aoede",
            }),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "media-generation",
                metadata: expect.objectContaining({
                    model: "speech-model",
                    outputType: "audio",
                    settings: {
                        models: {
                            "speech-model": {
                                voiceName: "Aoede",
                            },
                        },
                    },
                }),
            }),
        );
    });

    test("enqueues upscaling media tasks with promptless model settings", async () => {
        mockMediaMetadata([
            {
                modelId: "video-upscaler",
                displayName: "Video Upscaler",
                category: "upscaling",
                isAvailable: true,
                mediaDefaults: {
                    inputVideos: [1, 1],
                },
            },
        ]);

        const response = await POST(
            createRequest({
                operation: "create-media",
                model: "video-upscaler",
                mediaKind: "upscaling",
                inputVideos: [
                    {
                        url: "https://example.com/source.mp4",
                        blobPath: "media/source.mp4",
                        hash: "hash-video",
                    },
                ],
                processingType: "pro",
                targetResolution: "4k",
                targetFps: 60,
            }),
        );

        expect(response.status).toBe(200);
        expect(createBackgroundTask).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "media-generation",
                metadata: expect.objectContaining({
                    prompt: "",
                    model: "video-upscaler",
                    outputType: "video",
                    inputVideoUrl: "https://example.com/source.mp4",
                    inputVideoBlobPath: "media/source.mp4",
                    inputVideoHash: "hash-video",
                    settings: {
                        models: {
                            "video-upscaler": {
                                processingType: "pro",
                                targetResolution: "4k",
                                targetFps: 60,
                            },
                        },
                    },
                }),
            }),
        );
    });

    test("rejects chat models for media generation", async () => {
        mockMediaMetadata([
            {
                modelId: "image-model",
                category: "image",
                isAvailable: true,
            },
            {
                modelId: "chat-model",
                category: "chat",
                isAvailable: true,
            },
        ]);

        const response = await POST(
            createRequest({
                operation: "create-media",
                prompt: "Make a poster",
                model: "chat-model",
                outputType: "image",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("model must be an available media model");
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test("limits active applet media tasks before enqueueing", async () => {
        Task.countDocuments.mockResolvedValueOnce(2);

        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://example.com/video.mp4",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(429);
        expect(data.code).toBe("APPLET_MEDIA_TASK_LIMITED");
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test.each([
        ["maxLineWidth", 201, "maxLineWidth must be 200 or less"],
        ["maxWordsPerLine", 51, "maxWordsPerLine must be 50 or less"],
        ["maxLineCount", 51, "maxLineCount must be 50 or less"],
    ])(
        "rejects oversized transcription option %s",
        async (key, value, error) => {
            const response = await POST(
                createRequest({
                    operation: "transcribe",
                    url: "https://example.com/video.mp4",
                    [key]: value,
                }),
            );
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe(error);
            expect(createBackgroundTask).not.toHaveBeenCalled();
        },
    );

    test("rejects oversized subtitle text before enqueueing", async () => {
        const response = await POST(
            createRequest({
                operation: "translate-subtitles",
                text: "x".repeat(250001),
                to: "Arabic",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("text must be 250000 characters or less");
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test("rejects unknown transcription model options", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://example.com/video.mp4",
                modelOption: "NotARealModel",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe(
            "modelOption must be one of: Whisper, NeuralSpace, Gemini, MAI-Transcribe-1.5, xAI, xAI + Gemini",
        );
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test("normalizes MAI transcription metadata and uses the longer task timeout", async () => {
        process.env.ENABLE_MAI_TRANSCRIBE = "true";

        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://example.com/video.mp4",
                modelOption: "MAI-Transcribe-1.5",
                wordTimestamped: true,
                maxLineCount: 10,
                maxLineWidth: 42,
                maxWordsPerLine: 8,
                highlightWords: true,
            }),
        );

        expect(response.status).toBe(200);
        const args = createBackgroundTask.mock.calls[0][0];
        expect(args.timeout).toBe(60 * 60 * 1000);
        expect(args.metadata).toEqual(
            expect.objectContaining({
                modelOption: "MAI-Transcribe-1.5",
                wordTimestamped: false,
                maxLineCount: undefined,
                maxLineWidth: undefined,
                maxWordsPerLine: undefined,
                highlightWords: false,
            }),
        );
    });

    test("validates required operation payloads before enqueueing", async () => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("url is required");
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test.each([
        "file:///etc/passwd",
        "http://localhost:3000/video.mp4",
        "http://127.0.0.1/video.mp4",
        "http://10.0.0.4/video.mp4",
        "http://169.254.169.254/latest/meta-data",
    ])("rejects non-public transcription URL %s", async (url) => {
        const response = await POST(
            createRequest({
                operation: "transcribe",
                url,
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("url must be a public http(s) URL");
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test("rejects transcription URLs whose DNS resolves to a private address", async () => {
        lookup.mockResolvedValueOnce([{ address: "10.0.0.4", family: 4 }]);

        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://media.example/video.mp4",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("url must be a public http(s) URL");
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test("does not inherit the MCP private URL bypass flag", async () => {
        process.env.MCP_ALLOW_PRIVATE_URLS = "true";

        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "http://localhost:3000/video.mp4",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("url must be a public http(s) URL");
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });

    test("returns access errors before enqueueing", async () => {
        validateAppletAccess.mockResolvedValueOnce(
            Response.json({ error: "Access denied" }, { status: 403 }),
        );

        const response = await POST(
            createRequest({
                operation: "transcribe",
                url: "https://example.com/video.mp4",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe("Access denied");
        expect(createBackgroundTask).not.toHaveBeenCalled();
    });
});
