import React from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import SidebarFolderTree from "../SidebarFolderTree";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../useUnifiedFileData", () => ({
    countFiles: () => 0,
}));

describe("SidebarFolderTree", () => {
    let scrollIntoView;

    beforeEach(() => {
        scrollIntoView = jest.fn();
        HTMLElement.prototype.scrollIntoView = scrollIntoView;
    });

    it("scrolls the selected folder into view", async () => {
        render(
            <SidebarFolderTree
                tree={{
                    files: [],
                    children: {
                        chats: {
                            path: "chats",
                            files: [],
                            children: {
                                "chat-42": {
                                    path: "chats/chat-42",
                                    files: [],
                                    children: {},
                                },
                            },
                        },
                        global: {
                            path: "global",
                            files: [],
                            children: {},
                        },
                    },
                }}
                totalFileCount={0}
                isExpanded={(path) => path === "chats"}
                isSelected={(path) => path === "chats/chat-42"}
                onToggleExpand={jest.fn()}
                onSelect={jest.fn()}
                expandedPaths={new Set(["chats"])}
                selectedPath="chats/chat-42"
            />,
        );

        await waitFor(() => {
            expect(scrollIntoView).toHaveBeenCalledWith({
                block: "nearest",
                inline: "nearest",
            });
        });
    });
});
