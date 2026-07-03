/**
 * @jest-environment node
 */

import { GET } from "../route";

jest.mock("../../models/app", () => ({
    __esModule: true,
    APP_TYPES: { APPLET: "applet", NATIVE: "native" },
    APP_STATUS: { ACTIVE: "active", INACTIVE: "inactive" },
    default: {
        find: jest.fn(),
    },
}));

jest.mock("../../models/workspace", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

jest.mock("../native-apps", () => ({
    ensureBuiltInNativeApps: jest.fn(),
}));

function mockAppFindResult(apps) {
    const sort = jest.fn().mockResolvedValue(apps);
    const populateApplet = jest.fn(() => ({ sort }));
    const populateAuthor = jest.fn(() => ({ populate: populateApplet }));

    return { populate: populateAuthor };
}

function mockWorkspaceFindResult(workspaces) {
    const lean = jest.fn().mockResolvedValue(workspaces);
    const populate = jest.fn(() => ({ lean }));
    const select = jest.fn(() => ({ populate }));

    return { select };
}

describe("apps catalog route", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        require("../../models/workspace").default.find.mockReturnValue(
            mockWorkspaceFindResult([]),
        );
    });

    test("omits applet records without a published version from Discover", async () => {
        const App = require("../../models/app").default;
        App.find.mockReturnValue(
            mockAppFindResult([
                {
                    _id: "stale-applet-app",
                    name: "Unpublished Applet",
                    type: "applet",
                    listedInStore: true,
                    appletId: { publishedVersionIndex: null },
                },
                {
                    _id: "published-applet-app",
                    name: "Published Applet",
                    type: "applet",
                    listedInStore: true,
                    appletId: { publishedVersionIndex: 0 },
                },
                {
                    _id: "native-app",
                    name: "Native App",
                    type: "native",
                    listedInStore: true,
                },
            ]),
        );

        const response = await GET();
        const body = await response.json();

        expect(body.map((app) => app._id)).toEqual([
            "published-applet-app",
            "native-app",
        ]);
    });

    test("omits legacy workspace applets without a published version from Discover", async () => {
        const App = require("../../models/app").default;
        const Workspace = require("../../models/workspace").default;
        App.find.mockReturnValue(
            mockAppFindResult([
                {
                    _id: "unpublished-legacy-app",
                    name: "Unpublished Legacy Applet",
                    type: "applet",
                    listedInStore: true,
                    workspaceId: "workspace-unpublished",
                },
                {
                    _id: "published-legacy-app",
                    name: "Published Legacy Applet",
                    type: "applet",
                    listedInStore: true,
                    workspaceId: "workspace-published",
                },
            ]),
        );
        Workspace.find.mockReturnValue(
            mockWorkspaceFindResult([
                {
                    _id: "workspace-unpublished",
                    applet: { publishedVersionIndex: null },
                },
                {
                    _id: "workspace-published",
                    applet: { publishedVersionIndex: 0 },
                },
            ]),
        );

        const response = await GET();
        const body = await response.json();

        expect(Workspace.find).toHaveBeenCalledWith({
            _id: {
                $in: ["workspace-unpublished", "workspace-published"],
            },
        });
        expect(body.map((app) => app._id)).toEqual(["published-legacy-app"]);
    });
});
