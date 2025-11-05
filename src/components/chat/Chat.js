"use client";

import { useTranslation } from "react-i18next";
import ChatContent from "./ChatContent";
import dynamic from "next/dynamic";
import {
    useUpdateActiveChat,
    useGetActiveChat,
    useGetChatById,
    useSetActiveChatId,
} from "../../../app/queries/chats";
import { useContext, useState, useEffect, useRef } from "react";
import { AuthContext } from "../../App";
import { useParams } from "next/navigation";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import EntityIcon from "./EntityIcon";
import { Share, Trash2, Check, Download } from "lucide-react";
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
    const { t } = useTranslation();
    const params = useParams();
    const urlChatId = params?.id;
    const updateActiveChat = useUpdateActiveChat();
    const setActiveChatId = useSetActiveChatId();
    const { data: activeChat } = useGetActiveChat();
    const { data: urlChat } = useGetChatById(urlChatId);

    const chat = getChatToUse(urlChatId, urlChat, viewingChat, activeChat);
    const activeChatId = chat?._id;
    const { user } = useContext(AuthContext);
    const { readOnly } = viewingChat || {};
    const publicChatOwner = viewingChat?.owner;

    // Track the last URL chat ID we've synced to prevent duplicate calls
    const lastSyncedUrlChatId = useRef(null);
    const isSyncingRef = useRef(false);

    // Reset sync state when active chat matches URL (sync completed or was already in sync)
    // This effect handles the case where activeChat updates to match urlChatId
    useEffect(() => {
        if (urlChatId && urlChatId === activeChat?._id) {
            lastSyncedUrlChatId.current = urlChatId;
            isSyncingRef.current = false;
        }
    }, [urlChatId, activeChat?._id]);

    // Sync active chat ID with URL when URL changes (e.g., browser back/forward)
    // This effect handles the actual sync operation when urlChatId changes
    useEffect(() => {
        // Don't sync if already syncing or if pending
        if (isSyncingRef.current || setActiveChatId.isPending) {
            return;
        }

        // Don't sync if already synced to this URL chat ID
        if (urlChatId === lastSyncedUrlChatId.current) {
            return;
        }

        // Don't sync if active chat already matches URL
        if (urlChatId === activeChat?._id) {
            lastSyncedUrlChatId.current = urlChatId;
            return;
        }

        // Only sync if URL chat ID is different from current active chat
        // and all conditions are met (not viewing, urlChat exists, not read-only)
        if (
            urlChatId &&
            urlChatId !== activeChat?._id &&
            !viewingChat &&
            urlChat &&
            !urlChat.readOnly
        ) {
            // URL chat ID is different from current active chat, update it
            lastSyncedUrlChatId.current = urlChatId;
            isSyncingRef.current = true;
            setActiveChatId.mutate(urlChatId, {
                onSettled: () => {
                    isSyncingRef.current = false;
                },
            });
        }
    }, [
        urlChatId,
        activeChat?._id,
        viewingChat,
        urlChat,
        setActiveChatId.isPending,
        setActiveChatId,
    ]);
    const [selectedEntityId, setSelectedEntityId] = useState(
        chat?.selectedEntityId || "",
    );
    const [showPublicConfirm, setShowPublicConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

    const handleShareOrCopy = async () => {
        const shareUrl = `${window.location.origin}/chat/${chat._id}`;

        if (chat?.isPublic) {
            await navigator.clipboard.writeText(shareUrl);
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
        } else {
            setShowPublicConfirm(true);
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

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between items-center">
                <ChatTopMenuDynamic />
                {publicChatOwner && (
                    <div className="text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded shadow-sm">
                        {t("Shared by")}{" "}
                        <span className="font-bold text-sky-600">
                            {publicChatOwner.name || publicChatOwner.username}
                        </span>
                    </div>
                )}
                <div className="flex gap-2 items-center">
                    <Select
                        value={selectedEntityId || defaultAiName}
                        onValueChange={handleEntityChange}
                        disabled={readOnly}
                    >
                        <SelectTrigger
                            className={`w-auto text-sm h-7 lb-outline ${readOnly ? "cursor-not-allowed opacity-50" : ""}`}
                            aria-label={t("Select entity")}
                        >
                            <div className="flex items-center gap-2 pr-1">
                                {selectedEntityId ? (
                                    <>
                                        <EntityIcon
                                            entity={entities.find(
                                                (e) =>
                                                    e.id === selectedEntityId,
                                            )}
                                            size="xs"
                                        />
                                        <span className="hidden sm:inline">
                                            {t(
                                                entities.find(
                                                    (e) =>
                                                        e.id ===
                                                        selectedEntityId,
                                                )?.name,
                                            )}
                                        </span>
                                    </>
                                ) : (
                                    <SelectValue
                                        placeholder={t("Select entity")}
                                    />
                                )}
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            {entities.map((entity) => (
                                <SelectItem
                                    className="text-sm focus:bg-gray-100 dark:focus:bg-gray-700 dark:focus:text-gray-100"
                                    key={entity.id}
                                    value={entity.id}
                                >
                                    <div className="flex items-center gap-2">
                                        <EntityIcon entity={entity} size="xs" />
                                        {t(entity.name)}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
                    <button
                        disabled={readOnly}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs"
                        onClick={handleShareOrCopy}
                        title={
                            chat?.isPublic ? t("Copy Share URL") : t("Share")
                        }
                    >
                        {copyStatus ? (
                            <Check className="w-4 h-4 text-green-500" />
                        ) : (
                            <Share className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">
                            {chat?.isPublic ? t("Copy Share URL") : t("Share")}
                        </span>
                    </button>
                    <button
                        disabled={readOnly}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs"
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
        </div>
    );
}

export default Chat;
