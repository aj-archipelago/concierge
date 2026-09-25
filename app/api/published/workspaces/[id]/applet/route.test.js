/**
 * @jest-environment node
 */

jest.mock("mongoose", () => ({
    __esModule: true,
    default: {
        isObjectIdOrHexString: jest.fn(),
    },
}));

jest.mock("../../../../models/workspace", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

jest.mock("../../../../models/applet", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

jest.mock("../../../../models/app", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
    APP_STATUS: { ACTIVE: "active" },
}));

jest.mock("../../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../../../utils/shareAccess", () => ({
    resolveShareAccess: jest.fn(),
}));

jest.mock("../../../../canvas-applets/versioning", () => ({
    resolvePublishedAppletContent: jest.fn(async () => "<html></html>"),
}));

const mongoose = require("mongoose").default;
const Workspace = require("../../../../models/workspace").default;
const Applet = require("../../../../models/applet").default;
const App = require("../../../../models/app").default;
const { getCurrentUser } = require("../../../../utils/auth");
const { resolveShareAccess } = require("../../../../utils/shareAccess");
const { GET } = require("./route");

function leanQuery(value) {
    return {
        select: jest.fn(() => ({
            lean: jest.fn(async () => value),
        })),
    };
}

describe("GET /api/published/workspaces/[id]/applet", () => {
    const workspaceId = "507f1f77bcf86cd799439011";
    const appletId = "507f1f77bcf86cd799439012";
    const ownerId = "507f1f77bcf86cd799439013";

    beforeEach(() => {
        jest.clearAllMocks();
        mongoose.isObjectIdOrHexString.mockReturnValue(true);
        Workspace.findOne.mockReturnValue(
            leanQuery({ _id: workspaceId, applet: appletId }),
        );
        Applet.findOne.mockReturnValue(
            leanQuery({
                _id: appletId,
                owner: ownerId,
                name: "Desk applet",
                publishedVersionIndex: 0,
                htmlVersions: [{ contentBlobPath: "blob/path" }],
            }),
        );
    });

    it("keeps listed workspace applet links public", async () => {
        App.findOne.mockReturnValue(
            leanQuery({
                _id: "app-1",
                name: "Desk applet",
                slug: "desk-applet",
                status: "active",
                type: "applet",
                listedInStore: true,
            }),
        );

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({ id: workspaceId }),
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.app.slug).toBe("desk-applet");
        expect(resolveShareAccess).not.toHaveBeenCalled();
    });

    it("keeps legacy workspace applet links public when no app metadata exists", async () => {
        App.findOne.mockReturnValue(leanQuery(null));

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({ id: workspaceId }),
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.app).toBeNull();
        expect(body.applet.publishedHtml).toBe("<html></html>");
        expect(resolveShareAccess).not.toHaveBeenCalled();
    });

    it("requires published share access for unlisted workspace applets", async () => {
        App.findOne.mockReturnValue(
            leanQuery({
                _id: "app-1",
                name: "Desk applet",
                slug: "desk-applet",
                status: "active",
                type: "applet",
                listedInStore: false,
            }),
        );
        getCurrentUser.mockResolvedValue({ _id: "viewer-1" });
        resolveShareAccess.mockResolvedValue({
            canAccess: false,
            isOwner: false,
            role: null,
        });

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({ id: workspaceId }),
        });
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe("Unauthorized");
        expect(resolveShareAccess).toHaveBeenCalledWith({
            entityType: "published_applet",
            entityId: appletId,
            userId: "viewer-1",
            ownerId,
        });
    });

    it("renders unlisted workspace applets for published share recipients without redirect metadata", async () => {
        App.findOne.mockReturnValue(
            leanQuery({
                _id: "app-1",
                name: "Desk applet",
                slug: "desk-applet",
                status: "active",
                type: "applet",
                listedInStore: false,
            }),
        );
        getCurrentUser.mockResolvedValue({ _id: "viewer-1" });
        resolveShareAccess.mockResolvedValue({
            canAccess: true,
            isOwner: false,
            role: "viewer",
        });

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({ id: workspaceId }),
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.app).toBeNull();
        expect(body.applet.publishedHtml).toBe("<html></html>");
    });
});
