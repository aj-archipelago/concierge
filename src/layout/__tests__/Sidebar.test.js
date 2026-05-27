import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import Sidebar from "../Sidebar";
import {
    useAddChat,
    useDeleteChat,
    useGetActiveChatId,
    useGetActiveChats,
} from "../../../app/queries/chats";
import { useCurrentUser } from "../../../app/queries/users";
import { useQueryClient } from "@tanstack/react-query";
import { useDispatch } from "react-redux";
import { NEW_CHAT_REQUEST_EVENT } from "../../utils/requestChatInputFocus";

const mockPush = jest.fn();
const mockUsePathname = jest.fn(() => "/chat");
jest.mock("next/link", () => ({
    __esModule: true,
    default: ({ children, href }) => <a href={href}>{children}</a>,
}));

jest.mock("next/navigation", () => ({
    usePathname: () => mockUsePathname(),
    useRouter: () => ({
        push: mockPush,
        prefetch: jest.fn(),
    }),
}));

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../../../app/queries/chats", () => ({
    __esModule: true,
    useAddChat: jest.fn(),
    useDeleteChat: jest.fn(),
    useGetActiveChatId: jest.fn(),
    useGetActiveChats: jest.fn(),
    DEFAULT_CHAT_MESSAGES_LIMIT: 20,
}));

jest.mock("../../../app/queries/users", () => ({
    __esModule: true,
    useCurrentUser: jest.fn(),
}));

jest.mock("@tanstack/react-query", () => ({
    __esModule: true,
    useQueryClient: jest.fn(),
}));

jest.mock("react-redux", () => ({
    __esModule: true,
    useDispatch: jest.fn(),
    useSelector: jest.fn(() => undefined),
}));

jest.mock("../../../app/queries/workspaces", () => ({
    __esModule: true,
    useWorkspace: () => ({ data: null }),
}));

jest.mock("../../hooks/useAutomations", () => ({
    __esModule: true,
    usePinnedAutomations: () => ({ data: [] }),
}));

jest.mock("../../../config", () => ({
    __esModule: true,
    default: {
        global: {
            getLogo: () => "/logo.png",
            getSidebarLogo: () => <span>Logo</span>,
        },
    },
}));

jest.mock("../../components/help/SendFeedbackModal", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../../contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        LanguageContext: React.createContext({ language: "en" }),
    };
});

jest.mock("../../contexts/ThemeProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        ThemeContext: React.createContext({ theme: "light" }),
    };
});

jest.mock("../ChatNavigationItem", () => ({
    __esModule: true,
    default: ({ subItem }) => (
        <li
            data-testid="mock-chat-nav-item"
            data-chat-id={subItem.key}
            data-active={subItem.isActive ? "true" : undefined}
        >
            {subItem.name}
        </li>
    ),
}));

describe("Sidebar sticky chat ordering", () => {
    const mockDeleteChat = { mutate: jest.fn() };
    const mockDispatch = jest.fn();
    const mockQueryClient = {
        getQueryData: jest.fn(),
        prefetchQuery: jest.fn().mockResolvedValue(undefined),
    };

    let activeChatsData;
    let activeChatIdData;
    let cachedChats;

    const renderSidebar = () =>
        render(
            <Sidebar
                isCollapsed={false}
                onToggleCollapse={jest.fn()}
                isMobile={false}
                initialActiveChats={[]}
            />,
        );

    beforeEach(() => {
        jest.clearAllMocks();
        activeChatsData = [];
        activeChatIdData = null;
        cachedChats = {};
        delete window.__chatFocusRequest;
        mockUsePathname.mockReturnValue("/chat");
        window.history.pushState({}, "", "/chat");

        useAddChat.mockReturnValue({
            mutateAsync: jest.fn(),
            isPending: false,
        });
        useDeleteChat.mockReturnValue(mockDeleteChat);
        useGetActiveChats.mockImplementation(() => ({
            data: activeChatsData,
            isLoading: false,
        }));
        useGetActiveChatId.mockImplementation(() => activeChatIdData);
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: [],
            },
        });
        useDispatch.mockReturnValue(mockDispatch);
        mockQueryClient.getQueryData.mockImplementation((key) => {
            if (Array.isArray(key) && key[0] === "chat") {
                return cachedChats[key[1]];
            }
            return undefined;
        });
        useQueryClient.mockReturnValue(mockQueryClient);
    });

    it("preserves the existing top chat order when the same chats re-rank", () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];
        activeChatIdData = "chat-a";

        const { rerender } = renderSidebar();

        expect(
            screen
                .getAllByTestId("mock-chat-nav-item")
                .map((item) => item.dataset.chatId),
        ).toEqual(["chat-a", "chat-b", "chat-c"]);

        activeChatsData = [
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-c", title: "Chat C" },
        ];
        activeChatIdData = "chat-b";

        rerender(
            <Sidebar
                isCollapsed={false}
                onToggleCollapse={jest.fn()}
                isMobile={false}
                initialActiveChats={[]}
            />,
        );

        expect(
            screen
                .getAllByTestId("mock-chat-nav-item")
                .map((item) => item.dataset.chatId),
        ).toEqual(["chat-a", "chat-b", "chat-c"]);
    });

    it("shows chats from activeChats data in order", () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];
        activeChatIdData = "chat-a";

        const { rerender } = renderSidebar();

        activeChatsData = [
            { _id: "chat-real", title: "Promoted chat" },
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
        ];
        activeChatIdData = "chat-real";

        rerender(
            <Sidebar
                isCollapsed={false}
                onToggleCollapse={jest.fn()}
                isMobile={false}
                initialActiveChats={[]}
            />,
        );

        expect(
            screen
                .getAllByTestId("mock-chat-nav-item")
                .map((item) => item.dataset.chatId),
        ).toEqual(["chat-real", "chat-a", "chat-b"]);
        expect(screen.getByText("Promoted chat")).toBeInTheDocument();
    });

    it("requests input focus before navigating to a new chat", () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];

        renderSidebar();

        fireEvent.click(screen.getByTestId("sidebar-new-chat-button"));

        expect(mockPush).toHaveBeenCalledWith("/chat/new");
        expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({ type: "chat/focusChatInput" }),
        );
        expect(typeof window.__chatFocusRequest).toBe("number");
    });

    it("dispatches a fresh-chat request instead of pushing the same /chat/new route", () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];
        mockUsePathname.mockReturnValue("/chat/new");
        window.history.pushState({}, "", "/chat/new");
        const dispatchEventSpy = jest.spyOn(window, "dispatchEvent");

        renderSidebar();

        fireEvent.click(screen.getByTestId("sidebar-new-chat-button"));

        expect(mockPush).not.toHaveBeenCalled();
        expect(dispatchEventSpy).toHaveBeenCalledWith(
            expect.objectContaining({ type: NEW_CHAT_REQUEST_EVENT }),
        );
        dispatchEventSpy.mockRestore();
    });
});
