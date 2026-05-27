/**
 * @jest-environment node
 */

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((data, options) => ({
            ...data,
            status: options?.status || 200,
        })),
    },
}));

jest.mock("../../../src/graphql", () => ({
    getClient: jest.fn(),
    QUERIES: {
        getWorkspaceAgentQuery: jest.fn((pathwayName) => ({
            kind: "agent",
            pathwayName,
        })),
        getWorkspacePromptQuery: jest.fn((pathwayName) => ({
            kind: "prompt",
            pathwayName,
        })),
    },
}));

jest.mock("../models/workspace", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../utils/prompt-utils", () => ({
    getPromptConfig: jest.fn(),
}));

jest.mock("../../../config", () => ({
    cortex: {
        defaultChatModel: "default-model",
        AGENTIC_MODEL: "agent-model",
    },
    endpoints: {
        mediaHelperDirect: jest.fn(() => "http://media-helper.test"),
    },
}));

jest.mock("../utils/media-service-utils.js", () => ({
    checkMediaFile: jest.fn(),
    hashBuffer: jest.fn(),
    uploadBufferToMediaService: jest.fn(),
}));

const {
    POST: executePromptPost,
} = require("../workspaces/[id]/applet/execute_prompt/route");

const { getClient, QUERIES } = require("../../../src/graphql");
const Workspace = require("../models/workspace").default;
const { getCurrentUser } = require("../utils/auth");
const { getPromptConfig } = require("../utils/prompt-utils");
const {
    checkMediaFile,
    uploadBufferToMediaService,
} = require("../utils/media-service-utils.js");

function buildWorkspace() {
    return {
        _id: "workspace-123",
        applet: {
            toString: () => "applet-123",
        },
        systemPrompt: "Workspace system prompt",
        contextKey: "workspace-key",
    };
}

function buildUser() {
    return {
        _id: "mongo-user-123",
        contextId: "user-456",
        contextKey: "user-key",
        personalEntityId: "personal-user-456",
        aiName: "Lana",
    };
}

function buildLegacySharedFile() {
    return {
        _id: "shared-file-1",
        hash: "shared-hash",
        url: "https://legacy.example.com/shared.pdf",
        originalName: "employee-handbook.pdf",
        filename: "employee-handbook.pdf",
        mimeType: "application/pdf",
        size: 128,
    };
}

function buildLegacyUserFile() {
    return {
        hash: "user-hash",
        url: "https://legacy.example.com/private.pdf",
        originalName: "private-notes.pdf",
        filename: "private-notes.pdf",
        mimeType: "application/pdf",
        size: 64,
    };
}

function parseJsonContentEntries(chatHistory) {
    return chatHistory.flatMap((message) =>
        (message.content || []).map((entry) => JSON.parse(entry)),
    );
}

function getUserFileEntries(chatHistory) {
    return parseJsonContentEntries(chatHistory).filter(
        (entry) => entry.type === "image_url",
    );
}

function expectLegacyFilesMigrated(fileEntries) {
    expect(fileEntries).toHaveLength(2);
    expect(fileEntries).toEqual([
        expect.objectContaining({
            url: "https://primary.example.com/applets/shared/employee-handbook.pdf",
            gcs: "gs://primary/applets/shared/employee-handbook.pdf",
            hash: "shared-hash",
            contextId: "applet-shared:applet-123",
            fileScope: "applet-shared",
            appletId: "applet-123",
        }),
        expect.objectContaining({
            url: "https://primary.example.com/applets/user/private-notes.pdf",
            gcs: "gs://primary/applets/user/private-notes.pdf",
            hash: "user-hash",
            contextId: "applet-user:applet-123:user-456",
            fileScope: "applet-user",
            appletId: "applet-123",
            userId: "user-456",
        }),
    ]);
}

function installLegacyStorageMocks() {
    const migratedByPrimaryKindAndHash = new Map();

    checkMediaFile.mockImplementation(async ({ hash, storageTarget }) => {
        const primaryKey = `${storageTarget.kind}:${hash}`;
        if (migratedByPrimaryKindAndHash.has(primaryKey)) {
            return migratedByPrimaryKindAndHash.get(primaryKey);
        }

        if (
            storageTarget.kind === "workspace-shared" &&
            hash === "shared-hash"
        ) {
            return {
                url: "https://legacy.example.com/shared.pdf",
                gcs: "gs://legacy/workspace/employee-handbook.pdf",
                hash: "shared-hash",
                blobPath: "workspace/files/employee-handbook.pdf",
            };
        }

        if (
            storageTarget.kind === "workspace-private" &&
            hash === "user-hash"
        ) {
            return {
                url: "https://legacy.example.com/private.pdf",
                gcs: "gs://legacy/workspace/private-notes.pdf",
                hash: "user-hash",
                blobPath: "workspace/private/private-notes.pdf",
            };
        }

        return null;
    });

    uploadBufferToMediaService.mockImplementation(
        async (_buffer, metadata, { storageTarget }) => {
            const data =
                storageTarget.kind === "applet-shared"
                    ? {
                          url: "https://primary.example.com/applets/shared/employee-handbook.pdf",
                          gcs: "gs://primary/applets/shared/employee-handbook.pdf",
                          hash: metadata.hash,
                          blobPath: "applets/shared/employee-handbook.pdf",
                          filename: metadata.filename,
                      }
                    : {
                          url: "https://primary.example.com/applets/user/private-notes.pdf",
                          gcs: "gs://primary/applets/user/private-notes.pdf",
                          hash: metadata.hash,
                          blobPath: "applets/user/private-notes.pdf",
                          filename: metadata.filename,
                      };

            migratedByPrimaryKindAndHash.set(
                `${storageTarget.kind}:${metadata.hash}`,
                data,
            );

            return { success: true, data };
        },
    );

    global.fetch = jest.fn(async (url) => ({
        ok: true,
        arrayBuffer: async () =>
            Uint8Array.from(
                String(url).includes("shared") ? [1, 2, 3] : [4, 5, 6],
            ).buffer,
        headers: {
            get: (name) =>
                name?.toLowerCase() === "content-type"
                    ? "application/pdf"
                    : null,
        },
    }));
}

describe("workspace applet execute_prompt legacy file compatibility", () => {
    const sharedFile = buildLegacySharedFile();
    const userFile = buildLegacyUserFile();
    let graphqlQueryMock;

    beforeEach(() => {
        jest.clearAllMocks();
        installLegacyStorageMocks();

        graphqlQueryMock = jest.fn();
        getClient.mockReturnValue({
            query: graphqlQueryMock,
        });

        getCurrentUser.mockResolvedValue(buildUser());
        Workspace.findById.mockResolvedValue(buildWorkspace());
    });

    it("runs agentic v1 applets with legacy shared and private files by healing them into applet scopes", async () => {
        getPromptConfig.mockResolvedValue({
            prompt: {
                text: "Answer from the handbook.",
                files: [sharedFile],
            },
            model: "gemini-agent",
            agentMode: true,
            reasoningEffort: "medium",
            pathwayName: "run_workspace_agent",
        });

        graphqlQueryMock.mockResolvedValue({
            data: {
                run_workspace_agent: {
                    result: "agent output",
                    tool: JSON.stringify({ citations: [] }),
                },
            },
        });

        const response = await executePromptPost(
            {
                json: async () => ({
                    promptId: "prompt-1",
                    prompt: "ignored when promptId is provided",
                    files: [userFile],
                    text: "Please summarize the attached files.",
                }),
            },
            { params: { id: "workspace-123" } },
        );

        expect(response).toEqual({
            output: "agent output",
            citations: [],
            status: 200,
        });

        expect(QUERIES.getWorkspaceAgentQuery).toHaveBeenCalledWith(
            "run_workspace_agent",
        );
        expect(graphqlQueryMock).toHaveBeenCalledTimes(1);

        const [{ query, variables }] = graphqlQueryMock.mock.calls[0];
        expect(query).toEqual({
            kind: "agent",
            pathwayName: "run_workspace_agent",
        });
        expect(variables.model).toBe("gemini-agent");
        expect(variables.entityId).toBe("personal-user-456");
        expect(variables.aiName).toBe("Lana");
        expect(variables.reasoningEffort).toBe("medium");
        expect(variables.fileAccessPlan).toEqual([
            {
                kind: "app-private",
                userContextId: "user-456",
                workspaceId: "workspace-123",
                appletId: "applet-123",
                contextKey: "user-key",
                write: true,
            },
            {
                kind: "app-shared",
                workspaceId: "workspace-123",
                appletId: "applet-123",
                contextKey: "workspace-key",
            },
        ]);
        expect(variables.contextId).toBe("applet-user:applet-123:user-456");
        expect(variables.contextKey).toBe("user-key");

        const fileEntries = getUserFileEntries(variables.chatHistory);
        expectLegacyFilesMigrated(fileEntries);
        expect(global.fetch).toHaveBeenCalledWith(
            "https://legacy.example.com/shared.pdf",
            { redirect: "follow" },
        );
        expect(global.fetch).toHaveBeenCalledWith(
            "https://legacy.example.com/private.pdf",
            { redirect: "follow" },
        );
        expect(uploadBufferToMediaService).toHaveBeenNthCalledWith(
            1,
            expect.any(Buffer),
            expect.objectContaining({
                filename: "employee-handbook.pdf",
                hash: "shared-hash",
            }),
            expect.objectContaining({
                storageTarget: expect.objectContaining({
                    kind: "applet-shared",
                    appletId: "applet-123",
                }),
            }),
        );
        expect(uploadBufferToMediaService).toHaveBeenNthCalledWith(
            2,
            expect.any(Buffer),
            expect.objectContaining({
                filename: "private-notes.pdf",
                hash: "user-hash",
            }),
            expect.objectContaining({
                storageTarget: expect.objectContaining({
                    kind: "applet-user",
                    appletId: "applet-123",
                    userContextId: "user-456",
                }),
            }),
        );
    });

    it("runs non-agentic v1 applets with the same legacy files and still sends healed attachments to run_workspace_prompt", async () => {
        getPromptConfig.mockResolvedValue({
            prompt: {
                text: "Extract the relevant policy.",
                files: [sharedFile],
            },
            model: "gemini-non-agent",
            agentMode: false,
            reasoningEffort: null,
            pathwayName: "run_workspace_prompt",
        });

        graphqlQueryMock.mockResolvedValue({
            data: {
                run_workspace_prompt: {
                    result: "prompt output",
                    tool: JSON.stringify({ citations: [] }),
                },
            },
        });

        const response = await executePromptPost(
            {
                json: async () => ({
                    promptId: "prompt-2",
                    files: [userFile],
                    text: "Use both attached PDFs.",
                }),
            },
            { params: { id: "workspace-123" } },
        );

        expect(response).toEqual({
            output: "prompt output",
            citations: [],
            status: 200,
        });

        expect(QUERIES.getWorkspacePromptQuery).toHaveBeenCalledWith(
            "run_workspace_prompt",
        );

        const [{ query, variables }] = graphqlQueryMock.mock.calls[0];
        expect(query).toEqual({
            kind: "prompt",
            pathwayName: "run_workspace_prompt",
        });
        expect(variables.model).toBe("gemini-non-agent");
        expect(variables.entityId).toBeUndefined();
        expect(variables.aiName).toBeUndefined();
        expect(variables.fileAccessPlan).toEqual([
            {
                kind: "app-private",
                userContextId: "user-456",
                workspaceId: "workspace-123",
                appletId: "applet-123",
                contextKey: "user-key",
                write: true,
            },
            {
                kind: "app-shared",
                workspaceId: "workspace-123",
                appletId: "applet-123",
                contextKey: "workspace-key",
            },
        ]);
        expect(variables.contextId).toBeUndefined();
        expect(variables.contextKey).toBeUndefined();

        const fileEntries = getUserFileEntries(variables.chatHistory);
        expectLegacyFilesMigrated(fileEntries);
        expect(uploadBufferToMediaService).toHaveBeenCalledTimes(2);
    });
});
