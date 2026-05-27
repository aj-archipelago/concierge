import React from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import UserFileCollection from "../UserFileCollection";

let unifiedFileManagerProps = null;

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("@apollo/client", () => ({
    useApolloClient: () => ({}),
}));

jest.mock("@/src/components/common/FileManager", () => ({
    __esModule: true,
    getFilename: (file) => file.filename || file.displayFilename || "",
}));

jest.mock("../chatFileUtils", () => ({
    purgeFiles: jest.fn(),
}));

jest.mock("../useFileUploadHandler", () => ({
    useFileUploadHandler: () => jest.fn(),
}));

jest.mock("@/src/components/common/UnifiedFileManager", () => ({
    __esModule: true,
    default: (props) => {
        unifiedFileManagerProps = props;
        return <div data-testid="unified-file-manager" />;
    },
}));

jest.mock("../../../components/FileUploadDialog", () => ({
    __esModule: true,
    default: () => <div data-testid="file-upload-dialog" />,
}));

jest.mock("@/src/utils/fileDownloadUtils", () => ({
    downloadFilesAsZip: jest.fn(),
    checkDownloadLimits: () => ({ allowed: true }),
}));

jest.mock("@/src/utils/storageTargets", () => ({
    createChatStorageTarget: (contextId, chatId) => ({
        kind: "chat",
        contextId,
        chatId,
    }),
    createUserGlobalStorageTarget: (contextId) => ({
        kind: "user-global",
        contextId,
    }),
}));

jest.mock("react-toastify", () => ({
    toast: {
        error: jest.fn(),
    },
}));

jest.mock("../../../../queries/chats", () => ({
    useGetActiveChats: () => ({ data: [] }),
}));

describe("UserFileCollection", () => {
    beforeEach(() => {
        unifiedFileManagerProps = null;
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ success: true }),
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("wires move through the shared file rename endpoint", async () => {
        render(
            <UserFileCollection
                contextId="ctx-1"
                contextKey="chat-ctx"
                chatId="chat-1"
                messages={[]}
            />,
        );

        await waitFor(() => {
            expect(unifiedFileManagerProps?.onMove).toEqual(
                expect.any(Function),
            );
        });

        await unifiedFileManagerProps.onMove(
            [
                {
                    blobPath: "users/ctx-1/chats/chat-1/source.mp3",
                    filename: "source.mp3",
                    hash: "hash-source",
                },
            ],
            "global/audio",
        );

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/files/rename",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    hash: "hash-source",
                    blobPath: "users/ctx-1/chats/chat-1/source.mp3",
                    newFilename: "global/audio/source.mp3",
                    targetBlobPath: "global/audio/source.mp3",
                    contextId: "ctx-1",
                }),
            }),
        );
    });

    it("moves relative blob paths from the storage root instead of the current folder", async () => {
        render(
            <UserFileCollection
                contextId="ctx-1"
                contextKey="chat-ctx"
                chatId="chat-1"
                messages={[]}
            />,
        );

        await waitFor(() => {
            expect(unifiedFileManagerProps?.onMove).toEqual(
                expect.any(Function),
            );
        });

        await unifiedFileManagerProps.onMove(
            [
                {
                    blobPath: "chats/chat-1/current/source.mp3",
                    filename: "source.mp3",
                },
            ],
            "chats/chat-1",
        );

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/files/rename",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    blobPath: "chats/chat-1/current/source.mp3",
                    newFilename: "chats/chat-1/source.mp3",
                    targetBlobPath: "chats/chat-1/source.mp3",
                    contextId: "ctx-1",
                }),
            }),
        );
    });
});
