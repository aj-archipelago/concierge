/**
 * @jest-environment node
 */

import { getCanvasAppletForDataAccess } from "../canvas-applets/[id]/utils";

jest.mock("next/server", () => ({
    NextResponse: {
        json: (data, options) => ({
            ...data,
            status: (options && options.status) || 200,
        }),
    },
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
}));

jest.mock("../models/app", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
    APP_STATUS: {
        ACTIVE: "active",
    },
}));

jest.mock("../models/share.js", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
    SHARE_ENTITY_TYPES: [
        "chat",
        "workspace",
        "applet",
        "published_applet",
        "automation",
    ],
    SHARE_ROLES: ["viewer", "editor"],
}));

jest.mock("../models/chat.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("../models/workspace", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("../models/automation", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("../models/article", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("mongoose", () => {
    const Types = {
        ObjectId: {
            isValid: jest.fn(),
        },
    };

    return {
        __esModule: true,
        default: {
            Types,
        },
        Types,
    };
});

function mockQueryResult(value) {
    return {
        select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(value),
        }),
    };
}

describe("getCanvasAppletForDataAccess", () => {
    const appletId = "69fcdbb6ac8ccc9ef8a8c0b4";
    const userId = "507f191e810c19729de860ea";
    const ownerId = "507f191e810c19729de860eb";

    beforeEach(() => {
        jest.clearAllMocks();

        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue({ _id: userId });

        const mongoose = require("mongoose").default;
        mongoose.Types.ObjectId.isValid.mockReturnValue(true);

        const Applet = require("../models/applet").default;
        Applet.findOne.mockResolvedValue({
            _id: appletId,
            owner: ownerId,
            version: 2,
            publishedVersionIndex: 0,
        });

        const App = require("../models/app").default;
        App.findOne.mockReturnValue(mockQueryResult(null));

        const Share = require("../models/share.js").default;
        Share.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
    });

    it("denies unlisted published applets without share access", async () => {
        const result = await getCanvasAppletForDataAccess(appletId);

        expect(result.error?.status).toBe(403);
    });

    it("allows users with explicit applet share access", async () => {
        const Applet = require("../models/applet").default;
        Applet.findOne.mockResolvedValue({
            _id: appletId,
            owner: ownerId,
            version: 2,
            publishedVersionIndex: null,
        });
        const Share = require("../models/share.js").default;
        Share.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                recipients: [{ userId, role: "viewer" }],
                link: { enabled: false, role: "viewer" },
            }),
        });

        const result = await getCanvasAppletForDataAccess(appletId);

        expect(result.error).toBeUndefined();
        expect(result.access).toMatchObject({
            canAccess: true,
            isOwner: false,
            role: "viewer",
        });
    });

    it("allows users with explicit published applet share access", async () => {
        const Share = require("../models/share.js").default;
        Share.findOne.mockImplementation(({ entityType }) => ({
            lean: jest.fn().mockResolvedValue(
                entityType === "published_applet"
                    ? {
                          recipients: [{ userId, role: "viewer" }],
                          link: { enabled: false, role: "viewer" },
                      }
                    : null,
            ),
        }));

        const result = await getCanvasAppletForDataAccess(appletId);

        expect(result.error).toBeUndefined();
        expect(result.access).toMatchObject({
            canAccess: true,
            isOwner: false,
            role: "viewer",
        });
    });

    it("allows listed public app-store applets", async () => {
        const App = require("../models/app").default;
        App.findOne.mockReturnValue(mockQueryResult({ _id: "app-record" }));

        const result = await getCanvasAppletForDataAccess(appletId);

        expect(result.error).toBeUndefined();
        expect(result.access).toMatchObject({
            canAccess: true,
            isOwner: false,
            role: "viewer",
        });
        expect(App.findOne).toHaveBeenCalledWith({
            appletId,
            status: "active",
            listedInStore: { $ne: false },
        });
    });
});
