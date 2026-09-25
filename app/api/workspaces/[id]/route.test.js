/**
 * @jest-environment node
 */

import { DELETE } from "./route";

jest.mock("mongoose", () => ({
    __esModule: true,
    default: {
        isObjectIdOrHexString: jest.fn(),
        createConnection: jest.fn(),
    },
}));

jest.mock("../../models/workspace", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        findByIdAndDelete: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findOne: jest.fn(),
    },
    workspaceSchema: {},
}));

jest.mock("../../models/workspace-state", () => ({
    __esModule: true,
    default: {
        deleteMany: jest.fn(),
    },
}));

jest.mock("../../models/app", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

jest.mock("../../models/applet-file", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        deleteMany: jest.fn(),
    },
}));

jest.mock("../../models/applet-shared-file", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        deleteMany: jest.fn(),
    },
}));

jest.mock("../../models/file", () => ({
    __esModule: true,
    default: {
        deleteMany: jest.fn(),
    },
}));

jest.mock("../../models/workspace-membership", () => ({
    __esModule: true,
    default: {
        deleteMany: jest.fn(),
    },
}));

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../utils/shareAccess", () => ({
    resolveShareAccess: jest.fn(),
}));

jest.mock("../../utils/shareHelpers", () => ({
    deleteEntityShare: jest.fn(),
}));

jest.mock("./db", () => ({
    getWorkspace: jest.fn(),
}));

jest.mock("./publish/utils", () => ({
    republishWorkspace: jest.fn(),
    unpublishWorkspace: jest.fn(),
}));

const Workspace = require("../../models/workspace").default;
const WorkspaceState = require("../../models/workspace-state").default;
const App = require("../../models/app").default;
const File = require("../../models/file").default;
const WorkspaceMembership =
    require("../../models/workspace-membership").default;
const mongoose = require("mongoose").default;
const { getCurrentUser } = require("../../utils/auth");
const { deleteEntityShare } = require("../../utils/shareHelpers");
const { getWorkspace } = require("./db");
const { unpublishWorkspace } = require("./publish/utils");
const { GET } = require("./route");

describe("DELETE /api/workspaces/[id]", () => {
    const userId = "507f191e810c19729de860ea";
    const workspaceId = "507f191e810c19729de860eb";

    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: userId });
        App.findOne.mockResolvedValue(null);
        Workspace.findByIdAndDelete.mockResolvedValue({});
        WorkspaceState.deleteMany.mockResolvedValue({});
        File.deleteMany.mockResolvedValue({});
        WorkspaceMembership.deleteMany.mockResolvedValue({});
        deleteEntityShare.mockResolvedValue({ deletedCount: 1 });
        unpublishWorkspace.mockResolvedValue();
    });

    it("returns 404 when the workspace does not exist", async () => {
        Workspace.findById.mockResolvedValue(null);

        const response = await DELETE(
            {},
            { params: Promise.resolve({ id: workspaceId }) },
        );
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body.error).toBe("Workspace not found");
        expect(deleteEntityShare).not.toHaveBeenCalled();
        expect(WorkspaceMembership.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes share state and legacy memberships for owned workspaces", async () => {
        const workspace = {
            _id: workspaceId,
            owner: { equals: jest.fn(() => true) },
            applet: null,
            files: [],
        };
        Workspace.findById.mockResolvedValue(workspace);

        const response = await DELETE(
            {},
            { params: Promise.resolve({ id: workspaceId }) },
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(Workspace.findByIdAndDelete).toHaveBeenCalledWith(workspaceId);
        expect(WorkspaceMembership.deleteMany).toHaveBeenCalledWith({
            workspace: workspaceId,
        });
        expect(deleteEntityShare).toHaveBeenCalledWith(
            "workspace",
            workspaceId,
        );
    });
});

describe("GET /api/workspaces/[id]", () => {
    const workspaceId = "507f191e810c19729de860eb";

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.MONGO_URI;
        mongoose.isObjectIdOrHexString.mockReturnValue(false);
        Workspace.findByIdAndUpdate.mockResolvedValue({});
    });

    it("returns 404 for inaccessible legacy slug workspaces without migrating", async () => {
        const legacyFindOne = jest.fn(async () => ({ _id: workspaceId }));
        const model = jest.fn(() => ({ findOne: legacyFindOne }));
        mongoose.createConnection.mockResolvedValue({ model });
        getWorkspace
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined);

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({ id: "legacy-workspace" }),
        });
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body.error).toBe("Workspace not found");
        expect(getWorkspace).toHaveBeenNthCalledWith(1, "legacy-workspace");
        expect(getWorkspace).toHaveBeenNthCalledWith(2, workspaceId);
        expect(Workspace.findByIdAndUpdate).not.toHaveBeenCalled();
    });
});
