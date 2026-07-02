/**
 * @jest-environment node
 */

import {
    buildCanonicalAppByAppletId,
    canonicalizeAppletApps,
    ensureCanonicalAppletApp,
    ensureUniqueActiveAppletAppIndex,
    hydrateMissingAppletImageVariants,
} from "../canvas-applets/app-records";

jest.mock("../models/app", () => ({
    __esModule: true,
    APP_STATUS: { ACTIVE: "active", INACTIVE: "inactive" },
    APP_TYPES: { APPLET: "applet" },
    default: {
        collection: {
            createIndex: jest.fn(),
            dropIndex: jest.fn(),
        },
        find: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn(),
    },
}));

jest.mock("../models/user.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

jest.mock("../models/media-item.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

const App = require("../models/app").default;
const MediaItem = require("../models/media-item.mjs").default;
const User = require("../models/user.mjs").default;

function lean(value) {
    return {
        lean: jest.fn().mockResolvedValue(value),
    };
}

function mediaItemsQuery(value) {
    return {
        select: jest.fn().mockReturnValue(lean(value)),
    };
}

describe("canvas applet app record canonicalization", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        App.updateMany.mockResolvedValue({});
        App.collection.createIndex.mockResolvedValue("index-created");
        App.collection.dropIndex.mockResolvedValue("index-dropped");
        MediaItem.find.mockReturnValue(mediaItemsQuery([]));
        User.find.mockReturnValue({
            select: jest.fn().mockResolvedValue([]),
        });
    });

    it("merges duplicate applet app metadata into the listed app row", async () => {
        const listedApp = {
            _id: "listed-app",
            appletId: "applet-1",
            name: "Store Listing",
            slug: "store-listing",
            type: "applet",
            status: "active",
            listedInStore: true,
        };
        const duplicateApp = {
            _id: "duplicate-app",
            appletId: "applet-1",
            name: "Private Listing",
            slug: "private-listing",
            type: "applet",
            status: "active",
            listedInStore: false,
            imageUrl: "https://images.example/card.png",
            imageAlt: "Generated card art",
            tags: ["image"],
        };
        const user = {
            apps: [
                {
                    appId: "duplicate-app",
                    order: 0,
                    addedAt: new Date("2026-06-01T00:00:00.000Z"),
                },
                {
                    appId: "listed-app",
                    order: 1,
                    addedAt: new Date("2026-06-02T00:00:00.000Z"),
                },
            ],
            save: jest.fn().mockResolvedValue(undefined),
        };

        App.find.mockReturnValue(lean([duplicateApp, listedApp]));
        App.findByIdAndUpdate.mockReturnValue(
            lean({
                ...listedApp,
                imageUrl: duplicateApp.imageUrl,
                imageAlt: duplicateApp.imageAlt,
                tags: duplicateApp.tags,
            }),
        );
        User.find.mockReturnValue({
            select: jest.fn().mockResolvedValue([user]),
        });

        const result = await canonicalizeAppletApps("applet-1");

        expect(result).toMatchObject({
            _id: "listed-app",
            imageUrl: "https://images.example/card.png",
        });
        expect(App.findByIdAndUpdate).toHaveBeenCalledWith(
            "listed-app",
            {
                $set: expect.objectContaining({
                    name: "Store Listing",
                    slug: "store-listing",
                    listedInStore: true,
                    imageUrl: "https://images.example/card.png",
                    imageAlt: "Generated card art",
                    tags: ["image"],
                }),
            },
            expect.objectContaining({ runValidators: true }),
        );
        expect(user.apps).toEqual([
            {
                appId: "listed-app",
                order: 0,
                addedAt: new Date("2026-06-01T00:00:00.000Z"),
            },
        ]);
        expect(user.save).toHaveBeenCalled();
        expect(App.updateMany).toHaveBeenCalledWith(
            { _id: { $in: ["duplicate-app"] } },
            {
                $set: {
                    status: "inactive",
                    listedInStore: false,
                },
            },
            { runValidators: true },
        );
    });

    it("does not set listedInStore in both $set and $setOnInsert when installing", async () => {
        App.find.mockReturnValue(lean([]));
        App.findOneAndUpdate.mockReturnValue(
            lean({
                _id: "app-1",
                appletId: "applet-1",
                name: "NYTimes Article Creator",
                slug: "private-applet-applet-1",
                type: "applet",
                status: "active",
                listedInStore: false,
            }),
        );

        await ensureCanonicalAppletApp("applet-1", {
            name: "NYTimes Article Creator",
            slug: "private-applet-applet-1",
            author: "user-1",
            type: "applet",
            status: "active",
            listedInStore: false,
            appletId: "applet-1",
            icon: null,
            description: null,
        });

        expect(App.findOneAndUpdate).toHaveBeenCalledWith(
            { appletId: "applet-1" },
            {
                $set: expect.objectContaining({
                    listedInStore: false,
                }),
                $setOnInsert: {},
            },
            expect.objectContaining({ upsert: true }),
        );
    });

    it("serializes applet apps through the supported metadata whitelist", () => {
        const byAppletId = buildCanonicalAppByAppletId([
            {
                _id: "app-1",
                appletId: "applet-1",
                name: "Weather Desk",
                slug: "weather-desk",
                type: "applet",
                status: "active",
                listedInStore: false,
                imageUrl: "https://images.example/card.png",
                tags: ["weather"],
                legacyExtraField: "stale",
            },
        ]);

        expect(byAppletId.get("applet-1")).toMatchObject({
            _id: "app-1",
            appletId: "applet-1",
            name: "Weather Desk",
            imageUrl: "https://images.example/card.png",
            tags: ["weather"],
        });
        expect(byAppletId.get("applet-1")).not.toHaveProperty(
            "legacyExtraField",
        );
    });

    it("hydrates missing light and dark image URLs from generated card media", async () => {
        MediaItem.find.mockReturnValue(
            mediaItemsQuery([
                {
                    outputFolder: "assets/applet-1",
                    tags: ["applet-card", "theme-dark"],
                    azureUrl: "https://images.example/old-dark.webp",
                    createdAt: new Date("2026-06-17T01:58:00.000Z"),
                },
                {
                    outputFolder: "assets/applet-1",
                    tags: ["applet-card", "theme-light"],
                    azureUrl: "https://images.example/light.webp",
                    createdAt: new Date("2026-06-17T01:59:00.000Z"),
                },
                {
                    outputFolder: "assets/applet-1",
                    tags: ["applet-card", "theme-dark"],
                    azureUrl: "https://images.example/dark.webp",
                    createdAt: new Date("2026-06-17T02:00:00.000Z"),
                },
            ]),
        );
        const byAppletId = buildCanonicalAppByAppletId([
            {
                _id: "app-1",
                appletId: "applet-1",
                name: "Headline Generator",
                slug: "headline-generator",
                type: "applet",
                status: "active",
                imageUrl: "https://images.example/light.webp",
            },
        ]);

        await hydrateMissingAppletImageVariants(byAppletId);

        expect(MediaItem.find).toHaveBeenCalledWith(
            expect.objectContaining({
                outputFolder: {
                    $in: ["assets/applet-1", "applets/assets/applet-1"],
                },
                status: "completed",
                tags: "applet-card",
            }),
        );
        expect(byAppletId.get("applet-1")).toMatchObject({
            imageUrl: "https://images.example/light.webp",
            imageLightUrl: "https://images.example/light.webp",
            imageDarkUrl: "https://images.example/dark.webp",
        });
        expect(
            MediaItem.find.mock.results[0].value.select,
        ).toHaveBeenCalledWith(
            "outputFolder tags azureUrl url gcsUrl createdAt",
        );
        expect(MediaItem.find.mock.results[0].value.sort).toBeUndefined();
    });

    it("creates the unique active applet index only for real applet ids", async () => {
        await ensureUniqueActiveAppletAppIndex();

        expect(App.collection.createIndex).toHaveBeenCalledWith(
            { appletId: 1, type: 1, status: 1 },
            expect.objectContaining({
                name: "unique_active_applet_app_identity",
                unique: true,
                partialFilterExpression: {
                    appletId: { $type: "objectId" },
                    type: "applet",
                    status: "active",
                },
            }),
        );
    });

    it("replaces the previous unique active applet index definition", async () => {
        App.collection.createIndex
            .mockRejectedValueOnce({
                code: 86,
                codeName: "IndexKeySpecsConflict",
            })
            .mockResolvedValueOnce("index-created");

        await ensureUniqueActiveAppletAppIndex();

        expect(App.collection.dropIndex).toHaveBeenCalledWith(
            "unique_active_applet_app_identity",
        );
        expect(App.collection.createIndex).toHaveBeenCalledTimes(2);
    });

    it("does not fail startup when Cosmos cannot add a unique index to an existing collection", async () => {
        const warnSpy = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {});
        App.collection.createIndex.mockRejectedValueOnce({
            code: 67,
            codeName: "CannotCreateIndex",
        });

        await expect(
            ensureUniqueActiveAppletAppIndex(),
        ).resolves.toBeUndefined();

        expect(App.collection.dropIndex).not.toHaveBeenCalled();
        expect(App.collection.createIndex).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            "Skipping unique active applet app index; this database does not support adding it after data exists.",
        );
        warnSpy.mockRestore();
    });

    it("does not fail startup when Cosmos throttles non-critical index creation", async () => {
        const warnSpy = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {});
        App.collection.createIndex.mockRejectedValueOnce({
            code: 16500,
            message: "Error=16500, RetryAfterMs=500, Details='TooManyRequests'",
        });

        await expect(
            ensureUniqueActiveAppletAppIndex(),
        ).resolves.toBeUndefined();

        expect(App.collection.dropIndex).not.toHaveBeenCalled();
        expect(App.collection.createIndex).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                "Skipping unique active applet app index during transient database throttling",
            ),
        );
        warnSpy.mockRestore();
    });

    it("does not fail startup when Cosmos throttles index replacement cleanup", async () => {
        const warnSpy = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {});
        App.collection.createIndex.mockRejectedValueOnce({
            code: 86,
            codeName: "IndexKeySpecsConflict",
        });
        App.collection.dropIndex.mockRejectedValueOnce({
            code: 16500,
            message: "Error=16500, RetryAfterMs=500, Details='TooManyRequests'",
        });

        await expect(
            ensureUniqueActiveAppletAppIndex(),
        ).resolves.toBeUndefined();

        expect(App.collection.dropIndex).toHaveBeenCalledWith(
            "unique_active_applet_app_identity",
        );
        expect(App.collection.createIndex).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                "Skipping unique active applet app index during transient database throttling",
            ),
        );
        warnSpy.mockRestore();
    });

    it("does not fail startup when Cosmos cannot recreate the replacement unique index", async () => {
        const warnSpy = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {});
        App.collection.createIndex
            .mockRejectedValueOnce({
                code: 86,
                codeName: "IndexKeySpecsConflict",
            })
            .mockRejectedValueOnce({
                code: 67,
                codeName: "CannotCreateIndex",
            });

        await expect(
            ensureUniqueActiveAppletAppIndex(),
        ).resolves.toBeUndefined();

        expect(App.collection.dropIndex).toHaveBeenCalledWith(
            "unique_active_applet_app_identity",
        );
        expect(App.collection.createIndex).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalledWith(
            "Skipping unique active applet app index; this database does not support adding it after data exists.",
        );
        warnSpy.mockRestore();
    });
});
