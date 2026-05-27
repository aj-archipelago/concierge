import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ChatTopMenu from "../ChatTopMenu";

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key) => key,
        i18n: {
            dir: () => "ltr",
        },
    }),
}));

jest.mock("../../../App", () => {
    const React = require("react");
    return {
        AuthContext: React.createContext({
            user: {
                contextId: "user-1",
                contextKey: "ctx-key",
            },
        }),
    };
});

jest.mock(
    "../../../../app/workspaces/[id]/components/UserFileCollection",
    () => ({
        __esModule: true,
        default: () => null,
    }),
);

jest.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }) => <>{children}</>,
    TooltipTrigger: ({ children }) => <>{children}</>,
    TooltipContent: ({ children }) => <div>{children}</div>,
    TooltipProvider: ({ children }) => <>{children}</>,
}));

describe("ChatTopMenu", () => {
    it("shows a visible Files label in full mode", () => {
        render(
            <ChatTopMenu
                displayState="full"
                chat={{ _id: "chat-1", messages: [] }}
            />,
        );

        expect(
            screen.getByRole("button", { name: /files/i }),
        ).toBeInTheDocument();
    });

    it("keeps the docked state compact", () => {
        render(
            <ChatTopMenu
                displayState="docked"
                chat={{ _id: "chat-1", messages: [] }}
            />,
        );

        expect(screen.queryByText("Files")).not.toBeInTheDocument();
    });

    it("disables the files button in read-only mode", () => {
        render(
            <ChatTopMenu
                readOnly={true}
                chat={{ _id: "chat-1", messages: [] }}
            />,
        );

        expect(screen.getByRole("button", { name: /files/i })).toBeDisabled();
    });

    it("shows the storage warning icon for large chats", () => {
        render(
            <ChatTopMenu
                chat={{
                    _id: "chat-1",
                    messages: [],
                    messageStorageBytes: 1_800_000,
                }}
            />,
        );

        expect(screen.getByLabelText("Large chat")).toBeInTheDocument();
        expect(
            screen.getByText(
                "This chat is large. Older messages may be removed automatically to keep the conversation available.",
            ),
        ).toBeInTheDocument();
    });

    it("does not show the storage warning icon for compacted chats below the warning threshold", () => {
        render(
            <ChatTopMenu
                chat={{
                    _id: "chat-1",
                    messages: [],
                    messagesCompacted: true,
                    messageStorageBytes: 1_000,
                }}
            />,
        );

        expect(screen.queryByLabelText("Large chat")).not.toBeInTheDocument();
    });
});
