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
        expect(src).toMatch(
            /appendChatMessage\(\s*currentChat,\s*finalMessage/,
        );
        expect(src).toMatch(/dedupeKey: `stream:\$\{subscriptionId\}`/);
    });

    test("ignores progress events after terminal completion begins", () => {
        const src = read("app/api/chats/[id]/stream/route.js");

        expect(src).toMatch(/if\s*\(completionHandled\)\s*return/);
        expect(src).toMatch(
            /if\s*\(completionHandled\)\s*return completionPromise/,
        );
    });

    test("does not create chats from the stream route", () => {
        const src = read("app/api/chats/[id]/stream/route.js");

        expect(src).toMatch(/id\s*===\s*"new"/);
        expect(src).toMatch(/Create a chat before starting a stream/);
        expect(src).not.toMatch(/sendEvent\("chatId"/);
    });

    test("persists one bounded message without rewriting chat history", () => {
        const src = read("app/api/chats/[id]/stream/route.js");
        expect(src).toMatch(/appendChatMessage/);
        expect(src).not.toMatch(/prepareMessagesForPersistence/);
        expect(src).not.toMatch(/currentChat\.messages/);
    });
});
