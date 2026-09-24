import {
    Archive,
    Copy,
    Pencil,
    Pin,
    Share2,
    Trash2,
    XIcon,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    useUpdateChat,
    DEFAULT_CHAT_MESSAGES_LIMIT,
} from "../../app/queries/chats";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ShareDialog from "@/components/share/ShareDialog";
import { toast } from "react-toastify";
import { formatCompactRelativeTime } from "../utils/formatCompactRelativeTime";
import { LanguageContext } from "../contexts/LanguageProvider";
import ChatTaskStatusDot from "./ChatTaskStatusDot";

const ChatNavigationItem = ({
    subItem,
    pathname,
    router,
    handleDeleteChat,
    handleArchiveChat,
    isCollapsed,
}) => {
    const [editingId, setEditingId] = useState(null);
    const [editedName, setEditedName] = useState("");
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [contextMenuPos, setContextMenuPos] = useState(null);
    const { t } = useTranslation();
    const { direction = "ltr" } = React.useContext(LanguageContext) || {};
    const updateChat = useUpdateChat();
    const queryClient = useQueryClient();
    const hoverTimeoutRef = useRef(null);
    const prefetchedChatsRef = useRef(new Set());
    const isPinned = Boolean(subItem?.pinned);
    const chatId = subItem?.key;
    const notificationStatus = subItem?.notificationStatus;
    const relativeTime = formatCompactRelativeTime(
        subItem?.lastMessageAt || subItem?.updatedAt,
    );

    useEffect(() => {
        if (!menuOpen) {
            setContextMenuPos(null);
        }
    }, [menuOpen]);

    const handleMouseEnter = () => {
        if (!chatId) return;
        if (prefetchedChatsRef.current.has(chatId)) return;

        hoverTimeoutRef.current = setTimeout(async () => {
            if (prefetchedChatsRef.current.has(chatId)) return;

            try {
                prefetchedChatsRef.current.add(chatId);

                const cached = queryClient.getQueryData(["chat", chatId]);
                if (cached && !cached.isChatLoading) return;

                await queryClient.prefetchQuery({
                    queryKey: ["chat", chatId],
                    queryFn: async () => {
                        const response = await axios.get(
                            `/api/chats/${String(chatId)}?limit=${DEFAULT_CHAT_MESSAGES_LIMIT}`,
                        );
                        return response.data;
                    },
                    staleTime: 1000 * 60 * 5,
                });
            } catch {
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

    const startRename = () => {
        setEditingId(subItem.key);
        setEditedName(subItem.name);
    };

    const handleTogglePin = (e) => {
        e?.stopPropagation?.();
        if (!chatId) return;
        updateChat.mutate({
            chatId,
            pinned: !isPinned,
            pinnedAt: !isPinned ? new Date().toISOString() : null,
        });
    };

    const handleArchive = (e) => {
        e?.stopPropagation?.();
        if (!chatId) return;
        if (handleArchiveChat) {
            handleArchiveChat(chatId);
            return;
        }
        updateChat.mutate({
            chatId,
            archived: true,
            archivedAt: new Date().toISOString(),
            pinned: false,
            pinnedAt: null,
        });
    };

    const handleCopyLink = async (e) => {
        e?.stopPropagation?.();
        if (!subItem?.href || typeof window === "undefined") return;
        try {
            const url = new URL(
                subItem.href,
                window.location.origin,
            ).toString();
            await navigator.clipboard.writeText(url);
            toast.success(t("Link copied"));
        } catch {
            toast.error(t("Failed to copy link"));
        }
    };

    const isActive = pathname === subItem?.href;

    return (
        <>
            <li
                data-testid="sidebar-chat-item"
                data-chat-id={chatId}
                data-pinned={isPinned ? "true" : "false"}
                className={classNames(
                    "group/chat my-0.5 flex h-8 items-center justify-between rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700",
                    isActive ? "bg-gray-100 dark:bg-gray-700" : "",
                )}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenuPos({ x: e.clientX, y: e.clientY });
                    setMenuOpen(true);
                }}
                onClick={() => {
                    if (subItem.href && editingId !== subItem.key) {
                        setEditingId(null);
                        router.push(subItem.href);
                    }
                }}
            >
                <div
                    className="h-full px-2 text-[11px] leading-4 flex items-center justify-between gap-1.5 w-full min-w-0"
                    dir={direction}
                >
                    <div className="flex items-center gap-1.5 overflow-hidden min-w-0 grow">
                        {editingId && editingId === subItem.key ? (
                            <>
                                <button
                                    type="button"
                                    className="shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(null);
                                        setEditedName(subItem.name);
                                    }}
                                >
                                    <XIcon className="h-3 w-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
                                </button>
                                <input
                                    onBlur={() => {
                                        setEditingId(null);
                                        handleSaveEdit(subItem);
                                    }}
                                    autoFocus
                                    type="text"
                                    className="py-0.5 border-0 w-full text-base md:text-[11px] bg-transparent p-0 font-medium underline ring-0 focus:ring-0 focus:outline-none text-gray-900 dark:text-gray-100"
                                    value={editedName}
                                    onChange={(e) =>
                                        setEditedName(e.target.value)
                                    }
                                    onClick={(e) => e.stopPropagation()}
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
                                <ChatTaskStatusDot
                                    status={notificationStatus || "idle"}
                                />
                                {isPinned && (
                                    <Pin
                                        className="h-3 w-3 shrink-0 text-gray-300 dark:text-gray-600"
                                        aria-hidden="true"
                                    />
                                )}
                                <div
                                    className="truncate text-gray-700 dark:text-gray-200"
                                    title={t(subItem.name || "")}
                                >
                                    {t(subItem.name || "")}
                                </div>
                            </>
                        )}
                    </div>
                    {editingId !== subItem.key && (
                        <div className="relative flex items-center justify-end shrink-0 min-w-[2.5rem]">
                            {relativeTime ? (
                                <span
                                    dir="ltr"
                                    className={classNames(
                                        "text-[10px] tabular-nums text-gray-400 dark:text-gray-500 ps-0.5 transition-opacity",
                                        !isCollapsed &&
                                            "group-hover/chat:opacity-0",
                                    )}
                                >
                                    {relativeTime}
                                </span>
                            ) : null}
                            <div
                                className={classNames(
                                    "pointer-events-none absolute inset-y-0 end-0 hidden w-max items-center gap-0 bg-transparent ps-1 opacity-0 transition-opacity sm:flex",
                                    !isCollapsed &&
                                        "group-hover/chat:pointer-events-auto group-hover/chat:opacity-100",
                                )}
                            >
                                <button
                                    type="button"
                                    data-testid="sidebar-chat-pin"
                                    title={isPinned ? t("Unpin") : t("Pin")}
                                    aria-label={
                                        isPinned ? t("Unpin") : t("Pin")
                                    }
                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-transparent text-gray-400 hover:bg-gray-200/70 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-600/50 dark:hover:text-gray-300"
                                    onClick={handleTogglePin}
                                >
                                    <Pin
                                        className={classNames(
                                            "h-3 w-3",
                                            isPinned && "fill-current",
                                        )}
                                    />
                                </button>
                                <button
                                    type="button"
                                    data-testid="sidebar-chat-archive"
                                    title={t("Archive")}
                                    aria-label={t("Archive")}
                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-transparent text-gray-400 hover:bg-gray-200/70 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-600/50 dark:hover:text-gray-300"
                                    onClick={handleArchive}
                                >
                                    <Archive className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </li>

            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-hidden="true"
                        tabIndex={-1}
                        className="sr-only"
                        style={
                            contextMenuPos
                                ? {
                                      position: "fixed",
                                      left: contextMenuPos.x,
                                      top: contextMenuPos.y,
                                      width: 1,
                                      height: 1,
                                  }
                                : undefined
                        }
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    sideOffset={4}
                    className="min-w-[10.5rem] text-xs"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <DropdownMenuItem
                        className="gap-2 text-xs"
                        onClick={handleTogglePin}
                    >
                        <Pin className="h-3.5 w-3.5" />
                        {isPinned ? t("Unpin") : t("Pin")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="gap-2 text-xs"
                        onClick={(e) => {
                            e.stopPropagation();
                            startRename();
                        }}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        {t("Rename")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="gap-2 text-xs"
                        onClick={handleCopyLink}
                    >
                        <Copy className="h-3.5 w-3.5" />
                        {t("Copy link")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="gap-2 text-xs"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShareOpen(true);
                        }}
                    >
                        <Share2 className="h-3.5 w-3.5" />
                        {t("Share")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="gap-2 text-xs"
                        onClick={handleArchive}
                    >
                        <Archive className="h-3.5 w-3.5" />
                        {t("Archive")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="gap-2 text-xs text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteDialog(true);
                        }}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("Delete")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ShareDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                entityType="chat"
                entityId={chatId}
            />

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
        prev.subItem?.pinned === next.subItem?.pinned &&
        prev.subItem?.updatedAt === next.subItem?.updatedAt &&
        prev.subItem?.lastMessageAt === next.subItem?.lastMessageAt &&
        prev.subItem?.notificationStatus === next.subItem?.notificationStatus &&
        prev.pathname === next.pathname &&
        prev.isCollapsed === next.isCollapsed &&
        prev.handleArchiveChat === next.handleArchiveChat &&
        prev.handleDeleteChat === next.handleDeleteChat,
);
