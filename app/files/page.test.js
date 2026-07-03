/**
 * @jest-environment node
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("/files page", () => {
    test("renders the unified file manager for user files", () => {
        const src = read("app/files/page.js");

        expect(src).toMatch(/UserFileCollection/);
        expect(src).toMatch(/useCurrentUser/);
        expect(src).toMatch(/contextId=\{contextId\}/);
        expect(src).toMatch(/persistenceKey="files-page"/);
    });
});
