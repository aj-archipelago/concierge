import {
    getAppsCatalogList,
    mergePickerApplets,
    normalizeAppletPickerApplet,
    normalizeStoreAppForPicker,
    normalizeStoreAppsForPicker,
} from "../appPickerUtils";

describe("appPickerUtils marketplace catalog helpers", () => {
    const marketplaceApplet = {
        _id: "app-1",
        name: "Market Briefing",
        type: "applet",
        listedInStore: true,
        category: "News",
        tags: ["markets"],
        appletId: {
            _id: "applet-market-1",
            name: "Market Briefing",
            publishedVersionIndex: 0,
            htmlVersions: [{ html: "<html></html>" }],
        },
    };

    const nativeApp = {
        _id: "native-1",
        name: "Files",
        type: "native",
        listedInStore: true,
    };

    test("getAppsCatalogList accepts the bare /api/apps array", () => {
        expect(getAppsCatalogList([marketplaceApplet, nativeApp])).toEqual([
            marketplaceApplet,
            nativeApp,
        ]);
    });

    test("getAppsCatalogList tolerates a wrapped { apps } payload", () => {
        expect(getAppsCatalogList({ apps: [marketplaceApplet] })).toEqual([
            marketplaceApplet,
        ]);
        expect(getAppsCatalogList(null)).toEqual([]);
        expect(getAppsCatalogList({})).toEqual([]);
    });

    test("normalizeStoreAppsForPicker maps marketplace applets and skips natives", () => {
        const pickerApplets = normalizeStoreAppsForPicker([
            marketplaceApplet,
            nativeApp,
            { _id: "app-2", type: "applet", name: "No applet id" },
        ]);

        expect(pickerApplets).toHaveLength(1);
        expect(pickerApplets[0]).toMatchObject({
            appletId: "applet-market-1",
            name: "Market Briefing",
            category: "News",
            tags: ["markets"],
            publishedVersionIndex: 0,
            latestVersionIndex: 0,
        });
    });

    test("normalizeStoreAppForPicker uses app metadata for display", () => {
        expect(
            normalizeStoreAppForPicker({
                ...marketplaceApplet,
                name: "Store Title",
                description: "From the store",
            }),
        ).toMatchObject({
            appletId: "applet-market-1",
            name: "Store Title",
            description: "From the store",
        });
    });

    test("mergePickerApplets prefers the first occurrence of each appletId", () => {
        const own = normalizeAppletPickerApplet({
            _id: "applet-market-1",
            version: 2,
            name: "My Copy",
            app: { name: "My Copy" },
        });
        const store = normalizeStoreAppsForPicker([marketplaceApplet]);

        expect(mergePickerApplets(own ? [own] : [], store)).toEqual([
            expect.objectContaining({
                appletId: "applet-market-1",
                name: "My Copy",
            }),
        ]);
    });

    test("normalizeStoreAppsForPicker recovers when callers pass { apps }", () => {
        expect(
            normalizeStoreAppsForPicker({ apps: [marketplaceApplet] }),
        ).toHaveLength(1);
    });
});
