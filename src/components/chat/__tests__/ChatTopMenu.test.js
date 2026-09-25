import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ChatTopMenu from "../ChatTopMenu";

let userFileCollectionProps = null;

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
        default: (props) => {
            userFileCollectionProps = props;
            return <div data-testid="user-file-collection" />;
        },
    }),
);

describe("ChatTopMenu", () => {
    beforeEach(() => {
        userFileCollectionProps = null;
    });

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

    it("dispatches selected chat files to the message input attachment bridge", async () => {
        const eventSpy = jest.fn();
        window.addEventListener("concierge:chat-files-attach", eventSpy);

        try {
            render(
                <ChatTopMenu
                    displayState="full"
                    chat={{ _id: "chat-1", messages: [] }}
                />,
            );

            fireEvent.click(screen.getByRole("button", { name: /files/i }));

            await waitFor(() => {
                expect(userFileCollectionProps?.onAttach).toEqual(
                    expect.any(Function),
                );
            });

            userFileCollectionProps.onAttach([
                {
                    url: "https://files.example.com/report.pdf",
                    filename: "report.pdf",
                    hash: "hash-1",
                },
            ]);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy.mock.calls[0][0].detail).toEqual({
                chatId: "chat-1",
                files: [
                    {
                        url: "https://files.example.com/report.pdf",
                        filename: "report.pdf",
                        hash: "hash-1",
                    },
                ],
            });
            await waitFor(() => {
                expect(
                    screen.queryByTestId("user-file-collection"),
                ).not.toBeInTheDocument();
            });
        } finally {
            window.removeEventListener("concierge:chat-files-attach", eventSpy);
        }
    });
});
