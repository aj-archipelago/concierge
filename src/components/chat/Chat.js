"use client";

import { useTranslation } from "react-i18next";
import ChatContent from "./ChatContent";
import dynamic from "next/dynamic";
import {
    useUpdateActiveChat,
    useGetActiveChat,
    useGetChatById,
    useSetActiveChatId,
    useAddChat,
} from "../../../app/queries/chats";
import { useContext, useState, useEffect, useRef, useMemo } from "react";
import { AuthContext } from "../../App";
import { useParams, useRouter } from "next/navigation";
import EntityIcon from "./EntityIcon";
import {
    Trash2,
    Check,
    Download,
    Users,
    Copy,
    Info,
    ChevronDown,
} from "lucide-react";
import { useEntities } from "../../hooks/useEntities";
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
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"), {
    loading: () => <div style={{ width: "80px", height: "20px" }}></div>,
});

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

    // Otherwise, use URL chat if available
    if (urlChatId && urlChat) {
        return urlChat;
    }

    // Fall back to active chat
    return activeChat;
}

function Chat({ viewingChat = null }) {
    const { t, i18n } = useTranslation();
    const params = useParams();
    const router = useRouter();
    const urlChatId = params?.id;
    const updateActiveChat = useUpdateActiveChat();
    const setActiveChatId = useSetActiveChatId();
    const addChat = useAddChat();
    const { data: activeChat } = useGetActiveChat();
    const { data: urlChat } = useGetChatById(urlChatId);

    const isRTL = i18n.dir() === "rtl";

    // Memoize chat determination to avoid recalculation on every render
    const chat = useMemo(
        () => getChatToUse(urlChatId, urlChat, viewingChat, activeChat),
        [urlChatId, urlChat, viewingChat, activeChat],
    );
    const activeChatId = useMemo(() => chat?._id, [chat?._id]);
    const { user } = useContext(AuthContext);
    const { readOnly } = viewingChat || {};
    const publicChatOwner = viewingChat?.owner;

    // Track the last URL chat ID we've updated to prevent duplicate calls
    const lastUpdatedUrlChatId = useRef(null);

    // Update active chat ID asynchronously in the background after reading from URL
    // This is non-blocking and only used for ChatBox fallback purposes
    useEffect(() => {
        // Skip if no URL chat ID or already updated this ID
        if (!urlChatId || urlChatId === lastUpdatedUrlChatId.current) {
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
    const [showPublicConfirm, setShowPublicConfirm] = useState(false);
    const [showUnshareConfirm, setShowUnshareConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showSharedByDialog, setShowSharedByDialog] = useState(false);
    const [copyStatus, setCopyStatus] = useState(false);

    const defaultAiName = user?.aiName || "Labeeb";
    const { entities, defaultEntityId } = useEntities(defaultAiName);

    // Sync local state with fetched chat data
    useEffect(() => {
        const entityIdFromChat = chat?.selectedEntityId || "";
        // If no entityId or entity doesn't exist, use default entity
        const newEntityId =
            entityIdFromChat && entities.some((e) => e.id === entityIdFromChat)
                ? entityIdFromChat
                : defaultEntityId;

        if (newEntityId !== selectedEntityId) {
            setSelectedEntityId(newEntityId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chat?.selectedEntityId, entities, defaultEntityId]);

    const handleShare = () => {
        setShowPublicConfirm(true);
    };

    const handleCopyUrl = async () => {
        const shareUrl = `${window.location.origin}/chat/${chat._id}`;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
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
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
        } catch (error) {
            console.error("Error making chat public:", error);
        }
    };

    const handleExportActiveChat = () => {
        try {
            const chatToExport = viewingChat || chat;
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

    const handleCopyChat = async () => {
        try {
            const chatToCopy = viewingChat || chat;
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

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex gap-2 items-center flex-wrap">
                    {readOnly ? (
                        <button
                            onClick={
                                publicChatOwner
                                    ? () => setShowSharedByDialog(true)
                                    : undefined
                            }
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors border bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-xs ${
                                publicChatOwner
                                    ? "hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                                    : "cursor-default"
                            }`}
                            title={
                                publicChatOwner
                                    ? `${t("Shared by")} ${publicChatOwner?.name || publicChatOwner?.username || ""}`
                                    : t("Read-only mode")
                            }
                        >
                            <span>{t("Read-only mode")}</span>
                            {publicChatOwner && (
                                <Info className="w-3.5 h-3.5" />
                            )}
                        </button>
                    ) : (
                        <>
                            {user?.useCustomEntities ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs"
                                            aria-label={t("Select entity")}
                                        >
                                            <div className="flex items-center gap-2">
                                                {selectedEntityId ? (
                                                    <>
                                                        <span className="hidden sm:inline">
                                                            {t("Chatting with")}{" "}
                                                            {t(
                                                                entities.find(
                                                                    (e) =>
                                                                        e.id ===
                                                                        selectedEntityId,
                                                                )?.name,
                                                            )}
                                                        </span>
                                                        <span className="sm:hidden">
                                                            {t(
                                                                entities.find(
                                                                    (e) =>
                                                                        e.id ===
                                                                        selectedEntityId,
                                                                )?.name,
                                                            )}
                                                        </span>
                                                        <EntityIcon
                                                            entity={entities.find(
                                                                (e) =>
                                                                    e.id ===
                                                                    selectedEntityId,
                                                            )}
                                                            size="xs"
                                                        />
                                                    </>
                                                ) : (
                                                    <span>
                                                        {t("Select entity")}
                                                    </span>
                                                )}
                                            </div>
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align={isRTL ? "start" : "end"}
                                    >
                                        {entities.map((entity) => (
                                            <DropdownMenuItem
                                                key={entity.id}
                                                onClick={() =>
                                                    handleEntityChange(
                                                        entity.id,
                                                    )
                                                }
                                                className="flex items-center gap-2 text-sm focus:bg-gray-100 dark:focus:bg-gray-700 dark:focus:text-gray-100"
                                            >
                                                <EntityIcon
                                                    entity={entity}
                                                    size="xs"
                                                />
                                                {t(entity.name)}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <button
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 text-xs cursor-default"
                                    aria-label={t("Select entity")}
                                    tabIndex={-1}
                                >
                                    <div className="flex items-center gap-2">
                                        {selectedEntityId ? (
                                            <>
                                                <span className="hidden sm:inline">
                                                    {t("Chatting with")}{" "}
                                                    {t(
                                                        entities.find(
                                                            (e) =>
                                                                e.id ===
                                                                selectedEntityId,
                                                        )?.name,
                                                    )}
                                                </span>
                                                <span className="sm:hidden">
                                                    {t(
                                                        entities.find(
                                                            (e) =>
                                                                e.id ===
                                                                selectedEntityId,
                                                        )?.name,
                                                    )}
                                                </span>
                                                <EntityIcon
                                                    entity={entities.find(
                                                        (e) =>
                                                            e.id ===
                                                            selectedEntityId,
                                                    )}
                                                    size="xs"
                                                />
                                            </>
                                        ) : (
                                            <span>{t("Select entity")}</span>
                                        )}
                                    </div>
                                </button>
                            )}
                        </>
                    )}
                    <ChatTopMenuDynamic
                        readOnly={readOnly || !!publicChatOwner}
                    />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <button
                        disabled={!chat?.messages?.length}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-700"
                        onClick={handleExportActiveChat}
                        title={
                            chat?.messages?.length
                                ? t("Export")
                                : `${t("Export")} - ${t("Empty chat")}`
                        }
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">{t("Export")}</span>
                    </button>
                    {/* Unified Sharing Control */}
                    {isChatOwner ? (
                        // Owner: Show share button or shared dropdown
                        isShared ? (
                            <DropdownMenu>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    className={`flex items-center justify-center px-3 py-1.5 rounded-md transition-colors border text-xs sm:w-20 ${
                                                        copyStatus
                                                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
                                                            : "gap-1 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30"
                                                    }`}
                                                >
                                                    {copyStatus ? (
                                                        <Check className="w-4 h-4" />
                                                    ) : (
                                                        <>
                                                            <Users className="w-4 h-4 flex-shrink-0" />
                                                            <span className="hidden sm:inline whitespace-nowrap">
                                                                {t("Shared")}
                                                            </span>
                                                        </>
                                                    )}
                                                </button>
                                            </DropdownMenuTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t("Shared chat options")}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <DropdownMenuContent
                                    align={isRTL ? "start" : "end"}
                                >
                                    <DropdownMenuItem
                                        onClick={handleCopyUrl}
                                        className="flex items-center gap-2"
                                    >
                                        <Copy className="w-4 h-4" />
                                        <span>{t("Copy Share URL")}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() =>
                                            setShowUnshareConfirm(true)
                                        }
                                        className="flex items-center gap-2 text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                                    >
                                        <Users className="w-4 h-4" />
                                        <span>{t("Unshare")}</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            // Not shared: Show share button
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            disabled={readOnly}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={handleShare}
                                        >
                                            <Users className="w-4 h-4" />
                                            <span className="hidden sm:inline">
                                                {t("Share")}
                                            </span>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Share this chat")}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )
                    ) : (
                        // Viewer: Show read-only shared indicator
                        isShared && (
                            <div
                                className="flex items-center gap-1 px-3 py-1.5 rounded-md border bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 text-xs cursor-default"
                                title={`${t("Shared by")} ${publicChatOwner?.name || publicChatOwner?.username || ""}`}
                            >
                                <Users className="w-4 h-4" />
                                <span className="hidden sm:inline">
                                    {t("Shared")}
                                </span>
                            </div>
                        )
                    )}
                    <button
                        disabled={readOnly || !!publicChatOwner}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-700"
                        onClick={() => {
                            setShowDeleteConfirm(true);
                        }}
                        title={t("Clear this chat")}
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">
                            {t("Clear this chat")}
                        </span>
                    </button>
                </div>
            </div>
            <div className="grow overflow-auto">
                <ChatContent
                    viewingChat={viewingChat}
                    streamingEnabled={user.streamingEnabled}
                    selectedEntityId={selectedEntityId}
                    entities={entities}
                    entityIconSize="lg"
                />
            </div>

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
