"use client";

import {
    BookOpen,
    MessageSquare,
    PinIcon,
    PinOffIcon,
    AppWindow,
    Grid3X3,
    EditIcon,
    Loader2,
    SquarePen,
} from "lucide-react";
import * as Icons from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { openCanvas, setActiveCanvasChat } from "../stores/chatSlice";
import { getTextProxyUrl } from "../utils/proxyUrl";
import {
    startNewChat,
    NEW_CHAT_REQUEST_EVENT,
} from "../utils/requestChatInputFocus";
import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import {
    useDeleteChat,
    useGetActiveChats,
    useAddChat,
    DEFAULT_CHAT_MESSAGES_LIMIT,
} from "../../app/queries/chats";
import { useQueryClient } from "@tanstack/react-query";
import axios from "../../app/utils/axios-client";
import { useCurrentUser } from "../../app/queries/users";
import { useWorkspace } from "../../app/queries/workspaces";
import { isClientOnlyChatId, NEW_CHAT_ID } from "../../app/utils/chatClientIds";
import { usePinnedAutomations } from "../hooks/useAutomations";

import classNames from "../../app/utils/class-names";
import { extractPreviewTextFromStoredPayload } from "../utils/assistantInlinePayload";
import SendFeedbackModal from "../components/help/SendFeedbackModal";
import ChatNavigationItem from "./ChatNavigationItem";
import AutomationNavigationItem from "./AutomationNavigationItem";
import { cn } from "@/lib/utils";

// Helper function to get icon component
const getIconComponent = (iconName) => {
    if (!iconName) return AppWindow; // Default fallback

    // Check if it's a Lucide icon
    if (Icons[iconName]) {
        return Icons[iconName];
    }

    // Fallback to default icon
    return AppWindow;
};

// App slug to navigation item mapping
const appNavigationMap = {
    home: {
        name: "Home",
        href: "/home",
    },
    chat: {
        name: "Chats",
        href: "/chat",
        children: [],
    },
    translate: {
        name: "Translate",
        href: "/translate",
    },
    video: {
        name: "Transcribe",
        href: "/video",
    },
    write: {
        name: "Write",
        href: "/write",
    },
    workspaces: {
        name: "Applets",
        href: "/applets",
    },
    media: {
        name: "Media",
        href: "/media",
    },
    automations: {
        name: "Automations",
        href: "/automations",
        children: [],
    },
    jira: {
        name: "Jira",
        href: "/code/jira",
    },
};

// Legacy navigation for backward compatibility
export const navigation = Object.values(appNavigationMap);

const routesToCollapseSidebarFor = ["/workspaces/"];

export const shouldForceCollapse = (pathname) => {
    return (
        navigation.some(
            (item) => item.collapsed && pathname?.startsWith(item.href),
        ) ||
        routesToCollapseSidebarFor.some((route) => pathname?.startsWith(route))
    );
};

/** v2 canvas applet — open the applet in a fresh chat with canvas attached. */
const CanvasAppletEditButton = ({
    canvasAppletId,
    router,
    dispatch,
    isCollapsed,
    t,
}) => {
    const addChat = useAddChat();

    if (!canvasAppletId) return null;

    const handleClick = async (e) => {
        e.stopPropagation();
        try {
            const res = await fetch(`/api/canvas-applets/${canvasAppletId}`);
            if (!res.ok) return;
            const applet = await res.json();
            if (!applet?.filePath) return;

            const htmlRes = await fetch(getTextProxyUrl(applet.filePath));
            if (!htmlRes.ok) return;
            const htmlContent = await htmlRes.text();
            const title = applet.name || t("Untitled Applet");
            const chat = await addChat.mutateAsync({
                messages: [],
                title,
                forceNew: true,
                isUnused: false,
            });
            const chatId = String(chat?._id || "");
            if (!chatId) return;

            dispatch(setActiveCanvasChat(chatId));
            dispatch(
                openCanvas({
                    type: "html",
                    title,
                    htmlContent,
                    url: applet.filePath,
                    appletId: applet._id,
                    workspacePath: applet.workspacePath || null,
                    fileHash: applet.fileHash || null,
                    blobPath: applet.fileBlobPath || null,
                }),
            );

            router.push(`/chat/${chatId}`);
        } catch (error) {
            console.error("Error opening applet:", error);
        }
    };

    return (
        <button
            type="button"
            aria-label={t("Edit applet")}
            className={cn(
                "ml-auto p-0 border-0 bg-transparent cursor-pointer",
                isCollapsed
                    ? "hidden group-hover:inline"
                    : "invisible group-hover:visible",
            )}
            disabled={addChat.isPending}
            onClick={handleClick}
        >
            <EditIcon className="h-4 w-4 text-gray-400 hover:text-gray-600" />
        </button>
    );
};

const AppletEditButton = ({ workspaceId, router, isCollapsed }) => {
    const { t } = useTranslation();
    const { data: currentUser } = useCurrentUser();
    const { data: workspace } = useWorkspace(workspaceId);

    // Check if user is the owner of the workspace
    const isOwner =
        currentUser?._id?.toString() === workspace?.owner?.toString();

    if (!isOwner) {
        return null;
    }

    const handleEditClick = (e) => {
        e.stopPropagation();
        if (workspaceId) {
            router.push(`/workspaces/${workspaceId}`);
        }
    };

    return (
        <EditIcon
            className={cn(
                "h-4 w-4 ml-auto text-gray-400 hover:text-gray-600 cursor-pointer",
                isCollapsed
                    ? "hidden group-hover:inline"
                    : "invisible group-hover:visible",
            )}
            onClick={handleEditClick}
            title={t("Edit applet")}
        />
    );
};

export default React.forwardRef(function Sidebar(
    {
        isCollapsed: propIsCollapsed,
        onToggleCollapse,
        isMobile,
        initialActiveChats,
    },
    ref,
) {
    const nextjsPathname = usePathname();
    const [promotedPathname, setPromotedPathname] = useState(null);
    // promotedPathname overrides usePathname() until Next.js catches up
    const pathname = promotedPathname || nextjsPathname;
    // Clear promotedPathname when Next.js reports any navigation change.
    // This covers both "catch-up" (nextjs matches promoted) and "navigate away"
    // (user clicks a different link, e.g. /chat).
    useEffect(() => {
        if (promotedPathname) {
            setPromotedPathname(null);
        }
    }, [nextjsPathname]); // eslint-disable-line react-hooks/exhaustive-deps

    const router = useRouter();
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const { data: chatsData = [], isLoading: chatsLoading } = useGetActiveChats(
        { initialData: initialActiveChats },
    );
    const visibleChats = useMemo(
        () => (Array.isArray(chatsData) ? chatsData : []),
        [chatsData],
    );

    // Track "New Chat" session — persists across navigations, cleared on promotion
    const [showNewChat, setShowNewChat] = useState(pathname === "/chat/new");
    const promotedRef = useRef(false);
    useEffect(() => {
        if (pathname === "/chat/new") {
            if (!promotedRef.current) {
                setShowNewChat(true);
            }
            return;
        }

        promotedRef.current = false;
    }, [pathname]);

    useEffect(() => {
        const onPromoted = (event) => {
            setShowNewChat(false);
            promotedRef.current = true;
            const chatId = event.detail?.chatId;
            if (chatId) {
                setPromotedPathname(`/chat/${chatId}`);
            }
        };
        const onNewChatRequest = () => {
            setShowNewChat(true);
            promotedRef.current = false;
            setPromotedPathname(null);
        };
        window.addEventListener("chatIdUpdate", onPromoted);
        window.addEventListener(NEW_CHAT_REQUEST_EVENT, onNewChatRequest);
        return () => {
            window.removeEventListener("chatIdUpdate", onPromoted);
            window.removeEventListener(
                NEW_CHAT_REQUEST_EVENT,
                onNewChatRequest,
            );
        };
    }, []);

    // Stabilize top-3 order so clicking a chat doesn't shuffle the sidebar
    const prevTop3Ref = useRef([]);
    const stableTop3 = useMemo(() => {
        const includeNew = showNewChat;
        // Filter out client-only IDs from cache to avoid duplicate "new" keys
        const realChats = visibleChats.filter(
            (c) => !isClientOnlyChatId(c._id),
        );
        const saved = realChats.slice(0, includeNew ? 2 : 3);
        const top3 = includeNew ? [{ _id: NEW_CHAT_ID }, ...saved] : saved;
        const newIds = new Set(top3.map((c) => c._id));
        const prevIds = new Set(prevTop3Ref.current.map((c) => c._id));
        // Same set of chats → keep previous order, update data
        if (
            newIds.size === prevIds.size &&
            [...newIds].every((id) => prevIds.has(id))
        ) {
            const map = new Map(top3.map((c) => [c._id, c]));
            const result = prevTop3Ref.current.map((p) => map.get(p._id) || p);
            prevTop3Ref.current = result;
            return result;
        }
        prevTop3Ref.current = top3;
        return top3;
    }, [showNewChat, visibleChats]);
    const { data: currentUser } = useCurrentUser();
    const { data: pinnedAutomations = [] } = usePinnedAutomations();

    // Check if user is authenticated
    const isAuthenticated =
        currentUser && currentUser.userId && currentUser.userId !== "anonymous";

    // Check if we're on the login page
    const isOnLoginPage = pathname === "/auth/login";

    const deleteChat = useDeleteChat();
    const queryClient = useQueryClient();
    const topChatsPrefetchRef = useRef(new Set());

    const canvasVisible = useSelector((state) => state.chat?.canvasVisible);
    const canvasContent = useSelector((state) => state.chat?.canvasContent);
    // Canvas only renders inside chat — collapse only when the canvas is
    // actually visible on the current route. Other routes uncollapse normally.
    const isCanvasOpen = !!(
        canvasVisible &&
        canvasContent &&
        pathname?.startsWith("/chat")
    );

    const isCollapsed =
        (propIsCollapsed || shouldForceCollapse(pathname) || isCanvasOpen) &&
        !isMobile;

    const handleNewChat = useCallback(() => {
        startNewChat({ pathname, router, dispatch });
    }, [pathname, router, dispatch]);

    useEffect(() => {
        if (!visibleChats.length) return;
        const topChats = visibleChats.slice(0, 3);
        topChats.forEach((chat) => {
            const chatId = chat?._id ? String(chat._id) : null;
            if (!chatId || isClientOnlyChatId(chatId)) {
                return;
            }
            if (topChatsPrefetchRef.current.has(chatId)) return;
            topChatsPrefetchRef.current.add(chatId);

            router.prefetch(`/chat/${chatId}`);
            queryClient
                .prefetchQuery({
                    queryKey: ["chat", chatId],
                    queryFn: async () => {
                        const response = await axios.get(
                            `/api/chats/${chatId}?limit=${DEFAULT_CHAT_MESSAGES_LIMIT}`,
                        );
                        return response.data;
                    },
                    staleTime: 1000 * 60 * 5,
                })
                .catch(() => {
                    topChatsPrefetchRef.current.delete(chatId);
                });
        });
    }, [visibleChats, queryClient, router]);

    const handleDeleteChat = useCallback(
        async (chatId) => {
            try {
                // For client-only IDs (e.g. "new"), just clear local state
                if (isClientOnlyChatId(chatId)) {
                    setShowNewChat(false);
                    promotedRef.current = false;
                    setPromotedPathname(null);
                    queryClient.removeQueries({ queryKey: ["chat", chatId] });
                    queryClient.setQueryData(["activeChats"], (old = []) =>
                        old.filter((c) => !isClientOnlyChatId(c?._id)),
                    );
                    router.push("/chat");
                    return;
                }

                const activeChats =
                    queryClient.getQueryData(["activeChats"]) || [];
                const userChatInfo =
                    queryClient.getQueryData(["userChatInfo"]) || {};

                const remainingActive = Array.isArray(activeChats)
                    ? activeChats.filter((chat) => chat?._id !== chatId)
                    : [];
                const fallbackRecent = Array.isArray(userChatInfo.recentChatIds)
                    ? userChatInfo.recentChatIds.filter((id) => id !== chatId)
                    : [];
                const nextActiveId =
                    remainingActive[0]?._id || fallbackRecent[0] || null;

                if (nextActiveId) {
                    router.push(`/chat/${nextActiveId}`);
                } else if (pathname.startsWith("/chat/")) {
                    router.push("/chat");
                }

                deleteChat.mutate({ chatId });
            } catch (error) {
                console.error("Error deleting chat:", error);
            }
        },
        [queryClient, router, pathname, deleteChat],
    );

    // Create navigation based on user's apps — only recompute when apps change
    const userNavigation = useMemo(() => {
        const coreNavigation = [
            { ...appNavigationMap.chat, icon: Icons.MessageCircleIcon },
            { ...appNavigationMap.home, icon: Icons.HomeIcon },
            { ...appNavigationMap.automations, icon: Icons.CalendarClockIcon },
        ];

        if (!currentUser?.apps || currentUser.apps.length === 0) {
            return coreNavigation;
        }

        const sortedUserApps = [...currentUser.apps].sort(
            (a, b) => a.order - b.order,
        );

        const userAppNavigation = sortedUserApps
            .map((userApp) => {
                const app = userApp.appId;
                if (!app) return null;
                if (app.slug === "home" || app.slug === "chat") return null;

                // v2 canvas applets — published apps navigate to /apps/[slug]
                // like every other installed app. The slug is guaranteed for
                // anything in the user's apps list because publishing to the
                // app store is what creates the App record (and the slug).
                if (app.type === "applet" && app.appletId) {
                    const rawId = app.appletId;
                    const canvasAppletId =
                        typeof rawId === "object" && rawId?._id
                            ? String(rawId._id)
                            : String(rawId);
                    return {
                        name: app.name || "Applet",
                        icon: Icons[app.icon] || AppWindow,
                        href: app.slug
                            ? `/apps/${app.slug}`
                            : `/published/applets/${canvasAppletId}`,
                        appId: userApp.appId._id || userApp.appId,
                        canvasAppletId,
                        type: "applet",
                    };
                }

                // v1 workspace applets
                if (app.type === "applet" && app.workspaceId) {
                    return {
                        name: app.name || "Applet",
                        icon: Icons[app.icon] || AppWindow,
                        href: app.slug
                            ? `/apps/${app.slug}`
                            : `/published/workspaces/${app.workspaceId}/applet`,
                        appId: userApp.appId._id || userApp.appId,
                        workspaceId: app.workspaceId,
                        type: "applet",
                    };
                }

                const navItem = appNavigationMap[app.slug];
                if (!navItem) return null;

                const iconComponent =
                    app.icon && app.icon.trim()
                        ? getIconComponent(app.icon)
                        : AppWindow;

                return {
                    ...navItem,
                    icon: iconComponent,
                    appId: userApp.appId._id || userApp.appId,
                };
            })
            .filter(Boolean);

        // Deduplicate nav items that share an href with core navigation or each other
        const seen = new Set(coreNavigation.map((n) => n.href));
        const deduped = userAppNavigation.filter((item) => {
            // Applet-type items always have unique hrefs, skip dedup
            if (item.type === "applet") return true;
            if (seen.has(item.href)) return false;
            seen.add(item.href);
            return true;
        });

        return [...coreNavigation, ...deduped];
    }, [currentUser?.apps]);

    // Build final navigation with chat children — only recompute when top3 changes
    const updatedNavigation = useMemo(() => {
        return userNavigation.map((item) => {
            if (item.name === "Chats" && Array.isArray(visibleChats)) {
                const chatChildren = stableTop3.map((chat) => ({
                    name: (() => {
                        if (chat?.title && chat.title !== "New Chat") {
                            return chat.title;
                        }
                        if (chat?.firstMessage?.payload) {
                            return (
                                extractPreviewTextFromStoredPayload(
                                    chat.firstMessage.payload,
                                ) || t("New Chat")
                            );
                        }
                        if (chat?.messages && chat?.messages[0]?.payload) {
                            return (
                                extractPreviewTextFromStoredPayload(
                                    chat.messages[0].payload,
                                ) || t("New Chat")
                            );
                        }
                        return t("New Chat");
                    })(),
                    href: chat._id ? `/chat/${chat._id}` : ``,
                    key: chat._id,
                }));
                return { ...item, children: chatChildren };
            }
            if (item.href === appNavigationMap.automations.href) {
                const automationChildren = pinnedAutomations.map(
                    (automation) => ({
                        variant: "automation",
                        name: automation.name,
                        slug: automation.slug,
                        href: `/automations/${automation.slug}/runs/latest`,
                        key: automation._id,
                        recentRuns: automation.recentRuns || [],
                    }),
                );
                return { ...item, children: automationChildren };
            }
            return item;
        });
    }, [userNavigation, stableTop3, visibleChats, pinnedAutomations, t]);

    return (
        <div
            className={cn(
                "flex grow flex-col gap-y-1 overflow-hidden border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 relative z-[41]",
                isCollapsed &&
                    "group hover:w-56 w-16 transition-[width] duration-100 shadow-xl",
                !isCollapsed && "w-56",
            )}
        >
            <div className="relative hidden">
                <button
                    onClick={onToggleCollapse}
                    className={cn(
                        "hidden bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full p-1 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600",
                        shouldForceCollapse(pathname)
                            ? "lg:hidden"
                            : "group-hover:block",
                        isCollapsed
                            ? "mx-auto mt-4 hidden group-hover:mt-0 group-hover:absolute group-hover:-right-3 group-hover:top-5"
                            : "mx-auto lg:block absolute -right-3 top-5",
                    )}
                >
                    {isCollapsed ? (
                        <PinIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                        <PinOffIcon className="h-4 w-4 text-gray-400" />
                    )}
                </button>
            </div>

            <nav className="flex min-h-0 flex-1 flex-col">
                {!isAuthenticated ? (
                    // Signed out state
                    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
                        <div className="mb-4">
                            <Icons.UserX className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto" />
                        </div>
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                            {isOnLoginPage
                                ? t("Sign in to continue")
                                : t("Not signed in")}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                            {isOnLoginPage
                                ? t("Complete the form to access your account")
                                : t(
                                      "Please sign in to access your apps and chats",
                                  )}
                        </p>
                        {!isOnLoginPage && (
                            <Link
                                href="/auth/login"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-sky-600 hover:bg-sky-600/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
                            >
                                {t("Sign in")}
                            </Link>
                        )}
                    </div>
                ) : (
                    // Authenticated state - show normal navigation
                    <ul className="flex min-h-0 flex-1 flex-col">
                        <li className="shrink-0 -mx-2 h-12 flex items-center">
                            <button
                                type="button"
                                data-testid="sidebar-new-chat-button"
                                onClick={handleNewChat}
                                title={t("New Chat")}
                                aria-label={t("New Chat")}
                                className={cn(
                                    "flex items-center gap-x-3 w-full rounded-md p-2 text-sm leading-6 font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700",
                                )}
                            >
                                <SquarePen
                                    className="h-6 w-6 shrink-0 text-sky-500"
                                    aria-hidden="true"
                                />
                                <span
                                    className={cn(
                                        "select-none whitespace-nowrap",
                                        isCollapsed
                                            ? "hidden group-hover:inline"
                                            : "inline",
                                    )}
                                >
                                    {t("New Chat")}
                                </span>
                            </button>
                        </li>
                        <li className="min-h-0 grow">
                            <ul className="-mx-2 h-full space-y-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                {updatedNavigation.map((item) => (
                                    <li
                                        key={
                                            item.appId
                                                ? `nav-app-${item.appId}`
                                                : item.name
                                        }
                                        className={cn(
                                            "rounded-md cursor-pointer group",
                                            item.name === "Home" && "mt-3",
                                        )}
                                    >
                                        <div
                                            className={classNames(
                                                "flex items-center justify-between",
                                                item.href &&
                                                    pathname.includes(
                                                        item.href,
                                                    ) &&
                                                    pathname === item.href
                                                    ? "bg-gray-100 dark:bg-gray-700"
                                                    : "hover:bg-gray-100 dark:hover:bg-gray-700",
                                                "rounded-md p-2 text-sm leading-6 font-semibold text-gray-700 dark:text-gray-200",
                                            )}
                                            onClick={() => {
                                                if (item.href) {
                                                    router.push(item.href);
                                                }
                                            }}
                                        >
                                            <div className="flex items-center grow gap-x-3">
                                                <item.icon
                                                    className="h-6 w-6 shrink-0 text-gray-400"
                                                    aria-hidden="true"
                                                />
                                                <span
                                                    className={cn(
                                                        "select-none whitespace-nowrap",
                                                        isCollapsed
                                                            ? "hidden group-hover:inline"
                                                            : "inline",
                                                    )}
                                                >
                                                    {t(item.name)}
                                                </span>
                                            </div>
                                            {item.type === "applet" &&
                                                item.workspaceId && (
                                                    <AppletEditButton
                                                        workspaceId={
                                                            item.workspaceId
                                                        }
                                                        router={router}
                                                        isCollapsed={
                                                            isCollapsed
                                                        }
                                                    />
                                                )}
                                            {item.type === "applet" &&
                                                item.canvasAppletId && (
                                                    <CanvasAppletEditButton
                                                        canvasAppletId={
                                                            item.canvasAppletId
                                                        }
                                                        router={router}
                                                        dispatch={dispatch}
                                                        isCollapsed={
                                                            isCollapsed
                                                        }
                                                        t={t}
                                                    />
                                                )}
                                        </div>
                                        {item.name === "Chats" &&
                                        chatsLoading ? (
                                            <div className="mt-1 px-1 flex items-center justify-center py-2">
                                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                            </div>
                                        ) : (
                                            <>
                                                {item.name === "Chats" &&
                                                    isCollapsed && (
                                                        <ul
                                                            className="mt-1 px-1 block group-hover:hidden"
                                                            aria-hidden="true"
                                                        >
                                                            {[0, 1, 2].map(
                                                                (i) => (
                                                                    <li
                                                                        key={`chat-placeholder-${i}`}
                                                                        className="h-10 my-0.5 flex items-center"
                                                                    >
                                                                        <Icons.MessageCircleIcon
                                                                            className="h-3.5 w-3.5 ms-3 text-gray-300 dark:text-gray-600"
                                                                            strokeWidth={
                                                                                2
                                                                            }
                                                                        />
                                                                    </li>
                                                                ),
                                                            )}
                                                        </ul>
                                                    )}
                                                {item.children?.length > 0 && (
                                                    <ul
                                                        className={cn(
                                                            "mt-1 px-1",
                                                            isCollapsed
                                                                ? "hidden group-hover:block"
                                                                : "block",
                                                        )}
                                                    >
                                                        {item.children.map(
                                                            (subItem, index) =>
                                                                item.name ===
                                                                "Chats" ? (
                                                                    <ChatNavigationItem
                                                                        key={
                                                                            subItem.key ||
                                                                            `${item.name}-${index}`
                                                                        }
                                                                        subItem={
                                                                            subItem
                                                                        }
                                                                        pathname={
                                                                            pathname
                                                                        }
                                                                        router={
                                                                            router
                                                                        }
                                                                        handleDeleteChat={
                                                                            handleDeleteChat
                                                                        }
                                                                        isCollapsed={
                                                                            isCollapsed
                                                                        }
                                                                    />
                                                                ) : subItem.variant ===
                                                                  "automation" ? (
                                                                    <AutomationNavigationItem
                                                                        key={
                                                                            subItem.key ||
                                                                            `${item.name}-${index}`
                                                                        }
                                                                        subItem={
                                                                            subItem
                                                                        }
                                                                        pathname={
                                                                            pathname
                                                                        }
                                                                        router={
                                                                            router
                                                                        }
                                                                        isCollapsed={
                                                                            isCollapsed
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <li
                                                                        key={
                                                                            subItem.key ||
                                                                            `${item.name}-${index}`
                                                                        }
                                                                        className={classNames(
                                                                            "group flex items-center justify-between rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 my-0.5",
                                                                            pathname ===
                                                                                subItem?.href
                                                                                ? "bg-gray-100 dark:bg-gray-700"
                                                                                : "",
                                                                        )}
                                                                        onClick={() => {
                                                                            if (
                                                                                subItem.href
                                                                            ) {
                                                                                router.push(
                                                                                    subItem.href,
                                                                                );
                                                                            }
                                                                        }}
                                                                    >
                                                                        <div
                                                                            className="relative block py-2 pe-1 text-xs ps-4 pe-4 leading-6 text-gray-700 dark:text-gray-200 w-full select-none flex items-center justify-between"
                                                                            dir={
                                                                                document
                                                                                    .documentElement
                                                                                    .dir
                                                                            }
                                                                        >
                                                                            <span
                                                                                className={`${
                                                                                    document
                                                                                        .documentElement
                                                                                        .dir ===
                                                                                    "rtl"
                                                                                        ? "pe-3"
                                                                                        : "ps-3"
                                                                                } truncate whitespace-nowrap overflow-hidden max-w-[150px]`}
                                                                                title={t(
                                                                                    subItem.name ||
                                                                                        "",
                                                                                )}
                                                                            >
                                                                                {t(
                                                                                    subItem.name ||
                                                                                        "",
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                    </li>
                                                                ),
                                                        )}
                                                    </ul>
                                                )}
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </li>
                        <li className="shrink-0 mt-4">
                            <div className="py-3 bg-gray-50 dark:bg-gray-700 -mx-5 px-5 text-gray-700 dark:text-gray-200 space-y-2">
                                <button
                                    className="flex gap-2 items-center text-xs w-full hover:opacity-80 transition-opacity"
                                    onClick={() => router.push("/apps")}
                                >
                                    <Grid3X3 className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />
                                    <span
                                        className={cn(
                                            "text-xs whitespace-nowrap text-gray-500 dark:text-gray-300",
                                            isCollapsed &&
                                                "hidden group-hover:block",
                                        )}
                                    >
                                        {t("Manage Apps")}
                                    </span>
                                </button>
                                <HelpLink isCollapsed={isCollapsed} />
                                <SendFeedbackButton
                                    ref={ref}
                                    isCollapsed={isCollapsed}
                                />
                            </div>
                        </li>
                    </ul>
                )}
            </nav>
        </div>
    );
});

const SendFeedbackButton = React.forwardRef(function SendFeedbackButton(
    { isCollapsed },
    ref,
) {
    const [show, setShow] = useState(false);
    const { t } = useTranslation();

    const handleClick = () => setShow(true);

    return (
        <>
            <SendFeedbackModal
                ref={ref}
                show={show}
                onHide={() => setShow(false)}
            />
            <button
                className="flex gap-2 items-center text-xs w-full hover:opacity-80 transition-opacity"
                onClick={handleClick}
            >
                <MessageSquare className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />
                <span
                    className={cn(
                        "text-xs whitespace-nowrap text-gray-500 dark:text-gray-300",
                        isCollapsed && "hidden group-hover:block",
                    )}
                >
                    {t("Send feedback")}
                </span>
            </button>
        </>
    );
});

function HelpLink({ isCollapsed }) {
    const { t } = useTranslation();
    const router = useRouter();

    return (
        <button
            className="flex gap-2 items-center text-xs w-full hover:opacity-80 transition-opacity"
            onClick={() => router.push("/help")}
        >
            <BookOpen className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />
            <span
                className={cn(
                    "text-xs whitespace-nowrap text-gray-500 dark:text-gray-300",
                    isCollapsed && "hidden group-hover:block",
                )}
            >
                {t("Help")}
            </span>
        </button>
    );
}
