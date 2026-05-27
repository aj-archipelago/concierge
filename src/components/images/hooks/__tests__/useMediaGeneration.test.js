/**
 * @jest-environment jsdom
 */

import {
    applyInputAudioReference,
    applyInputImageReference,
    applyInputImageRole,
    applyStoredInputAudioReference,
    applyInputVideoReference,
    applyStoredInputImageReference,
    applyStoredInputVideoReference,
    getInputAudioUrl,
    getInputImageUrl,
    getInputVideoUrl,
    hasUsableInputAudioUrl,
    hasUsableInputImageUrl,
    hasUsableInputVideoUrl,
    useMediaGeneration,
} from "../useMediaGeneration";
import { act, renderHook } from "@testing-library/react";

let mockMediaModels = [];

jest.mock("../../../../../app/queries/modelMetadata", () => ({
    useMediaModels: () => ({ data: mockMediaModels }),
}));

beforeEach(() => {
    mockMediaModels = [];
    jest.clearAllMocks();
});

describe("useMediaGeneration input image helpers", () => {
    test("prefers Azure URLs by default and GCS URLs when requested", () => {
        const image = {
            url: "https://display.example/image.png",
            azureUrl: "https://azure.example/image.png?stale=sas",
            gcsUrl: "gs://bucket/image.png",
        };

        expect(getInputImageUrl(image)).toBe(
            "https://azure.example/image.png?stale=sas",
        );
        expect(getInputImageUrl(image, true)).toBe("gs://bucket/image.png");
    });

    test("prefers GCS URLs for input videos when requested", () => {
        const video = {
            url: "https://display.example/video.mp4",
            azureUrl: "https://azure.example/video.mp4?stale=sas",
            gcsUrl: "gs://bucket/video.mp4",
        };

        expect(getInputVideoUrl(video)).toBe(
            "https://azure.example/video.mp4?stale=sas",
        );
        expect(getInputVideoUrl(video, true)).toBe("gs://bucket/video.mp4");
    });

    test("accepts selected images with any stored input URL", () => {
        expect(
            hasUsableInputImageUrl({ azureUrl: "https://azure.example/a" }),
        ).toBe(true);
        expect(hasUsableInputImageUrl({ gcsUrl: "gs://bucket/a" })).toBe(true);
        expect(
            hasUsableInputImageUrl({ url: "https://display.example/a" }),
        ).toBe(true);
        expect(hasUsableInputImageUrl({ blobPath: "media/a.png" })).toBe(false);
    });

    test("accepts selected videos with any stored input URL", () => {
        expect(
            hasUsableInputVideoUrl({ azureUrl: "https://azure.example/a.mp4" }),
        ).toBe(true);
        expect(hasUsableInputVideoUrl({ gcsUrl: "gs://bucket/a.mp4" })).toBe(
            true,
        );
        expect(
            hasUsableInputVideoUrl({
                url: "https://display.example/a.mp4",
            }),
        ).toBe(true);
        expect(hasUsableInputVideoUrl({ blobPath: "media/a.mp4" })).toBe(false);
    });

    test("accepts selected audio with any stored input URL", () => {
        expect(
            hasUsableInputAudioUrl({
                type: "audio",
                azureUrl: "https://azure.example/a.wav",
            }),
        ).toBe(true);
        expect(
            hasUsableInputAudioUrl({
                type: "audio",
                gcsUrl: "gs://bucket/a.wav",
            }),
        ).toBe(true);
        expect(
            hasUsableInputAudioUrl({
                type: "audio",
                url: "https://display.example/a.wav",
            }),
        ).toBe(true);
        expect(
            hasUsableInputAudioUrl({
                type: "image",
                url: "https://display.example/a.png",
            }),
        ).toBe(false);
        expect(hasUsableInputAudioUrl({ type: "audio" })).toBe(false);
    });

    test("adds stable file identifiers next to the input audio URL", () => {
        const taskData = {};
        const audio = {
            type: "audio",
            url: "https://display.example/source.wav",
            azureUrl: "https://azure.example/source.wav?stale=sas",
            blobPath: "media/source.wav",
            hash: "hash-source",
        };

        expect(getInputAudioUrl(audio)).toBe(
            "https://azure.example/source.wav?stale=sas",
        );

        applyInputAudioReference(taskData, audio);

        expect(taskData).toEqual({
            inputAudioUrl: "https://azure.example/source.wav?stale=sas",
            inputAudioBlobPath: "media/source.wav",
            inputAudioHash: "hash-source",
        });
    });

    test("adds stable file identifiers next to the URL for the worker refresh", () => {
        const taskData = {};

        applyInputImageReference(
            taskData,
            {
                azureUrl: "https://azure.example/media/a.png?stale=sas",
                blobPath: "media/a.png",
                hash: "hash-a",
            },
            0,
            false,
        );

        expect(taskData).toEqual({
            inputImageUrl: "https://azure.example/media/a.png?stale=sas",
            inputImageBlobPath: "media/a.png",
            inputImageHash: "hash-a",
        });
    });

    test("uses numbered input fields for additional selected images", () => {
        const taskData = {};

        applyInputImageReference(
            taskData,
            {
                gcsUrl: "gs://bucket/media/b.png",
                azureUrl: "https://azure.example/media/b.png?stale=sas",
                blobPath: "media/b.png",
                hash: "hash-b",
            },
            1,
            true,
        );

        expect(taskData).toEqual({
            inputImageUrl2: "gs://bucket/media/b.png",
            inputImageBlobPath2: "media/b.png",
            inputImageHash2: "hash-b",
        });
    });

    test("adds stable file identifiers next to the input video URL", () => {
        const taskData = {};

        applyInputVideoReference(
            taskData,
            {
                azureUrl: "https://azure.example/media/a.mp4?stale=sas",
                gcsUrl: "gs://bucket/media/a.mp4",
                blobPath: "media/a.mp4",
                hash: "hash-video-a",
            },
            0,
            true,
        );

        expect(taskData).toEqual({
            inputVideoUrl: "gs://bucket/media/a.mp4",
            inputVideoBlobPath: "media/a.mp4",
            inputVideoHash: "hash-video-a",
        });
    });

    test("stores display input image references with numbered fields", () => {
        const mediaItemData = {};

        applyStoredInputImageReference(
            mediaItemData,
            {
                url: "https://display.example/media/d.png",
                azureUrl: "https://azure.example/media/d.png?stale=sas",
                gcsUrl: "gs://bucket/media/d.png",
            },
            3,
        );

        expect(mediaItemData).toEqual({
            inputImageUrl4: "https://display.example/media/d.png",
        });
    });

    test("stores display input video references", () => {
        const mediaItemData = {};

        applyStoredInputVideoReference(
            mediaItemData,
            {
                url: "https://display.example/media/d.mp4",
                azureUrl: "https://azure.example/media/d.mp4?stale=sas",
                gcsUrl: "gs://bucket/media/d.mp4",
            },
            0,
            "extend",
        );

        expect(mediaItemData).toEqual({
            inputVideoUrl: "https://display.example/media/d.mp4",
            inputVideoRole: "extend",
        });
    });

    test("stores display input audio references", () => {
        const mediaItemData = {};

        applyStoredInputAudioReference(mediaItemData, {
            type: "audio",
            url: "https://display.example/media/source.wav",
            azureUrl: "https://azure.example/media/source.wav?stale=sas",
            blobPath: "media/source.wav",
            hash: "hash-source",
        });

        expect(mediaItemData).toEqual({
            inputAudioUrl: "https://display.example/media/source.wav",
            inputAudioBlobPath: "media/source.wav",
            inputAudioHash: "hash-source",
        });
    });

    test("stores numbered input image roles", () => {
        const taskData = {};

        applyInputImageRole(taskData, "end_frame", 1);

        expect(taskData).toEqual({
            inputImageRole2: "end_frame",
        });
    });
});

describe("useMediaGeneration settings snapshot", () => {
    test("queues generation with the latest settings ref", async () => {
        const runTask = {
            mutateAsync: jest.fn().mockResolvedValue({ taskId: "task-1" }),
        };
        const createMediaItem = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };
        const promptRef = { current: { focus: jest.fn() } };
        const staleSettings = {
            models: {
                "google-lyria-3-music": {
                    type: "audio",
                    duration: 30,
                    audioUseCase: "music",
                    audioStyle: "cinematic",
                    audioMood: "focused",
                },
            },
        };
        const latestSettings = {
            models: {
                "google-lyria-3-music": {
                    type: "audio",
                    duration: 30,
                    audioUseCase: "music",
                    audioStyle: "orchestral",
                    audioMood: "focused",
                },
            },
        };
        const expectedSettings = {
            models: {
                "google-lyria-3-music": {
                    type: "audio",
                },
            },
        };

        const view = renderHook(() =>
            useMediaGeneration({
                selectedModel: "google-lyria-3-music",
                outputType: "audio",
                settings: staleSettings,
                settingsRef: { current: latestSettings },
                runTask,
                createMediaItem,
                promptRef,
                setLoading: jest.fn(),
            }),
        );

        await act(async () => {
            await view.result.current.generateMedia("turkish music");
        });

        expect(runTask.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: expectedSettings,
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: expectedSettings,
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.not.objectContaining({
                audioStyle: expect.anything(),
                audioMood: expect.anything(),
                audioUseCase: expect.anything(),
                duration: expect.anything(),
            }),
        );
    });

    test("queues generation into the selected media folder", async () => {
        const runTask = {
            mutateAsync: jest.fn().mockResolvedValue({ taskId: "task-folder" }),
        };
        const createMediaItem = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };
        const promptRef = { current: { focus: jest.fn() } };

        const view = renderHook(() =>
            useMediaGeneration({
                selectedModel: "gpt-image-2",
                outputType: "image",
                settings: {
                    models: {
                        "gpt-image-2": {
                            type: "image",
                        },
                    },
                },
                outputFolder: "Article Demo",
                runTask,
                createMediaItem,
                promptRef,
                setLoading: jest.fn(),
            }),
        );

        await act(async () => {
            await view.result.current.generateMedia("article hero image");
        });

        expect(runTask.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                outputFolder: "Article Demo",
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                outputFolder: "Article Demo",
                status: "pending",
            }),
        );
    });

    test("uses per-generation music settings overrides", async () => {
        const runTask = {
            mutateAsync: jest.fn().mockResolvedValue({ taskId: "task-music" }),
        };
        const createMediaItem = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };
        const promptRef = { current: { focus: jest.fn() } };
        const settings = {
            models: {
                "replicate-minimax-music-26": {
                    type: "audio",
                    isInstrumental: true,
                },
            },
        };
        const generationSettings = {
            models: {
                "replicate-minimax-music-26": {
                    type: "audio",
                    audioFormat: "mp3",
                    sampleRate: 44100,
                    bitrate: 256000,
                    isInstrumental: false,
                    lyricsOptimizer: true,
                    lyrics: "Sunrise over the desert",
                },
            },
        };

        const view = renderHook(() =>
            useMediaGeneration({
                selectedModel: "replicate-minimax-music-26",
                outputType: "audio",
                settings,
                runTask,
                createMediaItem,
                promptRef,
                setLoading: jest.fn(),
            }),
        );

        await act(async () => {
            await view.result.current.generateMedia(
                "cinematic desert pop",
                null,
                null,
                "",
                generationSettings,
            );
        });

        expect(runTask.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: generationSettings,
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: generationSettings,
            }),
        );
    });

    test("queues MiniMax cover with selected audio input", async () => {
        const runTask = {
            mutateAsync: jest.fn().mockResolvedValue({ taskId: "task-cover" }),
        };
        const createMediaItem = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };
        const promptRef = { current: { focus: jest.fn() } };
        const inputAudio = {
            type: "audio",
            url: "https://display.example/source.wav",
            azureUrl: "https://azure.example/source.wav?stale=sas",
            blobPath: "media/source.wav",
            hash: "hash-source",
        };
        const settings = {
            models: {
                "replicate-minimax-music-cover": {
                    type: "audio",
                    audioFormat: "wav",
                    sampleRate: 44100,
                    bitrate: 256000,
                },
            },
        };
        const expectedSettings = {
            models: {
                "replicate-minimax-music-cover": {
                    type: "audio",
                },
            },
        };

        const view = renderHook(() =>
            useMediaGeneration({
                selectedModel: "replicate-minimax-music-cover",
                outputType: "audio",
                settings,
                runTask,
                createMediaItem,
                promptRef,
                setLoading: jest.fn(),
            }),
        );

        await act(async () => {
            await view.result.current.generateMedia(
                "add cello layer",
                null,
                null,
                "",
                null,
                inputAudio,
            );
        });

        expect(runTask.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                model: "replicate-minimax-music-cover",
                inputAudioUrl: "https://azure.example/source.wav?stale=sas",
                inputAudioBlobPath: "media/source.wav",
                inputAudioHash: "hash-source",
                settings: expectedSettings,
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                model: "replicate-minimax-music-cover",
                inputAudioUrl: "https://display.example/source.wav",
                inputAudioBlobPath: "media/source.wav",
                inputAudioHash: "hash-source",
                settings: expectedSettings,
            }),
        );
    });

    test("queues image-only Lyria generation with selected image context", async () => {
        mockMediaModels = [
            {
                modelId: "google-lyria-3-music",
                preferredUrlFormat: "gcs",
                mediaDefaults: {
                    inputImages: [0, 1],
                },
            },
        ];
        const runTask = {
            mutateAsync: jest.fn().mockResolvedValue({ taskId: "task-lyria" }),
        };
        const createMediaItem = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };
        const promptRef = { current: { focus: jest.fn() } };

        const view = renderHook(() =>
            useMediaGeneration({
                selectedModel: "google-lyria-3-music",
                outputType: "audio",
                settings: {
                    models: {
                        "google-lyria-3-music": {
                            type: "audio",
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
                setLoading: jest.fn(),
            }),
        );

        await act(async () => {
            await view.result.current.handleModifySelected({
                prompt: "",
                selectedImagesObjects: [
                    {
                        type: "image",
                        url: "https://display.example/reference.png",
                        azureUrl:
                            "https://azure.example/reference.png?stale=sas",
                        gcsUrl: "gs://bucket/reference.png",
                        blobPath: "media/reference.png",
                        hash: "hash-reference",
                        tags: ["newsroom"],
                    },
                ],
                outputType: "audio",
                selectedModel: "google-lyria-3-music",
                settings: {
                    models: {
                        "google-lyria-3-music": {
                            type: "audio",
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
            });
        });

        expect(runTask.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: "",
                displayPrompt: "Image-only music generation",
                outputType: "audio",
                model: "google-lyria-3-music",
                inputImageUrl: "gs://bucket/reference.png",
                inputImageBlobPath: "media/reference.png",
                inputImageHash: "hash-reference",
                inputTags: ["newsroom"],
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: "Image-only music generation",
                type: "audio",
                model: "google-lyria-3-music",
                inputImageUrl: "https://display.example/reference.png",
                tags: ["newsroom"],
            }),
        );
    });

    test("queues a selected video with the extend role as an input video", async () => {
        mockMediaModels = [
            {
                modelId: "veo-3.1-generate",
                preferredUrlFormat: "gcs",
                mediaDefaults: {
                    inputImages: [0, 3],
                    inputVideos: [0, 1],
                },
                videoInputModes: ["extend"],
            },
        ];
        const runTask = {
            mutateAsync: jest.fn().mockResolvedValue({ taskId: "task-extend" }),
        };
        const createMediaItem = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };
        const promptRef = { current: { focus: jest.fn() } };
        const selectedImagesObjects = [
            {
                cortexRequestId: "video-reference-1",
                type: "video",
                url: "https://display.example/reference.mp4",
                azureUrl: "https://azure.example/reference.mp4?stale=sas",
                gcsUrl: "gs://bucket/reference.mp4",
                blobPath: "media/reference.mp4",
                hash: "hash-reference-video",
                tags: ["source"],
            },
        ];

        const view = renderHook(() =>
            useMediaGeneration({
                selectedModel: "veo-3.1-generate",
                outputType: "video",
                settings: {
                    models: {
                        "veo-3.1-generate": {
                            type: "video",
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
                setLoading: jest.fn(),
            }),
        );

        await act(async () => {
            await view.result.current.handleModifySelected({
                prompt: "continue this shot",
                selectedImagesObjects,
                outputType: "video",
                selectedModel: "veo-3.1-generate",
                settings: {
                    models: {
                        "veo-3.1-generate": {
                            type: "video",
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
                inputImageRolesById: {
                    "video-reference-1": "extend",
                },
            });
        });

        expect(runTask.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                inputVideoUrl: "gs://bucket/reference.mp4",
                inputVideoBlobPath: "media/reference.mp4",
                inputVideoHash: "hash-reference-video",
                inputVideoRole: "extend",
                inputImageUrl: "",
                inputTags: ["source"],
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                inputVideoUrl: "https://display.example/reference.mp4",
                inputVideoRole: "extend",
                tags: ["source"],
            }),
        );
    });

    test("queues and persists all selected input image references up to model limit", async () => {
        mockMediaModels = [
            {
                modelId: "gemini-3-pro-image-preview",
                preferredUrlFormat: "gcs",
                mediaDefaults: {
                    inputImages: [2, 4],
                },
            },
        ];
        const runTask = {
            mutateAsync: jest
                .fn()
                .mockResolvedValue({ taskId: "task-combine" }),
        };
        const createMediaItem = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };
        const promptRef = { current: { focus: jest.fn() } };
        const selectedImagesObjects = Array.from({ length: 4 }, (_, index) => ({
            cortexRequestId: `reference-${index + 1}`,
            type: "image",
            url: `https://display.example/reference-${index + 1}.png`,
            azureUrl: `https://azure.example/reference-${index + 1}.png?stale=sas`,
            gcsUrl: `gs://bucket/reference-${index + 1}.png`,
        }));

        const view = renderHook(() =>
            useMediaGeneration({
                selectedModel: "gemini-3-pro-image-preview",
                outputType: "image",
                settings: {
                    models: {
                        "gemini-3-pro-image-preview": {
                            type: "image",
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
                setLoading: jest.fn(),
            }),
        );

        await act(async () => {
            await view.result.current.handleCombineSelected({
                prompt: "combine references",
                selectedImagesObjects,
                outputType: "image",
                selectedModel: "gemini-3-pro-image-preview",
                settings: {
                    models: {
                        "gemini-3-pro-image-preview": {
                            type: "image",
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
                inputImageRolesById: {
                    "reference-1": "start_frame",
                    "reference-2": "end_frame",
                    "reference-3": "reference",
                    "reference-4": "reference",
                },
            });
        });

        expect(runTask.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                inputImageUrl: "gs://bucket/reference-1.png",
                inputImageUrl2: "gs://bucket/reference-2.png",
                inputImageUrl3: "gs://bucket/reference-3.png",
                inputImageUrl4: "gs://bucket/reference-4.png",
                inputImageRole: "start_frame",
                inputImageRole2: "end_frame",
                inputImageRole3: "reference",
                inputImageRole4: "reference",
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                inputImageUrl: "https://display.example/reference-1.png",
                inputImageUrl2: "https://display.example/reference-2.png",
                inputImageUrl3: "https://display.example/reference-3.png",
                inputImageUrl4: "https://display.example/reference-4.png",
                inputImageRole: "start_frame",
                inputImageRole2: "end_frame",
                inputImageRole3: "reference",
                inputImageRole4: "reference",
            }),
        );
    });

    test("queues only the first allowed reference when selected references exceed the model limit", async () => {
        mockMediaModels = [
            {
                modelId: "veo-3.1-lite-generate",
                preferredUrlFormat: "gcs",
                mediaDefaults: {
                    inputImages: [0, 3],
                },
                referenceImageRoleLimits: {
                    reference: [0, 1],
                    start_frame: [0, 1],
                    end_frame: [0, 1],
                },
            },
        ];
        const runTask = {
            mutateAsync: jest
                .fn()
                .mockResolvedValue({ taskId: "task-combine" }),
        };
        const createMediaItem = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };
        const promptRef = { current: { focus: jest.fn() } };
        const selectedImagesObjects = Array.from({ length: 2 }, (_, index) => ({
            cortexRequestId: `reference-${index + 1}`,
            type: "image",
            url: `https://display.example/reference-${index + 1}.png`,
            azureUrl: `https://azure.example/reference-${index + 1}.png?stale=sas`,
            gcsUrl: `gs://bucket/reference-${index + 1}.png`,
        }));

        const view = renderHook(() =>
            useMediaGeneration({
                selectedModel: "veo-3.1-lite-generate",
                outputType: "video",
                settings: {
                    models: {
                        "veo-3.1-lite-generate": {
                            type: "video",
                            inputImages: [0, 1],
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
                setLoading: jest.fn(),
            }),
        );

        await act(async () => {
            await view.result.current.handleCombineSelected({
                prompt: "combine references",
                selectedImagesObjects,
                outputType: "video",
                selectedModel: "veo-3.1-lite-generate",
                settings: {
                    models: {
                        "veo-3.1-lite-generate": {
                            type: "video",
                            inputImages: [0, 1],
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
                inputImageRolesById: {
                    "reference-1": "reference",
                    "reference-2": "reference",
                },
            });
        });

        expect(runTask.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                inputImageUrl: "gs://bucket/reference-1.png",
                inputImageRole: "reference",
            }),
        );
        expect(runTask.mutateAsync.mock.calls[0][0]).not.toHaveProperty(
            "inputImageUrl2",
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                inputImageUrl: "https://display.example/reference-1.png",
                inputImageRole: "reference",
            }),
        );
        expect(createMediaItem.mutateAsync.mock.calls[0][0]).not.toHaveProperty(
            "inputImageUrl2",
        );
    });

    test("allows start and end frame references beyond the generic image limit", async () => {
        mockMediaModels = [
            {
                modelId: "veo-3.1-lite-generate",
                preferredUrlFormat: "gcs",
                mediaDefaults: {
                    inputImages: [0, 3],
                },
                referenceImageRoleLimits: {
                    reference: [0, 1],
                    start_frame: [0, 1],
                    end_frame: [0, 1],
                },
            },
        ];
        const runTask = {
            mutateAsync: jest
                .fn()
                .mockResolvedValue({ taskId: "task-combine" }),
        };
        const createMediaItem = {
            mutateAsync: jest.fn().mockResolvedValue({}),
        };
        const promptRef = { current: { focus: jest.fn() } };
        const selectedImagesObjects = Array.from({ length: 2 }, (_, index) => ({
            cortexRequestId: `reference-${index + 1}`,
            type: "image",
            url: `https://display.example/reference-${index + 1}.png`,
            azureUrl: `https://azure.example/reference-${index + 1}.png?stale=sas`,
            gcsUrl: `gs://bucket/reference-${index + 1}.png`,
        }));

        const view = renderHook(() =>
            useMediaGeneration({
                selectedModel: "veo-3.1-lite-generate",
                outputType: "video",
                settings: {
                    models: {
                        "veo-3.1-lite-generate": {
                            type: "video",
                            inputImages: [0, 1],
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
                setLoading: jest.fn(),
            }),
        );

        await act(async () => {
            await view.result.current.handleCombineSelected({
                prompt: "animate between frames",
                selectedImagesObjects,
                outputType: "video",
                selectedModel: "veo-3.1-lite-generate",
                settings: {
                    models: {
                        "veo-3.1-lite-generate": {
                            type: "video",
                            inputImages: [0, 1],
                        },
                    },
                },
                runTask,
                createMediaItem,
                promptRef,
                inputImageRolesById: {
                    "reference-1": "start_frame",
                    "reference-2": "end_frame",
                },
            });
        });

        expect(runTask.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                inputImageRole: "start_frame",
                inputImageRole2: "end_frame",
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalled();
    });
});
