import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FileUploadDialog from "../FileUploadDialog";
import {
    getUserFolderUploadDestination,
    createUserGlobalStorageTarget,
} from "../../../../src/utils/storageTargets";

jest.mock("../../../../src/App", () => {
    const React = require("react");
    return {
        AuthContext: React.createContext({ user: { contextId: "user-1" } }),
        ServerContext: React.createContext({ serverUrl: "http://localhost" }),
    };
});
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("i18next", () => ({ language: "en" }));
jest.mock("../../../../config", () => ({
    endpoints: { mediaHelper: () => "http://localhost/media-helper" },
}));
jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogDescription: ({ children }) => <p>{children}</p>,
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h1>{children}</h1>,
}));

describe("file picker upload requests", () => {
    const OriginalXHR = global.XMLHttpRequest;
    afterEach(() => {
        global.XMLHttpRequest = OriginalXHR;
    });

    it.each([
        ["chats/chat-2", "chat", "chat-2", null],
        ["chats/chat-2/photos", "chat", "chat-2", "photos"],
        ["global", "global", null, null],
        ["media/videos", "media", null, "videos"],
        ["applets/old-workspace", "applets", null, "old-workspace"],
        ["custom/photos", "all", null, "custom/photos"],
    ])(
        "sends %s to CFH and retains the returned location",
        async (path, scope, chatId, subPath) => {
            let form;
            const response = {
                url: "https://files.test/32.jpg",
                blobPath: `${path}/32.jpg`,
                displayFilename: "32.jpg",
                folderPath: path,
            };
            global.XMLHttpRequest = class {
                upload = {};
                status = 200;
                responseText = JSON.stringify(response);
                open() {}
                send(body) {
                    form = body;
                    this.onload();
                }
            };
            const onFileUpload = jest.fn();
            const destination = getUserFolderUploadDestination(
                "user-1",
                path,
                createUserGlobalStorageTarget("user-1"),
            );
            render(
                <FileUploadDialog
                    isOpen
                    onClose={jest.fn()}
                    onFileUpload={onFileUpload}
                    contextId="user-1"
                    {...destination}
                />,
            );
            fireEvent.change(screen.getByLabelText("Choose files"), {
                target: {
                    files: [
                        new File(["image"], "32.jpg", { type: "image/jpeg" }),
                    ],
                },
            });
            await waitFor(() =>
                expect(onFileUpload).toHaveBeenCalledWith(response),
            );
            expect(form.get("contextId")).toBe("user-1");
            expect(form.get("fileScope")).toBe(scope);
            expect(form.get("chatId")).toBe(chatId);
            expect(form.get("subPath")).toBe(subPath);
            expect(form.has("hash")).toBe(false);
            expect([...form.keys()].at(-1)).toBe("file");
        },
    );
});
