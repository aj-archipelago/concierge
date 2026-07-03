/**
 * @jest-environment node
 */

jest.mock("../../../models/applet", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        updateOne: jest.fn(async () => ({})),
    },
}));

jest.mock("../../../models/app", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
    APP_STATUS: { ACTIVE: "active" },
}));

jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../../utils/shareAccess", () => ({
    resolveShareAccess: jest.fn(),
}));

jest.mock("../../../canvas-applets/versioning", () => ({
    getAppletVersionBlobPath: jest.fn(() => null),
    resolvePublishedAppletContent: jest.fn(async () => "<html></html>"),
}));

const Applet = require("../../../models/applet").default;
const App = require("../../../models/app").default;
const { getCurrentUser } = require("../../../utils/auth");
const { resolveShareAccess } = require("../../../utils/shareAccess");
const { GET } = require("../[id]/route");

describe("GET /api/published/applets/[id]", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns published applet data for app-store listings without auth", async () => {
        Applet.findOne.mockReturnValue({
            select: jest.fn(() => ({
                lean: jest.fn(async () => ({
                    _id: "507f1f77bcf86cd799439011",
                    owner: "owner-1",
                    name: "Budget tracker",
                    publishedVersionIndex: 0,
                    htmlVersions: [{ contentBlobPath: "blob/path" }],
                })),
            })),
        });
        App.findOne
            .mockReturnValueOnce({
                select: jest.fn(() => ({
                    lean: jest.fn(async () => ({ _id: "app-1" })),
                })),
            })
            .mockReturnValueOnce({
                select: jest.fn(() => ({
                    lean: jest.fn(async () => ({
                        name: "Budget tracker",
                        slug: "budget-tracker",
                        status: "active",
                    })),
                })),
            });

        getCurrentUser.mockResolvedValue(null);

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({
                id: "507f1f77bcf86cd799439011",
            }),
        });

        expect(response.status).toBe(200);
        expect(getCurrentUser).toHaveBeenCalledTimes(1);
        expect(getCurrentUser).toHaveBeenCalledWith(false);
        const body = await response.json();
        expect(body.applet.publishedHtml).toBe("<html></html>");
        expect(body.meta).toBeNull();
    });

    it("does not treat private active app records as public listings", async () => {
        Applet.findOne.mockReturnValue({
            select: jest.fn(() => ({
                lean: jest.fn(async () => ({
                    _id: "507f1f77bcf86cd799439011",
                    owner: "owner-1",
                    name: "Budget tracker",
                    publishedVersionIndex: 0,
                    htmlVersions: [{ contentBlobPath: "blob/path" }],
                })),
            })),
        });
        App.findOne.mockImplementation((query) => ({
            select: jest.fn(() => ({
                lean: jest.fn(async () =>
                    query.listedInStore?.$ne === false
                        ? null
                        : { _id: "private-app", listedInStore: false },
                ),
            })),
        }));
        getCurrentUser.mockResolvedValue(null);
        resolveShareAccess.mockResolvedValue({
            canAccess: false,
            isOwner: false,
            role: null,
        });

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({
                id: "507f1f77bcf86cd799439011",
            }),
        });

        expect(response.status).toBe(401);
        expect(App.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                appletId: "507f1f77bcf86cd799439011",
                status: "active",
                listedInStore: { $ne: false },
            }),
        );
        expect(resolveShareAccess).toHaveBeenCalled();
    });

    it("allows link-shared published applets without auth", async () => {
        Applet.findOne.mockReturnValue({
            select: jest.fn(() => ({
                lean: jest.fn(async () => ({
                    _id: "507f1f77bcf86cd799439011",
                    owner: "owner-1",
                    name: "Budget tracker",
                    publishedVersionIndex: 0,
                    htmlVersions: [{ contentBlobPath: "blob/path" }],
                })),
            })),
        });
        App.findOne.mockReturnValue({
            select: jest.fn(() => ({
                lean: jest.fn(async () => null),
            })),
        });
        getCurrentUser.mockResolvedValue(null);
        resolveShareAccess.mockResolvedValue({
            canAccess: true,
            isOwner: false,
            role: "viewer",
        });

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({
                id: "507f1f77bcf86cd799439011",
            }),
        });

        expect(response.status).toBe(200);
        expect(resolveShareAccess).toHaveBeenCalled();
    });

    it("requires share access for private published applets", async () => {
        Applet.findOne.mockReturnValue({
            select: jest.fn(() => ({
                lean: jest.fn(async () => ({
                    _id: "507f1f77bcf86cd799439011",
                    owner: "owner-1",
                    name: "Budget tracker",
                    publishedVersionIndex: 0,
                    htmlVersions: [{ contentBlobPath: "blob/path" }],
                })),
            })),
        });
        App.findOne.mockReturnValue({
            select: jest.fn(() => ({
                lean: jest.fn(async () => null),
            })),
        });
        getCurrentUser.mockResolvedValue({ _id: "viewer-1" });
        resolveShareAccess.mockResolvedValue({
            canAccess: false,
            isOwner: false,
            role: null,
        });

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({
                id: "507f1f77bcf86cd799439011",
            }),
        });

        expect(response.status).toBe(401);
    });

    it("allows recipients to load private published applets", async () => {
        Applet.findOne.mockReturnValue({
            select: jest.fn(() => ({
                lean: jest.fn(async () => ({
                    _id: "507f1f77bcf86cd799439011",
                    owner: "owner-1",
                    name: "Budget tracker",
                    publishedVersionIndex: 0,
                    htmlVersions: [{ contentBlobPath: "blob/path" }],
                })),
            })),
        });
        App.findOne.mockReturnValue({
            select: jest.fn(() => ({
                lean: jest.fn(async () => null),
            })),
        });
        getCurrentUser.mockResolvedValue({ _id: "viewer-1" });
        resolveShareAccess.mockResolvedValue({
            canAccess: true,
            isOwner: false,
            role: "viewer",
        });

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({
                id: "507f1f77bcf86cd799439011",
            }),
        });

        expect(response.status).toBe(200);
        expect(getCurrentUser).toHaveBeenCalledTimes(1);
        expect(getCurrentUser).toHaveBeenCalledWith(false);
        const body = await response.json();
        expect(body.applet.name).toBe("Budget tracker");
        expect(body.meta).toEqual({
            isOwner: false,
            canAdminCopy: false,
        });
    });
});
