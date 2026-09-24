"use client";

import {
    BookOpen,
    Check,
    MessageSquare,
    MessageSquareText,
    PinIcon,
    PinOffIcon,
    AppWindow,
    Grid3X3,
    EditIcon,
    GripVertical,
    Loader2,
    Pencil,
    Plus,
    ChevronDown,
    ChevronRight,
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
import WispIcon from "../components/colleagues/WispIcon";
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
    useUpdateChat,
    DEFAULT_CHAT_MESSAGES_LIMIT,
} from "../../app/queries/chats";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "../../app/utils/axios-client";
import { useCurrentUser, useUpdateCurrentUser } from "../../app/queries/users";
import { useWorkspace } from "../../app/queries/workspaces";
import { useColleagueUpdates } from "../hooks/useColleagueUpdates";
import {
    CHAT_ATTENTION_QUERY_KEY,
    clearChatNeedsAttention,
    getChatLastViewedAt,
    getChatNeedsAttention,
    getChatTaskNotificationStatus,
    markChatViewed,
} from "../utils/chatsUnread";

import classNames from "../../app/utils/class-names";
import { extractPreviewTextFromStoredPayload } from "../utils/assistantInlinePayload";
import SendFeedbackModal from "../components/help/SendFeedbackModal";
import ChatNavigationItem from "./ChatNavigationItem";
import ChatTaskStatusDot from "./ChatTaskStatusDot";
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
        href: "/apps",
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
export const SIDEBAR_CHAT_LIST_INITIAL = 4;
const PRIMARY_SIDEBAR_NAV_NAMES = new Set([
    "Home",
    "Automations",
    "Chats",
    "Files",
]);
/** Built-ins that have dedicated sidebar affordances and must not appear as Apps list items. */
const APPS_SECTION_EXCLUDED_NAV_NAMES = new Set(["Applets"]);
const APPS_SECTION_EXCLUDED_SLUGS = new Set(["workspaces"]);

/**
 * Compact rail rows that reserve chat-list height and show per-chat status
 * dots while titles stay hidden. Individual chats use a square conversation
 * icon so they stay distinct from the round Chats header bubble.
 */
const SidebarChatListPlaceholders = ({
    items = [],
    count,
    includeViewAllRow = false,
}) => {
    const rowCount = typeof count === "number" ? count : items.length;
    if (!rowCount && !includeViewAllRow) return null;

    return (
        <ul data-testid="sidebar-chats-placeholders" className="px-2">
            {Array.from({ length: rowCount }).map((_, index) => {
                const item = items[index];
                const status = item?.notificationStatus || "idle";
                const content = (
                    <span className="relative inline-flex h-5 w-5 items-center justify-center overflow-visible">
                        <MessageSquareText
                            data-testid="sidebar-chat-placeholder-icon"
                            className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600"
                            strokeWidth={2}
                            aria-hidden="true"
                        />
                        {item ? (
                            <ChatTaskStatusDot
                                status={status}
                                sizeClassName="h-1.5 w-1.5"
                                className="absolute end-0 top-0 ring-1 ring-white dark:ring-gray-800"
                            />
                        ) : null}
                    </span>
                );

                return (
                    <li
                        key={item?.key || `sidebar-chat-placeholder-${index}`}
                        data-testid="sidebar-chat-placeholder-row"
                        data-notification-status={item ? status : undefined}
                        className="my-0.5 flex h-8 items-center justify-center"
                    >
                        {item?.href ? (
                            <Link
                                href={item.href}
                                title={item.name}
                                aria-label={item.name}
                                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                {content}
                            </Link>
                        ) : (
                            content
                        )}
                    </li>
                );
            })}
            {includeViewAllRow ? (
                <li
                    data-testid="sidebar-chat-placeholder-view-all"
                    className="flex h-7 items-center"
                />
            ) : null}
        </ul>
    );
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
                "ms-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-0 bg-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 lg:h-6 lg:w-6",
                isCollapsed
                    ? "hidden"
                    : "lg:invisible group-hover:visible group-focus-within:visible",
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
        <button
            type="button"
            data-testid="sidebar-applet-edit-button"
            aria-label={t("Edit applet")}
            title={t("Edit applet")}
            className={cn(
                "ms-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 lg:h-6 lg:w-6",
                isCollapsed
                    ? "hidden"
                    : "lg:invisible group-hover:visible group-focus-within:visible",
                !showDelayedControls && "pointer-events-none !invisible",
            )}
            onClick={handleEditClick}
            disabled={addChat.isPending}
        >
            <EditIcon className="h-4 w-4" aria-hidden="true" />
        </button>
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

export default React.forwardRef(function Sidebar(
    {
        isCollapsed: propIsCollapsed,
        isPinned = false,
        onTogglePin,
        isEditingSidebar = false,
        onInteractionExpandedChange,
        onToggleSidebarEdit,
        onNavigate,
        isMobile,
        initialActiveChats,
        renderHeader,
    },
    ref,
) {
    const pathname = usePathname();
    const router = useRouter();
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const { direction = "ltr" } = React.useContext(LanguageContext) || {};
    const addChat = useAddChat();
    const updateChat = useUpdateChat();
    const updateUser = useUpdateCurrentUser();
    const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
    const [isSidebarInteractionExpanded, setIsSidebarInteractionExpanded] =
        useState(false);
    const [isSidebarHoverExpanded, setIsSidebarHoverExpanded] = useState(false);
    const [optimisticSidebarOrder, setOptimisticSidebarOrder] = useState([]);
    const [removedSidebarAppIds, setRemovedSidebarAppIds] = useState([]);
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
    const [chatLastViewedVersion, setChatLastViewedVersion] = useState(0);
    const [chatHistoryExpanded, setChatHistoryExpanded] = useState(true);
    useEffect(() => {
        const sync = () => {
            try {
                setChatHistoryExpanded(
                    localStorage.getItem("concierge-sidebar-chat-history") !==
                        "collapsed",
                );
            } catch {
                /* Storage may be unavailable. */
            }
        };
        sync();
        window.addEventListener("storage", sync);
        window.addEventListener("concierge-chat-history-toggle", sync);
        return () => {
            window.removeEventListener("storage", sync);
            window.removeEventListener("concierge-chat-history-toggle", sync);
        };
    }, []);
    const toggleChatHistory = () => {
        const expanded = !chatHistoryExpanded;
        setChatHistoryExpanded(expanded);
        try {
            localStorage.setItem(
                "concierge-sidebar-chat-history",
                expanded ? "expanded" : "collapsed",
            );
            window.dispatchEvent(new Event("concierge-chat-history-toggle"));
        } catch {
            /* Keep the toggle usable without storage. */
        }
    };
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

    const topChats = useMemo(
        () => visibleChats.slice(0, SIDEBAR_CHAT_LIST_INITIAL),
        [visibleChats],
    );
    const canShowViewAllChats = visibleChats.length > SIDEBAR_CHAT_LIST_INITIAL;
    const chatListPlaceholderCount = chatsLoading
        ? 1
        : Math.max(topChats.length, 1);
    const chatListPlaceholderIncludesViewAll =
        !chatsLoading && canShowViewAllChats;
    const { data: currentUser } = useCurrentUser();
    const { hasUnreadUpdates } = useColleagueUpdates();

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
    const { data: chatAttentionMap = {} } = useQuery({
        queryKey: CHAT_ATTENTION_QUERY_KEY,
        queryFn: () => ({}),
        staleTime: Infinity,
        initialData: {},
    });
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
        visibleChats.slice(0, SIDEBAR_CHAT_LIST_INITIAL).forEach((chat) => {
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

    const navigateAwayFromChat = useCallback(
        (chatId) => {
            const activeChats = queryClient.getQueryData(["activeChats"]) || [];
            const userChatInfo =
                queryClient.getQueryData(["userChatInfo"]) || {};

            const remainingActive = Array.isArray(activeChats)
                ? activeChats.filter(
                      (chat) => String(chat?._id) !== String(chatId),
                  )
                : [];
            const fallbackRecent = Array.isArray(userChatInfo.recentChatIds)
                ? userChatInfo.recentChatIds.filter(
                      (id) => String(id) !== String(chatId),
                  )
                : [];
            const nextActiveId =
                remainingActive[0]?._id || fallbackRecent[0] || null;

            if (pathname === `/chat/${chatId}`) {
                if (nextActiveId) {
                    router.push(`/chat/${nextActiveId}`);
                } else {
                    router.push("/chat");
                }
            }
        },
        [queryClient, router, pathname],
    );

    const handleDeleteChat = useCallback(
        async (chatId) => {
            try {
                navigateAwayFromChat(chatId);
                deleteChat.mutate({ chatId });
            } catch (error) {
                console.error("Error deleting chat:", error);
            }
        },
        [navigateAwayFromChat, deleteChat],
    );

    const handleArchiveChat = useCallback(
        async (chatId) => {
            try {
                navigateAwayFromChat(chatId);
                await updateChat.mutateAsync({
                    chatId,
                    archived: true,
                    archivedAt: new Date().toISOString(),
                    pinned: false,
                    pinnedAt: null,
                });
            } catch (error) {
                console.error("Error archiving chat:", error);
            }
        },
        [navigateAwayFromChat, updateChat],
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
                    const isListed = app.listedInStore !== false;
                    return {
                        name: app.name || "Applet",
                        icon: Icons[app.icon] || AppWindow,
                        href:
                            app.slug && isListed
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

    const getChatSidebarTitle = useCallback(
        (chat) => {
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
        },
        [t],
    );

    const activeChatRouteId = useMemo(() => {
        const match = pathname?.match(/^\/chat\/([^/]+)/);
        return match?.[1] || null;
    }, [pathname]);
    const previousActiveChatRouteIdRef = useRef(null);

    useEffect(() => {
        const previousChatId = previousActiveChatRouteIdRef.current;
        // Mark on leave so tasks that finished while viewing don't leave a dot.
        if (previousChatId && previousChatId !== activeChatRouteId) {
            markChatViewed(previousChatId);
        }
        if (activeChatRouteId) {
            markChatViewed(activeChatRouteId);
            clearChatNeedsAttention(queryClient, activeChatRouteId);
        }
        previousActiveChatRouteIdRef.current = activeChatRouteId;
        setChatLastViewedVersion((version) => version + 1);
    }, [activeChatRouteId, queryClient]);

    const sidebarChatItems = useMemo(
        () =>
            topChats.map((chat) => {
                const chatId = chat._id ? String(chat._id) : null;
                const lastViewedAt = chatId
                    ? getChatLastViewedAt(chatId)
                    : null;
                return {
                    name: getChatSidebarTitle(chat),
                    href: chatId ? `/chat/${chatId}` : "",
                    key: chatId,
                    pinned: Boolean(chat.pinned),
                    updatedAt: chat.updatedAt,
                    lastMessageAt: chat.lastMessageAt,
                    notificationStatus: getChatTaskNotificationStatus(
                        chat,
                        lastViewedAt,
                        {
                            isCurrentlyViewing:
                                Boolean(chatId) && chatId === activeChatRouteId,
                            needsAttention: getChatNeedsAttention(
                                chatAttentionMap,
                                chatId,
                            ),
                        },
                    ),
                };
            }),
        // chatLastViewedVersion forces recompute after markChatViewed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            topChats,
            getChatSidebarTitle,
            activeChatRouteId,
            chatLastViewedVersion,
            chatAttentionMap,
        ],
    );

    const updatedNavigation = useMemo(() => {
        return userNavigation.map((item) => {
            if (item.name === "Chats") {
                return { ...item, children: [] };
            }
            return item;
        });
    }, [userNavigation]);

    const topLevelNavigation = useMemo(
        () =>
            orderSidebarNavigationItems(
                updatedNavigation.filter(
                    (item) =>
                        !PRIMARY_SIDEBAR_NAV_NAMES.has(item.name) &&
                        !APPS_SECTION_EXCLUDED_NAV_NAMES.has(item.name) &&
                        (!item.appId ||
                            !removedSidebarAppIds.includes(String(item.appId))),
                ),
                optimisticSidebarOrder,
            ),
        [updatedNavigation, removedSidebarAppIds, optimisticSidebarOrder],
    );

    const HomeIcon = appNavigationMap.home.icon;
    const ChatsIcon = appNavigationMap.chat.icon;
    const FilesIcon = appNavigationMap.files.icon;
    const isOnFilesRoute =
        pathname === "/files" || pathname?.startsWith("/files/");
    // Header is active only on the chats list page, not individual /chat/:id.
    const isOnChatRoute = pathname === "/chat";

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
                .filter(
                    (app) =>
                        app.type === "native" &&
                        !APPS_SECTION_EXCLUDED_SLUGS.has(app.slug),
                )
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
                "flex grow flex-col gap-y-1 overflow-hidden border-e border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 pt-4 relative z-[41]",
                isCollapsed &&
                    cn(
                        "group transition-[width] duration-100 shadow-xl",
                        isSidebarInteractionExpanded ? "w-56" : "w-14",
                    ),
                !isCollapsed && "w-56",
                renderHeader && "pt-0",
            )}
        >
            {renderHeader?.({ collapsed: isVisuallyCollapsed })}
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
                    "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden lg:overflow-visible",
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
                    <ul className="flex min-h-full flex-1 flex-col lg:min-h-0">
                        <li className="shrink-0 -mx-2 space-y-0.5 pb-2 border-b border-gray-200 dark:border-gray-700 mb-2">
                            <button
                                type="button"
                                data-testid="sidebar-new-chat-button"
                                onClick={handleNewChat}
                                disabled={
                                    isCreatingNewChat || addChat.isPending
                                }
                                title={t("New Chat")}
                                aria-label={t("New Chat")}
                                className="flex h-10 lg:h-8 items-center gap-x-2.5 w-full rounded-md px-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Plus
                                    className="h-4 w-4 shrink-0 text-sky-500"
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
                            <button
                                type="button"
                                data-testid="sidebar-home-button"
                                onClick={() => router.push("/home")}
                                title={t("Home")}
                                aria-label={t("Home")}
                                className={cn(
                                    "flex h-10 lg:h-8 items-center gap-x-2.5 w-full rounded-md px-2 text-xs font-medium text-gray-700 dark:text-gray-200",
                                    pathname === "/home" ||
                                        pathname?.startsWith("/home/")
                                        ? "bg-gray-100 dark:bg-gray-700"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-700",
                                )}
                            >
                                <HomeIcon
                                    className="h-4 w-4 shrink-0 text-gray-400"
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
                                    {t("Home")}
                                </span>
                            </button>
                            <button
                                type="button"
                                data-testid="sidebar-colleagues-button"
                                onClick={() => {
                                    onNavigate?.();
                                    router.push(
                                        `/colleagues?view=${hasUnreadUpdates ? "recent" : "team"}`,
                                    );
                                }}
                                title={t("colleagues.title")}
                                aria-label={
                                    hasUnreadUpdates
                                        ? t("Tasks with new updates")
                                        : t("colleagues.title")
                                }
                                className={cn(
                                    "flex h-10 lg:h-8 items-center gap-x-2.5 w-full rounded-md px-2 text-xs font-medium text-gray-700 dark:text-gray-200",
                                    pathname?.startsWith("/colleagues") ||
                                        pathname?.startsWith("/automations")
                                        ? "bg-gray-100 dark:bg-gray-700"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-700",
                                )}
                            >
                                <span className="relative shrink-0">
                                    <WispIcon className="h-4 w-4 text-gray-400" />
                                    {hasUnreadUpdates && (
                                        <span
                                            data-testid="sidebar-colleagues-unread-dot"
                                            className="absolute -top-0.5 -end-0.5 h-2 w-2 rounded-full bg-sky-500"
                                            aria-hidden="true"
                                        />
                                    )}
                                </span>
                                <span
                                    className={cn(
                                        "select-none whitespace-nowrap",
                                        isVisuallyCollapsed
                                            ? "hidden"
                                            : "inline",
                                    )}
                                >
                                    {t("colleagues.title")}
                                </span>
                            </button>

                            <button
                                type="button"
                                data-testid="sidebar-files-button"
                                onClick={() => router.push("/files")}
                                title={t("Files")}
                                aria-label={t("Files")}
                                className={cn(
                                    "flex h-10 lg:h-8 items-center gap-x-2.5 w-full rounded-md px-2 text-xs font-medium text-gray-700 dark:text-gray-200",
                                    isOnFilesRoute
                                        ? "bg-gray-100 dark:bg-gray-700"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-700",
                                )}
                            >
                                <FilesIcon
                                    className="h-4 w-4 shrink-0 text-gray-400"
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
                                    {t("Files")}
                                </span>
                            </button>
                        </li>

                        <li
                            data-testid="sidebar-chats-section"
                            className="shrink-0 -mx-2 pb-2 border-b border-gray-200 dark:border-gray-700 mb-2"
                        >
                            <div className="flex items-center pt-1 pb-0.5">
                                <Link
                                    href="/chat"
                                    data-testid="sidebar-chats-header"
                                    title={t("Chats")}
                                    aria-label={t("Chats")}
                                    className={cn(
                                        "flex min-h-10 min-w-0 flex-1 items-center gap-1 rounded-md px-2",
                                        isVisuallyCollapsed
                                            ? "justify-center"
                                            : "justify-between",
                                        isOnChatRoute
                                            ? "bg-gray-100 dark:bg-gray-700"
                                            : "hover:bg-gray-100 dark:hover:bg-gray-700",
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400",
                                            isVisuallyCollapsed && "hidden",
                                        )}
                                    >
                                        {t("Chats")}
                                    </div>
                                    <ChatsIcon
                                        data-testid="sidebar-chats-view-all"
                                        className="h-3.5 w-3.5 shrink-0 text-gray-400"
                                        aria-hidden="true"
                                    />
                                </Link>
                                {!isVisuallyCollapsed && (
                                    <button
                                        type="button"
                                        data-testid="sidebar-chat-history-toggle"
                                        aria-expanded={chatHistoryExpanded}
                                        aria-controls={
                                            isMobile
                                                ? "mobile-sidebar-chat-history"
                                                : "desktop-sidebar-chat-history"
                                        }
                                        aria-label={t(
                                            chatHistoryExpanded
                                                ? "Collapse chat history"
                                                : "Expand chat history",
                                        )}
                                        title={t(
                                            chatHistoryExpanded
                                                ? "Collapse chat history"
                                                : "Expand chat history",
                                        )}
                                        onClick={toggleChatHistory}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-gray-400 dark:hover:bg-gray-700"
                                    >
                                        {chatHistoryExpanded ? (
                                            <ChevronDown className="h-4 w-4" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                                        )}
                                    </button>
                                )}
                            </div>
                            <div
                                id={
                                    isMobile
                                        ? "mobile-sidebar-chat-history"
                                        : "desktop-sidebar-chat-history"
                                }
                                hidden={!chatHistoryExpanded}
                            >
                                {isVisuallyCollapsed ? (
                                    <SidebarChatListPlaceholders
                                        items={sidebarChatItems}
                                        count={chatListPlaceholderCount}
                                        includeViewAllRow={
                                            chatListPlaceholderIncludesViewAll
                                        }
                                    />
                                ) : chatsLoading ? (
                                    <div className="flex items-center justify-center px-2 py-3">
                                        <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
                                    </div>
                                ) : sidebarChatItems.length === 0 ? (
                                    <p className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400">
                                        {t("No chats yet")}
                                    </p>
                                ) : (
                                    <ul data-testid="sidebar-chat-list">
                                        {sidebarChatItems.map((subItem) => (
                                            <ChatNavigationItem
                                                key={subItem.key}
                                                subItem={subItem}
                                                pathname={pathname}
                                                router={router}
                                                handleDeleteChat={
                                                    handleDeleteChat
                                                }
                                                handleArchiveChat={
                                                    handleArchiveChat
                                                }
                                                isCollapsed={false}
                                            />
                                        ))}
                                        {canShowViewAllChats && (
                                            <li>
                                                <Link
                                                    href="/chat"
                                                    data-testid="sidebar-chats-view-all-link"
                                                    className="flex h-7 w-full min-h-10 sm:min-h-0 items-center rounded-md px-2 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                                >
                                                    {t("View all")}
                                                </Link>
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </div>
                        </li>

                        <li className="min-h-0 shrink-0 grow lg:shrink">
                            <DndContext
                                sensors={sensors}
                                collisionDetection={rectIntersection}
                                onDragEnd={handleSidebarDragEnd}
                            >
                                <SortableContext
                                    items={sortableNavigationIds}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <ul className="-mx-2 h-auto lg:h-full space-y-0.5 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                        <li className="pt-1 pb-0.5">
                                            <button
                                                type="button"
                                                data-testid="sidebar-applets-button"
                                                title={t("Applets")}
                                                aria-label={t("Applets")}
                                                onClick={() =>
                                                    router.push("/apps")
                                                }
                                                className={cn(
                                                    "flex h-10 lg:h-6 w-full items-center gap-1 rounded-md px-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200",
                                                    isVisuallyCollapsed
                                                        ? "justify-center"
                                                        : "justify-between",
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        "text-[11px] font-medium uppercase tracking-wide",
                                                        isVisuallyCollapsed &&
                                                            "hidden",
                                                    )}
                                                >
                                                    {t("Apps")}
                                                </div>
                                                <AppWindow
                                                    className="h-3.5 w-3.5 shrink-0"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </li>
                                        {topLevelNavigation.map((item) => {
                                            const itemId =
                                                getSidebarItemId(item);
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
                                                            "min-h-10 lg:min-h-8 rounded-md text-xs font-medium text-gray-700 dark:text-gray-200",
                                                        )}
                                                    >
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                isEditingSidebar
                                                            }
                                                            aria-label={t(
                                                                item.name,
                                                            )}
                                                            aria-current={
                                                                pathname ===
                                                                item.href
                                                                    ? "page"
                                                                    : undefined
                                                            }
                                                            className="flex min-h-10 lg:min-h-8 min-w-0 grow items-center gap-x-2.5 rounded-md px-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 disabled:cursor-default"
                                                            onClick={() => {
                                                                if (item.href)
                                                                    router.push(
                                                                        item.href,
                                                                    );
                                                            }}
                                                        >
                                                            <item.icon
                                                                className="h-4 w-4 shrink-0 text-gray-400"
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
                                                        </button>
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
                                                    </div>
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
                                                    className="flex h-8 w-full min-w-0 items-center gap-x-2.5 rounded-md px-8 text-xs font-medium leading-5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                                                    onClick={
                                                        loadSidebarAddPicker
                                                    }
                                                >
                                                    <Plus
                                                        className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-400"
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
                        <li className="shrink-0 mt-3">
                            <div className="py-3 bg-gray-50 dark:bg-gray-700 -mx-5 px-5 text-gray-700 dark:text-gray-200 space-y-0 lg:space-y-2">
                                <button
                                    type="button"
                                    title={t("Manage Applets")}
                                    aria-label={t("Manage Applets")}
                                    className="flex min-h-10 lg:min-h-0 gap-2 items-center rounded-md text-xs w-full hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
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
                className="flex min-h-10 lg:min-h-0 gap-2 items-center rounded-md text-xs w-full hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
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
            className="flex min-h-10 lg:min-h-0 gap-2 items-center rounded-md text-xs w-full hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
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
