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

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../applet/access", () => ({
    validateAppletAccess: jest.fn(),
}));

jest.mock("../utils/workspace-prompt-execution", () => ({
    executeWorkspacePrompt: jest.fn(),
    getWorkspaceForAppletPrompts: jest.fn(),
    listWorkspacePromptsForApplet: jest.fn(),
}));

const {
    GET: listWorkspacePrompts,
} = require("../canvas-applets/[id]/workspace-prompts/route");
const {
    POST: runWorkspacePrompt,
} = require("../canvas-applets/[id]/workspace-prompts/[promptId]/run/route");
const { getCurrentUser } = require("../utils/auth");
const { validateAppletAccess } = require("../applet/access");
const {
    executeWorkspacePrompt,
    getWorkspaceForAppletPrompts,
    listWorkspacePromptsForApplet,
} = require("../utils/workspace-prompt-execution");

describe("canvas applet workspace prompt bridge", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({
            _id: "user-123",
            contextId: "ctx-user",
        });
        validateAppletAccess.mockResolvedValue(null);
    });

    test("lists prompts linked to the applet workspace", async () => {
        listWorkspacePromptsForApplet.mockResolvedValue({
            workspace: { _id: "workspace-123" },
            prompts: [{ _id: "prompt-1", title: "Brief" }],
        });

        const response = await listWorkspacePrompts(
            {},
            { params: Promise.resolve({ id: "applet-123" }) },
        );

        expect(validateAppletAccess).toHaveBeenCalledWith(
            "applet-123",
            expect.objectContaining({ _id: "user-123" }),
        );
        expect(listWorkspacePromptsForApplet).toHaveBeenCalledWith(
            "applet-123",
        );
        expect(response).toEqual({
            workspaceId: "workspace-123",
            prompts: [{ _id: "prompt-1", title: "Brief" }],
            status: 200,
        });
    });

    test("runs a prompt through the shared workspace execution helper", async () => {
        const workspace = { _id: "workspace-123", applet: "applet-123" };
        getWorkspaceForAppletPrompts.mockResolvedValue(workspace);
        executeWorkspacePrompt.mockResolvedValue({
            output: "done",
            citations: [],
            metadata: { citations: [] },
        });

        const response = await runWorkspacePrompt(
            {
                json: async () => ({
                    input: "Summarize this",
                    files: [],
                }),
            },
            {
                params: Promise.resolve({
                    id: "applet-123",
                    promptId: "prompt-1",
                }),
            },
        );

        expect(executeWorkspacePrompt).toHaveBeenCalledWith({
            workspace,
            user: expect.objectContaining({ _id: "user-123" }),
            body: {
                input: "Summarize this",
                files: [],
                promptId: "prompt-1",
            },
        });
        expect(response).toEqual({
            output: "done",
            citations: [],
            metadata: { citations: [] },
            status: 200,
        });
    });
});
