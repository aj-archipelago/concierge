/**
 * @jest-environment node
 */

import { GET as getModels } from "../applet/models/route";
import { POST as generateModel } from "../applet/model-generate/route";

const mockQuery = jest.fn();
const mockResolveShareAccess = jest.fn();
const createLeanQuery = (data) => ({
    select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(data),
    }),
});

jest.mock("../../../src/graphql", () => ({
    getClient: () => ({
        query: mockQuery,
    }),
    SYS_MODEL_METADATA: { kind: "Document", definitions: [] },
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("mongoose", () => ({
    __esModule: true,
    default: {
        Types: {
            ObjectId: {
                isValid: jest.fn(),
            },
        },
    },
}));

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

jest.mock("../models/app", () => ({
    __esModule: true,
    APP_STATUS: {
        ACTIVE: "active",
    },
    APP_TYPES: {
        APPLET: "applet",
    },
    default: {
        findOne: jest.fn(),
    },
}));

jest.mock("../models/workspace", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

jest.mock("../utils/shareAccess.js", () => ({
    resolveShareAccess: (...args) => mockResolveShareAccess(...args),
}));

jest.mock("../utils/llm-file-utils.js", () => ({
    buildWorkspacePromptVariables: jest.fn(() =>
        Promise.resolve({
            chatHistory: [{ role: "user", content: ["Hello"] }],
            fileAccessPlan: [{ kind: "app-private" }],
        }),
    ),
}));

jest.mock("../../../app.config/config/index.js", () => ({
    __esModule: true,
    default: {
        cortex: { defaultChatModel: "oai-gpt4o" },
    },
}));

const appletId = "507f191e810c19729de860ea";

function createPostRequest(body) {
    return {
        json: () =>
            Promise.resolve({
                appletId,
                ...body,
            }),
    };
}

function mockMetadata(models = []) {
    mockQuery.mockResolvedValueOnce({
        data: {
            sys_model_metadata: {
                result: JSON.stringify({ models, redirects: {} }),
            },
        },
    });
}

describe("applet model APIs", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            contextId: "user-ctx-1",
            contextKey: "user-key-1",
        });
        const mongoose = require("mongoose").default;
        mongoose.Types.ObjectId.isValid.mockReturnValue(true);
        const Applet = require("../models/applet").default;
        Applet.findById.mockReturnValue(
            createLeanQuery({
                _id: appletId,
                owner: "user-1",
                version: 2,
                publishedVersionIndex: null,
            }),
        );
        const App = require("../models/app").default;
        App.findOne.mockReturnValue(createLeanQuery(null));
        const Workspace = require("../models/workspace").default;
        Workspace.findOne.mockReturnValue(createLeanQuery(null));
        mockResolveShareAccess.mockResolvedValue({
            canAccess: false,
            isOwner: false,
            role: null,
        });
    });

    test("lists applet-available chat models", async () => {
        mockMetadata([
            {
                modelId: "oai-gpt4o",
                displayName: "GPT-4o",
                provider: "openai",
                category: "chat",
                isDefault: true,
                supportedReasoningEfforts: ["low", "medium"],
            },
            {
                modelId: "image-model",
                displayName: "Image",
                category: "image",
            },
            {
                modelId: "disabled-chat",
                displayName: "Disabled",
                category: "chat",
                isAvailable: false,
            },
        ]);

        const res = await getModels({
            url: `http://localhost/api/applet/models?appletId=${appletId}`,
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.defaultModel).toBe("oai-gpt4o");
        expect(data.models).toEqual([
            expect.objectContaining({
                id: "oai-gpt4o",
                name: "GPT-4o",
                provider: "openai",
                reasoningEfforts: ["low", "medium"],
                isDefault: true,
            }),
        ]);
    });

    test("lists applet-available media models with generation defaults", async () => {
        mockMetadata([
            {
                modelId: "image-model",
                displayName: "Image Model",
                provider: "openai",
                category: "image",
                isDefault: true,
                mediaDefaults: {
                    aspectRatio: "1:1",
                    quality: "high",
                },
                mediaControls: [{ key: "aspectRatio" }],
                availableOutputFormats: [
                    { value: "png", label: "PNG" },
                    { value: "jpg", label: "JPG" },
                ],
                availableImageSizes: ["1K", "2K"],
                availableResolutions: ["720p", "1080p"],
                availableDurations: [5, 8],
                mediaToggles: ["generateAudio"],
            },
            {
                modelId: "speech-model",
                displayName: "Speech Model",
                provider: "google",
                category: "tts",
                mediaDefaults: {
                    voiceName: "Aoede",
                },
            },
            {
                modelId: "chat-model",
                category: "chat",
            },
            {
                modelId: "disabled-image",
                category: "image",
                isAvailable: false,
            },
        ]);

        const res = await getModels({
            url: `http://localhost/api/applet/models?appletId=${appletId}&kind=media`,
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.defaultModel).toBe("image-model");
        expect(data.models).toEqual([
            expect.objectContaining({
                id: "image-model",
                name: "Image Model",
                category: "image",
                mediaDefaults: {
                    aspectRatio: "1:1",
                    quality: "high",
                },
                availableOutputFormats: [
                    { value: "png", label: "PNG" },
                    { value: "jpg", label: "JPG" },
                ],
                availableImageSizes: ["1K", "2K"],
                availableResolutions: ["720p", "1080p"],
                availableDurations: [5, 8],
                mediaToggles: ["generateAudio"],
                isDefault: true,
            }),
            expect.objectContaining({
                id: "speech-model",
                category: "tts",
                mediaDefaults: {
                    voiceName: "Aoede",
                },
            }),
        ]);
        expect(data.models[0].mediaControls).toEqual([
            { key: "aspectRatio" },
            {
                key: "image_size",
                aliases: ["imageSize", "size"],
                label: "Image Size",
                type: "select",
                options: [
                    { value: "1K", label: "1K" },
                    { value: "2K", label: "2K" },
                ],
            },
            {
                key: "resolution",
                label: "Resolution",
                type: "select",
                options: [
                    { value: "720p", label: "720p" },
                    { value: "1080p", label: "1080p" },
                ],
            },
            {
                key: "duration",
                label: "Duration",
                type: "select",
                options: [
                    { value: 5, label: "5s" },
                    { value: 8, label: "8s" },
                ],
            },
            {
                key: "outputFormat",
                label: "Output Format",
                type: "select",
                options: [
                    { value: "png", label: "PNG" },
                    { value: "jpg", label: "JPG" },
                ],
            },
            {
                key: "generateAudio",
                label: "Generate Audio",
                type: "boolean",
                trueLabel: "Audio",
                falseLabel: "No Audio",
            },
        ]);
    });

    test("exposes Media-page option families as applet SDK controls", async () => {
        mockMetadata([
            {
                modelId: "gemini-flash-31-image",
                displayName: "Gemini 3.1 Flash Image",
                provider: "google",
                category: "image",
                mediaDefaults: {
                    inputImages: [0, 3],
                    quality: "high",
                    aspectRatio: "1:1",
                    optimizePrompt: true,
                },
                availableAspectRatios: [
                    "1:1",
                    "16:9",
                    "9:16",
                    "match_input_image",
                ],
                mediaToggles: ["optimizePrompt"],
                mediaInputModes: [
                    {
                        key: "referenceEdit",
                        promptRequired: false,
                        requires: {
                            inputImages: [1, 3],
                        },
                    },
                ],
                preferredUrlFormat: "gcs",
            },
        ]);

        const res = await getModels({
            url: `http://localhost/api/applet/models?appletId=${appletId}&kind=media`,
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.models[0]).toEqual(
            expect.objectContaining({
                id: "gemini-flash-31-image",
                availableAspectRatios: [
                    "1:1",
                    "16:9",
                    "9:16",
                    "match_input_image",
                ],
                mediaDefaults: expect.objectContaining({
                    aspectRatio: "1:1",
                    optimizePrompt: true,
                }),
                mediaInputModes: [
                    {
                        key: "referenceEdit",
                        promptRequired: false,
                        requires: {
                            inputImages: [1, 3],
                        },
                    },
                ],
            }),
        );
        expect(data.models[0].mediaControls).toEqual([
            {
                key: "aspectRatio",
                label: "Aspect Ratio",
                type: "select",
                options: [
                    { value: "1:1", label: "1:1" },
                    { value: "16:9", label: "16:9" },
                    { value: "9:16", label: "9:16" },
                    {
                        value: "match_input_image",
                        label: "Match Input Image",
                    },
                ],
            },
            {
                key: "optimizePrompt",
                label: "Optimize Prompt",
                type: "boolean",
                trueLabel: "Optimized",
                falseLabel: "Raw Prompt",
            },
        ]);
    });

    test("generates with run_workspace_prompt without agent entity variables", async () => {
        mockMetadata([
            {
                modelId: "oai-gpt4o",
                displayName: "GPT-4o",
                provider: "openai",
                category: "chat",
                supportedReasoningEfforts: ["low", "medium"],
            },
        ]);
        mockQuery.mockResolvedValueOnce({
            data: {
                run_workspace_prompt: {
                    result: "مرحبا",
                    tool: JSON.stringify({
                        citations: [{ title: "Source", url: "https://x" }],
                        custom: { confidence: 0.9 },
                    }),
                },
            },
        });

        const res = await generateModel(
            createPostRequest({
                prompt: "Translate hello to Arabic",
                model: "oai-gpt4o",
                reasoningEffort: "low",
            }),
        );
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toEqual({
            result: "مرحبا",
            citations: [{ title: "Source", url: "https://x" }],
            metadata: {
                citations: [{ title: "Source", url: "https://x" }],
                custom: { confidence: 0.9 },
            },
        });
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(mockQuery.mock.calls[1][0].variables).toEqual(
            expect.objectContaining({
                model: "oai-gpt4o",
                reasoningEffort: "low",
                chatHistory: [{ role: "user", content: ["Hello"] }],
            }),
        );
        expect(mockQuery.mock.calls[1][0].variables).not.toHaveProperty(
            "entityId",
        );
        expect(mockQuery.mock.calls[1][0].variables).not.toHaveProperty(
            "aiMemorySelfModify",
        );
    });

    test("rejects unavailable model ids before calling run_workspace_prompt", async () => {
        mockMetadata([
            {
                modelId: "oai-gpt4o",
                displayName: "GPT-4o",
                category: "chat",
            },
        ]);

        const res = await generateModel(
            createPostRequest({
                prompt: "Hello",
                model: "unknown-model",
            }),
        );
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toBe("Model is not available for applets");
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });
});
