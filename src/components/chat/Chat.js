"use client";

import { useTranslation } from "react-i18next";
import ChatContent from "./ChatContent";
import Canvas from "./Canvas";
import MobileTabBar from "./MobileTabBar";
import {
    useUpdateActiveChat,
    useGetActiveChat,
    useGetChatById,
    useSetActiveChatId,
    useAddChat,
    useUpdateChat,
} from "../../../app/queries/chats";
import {
    isClientOnlyChatId,
    NEW_CHAT_ID,
} from "../../../app/utils/chatClientIds";
import { NEW_CHAT_REQUEST_EVENT } from "../../utils/requestChatInputFocus";
import { useContext, useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSelector, useDispatch } from "react-redux";
import { CurrentUserContext, AuthContext } from "../../App";
import {
    useParams,
    usePathname,
    useRouter,
    useSearchParams,
} from "next/navigation";
import { usePageContext } from "../../contexts/PageContextProvider";
import {
    CHAT_CONTEXTUAL_TOOLS,
    CHAT_TOOL_HANDLERS,
} from "../../../app/chat/chatTools";
import {
    SLACK_CONTEXTUAL_TOOLS,
    SLACK_TOOL_HANDLERS,
} from "../../../app/chat/slackTools";
import { useMcpServers } from "../../hooks/useMcpServers";
import axios from "../../../app/utils/axios-client";
import {
    setCanvasVisibility,
    openCanvas,
    closeCanvas,
    restoreCanvasState,
    setActiveCanvasChat,
    promoteCanvasChatId,
    clearCanvasForChat,
    stripCanvasPersistContent,
} from "../../stores/chatSlice";
import EntityIcon from "./EntityIcon";
import { Users, Copy, Info, ChevronDown, MoreHorizontal } from "lucide-react";
import { useEntities } from "../../hooks/useEntities";
import ActiveToolsList from "./ActiveToolsList";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import ChatTopMenu from "./ChatTopMenu";

/**
 * Determines which chat to use based on URL and viewing state.
 * Matches the logic in ChatContent.js for consistency:
 * 1. If viewing a read-only chat, use viewingChat
 * 2. Otherwise, if URL chat is available, use urlChat
 * 3. Otherwise, fall back to active chat
 */
function getChatToUse(urlChatId, urlChat, viewingChat, activeChat) {
    // If viewing a read-only chat, use it directly
    if (viewingChat && viewingChat.readOnly) {
        return viewingChat;
    }

    if (urlChatId) {
        if (urlChat) {
            return urlChat;
        }
        if (activeChat?._id && String(activeChat._id) === String(urlChatId)) {
            return activeChat;
        }
        return null;
    }

    // Fall back to active chat when no URL chat is specified
    return activeChat;
}

function Chat({ viewingChat = null, chatIdOverride = null, instantOnly }) {
    const { t, i18n } = useTranslation();
    const params = useParams();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const routeChatId = chatIdOverride || params?.id;
    const [promotedChatId, setPromotedChatId] = useState(null);
    const urlChatId = promotedChatId || routeChatId;
    const updateActiveChat = useUpdateActiveChat();
    const updateChatHook = useUpdateChat();
    const setActiveChatId = useSetActiveChatId();
    const addChat = useAddChat();
    const { data: activeChat } = useGetActiveChat({
        pollOnLoading: !urlChatId,
        notifyOnChangeProps: ["data"],
    });
    const { data: urlChat, error: urlChatError } = useGetChatById(urlChatId, {
        notifyOnChangeProps: ["data", "error"],
    });
    const queryClient = useQueryClient();

    const isRTL = i18n.dir() === "rtl";

    // Memoize chat determination to avoid recalculation on every render.
    // Keep a ref to the last non-null value so transient gaps during
    // promotion (old query removed before new urlChatId commits) never
    // pass null to ChatContent, which would unmount the input and flash.
    const lastChatRef = useRef(null);
    const rawChat = useMemo(
        () => getChatToUse(urlChatId, urlChat, viewingChat, activeChat),
        [urlChatId, urlChat, viewingChat, activeChat],
    );
    if (rawChat) {
        lastChatRef.current = rawChat;
    }
    const chat = rawChat ?? lastChatRef.current;
    const activeChatId = useMemo(() => chat?._id, [chat?._id]);
    // Force a fresh ChatContent instance when the user truly switches chats.
    // Prefer the route id so /chat/new can promote to a real persisted id
    // without remounting the streaming hook mid-response.
    const chatContentInstanceKey = useMemo(() => {
        if (
            routeChatId &&
            routeChatId !== "undefined" &&
            routeChatId !== "null"
        ) {
            return `route:${String(routeChatId)}`;
        }

        if (viewingChat?._id) {
            return `view:${String(viewingChat._id)}`;
        }

        if (activeChatId) {
            return `active:${String(activeChatId)}`;
        }

        return "chat:default";
    }, [routeChatId, viewingChat?._id, activeChatId]);
    const user = useContext(CurrentUserContext);
    const { readOnly } = viewingChat || {};
    const publicChatOwner = viewingChat?.owner;
    const { setPageContext, clearPageContext } = usePageContext();
    const { mcpServers: connectedMcpServers } = useMcpServers();
    const slackBotConnected = !!connectedMcpServers?.slack?.hasBotToken;
    const dispatch = useDispatch();

    useEffect(() => {
        const handleChatIdUpdate = (event) => {
            const nextChatId = event.detail?.chatId;
            if (!nextChatId) {
                return;
            }
            // Migrate the in-flight canvas bucket from NEW_CHAT_ID to the
            // newly-persisted chat id so the user's open canvas survives
            // the URL flip without a flash.
            dispatch(
                promoteCanvasChatId({
                    fromChatId: NEW_CHAT_ID,
                    toChatId: String(nextChatId),
                }),
            );
            setPromotedChatId(String(nextChatId));
        };

        const handleNewChatRequest = (event) => {
            setPromotedChatId(null);
            queryClient.removeQueries({ queryKey: ["chat", NEW_CHAT_ID] });
            // The user is starting a fresh new chat — discard any canvas
            // state still parked under NEW_CHAT_ID from the prior compose.
            // preserveCanvas=true skips this so flows that intentionally open
            // a canvas while spawning a chat (e.g. launching an applet) keep it.
            if (event?.detail?.preserveCanvas) return;
            // Switch the active bucket to NEW_CHAT_ID FIRST so the subsequent
            // closeCanvas / setCanvasVisibility syncs land on NEW_CHAT_ID's
            // bucket — not on the previous chat's bucket, which would wipe its
            // persisted canvas state. (The route useEffect at line 349 hasn't
            // fired yet at this point because we're still on /chat/{prevId}.)
            dispatch(setActiveCanvasChat(NEW_CHAT_ID));
            dispatch(clearCanvasForChat(NEW_CHAT_ID));
            dispatch(closeCanvas());
            dispatch(setCanvasVisibility(false));
        };

        window.addEventListener("chatIdUpdate", handleChatIdUpdate);
        window.addEventListener(NEW_CHAT_REQUEST_EVENT, handleNewChatRequest);
        return () => {
            window.removeEventListener("chatIdUpdate", handleChatIdUpdate);
            window.removeEventListener(
                NEW_CHAT_REQUEST_EVENT,
                handleNewChatRequest,
            );
        };
    }, [queryClient, dispatch]);

    useEffect(() => {
        if (!promotedChatId) {
            return;
        }

        if (String(routeChatId || "") === String(promotedChatId)) {
            setPromotedChatId(null);
            return;
        }

        if (routeChatId && !isClientOnlyChatId(routeChatId)) {
            setPromotedChatId(null);
        }
    }, [promotedChatId, routeChatId]);

    useEffect(() => {
        if (!urlChatId || !urlChatError) return;
        const status = urlChatError?.response?.status;
        const isNotFound =
            status === 404 || /not found/i.test(urlChatError?.message || "");
        if (!isNotFound) return;

        const activeChats = queryClient.getQueryData(["activeChats"]) || [];
        const userChatInfo = queryClient.getQueryData(["userChatInfo"]) || {};
        const remainingActive = Array.isArray(activeChats)
            ? activeChats.filter(
                  (chat) => String(chat?._id) !== String(urlChatId),
              )
            : [];
        const fallbackRecent = Array.isArray(userChatInfo.recentChatIds)
            ? userChatInfo.recentChatIds.filter(
                  (id) => String(id) !== String(urlChatId),
              )
            : [];
        const nextActiveId =
            remainingActive[0]?._id || fallbackRecent[0] || null;

        if (nextActiveId) {
            router.replace(`/chat/${String(nextActiveId)}`);
        } else {
            router.replace("/chat");
        }
    }, [urlChatError, urlChatId, queryClient, router]);

    // Set up contextual tools for chat page
    useEffect(() => {
        const tools = slackBotConnected
            ? [...CHAT_CONTEXTUAL_TOOLS, ...SLACK_CONTEXTUAL_TOOLS]
            : CHAT_CONTEXTUAL_TOOLS;
        const handlers = slackBotConnected
            ? { ...CHAT_TOOL_HANDLERS, ...SLACK_TOOL_HANDLERS }
            : CHAT_TOOL_HANDLERS;

        setPageContext(
            tools,
            null, // No page context data needed for chat page
            handlers,
            null,
            "chat-page",
        );

        return () => {
            clearPageContext("chat-page");
        };
    }, [setPageContext, clearPageContext, slackBotConnected]);

    // Track the last URL chat ID we've updated to prevent duplicate calls
    const lastUpdatedUrlChatId = useRef(null);

    // Update active chat ID asynchronously in the background after reading from URL
    // This is non-blocking and only used for ChatBox fallback purposes
    useEffect(() => {
        // Skip if no URL chat ID or already updated this ID
        if (!urlChatId || urlChatId === lastUpdatedUrlChatId.current) {
            return;
        }

        // Client-only routes are promoted by the stream path and should never
        // be written back as the persisted active chat ID.
        if (isClientOnlyChatId(urlChatId)) {
            return;
        }

        // Skip if viewing a read-only chat or chat doesn't exist
        if (viewingChat || !urlChat || urlChat.readOnly) {
            return;
        }

        // Skip if already matches active chat (no update needed)
        if (urlChatId === activeChat?._id) {
            lastUpdatedUrlChatId.current = urlChatId;
            return;
        }

        // Update active chat ID asynchronously in the background (non-blocking)
        // This is only for ChatBox fallback, not for navigation
        lastUpdatedUrlChatId.current = urlChatId;
        setActiveChatId.mutate(urlChatId, {
            onError: (error) => {
                console.error("Error updating active chat ID:", error);
                // Reset on error so we can retry
                lastUpdatedUrlChatId.current = null;
            },
        });
    }, [urlChatId, activeChat?._id, viewingChat, urlChat, setActiveChatId]);
    const [selectedEntityId, setSelectedEntityId] = useState(
        chat?.selectedEntityId || "",
    );
    const persistedEntityRepairRef = useRef(null);
    const [showPublicConfirm, setShowPublicConfirm] = useState(false);
    const [showUnshareConfirm, setShowUnshareConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showSharedByDialog, setShowSharedByDialog] = useState(false);

    const defaultAiName = user?.aiName || "Concierge";
    const { entities, defaultEntityId, entitiesLoaded } = useEntities(
        defaultAiName,
        {
            userId: user?.contextId,
            personalEntityId: user?.personalEntityId,
        },
    );
    const selectedEntityExists = useMemo(
        () => entities.some((entity) => entity.id === selectedEntityId),
        [entities, selectedEntityId],
    );
    const effectiveSelectedEntityId = selectedEntityExists
        ? selectedEntityId
        : defaultEntityId || "";
    const canvasContent = useSelector((state) => state.chat?.canvasContent);
    const canvasVisible = useSelector(
        (state) => state.chat?.canvasVisible ?? true,
    );
    const canvasWidth = useSelector((state) => state.chat?.canvasWidth);
    const canvasByChatId = useSelector(
        (state) => state.chat?.canvasByChatId || {},
    );

    // Switch the active canvas bucket whenever the chat changes so each chat
    // sees its own open tabs/applet. setActiveCanvasChat snapshots the prior
    // chat's bucket and loads the new one (or creates an empty one).
    useEffect(() => {
        dispatch(
            setActiveCanvasChat(activeChatId ? String(activeChatId) : null),
        );
    }, [activeChatId, dispatch]);

    // Restore + persist canvas across page reloads via UserState (Mongo).
    // Restore runs once after userState first loads; persist runs on any
    // canvas state change once we've restored. Persistence is per-chat
    // (canvasByChatId) so each chat keeps its own canvas across sessions.
    const { userState, debouncedUpdateUserState } = useContext(AuthContext);
    const canvasRestoredRef = useRef(false);
    useEffect(() => {
        if (canvasRestoredRef.current) return;
        if (!userState) return;
        canvasRestoredRef.current = true;
        if (userState.canvas) {
            dispatch(restoreCanvasState(userState.canvas));
        }
    }, [userState, dispatch]);
    useEffect(() => {
        if (!canvasRestoredRef.current) return;
        if (!debouncedUpdateUserState) return;
        const stripBucket = (bucket) => ({
            canvasContent: stripCanvasPersistContent(bucket?.canvasContent),
            canvasTabs: (bucket?.canvasTabs || []).map((tab) => ({
                ...tab,
                content: stripCanvasPersistContent(tab.content),
            })),
            activeTabId: bucket?.activeTabId ?? null,
            canvasVisible:
                typeof bucket?.canvasVisible === "boolean"
                    ? bucket.canvasVisible
                    : true,
        });
        const byChatId = {};
        for (const [chatId, bucket] of Object.entries(canvasByChatId)) {
            // Skip the throwaway pending bucket — it migrates into a real
            // chat on setActiveCanvasChat and isn't worth persisting.
            if (chatId === "__pending__") continue;
            // NEW_CHAT_ID is a transient route that gets promoted to a real
            // chat id once the user sends a message. Persisting its bucket
            // re-seeds stale state on the next /chat/new mount, which then
            // overwrites a freshly-adopted __pending__ bucket (e.g. when
            // launching an applet from /applets) and the canvas vanishes.
            if (chatId === NEW_CHAT_ID) continue;
            byChatId[chatId] = stripBucket(bucket);
        }
        debouncedUpdateUserState({
            canvas: { byChatId },
        });
    }, [canvasByChatId, debouncedUpdateUserState]);

    // Deep link from Manage Apps (v2 canvas applets): ?openCanvasApplet=<mongo id>
    useEffect(() => {
        const param = searchParams.get("openCanvasApplet")?.trim();
        if (!param || !/^[a-f\d]{24}$/i.test(param)) return;

        const stripOpenAppletParam = () => {
            const next = new URLSearchParams(searchParams.toString());
            next.delete("openCanvasApplet");
            const q = next.toString();
            router.replace(q ? `${pathname}?${q}` : pathname, {
                scroll: false,
            });
        };

        if (readOnly || chat?.readOnly) {
            stripOpenAppletParam();
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/canvas-applets/${param}`);
                if (cancelled || !res.ok) {
                    if (!cancelled) stripOpenAppletParam();
                    return;
                }
                const applet = await res.json();
                if (cancelled) return;
                const versions = applet.htmlVersions;
                const latestHtml =
                    Array.isArray(versions) && versions.length > 0
                        ? versions[versions.length - 1].content
                        : applet.html || "";
                if (!applet.filePath && !latestHtml) {
                    stripOpenAppletParam();
                    return;
                }
                const baseTitle = applet.name || t("Applet") || "Applet";
                const filename = /\.html$/i.test(baseTitle)
                    ? baseTitle
                    : `${baseTitle.replace(/\.html$/i, "")}.html`;

                if (cancelled) return;
                dispatch(
                    openCanvas({
                        type: "html",
                        title: baseTitle,
                        filename,
                        url: applet.filePath || undefined,
                        htmlContent: latestHtml || undefined,
                        appletId: String(applet._id),
                        workspacePath: applet.workspacePath || null,
                        fileHash: applet.fileHash || null,
                        blobPath: applet.fileBlobPath || null,
                    }),
                );
                stripOpenAppletParam();
            } catch (e) {
                console.error("[Chat] openCanvasApplet deep link failed:", e);
                stripOpenAppletParam();
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [searchParams, pathname, router, dispatch, readOnly, chat?.readOnly, t]);

    // Mobile detection
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Swipe gesture support for mobile
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        if (!isMobile) return;
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
        if (!isMobile) return;
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!isMobile || !touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe && canvasVisible && canvasContent) {
            // Swipe left to go to Chat
            dispatch(setCanvasVisibility(false));
        }
        if (isRightSwipe && !canvasVisible && canvasContent) {
            // Swipe right to go to Canvas
            dispatch(setCanvasVisibility(true));
        }
    };

    // For /chat/new, keep the selector pinned to the current default unless
    // the user already has a valid explicit selection carried from a chat.
    useEffect(() => {
        if (chat?.selectedEntityId || !defaultEntityId) {
            return;
        }

        if (!selectedEntityId || !selectedEntityExists) {
            setSelectedEntityId(defaultEntityId);
        }
    }, [
        chat?.selectedEntityId,
        defaultEntityId,
        selectedEntityId,
        selectedEntityExists,
    ]);

    // Sync local state with fetched chat data (only for persisted chats)
    useEffect(() => {
        const entityIdFromChat = chat?.selectedEntityId;
        // Skip sync when there's no persisted entity to sync from (e.g. /chat/new)
        // so user-selected entities aren't clobbered by defaultEntityId resets
        if (!entityIdFromChat || !entitiesLoaded) return;

        const hasKnownEntity = entities.some((e) => e.id === entityIdFromChat);
        const newEntityId = hasKnownEntity ? entityIdFromChat : defaultEntityId;

        if (newEntityId !== selectedEntityId) {
            setSelectedEntityId(newEntityId);
        }

        if (
            hasKnownEntity ||
            !newEntityId ||
            readOnly ||
            chat?.readOnly ||
            !chat?._id ||
            chat?._id === NEW_CHAT_ID
        ) {
            persistedEntityRepairRef.current = null;
            return;
        }

        const repairKey = `${String(chat._id)}:${entityIdFromChat}->${newEntityId}`;
        if (persistedEntityRepairRef.current === repairKey) {
            return;
        }

        persistedEntityRepairRef.current = repairKey;
        updateChatHook.mutate({
            chatId: String(chat._id),
            selectedEntityId: newEntityId,
        });
    }, [
        chat?._id,
        chat?.readOnly,
        chat?.selectedEntityId,
        defaultEntityId,
        entities,
        entitiesLoaded,
        readOnly,
        selectedEntityId,
        updateChatHook,
    ]);

    const handleShare = () => {
        setShowPublicConfirm(true);
    };

    const handleCopyUrl = async () => {
        const shareUrl = `${window.location.origin}/chat/${chat._id}`;
        try {
            await navigator.clipboard.writeText(shareUrl);
        } catch (error) {
            console.error("Error copying URL:", error);
        }
    };

    const handleUnshare = async () => {
        try {
            await updateActiveChat.mutateAsync({ isPublic: false });
        } catch (error) {
            console.error("Error unsharing chat:", error);
        }
    };

    const handleEntityChange = (value) => {
        const newEntityId = value === defaultAiName ? "" : value;
        setSelectedEntityId(newEntityId);
        if (activeChatId) {
            updateActiveChat.mutate({
                chatId: activeChatId,
                selectedEntityId: newEntityId,
            });
        }
    };

    const handleMakePublic = async () => {
        try {
            const shareUrl = `${window.location.origin}/chat/${chat._id}`;
            await updateActiveChat.mutateAsync({ isPublic: true });
            document.body.focus();
            await navigator.clipboard.writeText(shareUrl);
        } catch (error) {
            console.error("Error making chat public:", error);
        }
    };

    const fetchFullChatIfNeeded = async (chatToFetch) => {
        if (!chatToFetch?._id) return chatToFetch;
        if (!chatToFetch?.messagesTruncated && !chatToFetch?.hasMoreMessages) {
            return chatToFetch;
        }
        const { data } = await axios.get(
            `/api/chats/${String(chatToFetch._id)}`,
        );
        return data || chatToFetch;
    };

    const handleExportActiveChat = async () => {
        try {
            const chatToExport = await fetchFullChatIfNeeded(
                viewingChat || chat,
            );
            if (!chatToExport?._id || !chatToExport?.messages?.length) return;

            const now = new Date();
            const stamp = now.toISOString().replace(/[:T]/g, "-").split(".")[0];
            const fileName = `chat-${String(chatToExport._id)}-${stamp}.json`;
            const blob = new Blob([JSON.stringify(chatToExport, null, 2)], {
                type: "application/json",
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (error) {
            console.error("Error exporting chat:", error);
        }
    };

    const handleDelete = async () => {
        try {
            if (activeChatId) {
                updateActiveChat.mutate({
                    chatId: activeChatId,
                    messages: [],
                    title: "",
                });
            }
        } catch (error) {
            console.error("Error deleting chat:", error);
        }
    };

    // Determine if current user owns this chat
    const isChatOwner = !readOnly && !publicChatOwner;
    const isShared = chat?.isPublic;
    const hasMessages =
        Array.isArray(chat?.messages) && chat.messages.length > 0;
    const selectedEntity = entities.find(
        (entity) => entity.id === effectiveSelectedEntityId,
    );
    const selectedEntityLabel = selectedEntity ? t(selectedEntity.name) : null;

    const handleCopyChat = async () => {
        try {
            const chatToCopy = await fetchFullChatIfNeeded(viewingChat || chat);
            if (!chatToCopy?._id || !chatToCopy?.messages?.length) return;

            const { _id } = await addChat.mutateAsync({
                messages: chatToCopy.messages,
                title: chatToCopy.title
                    ? `${t("Copy of")} ${chatToCopy.title}`
                    : t("Copy of chat"),
            });
            setShowSharedByDialog(false);
            router.push(`/chat/${_id}`);
        } catch (error) {
            console.error("Error copying chat:", error);
        }
    };

    const handleCanvasToggle = () => {
        if (canvasContent) {
            if (canvasVisible) {
                dispatch(closeCanvas());
                dispatch(setCanvasVisibility(false));
            } else {
                dispatch(setCanvasVisibility(true));
            }
            return;
        }

        dispatch(
            openCanvas({
                type: "empty",
                title: t("Canvas") || "Canvas",
            }),
        );
    };

    const renderEntityControl = ({ mobile = false } = {}) => {
        const buttonClassName = [
            "flex items-center rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 text-xs",
            mobile
                ? "w-full min-w-0 justify-between gap-2 px-3 py-2"
                : "gap-1.5 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600",
        ].join(" ");
        const label = selectedEntityLabel || t("Select entity");
        const isInteractive = user?.useCustomEntities && !readOnly;

        const content = (
            <>
                <div className="flex min-w-0 items-center gap-2">
                    {selectedEntity ? (
                        <EntityIcon
                            entity={selectedEntity}
                            size={mobile ? "sm" : "xs"}
                        />
                    ) : null}
                    <span className="min-w-0 truncate">
                        {selectedEntityLabel ? (
                            <>
                                <span className="hidden sm:inline">
                                    {t("Chatting with")} {selectedEntityLabel}
                                </span>
                                <span className="sm:hidden">
                                    {selectedEntityLabel}
                                </span>
                            </>
                        ) : (
                            label
                        )}
                    </span>
                </div>
                {isInteractive ? (
                    <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                ) : null}
            </>
        );

        if (isInteractive) {
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className={buttonClassName}
                            aria-label={t("Select entity")}
                        >
                            {content}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={isRTL ? "start" : "end"}>
                        {entities.map((entity) => (
                            <DropdownMenuItem
                                key={entity.id}
                                onClick={() => handleEntityChange(entity.id)}
                                className="flex items-center gap-2 text-sm focus:bg-gray-100 dark:focus:bg-gray-700 dark:focus:text-gray-100"
                            >
                                <EntityIcon entity={entity} size="xs" />
                                {t(entity.name)}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        }

        return (
            <button
                className={`${buttonClassName} cursor-default`}
                aria-label={t("Select entity")}
                tabIndex={-1}
                type="button"
            >
                {content}
            </button>
        );
    };

    const renderSharedStatus = ({ mobile = false } = {}) => {
        if (publicChatOwner) {
            return (
                <button
                    type="button"
                    onClick={() => setShowSharedByDialog(true)}
                    className={`flex items-center gap-1.5 rounded-md border bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 ${
                        mobile
                            ? "px-2.5 py-2 text-xs"
                            : "px-3 py-1.5 text-xs hover:bg-sky-100 dark:hover:bg-sky-900/30"
                    }`}
                    title={`${t("Shared by")} ${publicChatOwner?.name || publicChatOwner?.username || ""}`}
                >
                    <Users className="w-4 h-4" />
                    <span>{t("Shared")}</span>
                    {!mobile ? <Info className="w-3.5 h-3.5" /> : null}
                </button>
            );
        }

        if (readOnly) {
            return (
                <div
                    className={`flex items-center gap-1.5 rounded-md border bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 ${
                        mobile ? "px-2.5 py-2 text-xs" : "px-3 py-1.5 text-xs"
                    }`}
                    title={t("Read-only mode")}
                >
                    <Info className="w-3.5 h-3.5" />
                    <span>{t("Read-only mode")}</span>
                </div>
            );
        }

        if (isShared) {
            return (
                <div
                    className={`flex items-center gap-1.5 rounded-md border bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 ${
                        mobile ? "px-2.5 py-2 text-xs" : "px-3 py-1.5 text-xs"
                    }`}
                    title={t("Shared chat options")}
                >
                    <Users className="w-4 h-4" />
                    <span>{t("Shared")}</span>
                </div>
            );
        }

        return null;
    };

    const renderOverflowMenu = () => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex items-center justify-center rounded-md border border-gray-200 bg-white px-2.5 py-2 text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    aria-label={t("More actions")}
                    title={t("More actions")}
                >
                    <MoreHorizontal className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isRTL ? "start" : "end"}>
                <DropdownMenuItem onClick={handleCanvasToggle}>
                    {canvasContent && canvasVisible
                        ? t("Hide Canvas")
                        : t("Show Canvas")}
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={!hasMessages}
                    onClick={handleExportActiveChat}
                >
                    {t("Export")}
                </DropdownMenuItem>
                {isChatOwner && !isShared ? (
                    <DropdownMenuItem disabled={readOnly} onClick={handleShare}>
                        {t("Share")}
                    </DropdownMenuItem>
                ) : null}
                {isChatOwner && isShared ? (
                    <>
                        <DropdownMenuItem onClick={handleCopyUrl}>
                            {t("Copy Share URL")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setShowUnshareConfirm(true)}
                        >
                            {t("Unshare")}
                        </DropdownMenuItem>
                    </>
                ) : null}
                {publicChatOwner ? (
                    <DropdownMenuItem
                        onClick={() => setShowSharedByDialog(true)}
                    >
                        {t("Shared chat")}
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    disabled={readOnly || !!publicChatOwner}
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                >
                    {t("Clear this chat")}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div className="flex flex-col gap-3 h-full">
            <div
                className={`flex gap-2 ${isMobile ? "flex-col items-stretch" : "items-center justify-between"}`}
            >
                {isMobile ? (
                    <>
                        <div className="flex items-center gap-2">
                            <ChatTopMenu
                                displayState="mobile"
                                readOnly={readOnly || !!publicChatOwner}
                                chat={chat}
                                contextId={user?.contextId}
                                contextKey={user?.contextKey}
                                updateChatHook={updateChatHook}
                            />
                            <ActiveToolsList displayState="docked" />
                            <div className="ms-auto">
                                {renderOverflowMenu()}
                            </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                            <div className="min-w-0 flex-1">
                                {renderEntityControl({ mobile: true })}
                            </div>
                            {renderSharedStatus({ mobile: true })}
                        </div>
                    </>
                ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <ChatTopMenu
                            displayState="full"
                            readOnly={readOnly || !!publicChatOwner}
                            chat={chat}
                            contextId={user?.contextId}
                            contextKey={user?.contextKey}
                            updateChatHook={updateChatHook}
                        />
                        <ActiveToolsList displayState="full" />
                        <div className="min-w-0 flex-1 max-w-[24rem] ms-2">
                            {renderEntityControl({ mobile: false })}
                        </div>
                        {renderSharedStatus({ mobile: false })}
                        <div className="ms-auto">{renderOverflowMenu()}</div>
                    </div>
                )}
            </div>
            {/* Mobile: Full-screen overlay, Desktop: Side-by-side */}
            {isMobile ? (
                <div
                    className="grow overflow-hidden flex flex-col relative"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    {canvasContent && (
                        <div className="mb-4">
                            <MobileTabBar
                                canvasVisible={canvasVisible}
                                canvasContent={canvasContent}
                            />
                        </div>
                    )}
                    {/* Always render both components but hide/show with CSS to keep them mounted */}
                    {canvasContent && (
                        <div
                            className={`flex-1 overflow-hidden relative ${
                                canvasVisible ? "" : "hidden"
                            }`}
                        >
                            <Canvas selectedEntityId={selectedEntityId} />
                        </div>
                    )}
                    <div
                        data-testid="main-chat-content"
                        className={`flex-1 overflow-hidden relative ${
                            canvasContent && canvasVisible ? "hidden" : ""
                        }`}
                    >
                        <ChatContent
                            key={chatContentInstanceKey}
                            viewingChat={viewingChat}
                            chat={chat}
                            urlChatId={urlChatId}
                            instantOnly={instantOnly}
                            streamingEnabled={user.streamingEnabled}
                            selectedEntityId={effectiveSelectedEntityId}
                            entities={entities}
                            entityIconSize="lg"
                        />
                    </div>
                </div>
            ) : (
                <div className="grow overflow-hidden flex gap-3">
                    <div className="flex-1 overflow-auto">
                        <ChatContent
                            key={chatContentInstanceKey}
                            viewingChat={viewingChat}
                            chat={chat}
                            urlChatId={urlChatId}
                            instantOnly={instantOnly}
                            streamingEnabled={user.streamingEnabled}
                            selectedEntityId={effectiveSelectedEntityId}
                            entities={entities}
                            entityIconSize="lg"
                        />
                    </div>
                    {canvasContent && canvasVisible && (
                        <div
                            className="flex-shrink-0 min-w-0 relative"
                            style={{
                                width:
                                    canvasWidth !== null
                                        ? `${canvasWidth}%`
                                        : "50%",
                                minWidth: "300px",
                            }}
                        >
                            <Canvas selectedEntityId={selectedEntityId} />
                        </div>
                    )}
                </div>
            )}

            <AlertDialog
                open={showPublicConfirm}
                onOpenChange={setShowPublicConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Make this chat public?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "This will make this chat visible to anyone with the link. This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={() => {
                                handleMakePublic();
                                setShowPublicConfirm(false);
                            }}
                        >
                            {t("Make Public")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={showUnshareConfirm}
                onOpenChange={setShowUnshareConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Unshare this chat?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "This will make this chat private. People with the link will no longer be able to access it.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={() => {
                                handleUnshare();
                                setShowUnshareConfirm(false);
                            }}
                        >
                            {t("Unshare")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Clear Chat?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to clear this chat? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={() => {
                                handleDelete();
                                setShowDeleteConfirm(false);
                            }}
                        >
                            {t("Clear")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog
                open={showSharedByDialog}
                onOpenChange={setShowSharedByDialog}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("Shared Chat")}</DialogTitle>
                        <DialogDescription>
                            {t("This chat was shared by")}{" "}
                            <span className="font-semibold">
                                {publicChatOwner?.name ||
                                    publicChatOwner?.username ||
                                    t("Unknown")}
                            </span>{" "}
                            {t(
                                "and is read only. You can read it but cannot change it.",
                            )}
                            <br />
                            <br />
                            {t(
                                "You can make a copy of this chat if you'd like to continue it.",
                            )}{" "}
                            {t(
                                "This will not give you access to the files used in the shared chat.",
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowSharedByDialog(false)}
                        >
                            {t("Close")}
                        </Button>
                        <Button
                            onClick={handleCopyChat}
                            disabled={addChat.isPending}
                            className="flex items-center gap-2"
                        >
                            <Copy className="w-4 h-4" />
                            {addChat.isPending
                                ? t("Copying...")
                                : t("Copy Chat")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default Chat;
