/**
 * @jest-environment node
 */

import { POST } from "./route";

jest.mock("../../../models/prompt", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        create: jest.fn(),
    },
}));

jest.mock("../../../models/workspace", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

jest.mock("../../../models/workspace-membership", () => ({
    __esModule: true,
    default: {
        exists: jest.fn(),
    },
}));

jest.mock("../../../models/applet", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        create: jest.fn(),
    },
}));

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../../utils/shareAccess", () => ({
    resolveShareAccess: jest.fn(),
}));

jest.mock("../../db", () => ({
    createWorkspace: jest.fn(),
}));

const Prompt = require("../../../models/prompt").default;
const Workspace = require("../../../models/workspace").default;
const WorkspaceMembership =
    require("../../../models/workspace-membership").default;
const { getCurrentUser } = require("../../../utils/auth");
const { resolveShareAccess } = require("../../../utils/shareAccess");
const { createWorkspace } = require("../../db");

describe("POST /api/workspaces/[id]/copy", () => {
    const user = { _id: "user-1" };
    const workspace = {
        _id: "workspace-1",
        owner: "owner-1",
        name: "Source workspace",
        prompts: ["prompt-1"],
        systemPrompt: "System",
        applet: null,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue(user);
        Workspace.findById.mockResolvedValue(workspace);
        WorkspaceMembership.exists.mockResolvedValue(null);
        resolveShareAccess.mockResolvedValue({
            canAccess: false,
            isOwner: false,
            role: null,
        });
        Prompt.find.mockResolvedValue([
            { title: "Prompt", text: "Prompt text" },
        ]);
        Prompt.create.mockResolvedValue({ _id: "new-prompt-1" });
        createWorkspace.mockResolvedValue({ _id: "copy-1" });
    });

    it("does not copy workspaces without owner, membership, or share access", async () => {
        const response = await POST(
            {},
            { params: Promise.resolve({ id: "workspace-1" }) },
        );
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body.error).toBe("Workspace not found");
        expect(Prompt.find).not.toHaveBeenCalled();
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it("copies a workspace when the caller has share access", async () => {
        resolveShareAccess.mockResolvedValue({
            canAccess: true,
            isOwner: false,
            role: "viewer",
        });

        const response = await POST(
            {},
            { params: Promise.resolve({ id: "workspace-1" }) },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ _id: "copy-1" });
        expect(createWorkspace).toHaveBeenCalledWith({
            workspaceName: "Copy of Source workspace",
            ownerId: "user-1",
            prompts: ["new-prompt-1"],
            systemPrompt: "System",
            applet: null,
        });
    });
});
