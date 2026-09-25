/**
 * @jest-environment node
 */

import { validateAppletAccess } from "./access.js";
import Applet from "../models/applet.js";
import App from "../models/app.js";
import Workspace from "../models/workspace.js";
import Share from "../models/share.js";

const appletId = "69fcdbb6ac8ccc9ef8a8c0b4";
const userId = "507f191e810c19729de860ea";
const ownerId = "507f191e810c19729de860eb";

jest.mock("../models/applet.js", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

jest.mock("../models/app.js", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
    },
    APP_STATUS: {
        ACTIVE: "active",
    },
    APP_TYPES: {
        APPLET: "applet",
    },
}));

jest.mock("../models/workspace.js", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findById: jest.fn(),
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
        "article",
    ],
    SHARE_ROLES: ["viewer", "editor"],
}));

jest.mock("../models/chat.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("../models/automation.js", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("../models/article.js", () => ({
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

describe("validateAppletAccess", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        const mongoose = require("mongoose").default;
        mongoose.Types.ObjectId.isValid.mockReturnValue(true);

        Applet.findById.mockReturnValue(
            mockQueryResult({
                _id: appletId,
                owner: ownerId,
                version: 2,
                publishedVersionIndex: 0,
            }),
        );
        App.findOne.mockReturnValue(mockQueryResult(null));
        Workspace.findOne.mockReturnValue(mockQueryResult(null));
        Share.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
    });

    it("denies unlisted published v2 applets without share access", async () => {
        const response = await validateAppletAccess(appletId, { _id: userId });

        expect(response.status).toBe(403);
        expect(App.findOne).toHaveBeenCalledWith({
            type: "applet",
            status: "active",
            listedInStore: { $ne: false },
            $or: [{ appletId }],
        });
    });

    it("allows listed public v2 applets", async () => {
        App.findOne.mockReturnValue(mockQueryResult({ _id: "app-record" }));

        const response = await validateAppletAccess(appletId, { _id: userId });

        expect(response).toBeNull();
    });

    it("allows explicit published applet recipients", async () => {
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

        const response = await validateAppletAccess(appletId, { _id: userId });

        expect(response).toBeNull();
    });

    it("does not treat unlisted legacy app records as public", async () => {
        Applet.findById.mockReturnValue(
            mockQueryResult({
                _id: appletId,
                owner: ownerId,
                version: 1,
                publishedVersionIndex: 0,
            }),
        );
        Workspace.findOne.mockReturnValue(
            mockQueryResult({ _id: "507f191e810c19729de860ec" }),
        );
        App.findOne.mockReturnValue(mockQueryResult(null));

        const response = await validateAppletAccess(appletId, { _id: userId });

        expect(response.status).toBe(403);
        expect(App.findOne).toHaveBeenCalledWith({
            type: "applet",
            status: "active",
            listedInStore: { $ne: false },
            $or: [{ appletId }, { workspaceId: "507f191e810c19729de860ec" }],
        });
    });
});
