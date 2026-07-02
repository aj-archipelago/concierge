/**
 * @jest-environment node
 */

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        create: jest.fn(),
    },
}));

const Applet = require("../models/applet").default;
const { copyAppletForAdmin } = require("../canvas-applets/copy");

describe("copyAppletForAdmin", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("rejects non-admin users", async () => {
        await expect(
            copyAppletForAdmin(
                { _id: "user1", role: "user" },
                "507f1f77bcf86cd799439011",
            ),
        ).rejects.toMatchObject({ status: 403 });
    });

    it("rejects copying an applet the admin already owns", async () => {
        Applet.findById.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
            owner: "admin1",
            name: "Contract Compliance",
            version: 2,
            publishedVersionIndex: 0,
            htmlVersions: [],
        });

        await expect(
            copyAppletForAdmin(
                { _id: "admin1", role: "admin" },
                "507f1f77bcf86cd799439011",
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "This applet already belongs to your account",
        });
    });

    it("rejects copying unpublished applets", async () => {
        Applet.findById.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
            owner: "owner1",
            name: "Draft Applet",
            version: 2,
            publishedVersionIndex: null,
            htmlVersions: [],
        });

        await expect(
            copyAppletForAdmin(
                { _id: "admin1", role: "admin" },
                "507f1f77bcf86cd799439011",
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "Applet is not published",
        });
    });

    it("rejects copying legacy v1 applets", async () => {
        Applet.findById.mockResolvedValue({
            _id: "507f1f77bcf86cd799439011",
            owner: "owner1",
            name: "Legacy Applet",
            version: 1,
            publishedVersionIndex: 0,
            htmlVersions: [],
        });

        await expect(
            copyAppletForAdmin(
                { _id: "admin1", role: "admin" },
                "507f1f77bcf86cd799439011",
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "Only canvas (v2) applets can be copied",
        });
    });
});
