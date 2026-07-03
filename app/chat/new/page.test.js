/**
 * @jest-environment node
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("/chat/new bootstrap route", () => {
    test("creates a persisted chat and redirects to its real route", () => {
        const src = read("app/chat/new/page.js");

        expect(src).toMatch(/createNewChat/);
        expect(src).toMatch(/redirect\(`\/chat\/\$\{String\(chat\._id\)\}`\)/);
    });
});
