import React from "react";
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import Sidebar, {
    orderSidebarNavigationItems,
    shouldForceCollapse,
} from "../Sidebar";
import {
    useAddChat,
    useDeleteChat,
    useGetActiveChatId,
    useGetActiveChats,
    useUpdateChat,
} from "../../../app/queries/chats";
import {
    useCurrentUser,
    useUpdateCurrentUser,
} from "../../../app/queries/users";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useQueryClient } from "@tanstack/react-query";
import { useDispatch } from "react-redux";

import fs from "node:fs";
import path from "node:path";
const ar = JSON.parse(
    fs.readFileSync(
        path.join(process.cwd(), "config/default/locales/ar.json"),
        "utf8",
    ),
);

const mockPush = jest.fn();
const mockUsePathname = jest.fn(() => "/chat");
let mockAutomations = [];
let mockInboxRequests = [];
let mockAutomationsLastViewedAt = null;
let mockWorkspaceData = null;
const LEGACY_SIDEBAR_HIDDEN_STORAGE_KEY =
    "concierge-sidebar-navigation-hidden-v1";
const nativeAppEntry = (slug, name, icon = "AppWindow", order = 0) => ({
    appId: {
        _id: `app-${slug}`,
        slug,
        name,
        icon,
        type: "native",
    },
    order,
});

const defaultSidebarApps = () => [
    nativeAppEntry("home", "Home", "Home", 0),
    nativeAppEntry("files", "Files", "Folder", 1),
    nativeAppEntry("chat", "Chat", "MessageCircle", 2),
    nativeAppEntry("automations", "Automations", "CalendarClock", 3),
    nativeAppEntry("media", "Media", "Image", 4),
];
jest.mock("next/link", () => ({
    __esModule: true,
    default: ({ children, href, ...props }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
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
    useUpdateChat: jest.fn(),
    useGetActiveChatId: jest.fn(),
    useGetActiveChats: jest.fn(),
    DEFAULT_CHAT_MESSAGES_LIMIT: 20,
}));

jest.mock("../../../app/queries/users", () => ({
    __esModule: true,
    useCurrentUser: jest.fn(),
    useUpdateCurrentUser: jest.fn(),
}));

const mockUseQuery = jest.fn(() => ({ data: {} }));
jest.mock("@tanstack/react-query", () => ({
    __esModule: true,
    useQueryClient: jest.fn(),
    useQuery: (...args) => mockUseQuery(...args),
}));

jest.mock("react-redux", () => ({
    __esModule: true,
    useDispatch: jest.fn(),
    useSelector: jest.fn(() => undefined),
}));

jest.mock("../../../app/queries/workspaces", () => ({
    __esModule: true,
    useWorkspace: () => ({ data: mockWorkspaceData }),
}));

jest.mock("../../hooks/useAutomations", () => ({
    __esModule: true,
    useAutomations: () => ({ data: mockAutomations }),
    useAutomationReadReceipts: () => ({ data: {} }),
    useAutomationsLastViewedAt: () => ({
        data: mockAutomationsLastViewedAt,
    }),
}));

jest.mock("../../../app/queries/notifications", () => ({
    useInbox: () => ({ data: { requests: mockInboxRequests } }),
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

const mockOpenPortal = jest.fn();
jest.mock("../../contexts/PortalContext", () => ({
    __esModule: true,
    usePortal: () => ({
        openPortal: mockOpenPortal,
        closePortal: jest.fn(),
    }),
}));

jest.mock("../ChatNavigationItem", () => ({
    __esModule: true,
    default: ({ subItem }) => (
        <li
            data-testid="mock-chat-nav-item"
            data-chat-id={subItem.key}
            data-active={subItem.isActive ? "true" : undefined}
            data-notification-status={subItem.notificationStatus || "idle"}
        >
            {subItem.notificationStatus === "needs_attention" ? (
                <span data-testid="sidebar-chat-attention-dot" />
            ) : subItem.notificationStatus === "failed" ? (
                <span data-testid="sidebar-chat-error-dot" />
            ) : subItem.notificationStatus === "completed" ? (
                <span data-testid="sidebar-chat-unread-dot" />
            ) : subItem.notificationStatus === "in_progress" ? (
                <span data-testid="sidebar-chat-progress-dot" />
            ) : (
                <span data-testid="sidebar-chat-idle-dot" />
            )}
            {subItem.name}
        </li>
    ),
}));

describe("shouldForceCollapse", () => {
    it("force-collapses app canvas routes", () => {
        expect(shouldForceCollapse("/apps")).toBe(true);
        expect(shouldForceCollapse("/apps/my-app")).toBe(true);
        expect(shouldForceCollapse("/published/applets/applet-1")).toBe(true);
        expect(shouldForceCollapse("/application-settings")).toBe(false);
    });
});

describe("orderSidebarNavigationItems", () => {
    it("keeps saved order for current items and appends new items", () => {
        const items = [
            { name: "Home" },
            { name: "Files" },
            { name: "Chats" },
            { name: "Translate", appId: "app-translate" },
        ];

        expect(
            orderSidebarNavigationItems(items, [
                "nav:Files",
                "app:app-translate",
                "nav:Missing",
            ]).map((item) => item.name),
        ).toEqual(["Files", "Translate", "Home", "Chats"]);
    });
});

describe("Sidebar navigation", () => {
    const mockDeleteChat = { mutate: jest.fn() };
    const mockAddChat = { mutateAsync: jest.fn(), isPending: false };
    const mockUpdateChat = { mutate: jest.fn(), mutateAsync: jest.fn() };
    const mockUpdateUser = { mutateAsync: jest.fn() };
    const mockDispatch = jest.fn();
    const mockQueryClient = {
        getQueryData: jest.fn(),
        setQueryData: jest.fn(),
        prefetchQuery: jest.fn().mockResolvedValue(undefined),
        invalidateQueries: jest.fn().mockResolvedValue(undefined),
    };

    let activeChatsData;
    let activeChatIdData;
    let cachedChats;
    let chatAttentionMap;

    const renderSidebar = ({ languageContext, ...props } = {}) =>
        render(
            <LanguageContext.Provider
                value={languageContext || { language: "en", direction: "ltr" }}
            >
                <Sidebar
                    isCollapsed={false}
                    isMobile={false}
                    initialActiveChats={[]}
                    {...props}
                />
            </LanguageContext.Provider>,
        );

    beforeEach(() => {
        jest.clearAllMocks();
        activeChatsData = [];
        activeChatIdData = null;
        cachedChats = {};
        chatAttentionMap = {};
        mockAutomations = [];
        mockInboxRequests = [];
        mockAutomationsLastViewedAt = null;
        mockWorkspaceData = null;
        document.documentElement.dir = "ltr";
        window.localStorage.clear();
        delete window.__chatFocusRequest;
        mockUsePathname.mockReturnValue("/chat");
        window.history.pushState({}, "", "/chat");

        mockAddChat.mutateAsync.mockResolvedValue({ _id: "chat-new-real" });
        mockUpdateChat.mutateAsync.mockResolvedValue({});
        useAddChat.mockReturnValue(mockAddChat);
        useDeleteChat.mockReturnValue(mockDeleteChat);
        useUpdateChat.mockReturnValue(mockUpdateChat);
        useGetActiveChats.mockImplementation(() => ({
            data: activeChatsData,
            isLoading: false,
        }));
        useGetActiveChatId.mockImplementation(() => activeChatIdData);
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: defaultSidebarApps(),
            },
        });
        mockUpdateUser.mutateAsync.mockResolvedValue({});
        useUpdateCurrentUser.mockReturnValue(mockUpdateUser);
        useDispatch.mockReturnValue(mockDispatch);
        mockUseQuery.mockImplementation(() => ({ data: chatAttentionMap }));
        mockQueryClient.getQueryData.mockImplementation((key) => {
            if (Array.isArray(key) && key[0] === "chat") {
                return cachedChats[key[1]];
            }
            return undefined;
        });
        mockQueryClient.setQueryData.mockImplementation((key, updater) => {
            if (
                Array.isArray(key) &&
                key[0] === "chatAttentionMap" &&
                typeof updater === "function"
            ) {
                chatAttentionMap = updater(chatAttentionMap);
            }
        });
        global.fetch = jest.fn((url, options = {}) => {
            if (url === "/api/canvas-applets") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applets: [
                            {
                                _id: "applet-3",
                                version: 2,
                                name: "Sidebar Timer",
                                app: {
                                    name: "Sidebar Timer",
                                    category: "Utilities",
                                },
                            },
                        ],
                    }),
                });
            }
            if (url === "/api/apps") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        {
                            _id: "app-home",
                            slug: "home",
                            name: "Home",
                            icon: "Home",
                            type: "native",
                        },
                        {
                            _id: "app-translate",
                            slug: "translate",
                            name: "Translate",
                            icon: "Languages",
                            type: "native",
                        },
                        {
                            _id: "public-applet-app",
                            name: "Published Applet",
                            type: "applet",
                        },
                    ],
                });
            }
            if (
                url === "/api/canvas-applets/applet-3/install" &&
                options.method === "POST"
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({}),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({}),
            });
        });
        useQueryClient.mockReturnValue(mockQueryClient);
    });

    it("shows recent chats inline under a clickable Chats header with chat icon", () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];
        activeChatIdData = "chat-a";

        renderSidebar();

        expect(screen.getByTestId("sidebar-chats-section")).toHaveTextContent(
            "Chats",
        );
        const chatsHeader = screen.getByTestId("sidebar-chats-header");
        expect(chatsHeader).toHaveAttribute("href", "/chat");
        expect(chatsHeader).toHaveAttribute("aria-label", "Chats");
        expect(
            within(chatsHeader).getByTestId("sidebar-chats-view-all"),
        ).toBeInTheDocument();
        expect(screen.queryByText("View all")).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("sidebar-chats-flyout"),
        ).not.toBeInTheDocument();
        expect(screen.getAllByTestId("mock-chat-nav-item")).toHaveLength(3);
        expect(screen.getByText("Chat A")).toBeInTheDocument();
        expect(
            screen
                .getByTestId("sidebar-new-chat-button")
                .compareDocumentPosition(
                    screen.getByTestId("sidebar-home-button"),
                ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            screen
                .getByTestId("sidebar-home-button")
                .compareDocumentPosition(
                    screen.getByTestId("sidebar-colleagues-button"),
                ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("highlights the Chats header only on the chats list route, not /chat/:id", () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
        ];

        mockUsePathname.mockReturnValue("/chat");
        const { unmount } = renderSidebar();
        expect(screen.getByTestId("sidebar-chats-header")).toHaveClass(
            "bg-gray-100",
        );
        unmount();

        mockUsePathname.mockReturnValue("/chat/chat-a");
        renderSidebar();
        const chatsHeader = screen.getByTestId("sidebar-chats-header");
        expect(chatsHeader).not.toHaveClass("bg-gray-100");
        expect(chatsHeader).toHaveClass("hover:bg-gray-100");
    });

    it("shows at most 4 chats and a View all link to the chats page", () => {
        activeChatsData = Array.from({ length: 10 }, (_, index) => ({
            _id: `chat-${index}`,
            title: `Chat ${index}`,
        }));

        renderSidebar();

        expect(screen.getAllByTestId("mock-chat-nav-item")).toHaveLength(4);
        expect(
            screen.queryByTestId("sidebar-chats-more"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("sidebar-chats-show-less"),
        ).not.toBeInTheDocument();
        const viewAll = screen.getByTestId("sidebar-chats-view-all-link");
        expect(viewAll).toHaveAttribute("href", "/chat");
        expect(viewAll).toHaveTextContent("View all");
    });

    it("reserves collapsed rail space for the View all control row", () => {
        activeChatsData = Array.from({ length: 10 }, (_, index) => ({
            _id: `chat-${index}`,
            title: `Chat ${index}`,
        }));

        renderSidebar({ isCollapsed: true });

        expect(
            screen.getAllByTestId("sidebar-chat-placeholder-row"),
        ).toHaveLength(4);
        expect(
            screen.getByTestId("sidebar-chat-placeholder-view-all"),
        ).toBeInTheDocument();
    });

    it("shows blue, red, pulsating gray, yellow, and idle gray dots for chat task statuses", () => {
        chatAttentionMap = {
            "chat-d": "2026-08-04T13:00:00.000Z",
        };
        activeChatsData = [
            {
                _id: "chat-a",
                title: "Chat A",
                latestTaskStatus: "completed",
                latestTaskAt: "2026-08-04T13:00:00.000Z",
            },
            {
                _id: "chat-b",
                title: "Chat B",
                latestTaskStatus: "failed",
                latestTaskAt: "2026-08-04T13:00:00.000Z",
            },
            {
                _id: "chat-c",
                title: "Chat C",
                isChatLoading: true,
            },
            { _id: "chat-d", title: "Chat D" },
            { _id: "chat-e", title: "Chat E" },
        ];

        renderSidebar();

        expect(
            screen.getByTestId("sidebar-chat-unread-dot"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("sidebar-chat-error-dot"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("sidebar-chat-progress-dot"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("sidebar-chat-attention-dot"),
        ).toBeInTheDocument();
        // chat-e is outside the initial sidebar window, so idle is not asserted here
    });

    it("shows per-chat status dots in the collapsed rail placeholders", () => {
        activeChatsData = [
            {
                _id: "chat-a",
                title: "Chat A",
                latestTaskStatus: "completed",
                latestTaskAt: "2026-08-04T13:00:00.000Z",
            },
            {
                _id: "chat-b",
                title: "Chat B",
                latestTaskStatus: "in_progress",
                latestTaskAt: "2026-08-04T13:00:00.000Z",
            },
            { _id: "chat-c", title: "Chat C" },
        ];

        renderSidebar({ isCollapsed: true });

        const rows = screen.getAllByTestId("sidebar-chat-placeholder-row");
        expect(rows).toHaveLength(3);
        expect(rows[0]).toHaveAttribute(
            "data-notification-status",
            "completed",
        );
        expect(rows[1]).toHaveAttribute(
            "data-notification-status",
            "in_progress",
        );
        expect(rows[2]).toHaveAttribute("data-notification-status", "idle");
        expect(
            screen.getByTestId("sidebar-chat-unread-dot"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("sidebar-chat-progress-dot"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("sidebar-chat-idle-dot")).toBeInTheDocument();
        expect(screen.queryByText("Chat A")).not.toBeInTheDocument();
        expect(
            screen.getAllByTestId("sidebar-chat-placeholder-icon"),
        ).toHaveLength(3);
        expect(
            within(screen.getByTestId("sidebar-chats-header")).getByTestId(
                "sidebar-chats-view-all",
            ),
        ).toBeInTheDocument();
        expect(
            within(rows[0]).queryByTestId("sidebar-chats-view-all"),
        ).not.toBeInTheDocument();
    });

    it("shows an unread badge on Colleagues when there are new results", () => {
        mockAutomations = [
            {
                _id: "automation-a",
                name: "Daily pulse",
                lastRunAt: "2026-08-04T13:00:00.000Z",
            },
        ];
        mockAutomationsLastViewedAt = "2026-08-04T12:00:00.000Z";

        renderSidebar();

        expect(screen.getByTestId("sidebar-colleagues-button")).toHaveAttribute(
            "aria-label",
            "Tasks with new updates",
        );
        expect(
            screen.getByTestId("sidebar-colleagues-unread-dot"),
        ).toBeInTheDocument();
        expect(screen.queryByText("Daily pulse")).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("sidebar-colleagues-button"));
        expect(mockPush).toHaveBeenCalledWith("/colleagues?view=recent");
    });

    it("opens Recent from the dot for an unread colleague message", () => {
        mockInboxRequests = [{ type: "colleague-message", read: false }];
        const onNavigate = jest.fn();
        renderSidebar({ isMobile: true, onNavigate });
        expect(
            screen.getByTestId("sidebar-colleagues-unread-dot"),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("sidebar-colleagues-button"));
        expect(mockPush).toHaveBeenCalledWith("/colleagues?view=recent");
        expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it("opens Team without a dot when messages are read or unrelated", () => {
        mockInboxRequests = [
            { type: "colleague-message", read: true },
            { type: "share-request", read: false },
        ];
        mockUsePathname.mockReturnValue("/colleagues");
        renderSidebar();
        expect(
            screen.queryByTestId("sidebar-colleagues-unread-dot"),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("sidebar-colleagues-button"));
        expect(mockPush).toHaveBeenCalledWith("/colleagues?view=team");
    });

    it("keeps chat titles out of the compact rail, reserves chat-list space, and links Chats to /chat", () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];

        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");
        expect(sidebar).toHaveClass("w-14");
        expect(screen.queryByText("Chat A")).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("sidebar-chat-list"),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-chats-header")).toHaveAttribute(
            "href",
            "/chat",
        );
        expect(
            screen.getAllByTestId("sidebar-chat-placeholder-row"),
        ).toHaveLength(3);
        expect(
            screen.queryByTestId("sidebar-chats-flyout"),
        ).not.toBeInTheDocument();
    });

    it("delays owned applet edit controls until collapsed hover expansion settles", async () => {
        useCurrentUser.mockReturnValue({
            data: {
                _id: "user-1",
                userId: "user-1",
                apps: [
                    {
                        appId: {
                            _id: "app-owned-applet",
                            type: "applet",
                            name: "Owned Applet",
                            icon: "Timer",
                            workspaceId: "workspace-1",
                            slug: "owned-applet",
                        },
                        order: 5,
                    },
                ],
            },
        });
        mockWorkspaceData = { owner: "user-1" };

        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");
        fireEvent.mouseEnter(sidebar);

        const editButton = screen.getByTestId("sidebar-applet-edit-button");
        expect(editButton).toHaveClass("hidden");
        expect(editButton).not.toHaveClass("group-hover:inline");

        await waitFor(() => {
            expect(sidebar).toHaveClass("w-56");
        });
        expect(editButton).toHaveClass("pointer-events-none");
        expect(editButton).toHaveClass("!invisible");

        await waitFor(() => {
            expect(editButton).not.toHaveClass("pointer-events-none");
        });
        expect(editButton).not.toHaveClass("!invisible");
    });

    it("delays canvas applet edit controls until collapsed hover expansion settles", async () => {
        useCurrentUser.mockReturnValue({
            data: {
                _id: "user-1",
                userId: "user-1",
                apps: [
                    {
                        appId: {
                            _id: "app-canvas-applet",
                            type: "applet",
                            name: "Canvas Applet",
                            icon: "Timer",
                            appletId: "canvas-applet-1",
                            listedInStore: false,
                        },
                        order: 5,
                    },
                ],
            },
        });

        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");
        fireEvent.mouseEnter(sidebar);

        const editButton = screen.getByTestId(
            "sidebar-canvas-applet-edit-button",
        );
        expect(editButton).toHaveClass("hidden");
        expect(editButton).not.toHaveClass("group-hover:inline");

        await waitFor(() => {
            expect(sidebar).toHaveClass("w-56");
        });
        expect(editButton).toHaveClass("pointer-events-none");
        expect(editButton).toHaveClass("!invisible");

        await waitFor(() => {
            expect(editButton).not.toHaveClass("pointer-events-none");
        });
        expect(editButton).not.toHaveClass("!invisible");
    });

    it("creates a real chat before navigating to a new chat", async () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];

        renderSidebar();

        fireEvent.click(screen.getByTestId("sidebar-new-chat-button"));

        expect(mockAddChat.mutateAsync).toHaveBeenCalledWith({
            messages: [],
        });
        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/chat/chat-new-real");
        });
        expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({ type: "chat/focusChatInput" }),
        );
        expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "chat/setActiveCanvasChat",
                payload: "chat-new-real",
            }),
        );
        expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({ type: "chat/closeCanvas" }),
        );
        const dispatchedTypes = mockDispatch.mock.calls.map(
            ([action]) => action.type,
        );
        expect(
            dispatchedTypes.indexOf("chat/setActiveCanvasChat"),
        ).toBeGreaterThan(dispatchedTypes.indexOf("chat/focusChatInput"));
        expect(dispatchedTypes.indexOf("chat/closeCanvas")).toBeGreaterThan(
            dispatchedTypes.indexOf("chat/setActiveCanvasChat"),
        );
        expect(typeof window.__chatFocusRequest).toBe("number");
    });

    it("shows New Chat at the top above Home, Files, and Media", () => {
        renderSidebar();

        const newChatButton = screen.getByTestId("sidebar-new-chat-button");
        const homeButton = screen.getByTestId("sidebar-home-button");
        const filesButton = screen.getByTestId("sidebar-files-button");

        expect(homeButton).toHaveTextContent("Home");
        expect(filesButton).toHaveTextContent("Files");
        expect(screen.getByText("Media")).toBeInTheDocument();
        expect(
            newChatButton.compareDocumentPosition(homeButton) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            homeButton.compareDocumentPosition(filesButton) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        fireEvent.click(homeButton);
        expect(mockPush).toHaveBeenCalledWith("/home");

        mockPush.mockClear();
        fireEvent.click(filesButton);

        expect(mockPush).toHaveBeenCalledWith("/files");
    });

    it("keeps Customize and Automations out of primary navigation", () => {
        renderSidebar();
        expect(
            screen.queryByTestId("sidebar-customize-button"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("sidebar-automations-button"),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("sidebar-colleagues-button"));
        expect(mockPush).toHaveBeenCalledWith("/colleagues?view=team");
    });

    it("collapses inline chat history, persists the choice, and keeps the history link", () => {
        activeChatsData = [{ _id: "chat-a", title: "Chat A" }];
        const { unmount } = renderSidebar();
        fireEvent.click(
            screen.getByRole("button", { name: "Collapse chat history" }),
        );
        expect(screen.getByText("Chat A")).not.toBeVisible();
        expect(screen.getByTestId("sidebar-chats-header")).toHaveAttribute(
            "href",
            "/chat",
        );
        unmount();
        renderSidebar();
        const toggle = screen.getByRole("button", {
            name: "Expand chat history",
        });
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(toggle);
        expect(screen.getByText("Chat A")).toBeVisible();
    });

    it("shows re-added app-backed built-ins even if a legacy hidden marker exists", () => {
        window.localStorage.setItem(
            LEGACY_SIDEBAR_HIDDEN_STORAGE_KEY,
            JSON.stringify(["nav:Chats", "nav:Files"]),
        );
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: [
                    nativeAppEntry("chat", "Chat", "MessageCircle", 0),
                    nativeAppEntry("files", "Files", "Folder", 1),
                ],
            },
        });

        renderSidebar();

        expect(screen.getByText("Chats")).toBeInTheDocument();
        expect(screen.getByText("Files")).toBeInTheDocument();
    });

    it("renders sidebar edit mode expanded with drag handles for every item except New Chat", async () => {
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: [
                    ...defaultSidebarApps(),
                    {
                        appId: {
                            _id: "app-translate",
                            slug: "translate",
                            name: "Translate",
                            icon: "Languages",
                            type: "native",
                        },
                        order: 5,
                    },
                ],
            },
        });

        renderSidebar({
            isCollapsed: true,
            isEditingSidebar: true,
            onToggleSidebarEdit: jest.fn(),
        });

        expect(screen.getByTestId("sidebar")).toHaveClass("w-56");
        expect(
            screen.getByTestId("sidebar-new-chat-button"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("sidebar-edit-button")).toHaveAttribute(
            "aria-label",
            "Done editing sidebar",
        );
        expect(screen.getByTestId("sidebar-edit-button")).toHaveTextContent(
            "Done editing sidebar",
        );
        // Home / Chats / Automations / Files are fixed primary items; remaining apps are editable.
        expect(screen.getAllByTestId("sidebar-drag-handle")).toHaveLength(2);
        expect(
            screen.getAllByTestId("sidebar-remove-item-button"),
        ).toHaveLength(2);
        expect(screen.getByTestId("sidebar-add-item-button")).toHaveAttribute(
            "aria-label",
            "Add",
        );
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Files")).toBeInTheDocument();
        expect(screen.getByText("Chats")).toBeInTheDocument();
        expect(
            screen.getByTestId("sidebar-colleagues-button"),
        ).toBeInTheDocument();
        expect(screen.getByText("Media")).toBeInTheDocument();
        expect(screen.getByText("Translate")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("sidebar-add-item-button"));

        expect(
            await screen.findByText("Add applets to sidebar"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("app-picker-panel")).toHaveClass(
            "flex",
            "flex-col",
        );
        expect(screen.getByTestId("app-picker-add-button")).toBeVisible();
        expect(screen.getByTestId("app-picker-cancel-button")).toBeVisible();
        expect(await screen.findByText("Sidebar Timer")).toBeInTheDocument();
        expect(screen.getByText("Built-in tools")).toBeInTheDocument();
        expect(mockPush).not.toHaveBeenCalledWith("/apps");
    });

    it("filters sidebar picker apps with RTL-safe dialog direction", async () => {
        renderSidebar({
            isEditingSidebar: true,
            onToggleSidebarEdit: jest.fn(),
            languageContext: { language: "ar", direction: "rtl" },
        });

        fireEvent.click(screen.getByTestId("sidebar-add-item-button"));

        const title = await screen.findByText("Add applets to sidebar");
        expect(title).toBeInTheDocument();
        expect(screen.getByTestId("app-picker-dialog")).toHaveAttribute(
            "dir",
            "rtl",
        );
        expect(await screen.findByText("Translate")).toBeInTheDocument();
        expect(screen.getByText("Sidebar Timer")).toBeInTheDocument();

        fireEvent.change(
            screen.getByRole("searchbox", { name: "Filter applets" }),
            {
                target: { value: "timer" },
            },
        );

        expect(screen.queryByText("Translate")).not.toBeInTheDocument();
        expect(screen.getByText("Sidebar Timer")).toBeInTheDocument();
        expect(ar["Add applets to sidebar"]).toBe(
            "إضافة تطبيقات صغيرة إلى الشريط الجانبي",
        );
        expect(ar["Filter applets"]).toBe("تصفية التطبيقات الصغيرة");
    });

    it("commits multiple sidebar picker selections without routing through Apps", async () => {
        const installedApps = defaultSidebarApps();
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: installedApps,
            },
        });

        renderSidebar({
            isEditingSidebar: true,
            onToggleSidebarEdit: jest.fn(),
        });

        fireEvent.click(screen.getByTestId("sidebar-add-item-button"));
        fireEvent.click(
            await screen.findByRole("button", {
                name: "Add Translate",
            }),
        );
        fireEvent.click(
            await screen.findByRole("button", {
                name: "Add Sidebar Timer",
            }),
        );
        expect(
            screen.getByRole("button", { name: "Remove Translate" }),
        ).toBeInTheDocument();
        expect(screen.getAllByText("Added")).toHaveLength(2);
        fireEvent.click(screen.getByTestId("app-picker-add-button"));

        await waitFor(() => {
            expect(mockUpdateUser.mutateAsync).toHaveBeenCalledWith({
                data: {
                    apps: [
                        ...installedApps,
                        expect.objectContaining({
                            appId: "app-translate",
                            order: installedApps.length,
                        }),
                    ],
                },
            });
        });
        expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ["currentUser"],
        });
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/canvas-applets/applet-3/install",
            { method: "POST" },
        );
        expect(mockPush).not.toHaveBeenCalledWith("/apps");
    });

    it("installs applets from the sidebar picker", async () => {
        renderSidebar({
            isEditingSidebar: true,
            onToggleSidebarEdit: jest.fn(),
        });

        fireEvent.click(screen.getByTestId("sidebar-add-item-button"));
        fireEvent.click(
            await screen.findByRole("button", {
                name: "Add Sidebar Timer",
            }),
        );
        fireEvent.click(screen.getByTestId("app-picker-add-button"));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/applet-3/install",
                { method: "POST" },
            );
        });
        expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ["currentUser"],
        });
    });

    it("renders an explicit RTL-safe sidebar edit exit control with Arabic copy available", () => {
        renderSidebar({
            isEditingSidebar: true,
            onToggleSidebarEdit: jest.fn(),
            languageContext: { language: "ar", direction: "rtl" },
        });

        const sidebar = screen.getByTestId("sidebar");
        const editButton = screen.getByTestId("sidebar-edit-button");

        expect(sidebar).toHaveAttribute("dir", "rtl");
        expect(editButton).toHaveTextContent("Done editing sidebar");
        expect(editButton).toHaveClass("inset-x-3");
        expect(ar["Done editing sidebar"]).toBe("إنهاء تعديل الشريط الجانبي");
    });

    it("removes an installed built-in sidebar item from the user's apps", async () => {
        const installedApps = defaultSidebarApps();
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: installedApps,
            },
        });

        renderSidebar({
            isEditingSidebar: true,
            onToggleSidebarEdit: jest.fn(),
        });

        // First removable item is Media (Home/Chats/Automations/Files are fixed).
        fireEvent.click(screen.getAllByTestId("sidebar-remove-item-button")[0]);

        expect(screen.queryByText("Media")).not.toBeInTheDocument();
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Files")).toBeInTheDocument();
        await waitFor(() => {
            expect(mockUpdateUser.mutateAsync).toHaveBeenCalledWith({
                data: {
                    apps: installedApps
                        .filter((app) => app.appId.slug !== "media")
                        .map((app, index) => ({
                            ...app,
                            order: index,
                        })),
                },
            });
        });
    });

    it("removes an app sidebar item from the user's apps", async () => {
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: [
                    {
                        appId: {
                            _id: "app-translate",
                            slug: "translate",
                            name: "Translate",
                            icon: "Languages",
                            type: "native",
                        },
                        order: 0,
                    },
                ],
            },
        });

        renderSidebar({
            isEditingSidebar: true,
            onToggleSidebarEdit: jest.fn(),
        });

        const removeButtons = screen.getAllByTestId(
            "sidebar-remove-item-button",
        );
        fireEvent.click(removeButtons[removeButtons.length - 1]);

        expect(screen.queryByText("Translate")).not.toBeInTheDocument();
        await waitFor(() => {
            expect(mockUpdateUser.mutateAsync).toHaveBeenCalledWith({
                data: { apps: [] },
            });
        });
    });

    it("routes unlisted installed applets to the private runtime page", () => {
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: [
                    {
                        appId: {
                            _id: "app-private-applet",
                            type: "applet",
                            name: "Sidebar Timer",
                            icon: "Timer",
                            appletId: "applet-1",
                            slug: "private-applet-applet-1",
                            listedInStore: false,
                        },
                        order: 0,
                    },
                ],
            },
        });

        renderSidebar();

        fireEvent.click(screen.getByText("Sidebar Timer"));

        expect(mockPush).toHaveBeenCalledWith("/apps/private/applet-1");
    });

    it("routes unlisted installed workspace applets to their published workspace link", () => {
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: [
                    {
                        appId: {
                            _id: "app-private-workspace-applet",
                            type: "applet",
                            name: "Workspace Timer",
                            icon: "Timer",
                            workspaceId: "workspace-1",
                            slug: "workspace-timer",
                            listedInStore: false,
                        },
                        order: 0,
                    },
                ],
            },
        });

        renderSidebar();

        fireEvent.click(screen.getByText("Workspace Timer"));

        expect(mockPush).toHaveBeenCalledWith(
            "/published/workspaces/workspace-1/applet",
        );
    });

    it("renders top-level navigation in the user's saved app order", () => {
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: [
                    nativeAppEntry("files", "Files", "Folder", 0),
                    nativeAppEntry("home", "Home", "Home", 1),
                    nativeAppEntry("chat", "Chat", "MessageCircle", 2),
                    nativeAppEntry(
                        "automations",
                        "Automations",
                        "CalendarClock",
                        3,
                    ),
                    nativeAppEntry("media", "Media", "Image", 4),
                ],
            },
        });

        renderSidebar({ isPinned: true });

        const itemLabels = screen
            .getAllByTestId("sidebar-nav-sortable-item")
            .map((item) => item.textContent);

        // Primary Home/Chats/Automations/Files are fixed above; sortable apps keep saved order.
        expect(itemLabels).toEqual(["Media"]);
    });

    it("ignores repeated new-chat clicks while creation is pending", async () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];
        let resolveCreate;
        mockAddChat.mutateAsync.mockReturnValue(
            new Promise((resolve) => {
                resolveCreate = resolve;
            }),
        );

        renderSidebar();

        const newChatButton = screen.getByTestId("sidebar-new-chat-button");
        fireEvent.click(newChatButton);
        fireEvent.click(newChatButton);

        expect(mockAddChat.mutateAsync).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(newChatButton).toBeDisabled();
        });

        resolveCreate({ _id: "chat-new-real" });
        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/chat/chat-new-real");
        });
    });

    it("keeps the sidebar expanded while pinned even on collapse routes", () => {
        mockUsePathname.mockReturnValue("/apps");

        renderSidebar({
            isCollapsed: true,
            isPinned: true,
            onTogglePin: jest.fn(),
        });

        expect(screen.getByTestId("sidebar")).toHaveClass("w-56");
        expect(screen.getByTestId("sidebar")).not.toHaveClass("w-14");
        expect(screen.getByTestId("sidebar-pin-button")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("renders a pin control after collapsed hover expansion", async () => {
        const onTogglePin = jest.fn();

        renderSidebar({
            isCollapsed: true,
            isPinned: false,
            onTogglePin,
        });

        const sidebar = screen.getByTestId("sidebar");
        expect(sidebar).toHaveClass("w-14");
        expect(
            screen.queryByTestId("sidebar-pin-button"),
        ).not.toBeInTheDocument();

        fireEvent.mouseEnter(sidebar);

        expect(
            screen.queryByTestId("sidebar-pin-button"),
        ).not.toBeInTheDocument();

        const pinButton = await screen.findByTestId("sidebar-pin-button");
        expect(pinButton).toHaveAttribute("aria-label", "Pin sidebar");

        fireEvent.click(pinButton);

        expect(onTogglePin).toHaveBeenCalledTimes(1);
    });

    it("renders the sidebar edit control after collapsed hover expansion", async () => {
        const onToggleSidebarEdit = jest.fn();

        renderSidebar({
            isCollapsed: true,
            onToggleSidebarEdit,
        });

        const sidebar = screen.getByTestId("sidebar");
        expect(
            screen.queryByTestId("sidebar-edit-button"),
        ).not.toBeInTheDocument();

        fireEvent.mouseEnter(sidebar);

        expect(
            screen.queryByTestId("sidebar-edit-button"),
        ).not.toBeInTheDocument();

        const editButton = await screen.findByTestId("sidebar-edit-button");
        expect(editButton).toHaveAttribute("aria-label", "Edit sidebar");
        expect(editButton).toHaveClass("absolute");
        expect(editButton).not.toHaveTextContent("Edit sidebar");

        fireEvent.click(editButton);

        expect(onToggleSidebarEdit).toHaveBeenCalledTimes(1);
    });

    it("collapses hover expansion after a short mouse leave delay", async () => {
        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");

        expect(sidebar).toHaveClass("w-14");

        fireEvent.mouseEnter(sidebar);
        expect(sidebar).toHaveClass("w-14");

        await waitFor(() => {
            expect(sidebar).toHaveClass("w-56");
        });

        fireEvent.mouseLeave(sidebar);
        expect(sidebar).toHaveClass("w-56");

        await waitFor(() => {
            expect(sidebar).toHaveClass("w-14");
        });
    });

    it("keeps collapsed labels hidden until delayed hover expansion starts", async () => {
        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");
        const newChatLabel = screen.getByText("New Chat");
        const homeLabel = screen.getByText("Home");
        const manageAppletsLabel = screen.getByText("Manage Applets");
        const helpLabel = screen.getByText("Help");
        const feedbackLabel = screen.getByText("Send feedback");

        expect(newChatLabel).toHaveClass("hidden");
        expect(newChatLabel).not.toHaveClass("group-hover:inline");
        expect(homeLabel).toHaveClass("hidden");
        expect(homeLabel).not.toHaveClass("group-hover:inline");
        expect(manageAppletsLabel).toHaveClass("hidden");
        expect(manageAppletsLabel).not.toHaveClass("group-hover:block");
        expect(helpLabel).toHaveClass("hidden");
        expect(helpLabel).not.toHaveClass("group-hover:block");
        expect(feedbackLabel).toHaveClass("hidden");
        expect(feedbackLabel).not.toHaveClass("group-hover:block");

        fireEvent.mouseEnter(sidebar);

        expect(newChatLabel).toHaveClass("hidden");
        expect(homeLabel).toHaveClass("hidden");
        expect(manageAppletsLabel).toHaveClass("hidden");
        expect(helpLabel).toHaveClass("hidden");
        expect(feedbackLabel).toHaveClass("hidden");

        await waitFor(() => {
            expect(sidebar).toHaveClass("w-56");
        });

        expect(newChatLabel).toHaveClass("inline");
        expect(homeLabel).toHaveClass("inline");
        expect(manageAppletsLabel).not.toHaveClass("hidden");
        expect(helpLabel).not.toHaveClass("hidden");
        expect(feedbackLabel).not.toHaveClass("hidden");
    });

    it("keeps hover expansion when the pointer returns before the retract delay", async () => {
        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");

        fireEvent.mouseEnter(sidebar);
        await waitFor(() => {
            expect(sidebar).toHaveClass("w-56");
        });

        fireEvent.mouseLeave(sidebar);
        fireEvent.mouseEnter(sidebar);

        await new Promise((resolve) => setTimeout(resolve, 320));
        expect(sidebar).toHaveClass("w-56");

        fireEvent.mouseLeave(sidebar);
        await waitFor(() => {
            expect(sidebar).toHaveClass("w-14");
        });
    });

    it("does not collapse on child blur while the expanded rail is still hovered", async () => {
        mockUsePathname.mockReturnValue("/apps");
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: [nativeAppEntry("workspaces", "Applets", "AppWindow", 0)],
            },
        });
        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");
        sidebar.matches = (selector) => selector === ":hover";

        const manageAppsButton = screen.getByRole("button", {
            name: "Manage Applets",
        });
        manageAppsButton.focus();
        expect(manageAppsButton).toHaveFocus();

        fireEvent.mouseEnter(sidebar);
        await waitFor(() => {
            expect(sidebar).toHaveClass("w-56");
        });

        fireEvent.blur(manageAppsButton, { relatedTarget: null });
        expect(sidebar).toHaveClass("w-56");

        // Applets is not a sortable Apps list item; open it from the Apps row icon.
        expect(screen.queryByText("Applets")).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("sidebar-applets-button"));
        expect(mockPush).toHaveBeenCalledWith("/apps");
    });

    it("opens Applets from the whole Apps header row and hides Applets as a nav item", () => {
        useCurrentUser.mockReturnValue({
            data: {
                userId: "user-1",
                apps: [
                    ...defaultSidebarApps(),
                    nativeAppEntry("workspaces", "Applets", "AppWindow", 5),
                ],
            },
        });
        renderSidebar();

        expect(screen.getByText("Apps")).toBeInTheDocument();
        expect(screen.getByText("Media")).toBeInTheDocument();
        // No visible "Applets" nav label — Apps row uses aria-label "Applets".
        expect(screen.queryByText("Applets")).not.toBeInTheDocument();
        const appsHeader = screen.getByTestId("sidebar-applets-button");
        expect(appsHeader).toHaveAttribute("aria-label", "Applets");
        expect(appsHeader).toHaveTextContent("Apps");

        fireEvent.click(appsHeader);
        expect(mockPush).toHaveBeenCalledWith("/apps");
    });

    it("gives Chats and Apps section headers horizontal hover padding like nav items", () => {
        renderSidebar();

        expect(screen.getByTestId("sidebar-chats-header")).toHaveClass("px-2");
        expect(screen.getByTestId("sidebar-applets-button")).toHaveClass(
            "px-2",
        );
    });

    it("reports temporary expansion state changes", async () => {
        const onInteractionExpandedChange = jest.fn();
        renderSidebar({
            isCollapsed: true,
            onInteractionExpandedChange,
        });

        const sidebar = screen.getByTestId("sidebar");

        await waitFor(() => {
            expect(onInteractionExpandedChange).toHaveBeenLastCalledWith(false);
        });

        fireEvent.mouseEnter(sidebar);
        expect(onInteractionExpandedChange).toHaveBeenLastCalledWith(false);

        await waitFor(() => {
            expect(onInteractionExpandedChange).toHaveBeenLastCalledWith(true);
        });

        fireEvent.mouseLeave(sidebar);
        expect(onInteractionExpandedChange).toHaveBeenLastCalledWith(true);

        await waitFor(() => {
            expect(onInteractionExpandedChange).toHaveBeenLastCalledWith(false);
        });
    });

    it("collapses on mouse leave in rtl after the delay", async () => {
        document.documentElement.dir = "rtl";
        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");

        fireEvent.mouseEnter(sidebar);
        await waitFor(() => {
            expect(sidebar).toHaveClass("w-56");
        });

        fireEvent.mouseLeave(sidebar);
        expect(sidebar).toHaveClass("w-56");

        await waitFor(() => {
            expect(sidebar).toHaveClass("w-14");
        });
    });

    it("expands on focus and collapses when focus leaves the sidebar", () => {
        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");
        const newChatButton = screen.getByTestId("sidebar-new-chat-button");
        const outsideButton = document.createElement("button");
        document.body.appendChild(outsideButton);

        expect(sidebar).toHaveClass("w-14");

        fireEvent.focus(newChatButton);
        expect(sidebar).toHaveClass("w-56");

        fireEvent.blur(newChatButton, { relatedTarget: outsideButton });
        expect(sidebar).toHaveClass("w-14");

        outsideButton.remove();
    });
});
