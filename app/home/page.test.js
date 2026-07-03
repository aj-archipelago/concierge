/**
 * @jest-environment node
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("/home page", () => {
    test("renders the selected home applet through OutputSandbox when configured", () => {
        const pageSrc = read("app/home/page.js");
        const sandboxSrc = read("app/home/components/HomeOutputSandbox.js");

        expect(pageSrc).not.toMatch(/home\.html/);
        expect(pageSrc).toMatch(/resolveAppletRuntimeHtml/);
        expect(pageSrc).toMatch(/readHomeAppletIdForUser/);
        expect(pageSrc).toMatch(
            /const homeAppletId = await readHomeAppletIdForUser/,
        );
        expect(pageSrc).toMatch(/readHomeAppletHtml/);
        expect(pageSrc).toMatch(/HomeOutputSandbox html=\{homeHtml\}/);
        expect(pageSrc).toMatch(/readHomeAppletDirectoryForUser/);
        expect(pageSrc).toMatch(/imageLightUrl: app\.imageLightUrl \|\| null/);
        expect(pageSrc).toMatch(/imageDarkUrl: app\.imageDarkUrl \|\| null/);
        expect(pageSrc).toMatch(/<HomeAppletDirectory/);
        expect(pageSrc).toMatch(/applets=\{homeAppletDirectory\}/);
        expect(pageSrc).toMatch(/initialHomeItems=\{homeItems\.items\}/);
        expect(pageSrc).toMatch(
            /initialHomeItemsConfigured=\{homeItems\.configured\}/,
        );
        expect(pageSrc).toMatch(
            /initialHomeItemsDefaultGroupMigrated=\{\s*homeItems\.defaultGroupMigrated\s*\}/,
        );
        expect(pageSrc).toMatch(/renderHomeAppletDirectory\(user\)/);
        expect(pageSrc).not.toMatch(/DigestBlockList/);
        expect(sandboxSrc).toMatch(/OutputSandbox/);
        expect(sandboxSrc).toMatch(/height="100%"/);
        expect(sandboxSrc).toMatch(/autoResize=\{false\}/);
    });
});
