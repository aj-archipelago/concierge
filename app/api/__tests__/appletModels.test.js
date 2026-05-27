/**
 * @jest-environment node
 */

import { GET as getModels } from "../applet/models/route";
import { POST as generateModel } from "../applet/model-generate/route";

const mockQuery = jest.fn();
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
        expect(data).toEqual({ result: "مرحبا" });
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
