/**
 * @jest-environment node
 */

jest.mock("../../../../config", () => ({
    endpoints: {
        mediaHelperDirect: jest.fn(() => "http://media-helper.test"),
    },
}));

jest.mock("../file-resolution-utils.js", () => ({
    resolveAndHealFile: jest.fn(async (file) => ({
        file,
        accessUrl: file.url,
        status: "resolved",
    })),
}));

const { buildWorkspacePromptVariables } = require("../llm-file-utils.js");
const { resolveAndHealFile } = require("../file-resolution-utils.js");

describe("buildWorkspacePromptVariables applet compatibility", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("includes only app-private and app-shared in applet fileAccessPlan by default", async () => {
        const result = await buildWorkspacePromptVariables({
            prompt: "Prompt",
            text: "Text",
            appletId: "applet-123",
            workspaceId: "workspace-123",
            workspaceContextKey: "workspace-key",
            userContextId: "user-456",
            userContextKey: "user-key",
        });

        expect(result.fileAccessPlan).toEqual([
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
        expect(result.contextId).toBe("applet-user:applet-123:user-456");
        expect(result.contextKey).toBe("user-key");
    });

    it("can still opt into all user files for applet fileAccessPlan when explicitly requested", async () => {
        const result = await buildWorkspacePromptVariables({
            prompt: "Prompt",
            text: "Text",
            appletId: "applet-123",
            workspaceId: "workspace-123",
            workspaceContextKey: "workspace-key",
            userContextId: "user-456",
            userContextKey: "user-key",
            includeUserGlobal: true,
        });

        expect(result.fileAccessPlan).toEqual([
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
            {
                kind: "user-files",
                userContextId: "user-456",
                contextKey: "user-key",
            },
        ]);
    });

    it("passes legacy workspace fallbacks when resolving v1 applet files", async () => {
        const sharedFile = {
            _id: "shared-file-1",
            hash: "shared-hash",
            url: "https://example.com/shared.pdf",
            originalName: "shared.pdf",
        };
        const userFile = {
            hash: "user-hash",
            url: "https://example.com/user.pdf",
            originalName: "user.pdf",
        };

        await buildWorkspacePromptVariables({
            prompt: "Prompt",
            text: "Text",
            appletId: "applet-123",
            workspaceId: "workspace-123",
            userContextId: "user-456",
            sharedFiles: [sharedFile],
            userFiles: [userFile],
        });

        expect(resolveAndHealFile).toHaveBeenNthCalledWith(
            1,
            sharedFile,
            expect.objectContaining({
                storageTarget: expect.objectContaining({
                    kind: "applet-shared",
                    appletId: "applet-123",
                }),
                fallbackStorageTargets: [
                    expect.objectContaining({
                        kind: "workspace-shared",
                        workspaceId: "workspace-123",
                    }),
                ],
                allowUrlRefresh: true,
            }),
        );
        expect(resolveAndHealFile).toHaveBeenNthCalledWith(
            2,
            userFile,
            expect.objectContaining({
                storageTarget: expect.objectContaining({
                    kind: "applet-user",
                    appletId: "applet-123",
                    userContextId: "user-456",
                }),
                fallbackStorageTargets: [
                    expect.objectContaining({
                        kind: "workspace-private",
                        workspaceId: "workspace-123",
                        userContextId: "user-456",
                    }),
                ],
                allowUrlRefresh: true,
            }),
        );
    });
});
