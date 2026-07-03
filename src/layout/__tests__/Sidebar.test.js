import React from "react";
import fs from "fs";
import path from "path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Sidebar, {
    SIDEBAR_EXPANDED_SECTIONS_STORAGE_KEY,
    orderSidebarNavigationItems,
    shouldForceCollapse,
} from "../Sidebar";
import {
    useAddChat,
    useDeleteChat,
    useGetActiveChatId,
    useGetActiveChats,
} from "../../../app/queries/chats";
import {
    useCurrentUser,
    useUpdateCurrentUser,
} from "../../../app/queries/users";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useQueryClient } from "@tanstack/react-query";
import { useDispatch } from "react-redux";

const ar = JSON.parse(
    fs.readFileSync(
        path.join(process.cwd(), "config/default/locales/ar.json"),
        "utf8",
    ),
);

const mockPush = jest.fn();
const mockUsePathname = jest.fn(() => "/chat");
let mockPinnedAutomations = [];
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
    useUpdateCurrentUser: jest.fn(),
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
    useWorkspace: () => ({ data: mockWorkspaceData }),
}));

jest.mock("../../hooks/useAutomations", () => ({
    __esModule: true,
    usePinnedAutomations: () => ({ data: mockPinnedAutomations }),
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
    const mockUpdateUser = { mutateAsync: jest.fn() };
    const mockDispatch = jest.fn();
    const mockQueryClient = {
        getQueryData: jest.fn(),
        prefetchQuery: jest.fn().mockResolvedValue(undefined),
        invalidateQueries: jest.fn().mockResolvedValue(undefined),
    };

    let activeChatsData;
    let activeChatIdData;
    let cachedChats;

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
        mockPinnedAutomations = [];
        mockWorkspaceData = null;
        document.documentElement.dir = "ltr";
        window.localStorage.clear();
        delete window.__chatFocusRequest;
        mockUsePathname.mockReturnValue("/chat");
        window.history.pushState({}, "", "/chat");

        mockAddChat.mutateAsync.mockResolvedValue({ _id: "chat-new-real" });
        useAddChat.mockReturnValue(mockAddChat);
        useDeleteChat.mockReturnValue(mockDeleteChat);
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
        mockQueryClient.getQueryData.mockImplementation((key) => {
            if (Array.isArray(key) && key[0] === "chat") {
                return cachedChats[key[1]];
            }
            return undefined;
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

    it("shows chat MRU submenu rows behind an expanded parent item", () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];
        activeChatIdData = "chat-a";

        renderSidebar();

        expect(screen.getAllByTestId("mock-chat-nav-item")).toHaveLength(3);
        expect(screen.getByText("Chat A")).toBeInTheDocument();

        const chatToggle = screen.getByTestId(
            "sidebar-section-toggle-nav:Chats",
        );
        expect(chatToggle).toHaveAttribute("aria-expanded", "true");

        fireEvent.click(chatToggle);

        expect(chatToggle).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("Chat A")).not.toBeInTheDocument();
    });

    it("shows sidebar-pinned automation submenu rows behind an expanded parent item", () => {
        mockPinnedAutomations = [
            {
                _id: "automation-a",
                name: "Daily pulse",
                slug: "daily-pulse",
                recentRuns: [],
            },
        ];

        renderSidebar();

        expect(screen.getByText("Automations")).toBeInTheDocument();
        expect(screen.getByText("Daily pulse")).toBeInTheDocument();
        expect(
            screen.getByTestId("sidebar-section-toggle-nav:Automations"),
        ).toHaveAttribute("aria-expanded", "true");
    });

    it("uses submenu placeholders only in the compact rail when a parent is expanded", async () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
            { _id: "chat-c", title: "Chat C" },
        ];

        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");
        expect(sidebar).toHaveClass("w-16");
        expect(screen.queryByText("Chat A")).not.toBeInTheDocument();
        expect(
            screen.getByTestId("sidebar-submenu-placeholders-nav:Chats"),
        ).toBeInTheDocument();

        fireEvent.mouseEnter(sidebar);

        expect(sidebar).toHaveClass("w-16");
        const chatToggle = screen.getByTestId(
            "sidebar-section-toggle-nav:Chats",
        );
        expect(chatToggle).toHaveClass("invisible");
        expect(chatToggle).toHaveClass("pointer-events-none");

        await waitFor(() => {
            expect(sidebar).toHaveClass("w-56");
        });
        await waitFor(() => {
            expect(chatToggle).not.toHaveClass("invisible");
        });
        expect(
            screen.queryByTestId("sidebar-submenu-placeholders-nav:Chats"),
        ).not.toBeInTheDocument();
        expect(screen.getByText("Chat A")).toBeInTheDocument();

        fireEvent.click(chatToggle);

        expect(screen.queryByText("Chat A")).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("sidebar-submenu-placeholders-nav:Chats"),
        ).not.toBeInTheDocument();
    });

    it("uses automation placeholder rows that match automation submenu height", () => {
        mockPinnedAutomations = [
            {
                _id: "automation-a",
                name: "Daily pulse",
                slug: "daily-pulse",
                recentRuns: [],
            },
        ];

        renderSidebar({ isCollapsed: true });

        expect(
            screen.getByTestId(
                "sidebar-submenu-placeholder-row-nav:Automations",
            ),
        ).toHaveClass("h-12");
    });

    it("persists collapsed submenu parent state across remounts", () => {
        activeChatsData = [
            { _id: "chat-a", title: "Chat A" },
            { _id: "chat-b", title: "Chat B" },
        ];

        const { unmount } = renderSidebar();

        fireEvent.click(screen.getByTestId("sidebar-section-toggle-nav:Chats"));

        expect(
            JSON.parse(
                window.localStorage.getItem(
                    SIDEBAR_EXPANDED_SECTIONS_STORAGE_KEY,
                ),
            ),
        ).toEqual(["nav:Automations"]);

        unmount();
        renderSidebar();

        expect(screen.queryByText("Chat A")).not.toBeInTheDocument();
        expect(
            screen.getByTestId("sidebar-section-toggle-nav:Chats"),
        ).toHaveAttribute("aria-expanded", "false");
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
        expect(typeof window.__chatFocusRequest).toBe("number");
    });

    it("shows installed Home, Files, and Media shortcuts under New Chat", () => {
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
        expect(screen.getAllByTestId("sidebar-drag-handle")).toHaveLength(6);
        expect(
            screen.getAllByTestId("sidebar-remove-item-button"),
        ).toHaveLength(6);
        expect(screen.getByTestId("sidebar-add-item-button")).toHaveAttribute(
            "aria-label",
            "Add",
        );
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Files")).toBeInTheDocument();
        expect(screen.getByText("Chats")).toBeInTheDocument();
        expect(screen.getByText("Automations")).toBeInTheDocument();
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

        fireEvent.click(screen.getAllByTestId("sidebar-remove-item-button")[0]);

        expect(screen.queryByText("Home")).not.toBeInTheDocument();
        await waitFor(() => {
            expect(mockUpdateUser.mutateAsync).toHaveBeenCalledWith({
                data: {
                    apps: installedApps.slice(1).map((app, index) => ({
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

        expect(itemLabels.slice(0, 3)).toEqual(["Files", "Home", "Chats"]);
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
        expect(screen.getByTestId("sidebar")).not.toHaveClass("w-16");
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
        expect(sidebar).toHaveClass("w-16");
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

        expect(sidebar).toHaveClass("w-16");

        fireEvent.mouseEnter(sidebar);
        expect(sidebar).toHaveClass("w-16");

        await waitFor(() => {
            expect(sidebar).toHaveClass("w-56");
        });

        fireEvent.mouseLeave(sidebar);
        expect(sidebar).toHaveClass("w-56");

        await waitFor(() => {
            expect(sidebar).toHaveClass("w-16");
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
            expect(sidebar).toHaveClass("w-16");
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

        fireEvent.click(screen.getByText("Applets"));
        expect(mockPush).toHaveBeenCalledWith("/apps?tab=my-applets");
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
            expect(sidebar).toHaveClass("w-16");
        });
    });

    it("expands on focus and collapses when focus leaves the sidebar", () => {
        renderSidebar({ isCollapsed: true });

        const sidebar = screen.getByTestId("sidebar");
        const newChatButton = screen.getByTestId("sidebar-new-chat-button");
        const outsideButton = document.createElement("button");
        document.body.appendChild(outsideButton);

        expect(sidebar).toHaveClass("w-16");

        fireEvent.focus(newChatButton);
        expect(sidebar).toHaveClass("w-56");

        fireEvent.blur(newChatButton, { relatedTarget: outsideButton });
        expect(sidebar).toHaveClass("w-16");

        outsideButton.remove();
    });
});
