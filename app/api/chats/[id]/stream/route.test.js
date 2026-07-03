/**
 * @jest-environment node
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../../../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("chat stream persistence idempotence", () => {
    test("does not append the same final assistant message twice", () => {
        const src = read("app/api/chats/[id]/stream/route.js");
        expect(src).toMatch(/function\s+isDuplicateFinalAssistantMessage/);
        expect(src).toMatch(
            /else\s+if\s*\(\s*isDuplicateFinalAssistantMessage\(messages\.at\(-1\),\s*messageToSave\)\s*\)\s*{\s*messages\[messages\.length\s*-\s*1\]\s*=\s*messageToSave;/,
        );
    });

    test("ignores progress events after terminal completion begins", () => {
        const src = read("app/api/chats/[id]/stream/route.js");

        expect(src).toMatch(/if\s*\(completionHandled\)\s*return/);
        expect(src).toMatch(
            /if\s*\(error\)\s*{\s*completionHandled\s*=\s*true/,
        );
        expect(src).toMatch(
            /if\s*\(progress\s*===\s*1\)\s*{\s*completionHandled\s*=\s*true/,
        );
    });

    test("does not create chats from the stream route", () => {
        const src = read("app/api/chats/[id]/stream/route.js");

        expect(src).toMatch(/id\s*===\s*"new"/);
        expect(src).toMatch(/Create a chat before starting a stream/);
        expect(src).not.toMatch(/sendEvent\("chatId"/);
    });
});
