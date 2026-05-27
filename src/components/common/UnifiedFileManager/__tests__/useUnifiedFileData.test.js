import "@testing-library/jest-dom";
import {
    buildFolderTree,
    countFiles,
    extractLegacyFilesFromMessages,
} from "../useUnifiedFileData";

jest.mock("@/src/App", () => ({
    AuthContext: require("react").createContext({
        user: { contextId: "user-1" },
    }),
}));

// Mock i18n — transitive import chain reaches src/i18n.js which loads
// locale JSON files that only exist after prebuild.
jest.mock("../../../../i18n", () => ({}));

describe("buildFolderTree", () => {
    it("adds the current chat folder even when it has no files yet", () => {
        const tree = buildFolderTree(
            [
                {
                    name: "users/user-1/global/hash_report.pdf",
                    filename: "report.pdf",
                },
            ],
            "users/user-1/",
            "chat-123",
        );

        /* eslint-disable testing-library/no-node-access -- tree is a plain JS object, not a DOM node */
        expect(tree.children.global).toBeDefined();
        expect(tree.children.chats).toBeDefined();
        expect(tree.children.chats.children["chat-123"]).toEqual({
            name: "chat-123",
            children: {},
            files: [],
            path: "chats/chat-123",
        });
        expect(countFiles(tree.children.chats.children["chat-123"])).toBe(0);
        /* eslint-enable testing-library/no-node-access */
    });
});

describe("extractLegacyFilesFromMessages", () => {
    it("recovers old URL-only chat attachments for the file manager", () => {
        const files = extractLegacyFilesFromMessages(
            [
                {
                    _id: "message-1",
                    createdAt: "2026-04-26T10:00:00.000Z",
                    payload: [
                        JSON.stringify({
                            type: "image_url",
                            image_url: {
                                url: "https://storage.example.blob.core.windows.net/cortexfiles-user-1/chats/chat-123/abc123_report.pdf?sv=old&sig=expired",
                            },
                        }),
                    ],
                },
            ],
            "chat-123",
        );

        expect(files).toHaveLength(1);
        expect(files[0]).toEqual(
            expect.objectContaining({
                url: "https://storage.example.blob.core.windows.net/cortexfiles-user-1/chats/chat-123/abc123_report.pdf?sv=old&sig=expired",
                blobPath: "chats/chat-123/abc123_report.pdf",
                hash: "abc123",
                filename: "abc123_report.pdf",
                _legacyMessageFile: true,
                _messageId: "message-1",
            }),
        );
    });

    it("ignores hidden placeholders", () => {
        const files = extractLegacyFilesFromMessages([
            {
                payload: [
                    JSON.stringify({
                        type: "text",
                        hideFromClient: true,
                        isDeletedFile: true,
                    }),
                ],
            },
        ]);

        expect(files).toEqual([]);
    });
});
