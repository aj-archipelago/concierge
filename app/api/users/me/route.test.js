/**
 * @jest-environment node
 */

import { getCurrentUser } from "../../utils/auth";
import App from "../../models/app";
import { ensureBuiltInNativeApps } from "../../apps/native-apps";
import { PUT } from "./route";
import { reconcileUserApps, SIDEBAR_APPS_SCHEMA_VERSION } from "./sidebar-apps";

jest.mock("../../utils/auth", () => ({
    __esModule: true,
    getCurrentUser: jest.fn(),
}));

jest.mock("../../models/app", () => ({
    __esModule: true,
    APP_TYPES: { NATIVE: "native" },
    APP_STATUS: { ACTIVE: "active" },
    default: {
        find: jest.fn(),
    },
}));

jest.mock("../../apps/native-apps", () => ({
    __esModule: true,
    CORE_SIDEBAR_NATIVE_APP_SLUGS: ["home", "files", "chat", "automations"],
    DEFAULT_NATIVE_APP_SLUGS: [
        "home",
        "files",
        "chat",
        "automations",
        "translate",
        "video",
        "write",
        "workspaces",
        "media",
        "jira",
    ],
    ensureBuiltInNativeApps: jest.fn(),
}));

function query(value) {
    return {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(value),
    };
}

const nativeApps = [
    "home",
    "files",
    "chat",
    "automations",
    "translate",
    "video",
    "write",
    "workspaces",
    "media",
    "jira",
].map((slug) => ({
    _id: `app-${slug}`,
    slug,
    type: "native",
}));

describe("/api/users/me sidebar app reconciliation", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ensureBuiltInNativeApps.mockResolvedValue(nativeApps);
    });

    it("prepends missing core app-backed navigation once while preserving saved app order", async () => {
        const user = {
            userId: "user-1",
            apps: [
                {
                    appId: "app-translate",
                    order: 0,
                    addedAt: new Date("2026-06-01T00:00:00.000Z"),
                },
                {
                    appId: "app-custom-applet",
                    order: 1,
                    addedAt: new Date("2026-06-02T00:00:00.000Z"),
                },
                {
                    appId: "app-media",
                    order: 2,
                    addedAt: new Date("2026-06-03T00:00:00.000Z"),
                },
            ],
            save: jest.fn().mockResolvedValue(undefined),
        };

        App.find.mockReturnValueOnce(
            query([
                { _id: "app-translate", slug: "translate" },
                { _id: "app-custom-applet", type: "applet" },
                { _id: "app-media", slug: "media" },
            ]),
        );

        await reconcileUserApps(user);

        expect(user.apps.map((entry) => entry.appId)).toEqual([
            "app-home",
            "app-files",
            "app-chat",
            "app-automations",
            "app-translate",
            "app-custom-applet",
            "app-media",
        ]);
        expect(user.apps.map((entry) => entry.order)).toEqual([
            0, 1, 2, 3, 4, 5, 6,
        ]);
        expect(user.sidebarAppsVersion).toBe(SIDEBAR_APPS_SCHEMA_VERSION);
        expect(user.save).toHaveBeenCalled();
    });

    it("initializes unversioned empty app lists with the current defaults", async () => {
        const user = {
            userId: "user-2",
            apps: [],
            save: jest.fn().mockResolvedValue(undefined),
        };
        await reconcileUserApps(user);

        expect(user.apps.map((entry) => entry.appId)).toEqual([
            "app-home",
            "app-files",
            "app-chat",
            "app-automations",
            "app-translate",
            "app-video",
            "app-write",
            "app-workspaces",
            "app-media",
            "app-jira",
        ]);
        expect(user.sidebarAppsVersion).toBe(SIDEBAR_APPS_SCHEMA_VERSION);
        expect(user.save).toHaveBeenCalled();
    });

    it("does not repopulate a versioned empty app list", async () => {
        const user = {
            userId: "user-3",
            apps: [],
            sidebarAppsVersion: SIDEBAR_APPS_SCHEMA_VERSION,
            save: jest.fn().mockResolvedValue(undefined),
        };
        await reconcileUserApps(user);

        expect(user.apps).toEqual([]);
        expect(user.save).not.toHaveBeenCalled();
        expect(ensureBuiltInNativeApps).not.toHaveBeenCalled();
    });

    it("marks explicit sidebar app updates as initialized even when every app is removed", async () => {
        const user = {
            apps: [{ appId: "app-home", order: 0 }],
            save: jest.fn().mockResolvedValue(undefined),
            populate: jest.fn().mockResolvedValue(undefined),
            toJSON: jest.fn(() => ({
                apps: [],
                sidebarAppsVersion: SIDEBAR_APPS_SCHEMA_VERSION,
            })),
        };
        getCurrentUser.mockResolvedValue(user);

        const response = await PUT({
            json: jest.fn().mockResolvedValue({ apps: [] }),
        });
        const body = await response.json();

        expect(user.apps).toEqual([]);
        expect(user.sidebarAppsVersion).toBe(SIDEBAR_APPS_SCHEMA_VERSION);
        expect(user.save).toHaveBeenCalled();
        expect(body.sidebarAppsVersion).toBe(SIDEBAR_APPS_SCHEMA_VERSION);
    });
});
