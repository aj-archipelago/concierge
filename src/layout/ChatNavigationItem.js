import { EditIcon, Trash2, XIcon } from "lucide-react";
import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
    useUpdateChat,
    DEFAULT_CHAT_MESSAGES_LIMIT,
} from "../../app/queries/chats";
import { isClientOnlyChatId } from "../../app/utils/chatClientIds";
import { useQueryClient } from "@tanstack/react-query";
import axios from "../../app/utils/axios-client";
import classNames from "../../app/utils/class-names";
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

const ChatNavigationItem = ({
    subItem,
    pathname,
    router,
    handleDeleteChat,
    isCollapsed,
}) => {
    const [editingId, setEditingId] = useState(null);
    const [editedName, setEditedName] = useState("");
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const { t } = useTranslation();
    const updateChat = useUpdateChat();
    const queryClient = useQueryClient();
    const hoverTimeoutRef = useRef(null);
    const prefetchedChatsRef = useRef(new Set());

    // Prefetch chat data on hover for instant switching
    const handleMouseEnter = () => {
        const chatId = subItem?.key;
        if (!chatId || isClientOnlyChatId(chatId)) return;

        // Already prefetched
        if (prefetchedChatsRef.current.has(chatId)) return;

        // Prefetch after 100ms hover (debounce)
        hoverTimeoutRef.current = setTimeout(async () => {
            if (prefetchedChatsRef.current.has(chatId)) return;

            try {
                prefetchedChatsRef.current.add(chatId);

                // Check if already cached
                const cached = queryClient.getQueryData(["chat", chatId]);
                if (cached && !cached.isChatLoading) return;

                // Prefetch the data
                await queryClient.prefetchQuery({
                    queryKey: ["chat", chatId],
                    queryFn: async () => {
                        const response = await axios.get(
                            `/api/chats/${String(chatId)}?limit=${DEFAULT_CHAT_MESSAGES_LIMIT}`,
                        );
                        return response.data;
                    },
                    staleTime: 1000 * 60 * 5, // 5 minutes
                });
            } catch (e) {
                // Silent fail - don't block navigation
                prefetchedChatsRef.current.delete(chatId);
            }
        }, 100);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
    };

    const handleSaveEdit = (item) => {
        updateChat.mutateAsync({
            chatId: item.key,
            title: editedName,
            titleSetByUser: true,
        });
        setEditingId(null);
    };

    return (
        <>
            <li
                data-testid="sidebar-chat-item"
                data-chat-id={subItem?.key}
                className={classNames(
                    "group flex items-center justify-between rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 my-0.5",
                    pathname === subItem?.href
                        ? "bg-gray-100 dark:bg-gray-700"
                        : "",
                )}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={() => {
                    if (subItem.href && editingId !== subItem.key) {
                        setEditingId(null);
                        // Navigate immediately - active chat ID will be updated
                        // asynchronously in the background by Chat.js component
                        router.push(subItem.href);
                    }
                }}
            >
                <div
                    className={`h-10 py-2.5 px-2 text-xs flex items-center justify-between gap-2 w-full`}
                    dir={document.documentElement.dir}
                >
                    <div className="flex items-center gap-2 overflow-auto">
                        {editingId && editingId === subItem.key ? (
                            <>
                                <div className="basis-3">
                                    <XIcon
                                        className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-pointer invisible group-hover:visible"
                                        style={{
                                            left:
                                                document.documentElement.dir ===
                                                "rtl"
                                                    ? "unset"
                                                    : "0.5rem",
                                            right:
                                                document.documentElement.dir ===
                                                "rtl"
                                                    ? "0.5rem"
                                                    : "unset",
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingId(null);
                                            setEditedName(subItem.name);
                                        }}
                                    />
                                </div>
                                <input
                                    onBlur={() => {
                                        setEditingId(null);
                                        handleSaveEdit(subItem);
                                    }}
                                    autoFocus
                                    type="text"
                                    className="py-1 border-0 w-full text-base md:text-xs bg-gray-50 dark:bg-gray-600 p-0 font-medium underline ring-0 focus:ring-0 focus:outline-none text-gray-900 dark:text-gray-100"
                                    value={editedName}
                                    onChange={(e) =>
                                        setEditedName(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter")
                                            handleSaveEdit(subItem);
                                        if (e.key === "Escape")
                                            setEditingId(null);
                                    }}
                                />
                            </>
                        ) : (
                            <>
                                <div className="basis-3 hidden sm:block">
                                    <EditIcon
                                        data-testid="sidebar-chat-edit"
                                        className={classNames(
                                            "h-3 w-3 text-gray-400 hover:text-gray-600 cursor-pointer",
                                            !isCollapsed
                                                ? "invisible group-hover:visible"
                                                : "invisible",
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingId(subItem.key);
                                            setEditedName(subItem.name);
                                        }}
                                    />
                                </div>
                                <div className="truncate">
                                    {t(subItem.name || "")}
                                </div>
                            </>
                        )}
                    </div>
                    {editingId !== subItem.key && (
                        <div className="basis-3 text-end hidden sm:block">
                            <Trash2
                                data-testid="sidebar-chat-delete"
                                className={classNames(
                                    "h-3 w-3 text-gray-400 cursor-pointer hover:text-red-600",
                                    !isCollapsed
                                        ? "invisible group-hover:visible"
                                        : "invisible",
                                )}
                                aria-hidden="true"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDeleteDialog(true);
                                }}
                            />
                        </div>
                    )}
                </div>
            </li>

            <AlertDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete this chat?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "This will permanently delete this chat and all its messages. This action cannot be undone. Continue?",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={() => {
                                handleDeleteChat(subItem.key);
                                setShowDeleteDialog(false);
                            }}
                        >
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

export default React.memo(
    ChatNavigationItem,
    (prev, next) =>
        prev.subItem?.key === next.subItem?.key &&
        prev.subItem?.name === next.subItem?.name &&
        prev.subItem?.href === next.subItem?.href &&
        prev.pathname === next.pathname &&
        prev.isCollapsed === next.isCollapsed,
);
