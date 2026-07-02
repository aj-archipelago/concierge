"use client";

import {
    BookOpen,
    Check,
    ChevronDown,
    MessageSquare,
    PinIcon,
    PinOffIcon,
    AppWindow,
    Grid3X3,
    EditIcon,
    GripVertical,
    Loader2,
    Pencil,
    Plus,
    SquarePen,
    X,
} from "lucide-react";
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    rectIntersection,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as Icons from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { openCanvas, setActiveCanvasChat } from "../stores/chatSlice";
import { getTextProxyUrl } from "../utils/proxyUrl";
import { startNewChat } from "../utils/requestChatInputFocus";
import React, {
    useEffect,
    useMemo,
    useRef,
    useCallback,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import {
    useDeleteChat,
    useGetActiveChats,
    useAddChat,
    DEFAULT_CHAT_MESSAGES_LIMIT,
} from "../../app/queries/chats";
import { useQueryClient } from "@tanstack/react-query";
import axios from "../../app/utils/axios-client";
import { useCurrentUser, useUpdateCurrentUser } from "../../app/queries/users";
import { useWorkspace } from "../../app/queries/workspaces";
import { usePinnedAutomations } from "../hooks/useAutomations";

import classNames from "../../app/utils/class-names";
import { extractPreviewTextFromStoredPayload } from "../utils/assistantInlinePayload";
import SendFeedbackModal from "../components/help/SendFeedbackModal";
import ChatNavigationItem from "./ChatNavigationItem";
import AutomationNavigationItem from "./AutomationNavigationItem";
import { cn } from "@/lib/utils";
import AppPickerDialog from "@/src/components/apps/AppPickerDialog";
import {
    getUserAppId,
    getUserAppletId,
    normalizeAppletPickerApplet,
} from "@/src/components/apps/appPickerUtils";
import { LanguageContext } from "../contexts/LanguageProvider";

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
        icon: getIconComponent("Home"),
    },
    chat: {
        name: "Chats",
        href: "/chat",
        icon: getIconComponent("MessageCircle"),
        children: [],
    },
    translate: {
        name: "Translate",
        href: "/translate",
        icon: getIconComponent("Languages"),
    },
    video: {
        name: "Transcribe",
        href: "/video",
        icon: getIconComponent("FileVideo"),
    },
    write: {
        name: "Write",
        href: "/write",
        icon: getIconComponent("PencilLine"),
    },
    workspaces: {
        name: "Applets",
        href: "/apps?tab=my-applets",
        icon: getIconComponent("AppWindow"),
    },
    media: {
        name: "Media",
        href: "/media",
        icon: getIconComponent("Image"),
    },
    automations: {
        name: "Automations",
        href: "/automations",
        icon: getIconComponent("CalendarClock"),
        children: [],
    },
    files: {
        name: "Files",
        href: "/files",
        icon: getIconComponent("Folder"),
    },
    jira: {
        name: "Jira",
        href: "/code/jira",
        icon: getIconComponent("ClipboardList"),
    },
};

const navigation = Object.values(appNavigationMap);

const routesToCollapseSidebarFor = [
    "/apps",
    "/published/applets",
    "/workspaces/",
];
const SIDEBAR_RETRACT_DELAY_MS = 280;
const SIDEBAR_EXPAND_DELAY_MS = SIDEBAR_RETRACT_DELAY_MS / 2;
const SIDEBAR_HOVER_CONTROL_DELAY_MS = 120;
const DEFAULT_EXPANDED_SIDEBAR_SECTIONS = ["nav:Chats", "nav:Automations"];
export const SIDEBAR_EXPANDED_SECTIONS_STORAGE_KEY =
    "concierge-sidebar-navigation-expanded-sections-v1";

const readExpandedSidebarSections = () => {
    if (typeof window === "undefined") {
        return new Set(DEFAULT_EXPANDED_SIDEBAR_SECTIONS);
    }

    try {
        const raw = window.localStorage.getItem(
            SIDEBAR_EXPANDED_SECTIONS_STORAGE_KEY,
        );
        if (raw === null) {
            return new Set(DEFAULT_EXPANDED_SIDEBAR_SECTIONS);
        }
        const parsed = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch {
        return new Set(DEFAULT_EXPANDED_SIDEBAR_SECTIONS);
    }
};

const writeExpandedSidebarSections = (sectionIds) => {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(
            SIDEBAR_EXPANDED_SECTIONS_STORAGE_KEY,
            JSON.stringify(sectionIds),
        );
    } catch {
        // Ignore localStorage errors; the in-memory section state still updates.
    }
};

const getSidebarItemId = (item) => {
    if (item?.sidebarId) return item.sidebarId;
    if (item?.appId) return `app:${String(item.appId)}`;
    return `nav:${item?.name || item?.href || "unknown"}`;
};

export const orderSidebarNavigationItems = (items, savedOrder = []) => {
    const byId = new Map(items.map((item) => [getSidebarItemId(item), item]));
    const ordered = [];
    const seen = new Set();

    savedOrder.forEach((id) => {
        if (!byId.has(id) || seen.has(id)) return;
        ordered.push(byId.get(id));
        seen.add(id);
    });

    items.forEach((item) => {
        const id = getSidebarItemId(item);
        if (seen.has(id)) return;
        ordered.push(item);
        seen.add(id);
    });

    return ordered;
};

const routeMatchesCollapsePrefix = (pathname, route) => {
    if (!pathname) return false;
    if (route.endsWith("/")) {
        return pathname.startsWith(route);
    }
    return pathname === route || pathname.startsWith(`${route}/`);
};

export const shouldForceCollapse = (pathname) => {
    return (
        navigation.some(
            (item) => item.collapsed && pathname?.startsWith(item.href),
        ) ||
        routesToCollapseSidebarFor.some((route) =>
            routeMatchesCollapsePrefix(pathname, route),
        )
    );
};

/** v2 canvas applet — open the applet in a fresh chat with canvas attached. */
const CanvasAppletEditButton = ({
    canvasAppletId,
    router,
    dispatch,
    isCollapsed,
    showDelayedControls,
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

            const htmlRes = await fetch(getTextProxyUrl(applet.filePath), {
                cache: "no-store",
            });
            if (!htmlRes.ok) return;
            const htmlContent = await htmlRes.text();
            const title = applet.name || t("Untitled Applet");
            const chat = await addChat.mutateAsync({
                messages: [],
                title,
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
            data-testid="sidebar-canvas-applet-edit-button"
            className={cn(
                "ml-auto p-0 border-0 bg-transparent cursor-pointer",
                isCollapsed ? "hidden" : "invisible group-hover:visible",
                !showDelayedControls && "pointer-events-none !invisible",
            )}
            disabled={addChat.isPending}
            onClick={handleClick}
        >
            <EditIcon className="h-4 w-4 text-gray-400 hover:text-gray-600" />
        </button>
    );
};

const AppletEditButton = ({
    workspaceId,
    router,
    dispatch,
    isCollapsed,
    showDelayedControls,
}) => {
    const { t } = useTranslation();
    const { data: currentUser } = useCurrentUser();
    const { data: workspace } = useWorkspace(workspaceId);
    const addChat = useAddChat();

    // Check if user is the owner of the workspace
    const isOwner =
        currentUser?._id?.toString() === workspace?.owner?.toString();

    if (!isOwner) {
        return null;
    }

    const handleEditClick = async (e) => {
        e.stopPropagation();
        if (!workspaceId) return;

        try {
            const migrateRes = await fetch("/api/canvas-applets/migrate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId }),
            });
            if (!migrateRes.ok) return;

            const migrated = await migrateRes.json();
            const appletId = migrated?.appletId;
            if (!appletId) return;

            const res = await fetch(`/api/canvas-applets/${appletId}`);
            if (!res.ok) return;
            const applet = await res.json();
            if (!applet?.filePath) return;

            const htmlRes = await fetch(getTextProxyUrl(applet.filePath), {
                cache: "no-store",
            });
            if (!htmlRes.ok) return;
            const htmlContent = await htmlRes.text();
            const title = applet.name || t("Untitled Applet");
            const chat = await addChat.mutateAsync({
                messages: [],
                title,
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
            console.error("Error migrating applet:", error);
        }
    };

    return (
        <EditIcon
            data-testid="sidebar-applet-edit-button"
            className={cn(
                "h-4 w-4 ml-auto text-gray-400 hover:text-gray-600 cursor-pointer",
                isCollapsed ? "hidden" : "invisible group-hover:visible",
                !showDelayedControls && "pointer-events-none !invisible",
            )}
            onClick={handleEditClick}
            aria-disabled={addChat.isPending}
            title={t("Edit applet")}
        />
    );
};

const SortableSidebarNavigationItem = ({
    id,
    isEditing,
    dragLabel,
    removeLabel,
    onRemove,
    children,
    className,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: !isEditing });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition: transition || "transform 200ms ease",
    };

    return (
        <li
            ref={setNodeRef}
            style={style}
            data-testid="sidebar-nav-sortable-item"
            data-sidebar-item-id={id}
            className={cn(className, isDragging && "opacity-50")}
        >
            {isEditing ? (
                <div className="flex h-10 min-w-0 items-center gap-0.5 rounded-md border border-transparent bg-transparent">
                    <button
                        type="button"
                        {...attributes}
                        {...listeners}
                        data-testid="sidebar-drag-handle"
                        aria-label={dragLabel}
                        className="flex h-10 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    >
                        <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <div className="min-w-0 flex-1 overflow-hidden">
                        {children}
                    </div>
                    <button
                        type="button"
                        data-testid="sidebar-remove-item-button"
                        aria-label={removeLabel}
                        className="flex h-10 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                        onClick={(event) => {
                            event.stopPropagation();
                            onRemove?.();
                        }}
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            ) : (
                children
            )}
        </li>
    );
};

const getSidebarSubmenuPlaceholderCount = (item, chatsLoading) => {
    if (item.name === "Chats" && chatsLoading) {
        return 1;
    }
    return Array.isArray(item.children) ? item.children.length : 0;
};

const SidebarSubmenuPlaceholders = ({ item, count }) => {
    if (!count) return null;

    const PlaceholderIcon =
        item.name === "Chats"
            ? Icons.MessageCircleIcon
            : item.href === appNavigationMap.automations.href
              ? Icons.CalendarClockIcon
              : item.icon || Icons.CircleIcon;
    const rowClassName =
        item.href === appNavigationMap.automations.href ? "h-12" : "h-10";

    return (
        <ul
            data-testid={`sidebar-submenu-placeholders-${getSidebarItemId(item)}`}
            className="mt-1 px-1"
            aria-hidden="true"
        >
            {Array.from({ length: count }).map((_, index) => (
                <li
                    key={`${getSidebarItemId(item)}-placeholder-${index}`}
                    data-testid={`sidebar-submenu-placeholder-row-${getSidebarItemId(item)}`}
                    className={cn(rowClassName, "my-0.5 flex items-center")}
                >
                    <PlaceholderIcon
                        className="ms-3 h-3.5 w-3.5 text-gray-300 dark:text-gray-600"
                        strokeWidth={2}
                    />
                </li>
            ))}
        </ul>
    );
};

export default React.forwardRef(function Sidebar(
    {
        isCollapsed: propIsCollapsed,
        isPinned = false,
        onTogglePin,
        isEditingSidebar = false,
        onInteractionExpandedChange,
        onToggleSidebarEdit,
        isMobile,
        initialActiveChats,
    },
    ref,
) {
    const pathname = usePathname();
    const router = useRouter();
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const { direction = "ltr" } = React.useContext(LanguageContext) || {};
    const addChat = useAddChat();
    const updateUser = useUpdateCurrentUser();
    const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
    const [isSidebarInteractionExpanded, setIsSidebarInteractionExpanded] =
        useState(false);
    const [isSidebarHoverExpanded, setIsSidebarHoverExpanded] = useState(false);
    const [optimisticSidebarOrder, setOptimisticSidebarOrder] = useState([]);
    const [removedSidebarAppIds, setRemovedSidebarAppIds] = useState([]);
    const [expandedSidebarSections, setExpandedSidebarSections] = useState(
        readExpandedSidebarSections,
    );
    const [showSidebarAddPicker, setShowSidebarAddPicker] = useState(false);
    const [availableSidebarApplets, setAvailableSidebarApplets] = useState([]);
    const [availableSidebarBuiltIns, setAvailableSidebarBuiltIns] = useState(
        [],
    );
    const [isLoadingSidebarApplets, setIsLoadingSidebarApplets] =
        useState(false);
    const [isLoadingSidebarBuiltIns, setIsLoadingSidebarBuiltIns] =
        useState(false);
    const [sidebarAddPendingKey, setSidebarAddPendingKey] = useState(null);
    const isCreatingNewChatRef = useRef(false);
    const expandTimerRef = useRef(null);
    const hoverControlsTimerRef = useRef(null);
    const retractTimerRef = useRef(null);
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const { data: chatsData = [], isLoading: chatsLoading } = useGetActiveChats(
        { initialData: initialActiveChats },
    );
    const visibleChats = useMemo(
        () => (Array.isArray(chatsData) ? chatsData : []),
        [chatsData],
    );

    const topChats = useMemo(() => visibleChats.slice(0, 3), [visibleChats]);
    const { data: currentUser } = useCurrentUser();
    const { data: pinnedAutomations = [] } = usePinnedAutomations();

    useEffect(() => {
        if (!Array.isArray(currentUser?.apps)) return;
        const currentAppIds = new Set(currentUser.apps.map(getUserAppId));
        setRemovedSidebarAppIds((currentIds) =>
            currentIds.filter((id) => currentAppIds.has(id)),
        );
    }, [currentUser?.apps]);

    useEffect(() => {
        setOptimisticSidebarOrder([]);
    }, [currentUser?.apps]);

    // Check if user is authenticated
    const isAuthenticated =
        currentUser && currentUser.userId && currentUser.userId !== "anonymous";

    // Check if we're on the login page
    const isOnLoginPage = pathname === "/auth/login";

    const deleteChat = useDeleteChat();
    const queryClient = useQueryClient();
    const topChatsPrefetchRef = useRef(new Set());

    const installedSidebarAppIds = useMemo(
        () =>
            new Set(
                (Array.isArray(currentUser?.apps) ? currentUser.apps : [])
                    .map(getUserAppId)
                    .filter(Boolean),
            ),
        [currentUser?.apps],
    );
    const installedSidebarAppletIds = useMemo(
        () =>
            new Set(
                (Array.isArray(currentUser?.apps) ? currentUser.apps : [])
                    .map(getUserAppletId)
                    .filter(Boolean),
            ),
        [currentUser?.apps],
    );
    const addableSidebarBuiltIns = useMemo(
        () =>
            availableSidebarBuiltIns.filter(
                (app) => !installedSidebarAppIds.has(String(app._id)),
            ),
        [availableSidebarBuiltIns, installedSidebarAppIds],
    );
    const addableSidebarApplets = useMemo(
        () =>
            availableSidebarApplets.filter(
                (applet) => !installedSidebarAppletIds.has(applet.appletId),
            ),
        [availableSidebarApplets, installedSidebarAppletIds],
    );

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
        !isPinned &&
        !isEditingSidebar &&
        (propIsCollapsed || shouldForceCollapse(pathname) || isCanvasOpen) &&
        !isMobile;
    const showPinButton =
        onTogglePin &&
        !isMobile &&
        !isEditingSidebar &&
        (!isCollapsed || isSidebarHoverExpanded);
    const showSidebarEditButton =
        onToggleSidebarEdit &&
        !isMobile &&
        (!isCollapsed || isSidebarHoverExpanded || isEditingSidebar);
    const isVisuallyCollapsed = isCollapsed && !isSidebarInteractionExpanded;

    useEffect(() => {
        return () => {
            if (expandTimerRef.current) {
                clearTimeout(expandTimerRef.current);
            }
            if (hoverControlsTimerRef.current) {
                clearTimeout(hoverControlsTimerRef.current);
            }
            if (retractTimerRef.current) {
                clearTimeout(retractTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        onInteractionExpandedChange?.(isSidebarInteractionExpanded);
    }, [isSidebarInteractionExpanded, onInteractionExpandedChange]);

    useEffect(() => {
        return () => {
            onInteractionExpandedChange?.(false);
        };
    }, [onInteractionExpandedChange]);

    const handleNewChat = useCallback(async () => {
        if (isCreatingNewChatRef.current) return;
        isCreatingNewChatRef.current = true;
        setIsCreatingNewChat(true);
        try {
            await startNewChat({
                router,
                dispatch,
                createChat: () =>
                    addChat.mutateAsync({
                        messages: [],
                    }),
            });
        } catch (error) {
            console.error("Error creating new chat:", error);
        } finally {
            isCreatingNewChatRef.current = false;
            setIsCreatingNewChat(false);
        }
    }, [router, dispatch, addChat]);

    useEffect(() => {
        if (!visibleChats.length) return;
        const topChats = visibleChats.slice(0, 3);
        topChats.forEach((chat) => {
            const chatId = chat?._id ? String(chat._id) : null;
            if (!chatId) {
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

    const userNavigation = useMemo(() => {
        if (!currentUser?.apps || currentUser.apps.length === 0) {
            return [];
        }

        const sortedUserApps = [...currentUser.apps].sort(
            (a, b) => a.order - b.order,
        );

        const userAppNavigation = sortedUserApps
            .map((userApp) => {
                const app = userApp.appId;
                if (!app) return null;

                // v2 canvas applets can be installed privately from Apps.
                // Listed app-store entries use their public slug; private
                // installs use an authenticated runtime route.
                if (app.type === "applet" && app.appletId) {
                    const rawId = app.appletId;
                    const canvasAppletId =
                        typeof rawId === "object" && rawId?._id
                            ? String(rawId._id)
                            : String(rawId);
                    const isListed = app.listedInStore !== false;
                    return {
                        name: app.name || "Applet",
                        icon: Icons[app.icon] || AppWindow,
                        href:
                            app.slug && isListed
                                ? `/apps/${app.slug}`
                                : `/apps/private/${canvasAppletId}`,
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
                        : navItem.icon || AppWindow;

                return {
                    ...navItem,
                    icon: iconComponent,
                    appId: userApp.appId._id || userApp.appId,
                    sidebarId: `nav:${navItem.name}`,
                };
            })
            .filter(Boolean);

        const seen = new Set();
        const deduped = userAppNavigation.filter((item) => {
            if (item.type === "applet") return true;
            if (seen.has(item.href)) return false;
            seen.add(item.href);
            return true;
        });

        return deduped;
    }, [currentUser?.apps]);

    const updatedNavigation = useMemo(() => {
        return userNavigation.map((item) => {
            if (item.name === "Chats" && Array.isArray(visibleChats)) {
                const chatChildren = topChats.map((chat) => ({
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
    }, [userNavigation, topChats, visibleChats, pinnedAutomations, t]);

    const topLevelNavigation = useMemo(
        () =>
            orderSidebarNavigationItems(
                updatedNavigation.filter(
                    (item) =>
                        !item.appId ||
                        !removedSidebarAppIds.includes(String(item.appId)),
                ),
                optimisticSidebarOrder,
            ),
        [updatedNavigation, removedSidebarAppIds, optimisticSidebarOrder],
    );

    const sortableNavigationIds = useMemo(
        () => topLevelNavigation.map(getSidebarItemId),
        [topLevelNavigation],
    );

    const handleSidebarDragEnd = useCallback(
        async (event) => {
            const { active, over } = event;
            if (!active?.id || !over?.id || active.id === over.id) return;

            const oldIndex = sortableNavigationIds.indexOf(active.id);
            const newIndex = sortableNavigationIds.indexOf(over.id);
            if (oldIndex < 0 || newIndex < 0) return;

            const reorderedItems = arrayMove(
                topLevelNavigation,
                oldIndex,
                newIndex,
            );
            const nextOrder = reorderedItems.map(getSidebarItemId);
            setOptimisticSidebarOrder(nextOrder);

            const orderedVisibleAppIds = reorderedItems
                .map((item) => (item.appId ? String(item.appId) : null))
                .filter(Boolean);

            if (
                !orderedVisibleAppIds.length ||
                !Array.isArray(currentUser?.apps)
            ) {
                return;
            }

            const visibleAppOrder = new Map(
                orderedVisibleAppIds.map((id, index) => [id, index]),
            );
            const nextApps = [...currentUser.apps]
                .sort((a, b) => {
                    const aId = getUserAppId(a);
                    const bId = getUserAppId(b);
                    const aVisibleOrder = visibleAppOrder.has(aId)
                        ? visibleAppOrder.get(aId)
                        : Number.MAX_SAFE_INTEGER;
                    const bVisibleOrder = visibleAppOrder.has(bId)
                        ? visibleAppOrder.get(bId)
                        : Number.MAX_SAFE_INTEGER;
                    if (aVisibleOrder !== bVisibleOrder) {
                        return aVisibleOrder - bVisibleOrder;
                    }
                    return (a.order || 0) - (b.order || 0);
                })
                .map((app, index) => ({
                    ...app,
                    order: index,
                }));

            try {
                await updateUser.mutateAsync({
                    data: { apps: nextApps },
                });
            } catch (error) {
                console.error("Error saving reordered sidebar apps:", error);
            }
        },
        [
            currentUser?.apps,
            sortableNavigationIds,
            topLevelNavigation,
            updateUser,
        ],
    );

    const handleRemoveSidebarItem = useCallback(
        async (item) => {
            const itemId = getSidebarItemId(item);
            setOptimisticSidebarOrder((currentOrder) =>
                currentOrder.filter((id) => id !== itemId),
            );

            if (!item.appId) return;

            setRemovedSidebarAppIds((currentIds) =>
                currentIds.includes(String(item.appId))
                    ? currentIds
                    : [...currentIds, String(item.appId)],
            );

            if (!Array.isArray(currentUser?.apps)) return;

            const nextApps = currentUser.apps
                .filter((app) => getUserAppId(app) !== String(item.appId))
                .map((app, index) => ({
                    ...app,
                    order: index,
                }));

            try {
                await updateUser.mutateAsync({
                    data: { apps: nextApps },
                });
            } catch (error) {
                setRemovedSidebarAppIds((currentIds) =>
                    currentIds.filter((id) => id !== String(item.appId)),
                );
                console.error("Error removing sidebar app:", error);
            }
        },
        [currentUser?.apps, updateUser],
    );

    const loadSidebarAddPicker = useCallback(async () => {
        setShowSidebarAddPicker(true);
        setIsLoadingSidebarApplets(true);
        setIsLoadingSidebarBuiltIns(true);

        try {
            const [appletsResponse, appsResponse] = await Promise.all([
                fetch("/api/canvas-applets"),
                fetch("/api/apps"),
            ]);

            if (!appletsResponse.ok || !appsResponse.ok) {
                throw new Error(
                    t("Failed to load sidebar apps. Please try again."),
                );
            }

            const [appletsData, appsData] = await Promise.all([
                appletsResponse.json(),
                appsResponse.json(),
            ]);

            const applets = (
                Array.isArray(appletsData.applets) ? appletsData.applets : []
            )
                .map(normalizeAppletPickerApplet)
                .filter(Boolean)
                .sort((appA, appB) =>
                    appA.name.localeCompare(appB.name, undefined, {
                        sensitivity: "base",
                    }),
                );
            const builtIns = (Array.isArray(appsData) ? appsData : [])
                .filter((app) => app.type === "native")
                .sort((appA, appB) =>
                    t(appA.name || "").localeCompare(
                        t(appB.name || ""),
                        undefined,
                        {
                            sensitivity: "base",
                        },
                    ),
                );

            setAvailableSidebarApplets(applets);
            setAvailableSidebarBuiltIns(builtIns);
        } catch (error) {
            console.error("Error loading sidebar app picker:", error);
            toast.error(
                error.message ||
                    t("Failed to load sidebar apps. Please try again."),
            );
        } finally {
            setIsLoadingSidebarApplets(false);
            setIsLoadingSidebarBuiltIns(false);
        }
    }, [t]);

    const handleCommitSidebarAddPicker = useCallback(
        async ({ applets: selectedApplets = [], builtInApps = [] }) => {
            const builtInsToAdd = builtInApps.filter((app) => {
                const appId = String(app?._id || "");
                return appId && !installedSidebarAppIds.has(appId);
            });
            const appletsToAdd = selectedApplets.filter((applet) => {
                const appletId = String(applet?.appletId || applet?._id || "");
                return appletId && !installedSidebarAppletIds.has(appletId);
            });
            if (!builtInsToAdd.length && !appletsToAdd.length) return;

            try {
                setSidebarAddPendingKey("commit");

                if (builtInsToAdd.length) {
                    const currentApps = Array.isArray(currentUser?.apps)
                        ? currentUser.apps
                        : [];
                    const nextApps = [
                        ...currentApps,
                        ...builtInsToAdd.map((app, index) => ({
                            appId: String(app._id),
                            order: currentApps.length + index,
                            addedAt: new Date(),
                        })),
                    ];
                    await updateUser.mutateAsync({
                        data: { apps: nextApps },
                    });
                }

                for (const applet of appletsToAdd) {
                    const appletId = String(applet.appletId || applet._id);
                    const response = await fetch(
                        `/api/canvas-applets/${appletId}/install`,
                        { method: "POST" },
                    );
                    if (!response.ok) {
                        const data = await response.json().catch(() => ({}));
                        throw new Error(
                            data.error ||
                                t(
                                    "Failed to add sidebar item. Please try again.",
                                ),
                        );
                    }
                }

                await queryClient.invalidateQueries({
                    queryKey: ["currentUser"],
                });
                setShowSidebarAddPicker(false);
            } catch (error) {
                console.error("Error adding sidebar items:", error);
                toast.error(
                    error.message ||
                        t("Failed to add sidebar item. Please try again."),
                );
            } finally {
                setSidebarAddPendingKey(null);
            }
        },
        [
            currentUser?.apps,
            installedSidebarAppIds,
            installedSidebarAppletIds,
            queryClient,
            t,
            updateUser,
        ],
    );

    const handleToggleSidebarSection = useCallback((itemId) => {
        setExpandedSidebarSections((currentSections) => {
            const nextSections = new Set(currentSections);
            if (nextSections.has(itemId)) {
                nextSections.delete(itemId);
            } else {
                nextSections.add(itemId);
            }
            writeExpandedSidebarSections([...nextSections]);
            return nextSections;
        });
    }, []);

    return (
        <div
            data-testid="sidebar"
            dir={direction}
            onMouseEnter={() => {
                if (retractTimerRef.current) {
                    clearTimeout(retractTimerRef.current);
                    retractTimerRef.current = null;
                }
                if (expandTimerRef.current) {
                    clearTimeout(expandTimerRef.current);
                }
                if (hoverControlsTimerRef.current) {
                    clearTimeout(hoverControlsTimerRef.current);
                    hoverControlsTimerRef.current = null;
                }
                expandTimerRef.current = setTimeout(() => {
                    setIsSidebarInteractionExpanded(true);
                    expandTimerRef.current = null;
                    hoverControlsTimerRef.current = setTimeout(() => {
                        setIsSidebarHoverExpanded(true);
                        hoverControlsTimerRef.current = null;
                    }, SIDEBAR_HOVER_CONTROL_DELAY_MS);
                }, SIDEBAR_EXPAND_DELAY_MS);
            }}
            onMouseLeave={() => {
                if (expandTimerRef.current) {
                    clearTimeout(expandTimerRef.current);
                    expandTimerRef.current = null;
                }
                if (hoverControlsTimerRef.current) {
                    clearTimeout(hoverControlsTimerRef.current);
                    hoverControlsTimerRef.current = null;
                }
                if (retractTimerRef.current) {
                    clearTimeout(retractTimerRef.current);
                }
                retractTimerRef.current = setTimeout(() => {
                    setIsSidebarInteractionExpanded(false);
                    setIsSidebarHoverExpanded(false);
                    retractTimerRef.current = null;
                }, SIDEBAR_RETRACT_DELAY_MS);
            }}
            onFocusCapture={() => {
                if (retractTimerRef.current) {
                    clearTimeout(retractTimerRef.current);
                    retractTimerRef.current = null;
                }
                if (expandTimerRef.current) {
                    clearTimeout(expandTimerRef.current);
                    expandTimerRef.current = null;
                }
                if (hoverControlsTimerRef.current) {
                    clearTimeout(hoverControlsTimerRef.current);
                    hoverControlsTimerRef.current = null;
                }
                setIsSidebarInteractionExpanded(true);
                setIsSidebarHoverExpanded(true);
            }}
            onBlurCapture={(event) => {
                const nextFocus =
                    typeof Node !== "undefined" &&
                    event.relatedTarget instanceof Node
                        ? event.relatedTarget
                        : null;
                if (nextFocus && event.currentTarget.contains(nextFocus)) {
                    return;
                }
                if (
                    isCollapsed &&
                    typeof event.currentTarget.matches === "function" &&
                    event.currentTarget.matches(":hover")
                ) {
                    return;
                }
                if (expandTimerRef.current) {
                    clearTimeout(expandTimerRef.current);
                    expandTimerRef.current = null;
                }
                if (hoverControlsTimerRef.current) {
                    clearTimeout(hoverControlsTimerRef.current);
                    hoverControlsTimerRef.current = null;
                }
                if (retractTimerRef.current) {
                    clearTimeout(retractTimerRef.current);
                    retractTimerRef.current = null;
                }
                setIsSidebarInteractionExpanded(false);
                setIsSidebarHoverExpanded(false);
            }}
            className={cn(
                "flex grow flex-col gap-y-1 overflow-hidden border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 relative z-[41]",
                isCollapsed &&
                    cn(
                        "group transition-[width] duration-100 shadow-xl",
                        isSidebarInteractionExpanded ? "w-56" : "w-16",
                    ),
                !isCollapsed && "w-56",
            )}
        >
            {showPinButton && (
                <button
                    type="button"
                    data-testid="sidebar-pin-button"
                    onClick={onTogglePin}
                    aria-pressed={isPinned}
                    title={isPinned ? t("Unpin sidebar") : t("Pin sidebar")}
                    aria-label={
                        isPinned ? t("Unpin sidebar") : t("Pin sidebar")
                    }
                    className={cn(
                        "absolute top-3 end-2 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-gray-200 dark:border-gray-600 bg-white/90 dark:bg-gray-800/90 text-gray-400 dark:text-gray-400 shadow-sm transition hover:bg-gray-50 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500 lg:flex",
                        !isCollapsed && "opacity-70 hover:opacity-100",
                    )}
                >
                    {isPinned ? (
                        <PinOffIcon className="h-3.5 w-3.5" />
                    ) : (
                        <PinIcon className="h-3.5 w-3.5" />
                    )}
                </button>
            )}
            {showSidebarEditButton && (
                <button
                    type="button"
                    data-testid="sidebar-edit-button"
                    onClick={onToggleSidebarEdit}
                    title={
                        isEditingSidebar
                            ? t("Done editing sidebar")
                            : t("Edit sidebar")
                    }
                    aria-label={
                        isEditingSidebar
                            ? t("Done editing sidebar")
                            : t("Edit sidebar")
                    }
                    aria-pressed={isEditingSidebar}
                    className={cn(
                        "absolute bottom-3 z-10 hidden items-center justify-center border shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-500 lg:flex",
                        isEditingSidebar
                            ? "inset-x-3 h-10 gap-2 rounded-md border-sky-500 bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 dark:border-sky-400 dark:bg-sky-500 dark:text-gray-950 dark:hover:bg-sky-400"
                            : "end-2 h-7 w-7 rounded-full border-gray-200 bg-white/90 text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200",
                        !isEditingSidebar &&
                            !isCollapsed &&
                            "opacity-70 hover:opacity-100",
                    )}
                >
                    {isEditingSidebar ? (
                        <>
                            <Check className="h-4 w-4 shrink-0" />
                            <span className="truncate">
                                {t("Done editing sidebar")}
                            </span>
                        </>
                    ) : (
                        <Pencil className="h-3.5 w-3.5" />
                    )}
                </button>
            )}

            <nav
                className={cn(
                    "flex min-h-0 flex-1 flex-col",
                    isEditingSidebar && "pb-14",
                )}
            >
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
                                disabled={
                                    isCreatingNewChat || addChat.isPending
                                }
                                title={t("New Chat")}
                                aria-label={t("New Chat")}
                                className={cn(
                                    "flex items-center gap-x-3 w-full rounded-md p-2 text-sm leading-6 font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60",
                                )}
                            >
                                <SquarePen
                                    className="h-6 w-6 shrink-0 text-sky-500"
                                    aria-hidden="true"
                                />
                                <span
                                    className={cn(
                                        "select-none whitespace-nowrap",
                                        isVisuallyCollapsed
                                            ? "hidden"
                                            : "inline",
                                    )}
                                >
                                    {t("New Chat")}
                                </span>
                            </button>
                        </li>
                        <li className="min-h-0 grow">
                            <DndContext
                                sensors={sensors}
                                collisionDetection={rectIntersection}
                                onDragEnd={handleSidebarDragEnd}
                            >
                                <SortableContext
                                    items={sortableNavigationIds}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <ul className="-mx-2 h-full space-y-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                        {topLevelNavigation.map((item) => {
                                            const itemId =
                                                getSidebarItemId(item);
                                            const submenuId = `sidebar-submenu-${itemId}`;
                                            const hasSubmenuItems =
                                                Array.isArray(item.children) &&
                                                item.children.length > 0;
                                            const isLoadingChatSubmenu =
                                                item.name === "Chats" &&
                                                chatsLoading;
                                            const hasExpandableSubmenu =
                                                !isEditingSidebar &&
                                                (hasSubmenuItems ||
                                                    isLoadingChatSubmenu);
                                            const isSubmenuExpanded =
                                                expandedSidebarSections.has(
                                                    itemId,
                                                );
                                            const showSubmenuContent =
                                                hasExpandableSubmenu &&
                                                isSubmenuExpanded &&
                                                !isVisuallyCollapsed;
                                            const placeholderCount =
                                                hasExpandableSubmenu &&
                                                isSubmenuExpanded &&
                                                isVisuallyCollapsed
                                                    ? getSidebarSubmenuPlaceholderCount(
                                                          item,
                                                          chatsLoading,
                                                      )
                                                    : 0;
                                            return (
                                                <SortableSidebarNavigationItem
                                                    key={itemId}
                                                    id={itemId}
                                                    isEditing={isEditingSidebar}
                                                    dragLabel={t(
                                                        "Drag to reorder",
                                                    )}
                                                    removeLabel={t(
                                                        "Remove sidebar item",
                                                    )}
                                                    onRemove={() =>
                                                        handleRemoveSidebarItem(
                                                            item,
                                                        )
                                                    }
                                                    className={cn(
                                                        "rounded-md group",
                                                        isEditingSidebar
                                                            ? "cursor-default"
                                                            : "cursor-pointer",
                                                    )}
                                                >
                                                    <div
                                                        data-testid={
                                                            item.href ===
                                                            "/home"
                                                                ? "sidebar-home-button"
                                                                : item.href ===
                                                                    "/files"
                                                                  ? "sidebar-files-button"
                                                                  : undefined
                                                        }
                                                        className={classNames(
                                                            "flex min-w-0 items-center justify-between",
                                                            item.href &&
                                                                pathname.includes(
                                                                    item.href,
                                                                ) &&
                                                                pathname ===
                                                                    item.href
                                                                ? "bg-gray-100 dark:bg-gray-700"
                                                                : isEditingSidebar
                                                                  ? ""
                                                                  : "hover:bg-gray-100 dark:hover:bg-gray-700",
                                                            "h-10 rounded-md px-2 text-sm leading-6 font-semibold text-gray-700 dark:text-gray-200",
                                                        )}
                                                        onClick={() => {
                                                            if (
                                                                isEditingSidebar
                                                            )
                                                                return;
                                                            if (item.href) {
                                                                router.push(
                                                                    item.href,
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex min-w-0 grow items-center gap-x-3">
                                                            <item.icon
                                                                className="h-6 w-6 shrink-0 text-gray-400"
                                                                aria-hidden="true"
                                                            />
                                                            <span
                                                                title={t(
                                                                    item.name,
                                                                )}
                                                                className={cn(
                                                                    "select-none truncate whitespace-nowrap",
                                                                    isVisuallyCollapsed
                                                                        ? "hidden"
                                                                        : "inline",
                                                                )}
                                                            >
                                                                {t(item.name)}
                                                            </span>
                                                        </div>
                                                        {!isEditingSidebar &&
                                                            item.type ===
                                                                "applet" &&
                                                            item.workspaceId && (
                                                                <AppletEditButton
                                                                    workspaceId={
                                                                        item.workspaceId
                                                                    }
                                                                    router={
                                                                        router
                                                                    }
                                                                    dispatch={
                                                                        dispatch
                                                                    }
                                                                    isCollapsed={
                                                                        isVisuallyCollapsed
                                                                    }
                                                                    showDelayedControls={
                                                                        !isCollapsed ||
                                                                        isSidebarHoverExpanded
                                                                    }
                                                                />
                                                            )}
                                                        {!isEditingSidebar &&
                                                            item.type ===
                                                                "applet" &&
                                                            item.canvasAppletId && (
                                                                <CanvasAppletEditButton
                                                                    canvasAppletId={
                                                                        item.canvasAppletId
                                                                    }
                                                                    router={
                                                                        router
                                                                    }
                                                                    dispatch={
                                                                        dispatch
                                                                    }
                                                                    isCollapsed={
                                                                        isVisuallyCollapsed
                                                                    }
                                                                    showDelayedControls={
                                                                        !isCollapsed ||
                                                                        isSidebarHoverExpanded
                                                                    }
                                                                    t={t}
                                                                />
                                                            )}
                                                        {hasExpandableSubmenu && (
                                                            <button
                                                                type="button"
                                                                data-testid={`sidebar-section-toggle-${itemId}`}
                                                                aria-label={
                                                                    isSubmenuExpanded
                                                                        ? t(
                                                                              "Collapse",
                                                                          )
                                                                        : t(
                                                                              "Expand",
                                                                          )
                                                                }
                                                                aria-expanded={
                                                                    isSubmenuExpanded
                                                                }
                                                                aria-controls={
                                                                    submenuId
                                                                }
                                                                title={
                                                                    isSubmenuExpanded
                                                                        ? t(
                                                                              "Collapse",
                                                                          )
                                                                        : t(
                                                                              "Expand",
                                                                          )
                                                                }
                                                                className={cn(
                                                                    "ms-1 h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200",
                                                                    isVisuallyCollapsed
                                                                        ? "hidden"
                                                                        : "flex",
                                                                    isCollapsed &&
                                                                        !isSidebarHoverExpanded &&
                                                                        "pointer-events-none invisible",
                                                                )}
                                                                onClick={(
                                                                    event,
                                                                ) => {
                                                                    event.stopPropagation();
                                                                    handleToggleSidebarSection(
                                                                        itemId,
                                                                    );
                                                                }}
                                                            >
                                                                <ChevronDown
                                                                    className={cn(
                                                                        "h-4 w-4 transition-transform",
                                                                        !isSubmenuExpanded &&
                                                                            (direction ===
                                                                            "rtl"
                                                                                ? "rotate-90"
                                                                                : "-rotate-90"),
                                                                    )}
                                                                    aria-hidden="true"
                                                                />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {showSubmenuContent &&
                                                    item.name === "Chats" &&
                                                    chatsLoading ? (
                                                        <div
                                                            id={submenuId}
                                                            className="mt-1 flex items-center justify-center px-1 py-2"
                                                        >
                                                            <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {placeholderCount >
                                                                0 && (
                                                                <SidebarSubmenuPlaceholders
                                                                    item={item}
                                                                    count={
                                                                        placeholderCount
                                                                    }
                                                                />
                                                            )}
                                                            {showSubmenuContent &&
                                                                hasSubmenuItems && (
                                                                    <ul
                                                                        id={
                                                                            submenuId
                                                                        }
                                                                        className="mt-1 px-1"
                                                                    >
                                                                        {item.children.map(
                                                                            (
                                                                                subItem,
                                                                                index,
                                                                            ) =>
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
                                                                                            isVisuallyCollapsed
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
                                                                                            isVisuallyCollapsed
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
                                                </SortableSidebarNavigationItem>
                                            );
                                        })}
                                        {isEditingSidebar && (
                                            <li className="rounded-md">
                                                <button
                                                    type="button"
                                                    data-testid="sidebar-add-item-button"
                                                    aria-label={t("Add")}
                                                    title={t("Add")}
                                                    className="flex h-10 w-full min-w-0 items-center gap-x-3 rounded-md px-8 text-sm font-semibold leading-6 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                                                    onClick={
                                                        loadSidebarAddPicker
                                                    }
                                                >
                                                    <Plus
                                                        className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-400"
                                                        aria-hidden="true"
                                                    />
                                                    <span className="select-none truncate whitespace-nowrap">
                                                        {t("Add")}
                                                    </span>
                                                </button>
                                            </li>
                                        )}
                                    </ul>
                                </SortableContext>
                            </DndContext>
                        </li>
                        <li className="shrink-0 mt-4">
                            <div className="py-3 bg-gray-50 dark:bg-gray-700 -mx-5 px-5 text-gray-700 dark:text-gray-200 space-y-2">
                                <button
                                    type="button"
                                    title={t("Manage Applets")}
                                    aria-label={t("Manage Applets")}
                                    className="flex gap-2 items-center text-xs w-full hover:opacity-80 transition-opacity"
                                    onClick={() => router.push("/apps")}
                                >
                                    <Grid3X3 className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />
                                    <span
                                        className={cn(
                                            "text-xs whitespace-nowrap text-gray-500 dark:text-gray-300",
                                            isCollapsed &&
                                                !isSidebarInteractionExpanded &&
                                                "hidden",
                                        )}
                                    >
                                        {t("Manage Applets")}
                                    </span>
                                </button>
                                <HelpLink isCollapsed={isVisuallyCollapsed} />
                                <SendFeedbackButton
                                    ref={ref}
                                    isCollapsed={isVisuallyCollapsed}
                                />
                            </div>
                        </li>
                    </ul>
                )}
            </nav>
            {showSidebarAddPicker && (
                <AppPickerDialog
                    title={t("Add applets to sidebar")}
                    applets={addableSidebarApplets}
                    builtInApps={addableSidebarBuiltIns}
                    includeBuiltIns
                    isLoadingApplets={isLoadingSidebarApplets}
                    isLoadingBuiltIns={isLoadingSidebarBuiltIns}
                    pendingKey={sidebarAddPendingKey}
                    onCommit={handleCommitSidebarAddPicker}
                    onClose={() => setShowSidebarAddPicker(false)}
                />
            )}
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
                type="button"
                title={t("Send feedback")}
                aria-label={t("Send feedback")}
                className="flex gap-2 items-center text-xs w-full hover:opacity-80 transition-opacity"
                onClick={handleClick}
            >
                <MessageSquare className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />
                <span
                    className={cn(
                        "text-xs whitespace-nowrap text-gray-500 dark:text-gray-300",
                        isCollapsed && "hidden",
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
            type="button"
            title={t("Help")}
            aria-label={t("Help")}
            className="flex gap-2 items-center text-xs w-full hover:opacity-80 transition-opacity"
            onClick={() => router.push("/help")}
        >
            <BookOpen className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />
            <span
                className={cn(
                    "text-xs whitespace-nowrap text-gray-500 dark:text-gray-300",
                    isCollapsed && "hidden",
                )}
            >
                {t("Help")}
            </span>
        </button>
    );
}
