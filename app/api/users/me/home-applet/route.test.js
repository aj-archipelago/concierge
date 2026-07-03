/**
 * @jest-environment node
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../../../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("/api/users/me/home-applet route", () => {
    test("validates applet access before persisting the user's home applet", () => {
        const routeSrc = read("app/api/users/me/home-applet/route.js");
        const userModelSrc = read("app/api/models/user.mjs");

        expect(userModelSrc).toMatch(/homeAppletId/);
        expect(userModelSrc).toMatch(/homeAppletDirectory/);
        expect(userModelSrc).toMatch(/homeItemsDefaultGroupMigrated/);
        expect(userModelSrc).toMatch(/ref: "Applet"/);
        expect(routeSrc).toMatch(/getCurrentUser\(false\)/);
        expect(routeSrc).toMatch(/validateAppletId\(appletId\)/);
        expect(routeSrc).toMatch(/getAppletRegistry\(user, appletId\)/);
        expect(routeSrc).toMatch(/setHomeAppletIdForUser\(user, appletId\)/);
        expect(routeSrc).toMatch(/clearHomeAppletIdForUser\(user\)/);
        expect(routeSrc).toMatch(/readHomeAppletDirectoryForUser\(user\)/);

        const settingsSrc = read("app/api/users/me/homeAppletSettings.js");
        expect(settingsSrc).toMatch(/User\.collection\.findOne/);
        expect(settingsSrc).toMatch(/User\.collection\.updateOne/);
        expect(settingsSrc).toMatch(/\$set: \{ homeAppletId \}/);
        expect(settingsSrc).toMatch(/\$unset: \{ homeAppletId: "" \}/);
        expect(settingsSrc).toMatch(/value\._id !== value/);
        expect(settingsSrc).toMatch(/addHomeAppletDirectoryItemForUser/);
        expect(settingsSrc).toMatch(/removeHomeAppletDirectoryItemForUser/);
        expect(settingsSrc).toMatch(/setHomeAppletDirectoryOrderForUser/);
        expect(settingsSrc).toMatch(/setHomeItemsForUser/);
        expect(settingsSrc).toMatch(/homeItemsDefaultGroupMigrated: true/);
    });

    test("home directory route validates applet access before changing the list", () => {
        const routeSrc = read(
            "app/api/users/me/home-applet-directory/route.js",
        );

        expect(routeSrc).toMatch(/getCurrentUser\(false\)/);
        expect(routeSrc).toMatch(/validateAppletId\(appletId\)/);
        expect(routeSrc).toMatch(/getAppletRegistry\(user, appletId\)/);
        expect(routeSrc).toMatch(/addHomeAppletDirectoryItemForUser/);
        expect(routeSrc).toMatch(/removeHomeAppletDirectoryItemForUser/);
        expect(routeSrc).toMatch(/setHomeAppletDirectoryOrderForUser/);
    });

    test("home items route validates applet access before changing the mixed layout", () => {
        const routeSrc = read("app/api/users/me/home-items/route.js");

        expect(routeSrc).toMatch(/getCurrentUser\(false\)/);
        expect(routeSrc).toMatch(/validateHomeItems\(user, homeItems\)/);
        expect(routeSrc).toMatch(/validateAppletId\(item\.appletId\)/);
        expect(routeSrc).toMatch(/getAppletRegistry\(user, item\.appletId\)/);
        expect(routeSrc).toMatch(/setHomeItemsForUser\(user, homeItems\)/);
        expect(routeSrc).toMatch(/homeItemsDefaultGroupMigrated: true/);
    });
});
