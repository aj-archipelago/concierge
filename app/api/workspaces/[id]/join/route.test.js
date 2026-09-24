/**
 * @jest-environment node
 */

import { POST } from "./route";

jest.mock("../../../models/workspace", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

jest.mock("../../../models/workspace-membership", () => ({
    __esModule: true,
    default: {
        findOneAndUpdate: jest.fn(),
    },
}));

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../../utils/shareAccess", () => ({
    resolveShareAccess: jest.fn(),
}));

const Workspace = require("../../../models/workspace").default;
const WorkspaceMembership =
    require("../../../models/workspace-membership").default;
const { getCurrentUser } = require("../../../utils/auth");
const { resolveShareAccess } = require("../../../utils/shareAccess");

describe("POST /api/workspaces/[id]/join", () => {
    const user = { _id: "507f191e810c19729de860ea" };
    const workspace = {
        _id: "507f191e810c19729de860eb",
        owner: "507f191e810c19729de860ec",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue(user);
        Workspace.findById.mockResolvedValue(workspace);
        WorkspaceMembership.findOneAndUpdate.mockResolvedValue({});
        resolveShareAccess.mockResolvedValue({
            canAccess: false,
            isOwner: false,
            role: null,
        });
    });

    it("does not join workspaces without owner or share access", async () => {
        const response = await POST(
            {},
            { params: Promise.resolve({ id: String(workspace._id) }) },
        );
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body.error).toBe("Workspace not found");
        expect(WorkspaceMembership.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("joins workspaces the caller can access", async () => {
        resolveShareAccess.mockResolvedValue({
            canAccess: true,
            isOwner: false,
            role: "viewer",
        });

        const response = await POST(
            {},
            { params: Promise.resolve({ id: String(workspace._id) }) },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(WorkspaceMembership.findOneAndUpdate).toHaveBeenCalledWith(
            {
                user: user._id,
                workspace: String(workspace._id),
            },
            {
                user: user._id,
                workspace: String(workspace._id),
            },
            {
                upsert: true,
            },
        );
    });
});
