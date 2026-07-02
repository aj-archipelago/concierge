/**
 * @jest-environment node
 */

import App from "../models/app";
import {
    clearBuiltInNativeAppsCacheForTests,
    ensureBuiltInNativeApps,
} from "./native-apps";

jest.mock("../models/app", () => ({
    __esModule: true,
    APP_TYPES: { NATIVE: "native" },
    APP_STATUS: { ACTIVE: "active", INACTIVE: "inactive" },
    default: {
        find: jest.fn(),
        bulkWrite: jest.fn(),
    },
}));

function query(value) {
    return {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(value),
    };
}

describe("ensureBuiltInNativeApps", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearBuiltInNativeAppsCacheForTests();
        App.bulkWrite.mockResolvedValue({});
    });

    it("updates stale metadata on existing native app records", async () => {
        App.find
            .mockReturnValueOnce(
                query([
                    {
                        _id: "app-workspaces",
                        slug: "workspaces",
                        name: "Workspaces",
                        type: "native",
                        status: "active",
                        listedInStore: true,
                        icon: "Briefcase",
                        description: "Old description",
                    },
                ]),
            )
            .mockResolvedValueOnce([{ _id: "app-workspaces" }]);

        await ensureBuiltInNativeApps();

        const operations = App.bulkWrite.mock.calls[0][0];
        const workspacesUpdate = operations.find(
            (operation) =>
                operation.updateOne?.filter?._id === "app-workspaces",
        );

        expect(workspacesUpdate).toEqual(
            expect.objectContaining({
                updateOne: expect.objectContaining({
                    update: {
                        $set: expect.objectContaining({
                            name: "Applets",
                            slug: "workspaces",
                            type: "native",
                            status: "active",
                            listedInStore: true,
                            icon: "AppWindow",
                            description:
                                "Browse, create, and manage your applets.",
                        }),
                    },
                }),
            }),
        );
    });

    it("reuses recently verified native app records for read-heavy routes", async () => {
        const activeApps = [{ _id: "app-home", slug: "home", type: "native" }];
        App.find
            .mockReturnValueOnce(query([]))
            .mockResolvedValueOnce(activeApps);

        const first = await ensureBuiltInNativeApps();
        const second = await ensureBuiltInNativeApps();

        expect(first).toBe(activeApps);
        expect(second).toBe(activeApps);
        expect(App.find).toHaveBeenCalledTimes(2);
        expect(App.bulkWrite).toHaveBeenCalledTimes(1);
    });
});
