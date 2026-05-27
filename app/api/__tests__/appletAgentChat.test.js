/**
 * @jest-environment node
 */

import { POST } from "../applet/agent-chat/route";

const mockQuery = jest.fn();
const createLeanQuery = (data) => ({
    select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(data),
    }),
});

jest.mock("../../../src/graphql", () => {
    return {
        getClient: () => ({
            query: mockQuery,
        }),
        QUERIES: {
            SYS_ENTITY_AGENT: { kind: "Document", definitions: [] },
        },
    };
});

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

jest.mock("../../../src/utils/fileAccessPlanUtils.js", () => ({
    buildFileAccessPlan: jest.fn(() => [
        {
            kind: "app-private",
            userContextId: "user-ctx-1",
            appletId: "507f191e810c19729de860ea",
            write: true,
        },
    ]),
    buildRunContext: jest.fn(() => ({
        contextId: "applet-user:507f191e810c19729de860ea:user-ctx-1",
        contextKey: "user-key-1",
    })),
}));

jest.mock("../../../app.config/config/index.js", () => ({
    __esModule: true,
    default: {
        cortex: { defaultChatModel: "oai-gpt4o" },
    },
}));

function createRequest(body) {
    return {
        json: () =>
            Promise.resolve({
                appletId: "507f191e810c19729de860ea",
                ...body,
            }),
    };
}

describe("POST /api/applet/agent-chat", () => {
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
                _id: "507f191e810c19729de860ea",
                owner: "user-1",
                version: 2,
                publishedVersionIndex: null,
            }),
        );
        const App = require("../models/app").default;
        App.findOne.mockReturnValue(createLeanQuery(null));
        const Workspace = require("../models/workspace").default;
        Workspace.findOne.mockReturnValue(createLeanQuery(null));
        mockQuery.mockResolvedValue({
            data: {
                sys_entity_agent: {
                    result: "Hello from the agent",
                    warnings: [],
                    errors: [],
                },
            },
        });
    });

    describe("validation", () => {
        test("returns 401 when the caller is not authenticated", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue(null);

            const res = await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );
            const data = await res.json();

            expect(res.status).toBe(401);
            expect(data.error).toBe("Unauthorized");
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("returns 400 when messages is missing", async () => {
            const res = await POST(createRequest({}));
            const data = await res.json();

            expect(res.status).toBe(400);
            expect(data.error).toBe("messages array is required");
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("returns 400 when messages is not an array", async () => {
            const res = await POST(createRequest({ messages: "hello" }));
            const data = await res.json();

            expect(res.status).toBe(400);
            expect(data.error).toBe("messages array is required");
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("returns 400 when messages is an empty array", async () => {
            const res = await POST(createRequest({ messages: [] }));
            const data = await res.json();

            expect(res.status).toBe(400);
            expect(data.error).toBe("messages array is required");
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("returns 400 when appletId is invalid", async () => {
            const mongoose = require("mongoose").default;
            mongoose.Types.ObjectId.isValid.mockReturnValue(false);

            const res = await POST(
                createRequest({
                    appletId: "invalid-applet-id",
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );
            const data = await res.json();

            expect(res.status).toBe(400);
            expect(data.error).toBe("Invalid applet ID");
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("returns 403 for a non-owner on an unpublished v2 applet", async () => {
            const Applet = require("../models/applet").default;
            Applet.findById.mockReturnValue(
                createLeanQuery({
                    _id: "507f191e810c19729de860ea",
                    owner: "other-user",
                    version: 2,
                    publishedVersionIndex: null,
                }),
            );

            const res = await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );
            const data = await res.json();

            expect(res.status).toBe(403);
            expect(data.error).toBe("Access denied");
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe("happy path", () => {
        test("allows public access to a published v2 applet", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue({
                _id: "viewer-1",
                contextId: "user-ctx-1",
                contextKey: "user-key-1",
            });
            const Applet = require("../models/applet").default;
            Applet.findById.mockReturnValue(
                createLeanQuery({
                    _id: "507f191e810c19729de860ea",
                    owner: "owner-1",
                    version: 2,
                    publishedVersionIndex: 0,
                }),
            );

            const res = await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalled();
        });

        test("allows public access to a listed legacy v1 applet", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue({
                _id: "viewer-1",
                contextId: "user-ctx-1",
                contextKey: "user-key-1",
            });
            const Applet = require("../models/applet").default;
            Applet.findById.mockReturnValue(
                createLeanQuery({
                    _id: "507f191e810c19729de860ea",
                    owner: "owner-1",
                    version: 1,
                    publishedVersionIndex: null,
                }),
            );
            const Workspace = require("../models/workspace").default;
            Workspace.findOne.mockReturnValue(
                createLeanQuery({ _id: "workspace-1" }),
            );
            const App = require("../models/app").default;
            App.findOne.mockReturnValue(createLeanQuery({ _id: "app-1" }));

            const res = await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalled();
        });

        test("returns result, warnings and errors on success", async () => {
            const res = await POST(
                createRequest({
                    messages: [{ role: "user", content: "What is 2+2?" }],
                }),
            );
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data).toEqual({
                result: "Hello from the agent",
                warnings: [],
                errors: [],
            });
        });

        test("includes systemPrompt in chatHistory when provided", async () => {
            await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                    systemPrompt: "You are a helpful assistant.",
                }),
            );

            expect(mockQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    variables: expect.objectContaining({
                        chatHistory: expect.arrayContaining([
                            {
                                role: "system",
                                content: "You are a helpful assistant.",
                            },
                            { role: "user", content: "Hello" },
                        ]),
                    }),
                }),
            );
        });

        test("uses provided model override", async () => {
            await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                    model: "claude-sonnet",
                }),
            );

            expect(mockQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    variables: expect.objectContaining({
                        model: "claude-sonnet",
                    }),
                }),
            );
        });

        test("falls back to default model when model is not provided", async () => {
            await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );

            expect(mockQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    variables: expect.objectContaining({
                        model: "oai-gpt4o",
                    }),
                }),
            );
        });

        test("returns empty strings/arrays when agent returns no data", async () => {
            mockQuery.mockResolvedValue({ data: { sys_entity_agent: null } });

            const res = await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data).toEqual({ result: "", warnings: [], errors: [] });
        });

        test("passes user.personalEntityId and aiName when present", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue({
                _id: "user-1",
                contextId: "user-ctx-1",
                contextKey: "user-key-1",
                personalEntityId: "personal-entity-xyz",
                aiName: "Concierge",
            });

            await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );

            expect(mockQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    variables: expect.objectContaining({
                        entityId: "personal-entity-xyz",
                        aiName: "Concierge",
                    }),
                }),
            );
        });

        test("falls back to empty entityId when user has no personalEntityId", async () => {
            await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );

            expect(mockQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    variables: expect.objectContaining({
                        entityId: "",
                    }),
                }),
            );
            const variables = mockQuery.mock.calls[0][0].variables;
            expect(variables.aiName).toBeUndefined();
        });

        test("sets aiMemorySelfModify to false so user memory is not modified", async () => {
            await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );

            expect(mockQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    variables: expect.objectContaining({
                        aiMemorySelfModify: false,
                    }),
                }),
            );
        });

        test("passes user contextId and contextKey to buildFileAccessPlan and buildRunContext", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue({
                _id: "user-1",
                contextId: "my-context-id",
                contextKey: "my-context-key",
            });
            const {
                buildFileAccessPlan,
                buildRunContext,
            } = require("../../../src/utils/fileAccessPlanUtils.js");

            await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );

            expect(buildFileAccessPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    appletId: "507f191e810c19729de860ea",
                    userContextId: "my-context-id",
                    userContextKey: "my-context-key",
                    includeUserGlobal: true,
                }),
            );
            expect(buildRunContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    appletId: "507f191e810c19729de860ea",
                    userContextId: "my-context-id",
                    userContextKey: "my-context-key",
                }),
            );
        });

        test("handles user with no contextId or contextKey gracefully", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue({
                _id: "user-1",
            });
            const {
                buildFileAccessPlan,
                buildRunContext,
            } = require("../../../src/utils/fileAccessPlanUtils.js");

            const res = await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(buildFileAccessPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    appletId: "507f191e810c19729de860ea",
                    userContextId: null,
                    userContextKey: null,
                    includeUserGlobal: true,
                }),
            );
            expect(buildRunContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    appletId: "507f191e810c19729de860ea",
                    userContextId: null,
                    userContextKey: null,
                }),
            );
            expect(data.result).toBeDefined();
        });
    });

    describe("error handling", () => {
        test("returns 500 when graphql query throws", async () => {
            mockQuery.mockRejectedValue(new Error("Network error"));

            const res = await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );
            const data = await res.json();

            expect(res.status).toBe(500);
            expect(data.error).toBe("Failed to process agent chat");
        });

        test("returns 500 when getCurrentUser throws", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockRejectedValue(new Error("Auth error"));

            const res = await POST(
                createRequest({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            );
            const data = await res.json();

            expect(res.status).toBe(500);
            expect(data.error).toBe("Failed to process agent chat");
        });
    });
});
