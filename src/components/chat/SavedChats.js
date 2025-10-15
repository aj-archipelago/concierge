import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import i18next from "i18next";
import {
    EditIcon,
    MoreVertical,
    XIcon,
    UserCircle,
    Trash2,
    Plus,
    Download,
    Upload,
    CheckSquare,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";
import Loader from "../../../app/components/loader";
import {
    useAddChat,
    useDeleteChat,
    useGetChats,
    useSetActiveChatId,
    useUpdateChat,
} from "../../../app/queries/chats";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import { isValidObjectId } from "../../utils/helper";
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

dayjs.extend(relativeTime);

const CATEGORIES = {
    today: "Today",
    yesterday: "Yesterday",
    thisWeek: "This Week",
    thisMonth: "This Month",
    older: "Older",
};

function SavedChats({ displayState }) {
    const { t } = useTranslation();
    const deleteChat = useDeleteChat();
    const isDocked = displayState === "docked";
    const {
        data,
        isLoading: areChatsLoading,
        fetchNextPage,
        isFetchingNextPage,
        hasNextPage,
    } = useGetChats();
    const setActiveChatId = useSetActiveChatId();
    const router = useRouter();
    const addChat = useAddChat();
    const updateChat = useUpdateChat();
    const { getLogo } = config.global;
    const [editingId, setEditingId] = useState(null);
    const [editedName, setEditedName] = useState("");
    const { language } = i18next;
    const [deleteChatId, setDeleteChatId] = useState(null);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
    const stickyExportButtonRef = useRef(null);
    const importInputRef = useRef(null);

    const allChats = useMemo(() => {
        try {
            const pages = data?.pages || [];
            return pages.flat().filter(Boolean);
        } catch (e) {
            return [];
        }
    }, [data]);

    const toggleSelect = (chatId) => {
        if (!chatId) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(chatId)) {
                next.delete(chatId);
            } else {
                next.add(chatId);
            }
            return next;
        });
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);

        // Close dialog and reset selection immediately for snappy UX
        setIsBulkDialogOpen(false);
        setSelectedIds(new Set());
        setSelectMode(false);

        // Fire deletions in parallel in the background; log any failures
        Promise.allSettled(
            ids.map((id) => deleteChat.mutateAsync({ chatId: id })),
        ).then((results) => {
            const failed = results.filter((r) => r.status === "rejected");
            if (failed.length > 0) {
                console.error(
                    "Failed to bulk delete chats:",
                    failed.map((f) => f.reason || f),
                );
                window.alert(
                    `${ids.length - failed.length} of ${ids.length} chats deleted. ${failed.length} failed.`,
                );
            }
        });
    };

    // Improve keyboard experience: focus the sticky Export button when entering select mode
    useEffect(() => {
        if (selectMode && stickyExportButtonRef.current) {
            stickyExportButtonRef.current.focus();
        }
    }, [selectMode]);

    const handleExportSelected = () => {
        try {
            const byId = new Map(allChats.map((c) => [String(c._id), c]));
            const selected = Array.from(selectedIds)
                .map((id) => byId.get(String(id)))
                .filter(Boolean);
            if (selected.length === 0) return;

            const now = new Date();
            const stamp = now.toISOString().replace(/[:T]/g, "-").split(".")[0];
            const blob = new Blob([JSON.stringify(selected, null, 2)], {
                type: "application/json",
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `chats-export-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (err) {
            console.error("Failed to export chats:", err);
        }
    };

    const handleImportClick = () => {
        if (importInputRef.current) {
            importInputRef.current.click();
        }
    };

    const handleImportFile = async (event) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (parseErr) {
                window.alert(
                    "The selected file is not valid JSON. The file should contain either a chat object, an array of chats, or an object with a 'chats' array. Please check the file format and try again.",
                );
                if (importInputRef.current) importInputRef.current.value = "";
                return;
            }

            // Normalize to an array of chats
            if (
                parsed &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
            ) {
                if (Array.isArray(parsed.chats)) parsed = parsed.chats;
                else parsed = [parsed];
            }
            if (!Array.isArray(parsed)) {
                window.alert(
                    'The file format is not supported. Please upload a file exported from this app, or a file containing your chats in JSON format. For example:\n\n[\n  { "title": "Chat Title", "messages": [ ... ] }\n]',
                );
                if (importInputRef.current) importInputRef.current.value = "";
                return;
            }

            for (const chat of parsed) {
                try {
                    await addChat.mutateAsync({
                        messages: Array.isArray(chat?.messages)
                            ? chat.messages
                            : [],
                        title:
                            typeof chat?.title === "string" ? chat.title : "",
                    });
                } catch (e) {
                    console.error("Failed to import one chat:", e);
                }
            }

            if (importInputRef.current) importInputRef.current.value = "";
        } catch (err) {
            console.error("Failed to import chats:", err);
        }
    };

    const categorizedChats = useMemo(() => {
        const categories = {
            today: [],
            yesterday: [],
            thisWeek: [],
            thisMonth: [],
            older: [],
        };

        if (!data) return categories;

        const now = dayjs();
        data.pages.forEach((page) => {
            page.forEach((chat) => {
                const chatDate = dayjs(chat.createdAt);
                if (chatDate.isSame(now, "day")) {
                    categories.today.push(chat);
                } else if (chatDate.isSame(now.subtract(1, "day"), "day")) {
                    categories.yesterday.push(chat);
                } else if (chatDate.isSame(now, "week")) {
                    categories.thisWeek.push(chat);
                } else if (chatDate.isSame(now, "month")) {
                    categories.thisMonth.push(chat);
                } else {
                    categories.older.push(chat);
                }
            });
        });

        return categories;
    }, [data]);

    const handleCreateNewChat = async () => {
        try {
            const { _id } = await addChat.mutateAsync({ messages: [] });
            router.push(`/chat/${String(_id)}`);
        } catch (error) {
            console.error("Error adding chat:", error);
        }
    };

    const handleDelete = async (chatId) => {
        try {
            if (!chatId) return;
            await deleteChat.mutateAsync({ chatId });
            setDeleteChatId(null);
        } catch (error) {
            console.error("Failed to delete chat", error);
        }
    };

    const handleSaveEdit = async (chat) => {
        try {
            if (!chat._id || !editedName) return;
            await updateChat.mutateAsync({
                chatId: chat._id,
                title: editedName,
                titleSetByUser: true,
            });
            setEditingId(null);
        } catch (error) {
            console.error("Failed to update chat title", error);
        }
    };

    const renderChatElements = (chats) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
            {chats.map(
                (chat) =>
                    chat &&
                    chat._id &&
                    isValidObjectId(chat._id) && (
                        <div
                            key={chat._id}
                            className="flex flex-col group text-start p-4 border rounded-lg relative min-h-[135px] overflow-auto"
                        >
                            <div className="flex justify-between mb-2 w-full">
                                <div className="flex items-start gap-2 w-full">
                                    {selectMode && (
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(chat._id)}
                                            onChange={() =>
                                                toggleSelect(chat._id)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            className="mt-1"
                                        />
                                    )}
                                    {chat._id && editingId === chat._id ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            className="font-semibold underline focus:ring-0 text-md relative w-full p-0 bg-transparent border-0 ring-0 grow"
                                            value={editedName}
                                            onChange={(e) =>
                                                setEditedName(e.target.value)
                                            }
                                            onBlur={() => {
                                                handleSaveEdit(chat);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    handleSaveEdit(chat);
                                                }
                                                if (e.key === "Escape") {
                                                    setEditingId(null);
                                                }
                                            }}
                                        />
                                    ) : (
                                        <h3
                                            onClick={async () => {
                                                if (selectMode) return; // disable navigation during multiselect
                                                if (editingId !== chat._id) {
                                                    try {
                                                        const chatId = chat._id;
                                                        if (
                                                            !chatId ||
                                                            !isValidObjectId(
                                                                chatId,
                                                            )
                                                        )
                                                            return;
                                                        await setActiveChatId.mutateAsync(
                                                            chatId,
                                                        );
                                                        router.push(
                                                            `/chat/${chatId}`,
                                                        );
                                                    } catch (error) {
                                                        console.error(
                                                            "Failed to set active chat ID:",
                                                            error,
                                                            chat,
                                                        );
                                                    }
                                                }
                                            }}
                                            className="font-semibold text-md relative grow text-start hover:text-sky-500 cursor-pointer"
                                        >
                                            {t(chat.title) || t("New Chat")}
                                        </h3>
                                    )}
                                </div>
                                {!selectMode && (
                                    <div
                                        className={classNames(
                                            editingId === chat._id
                                                ? "flex"
                                                : "hidden sm:group-hover:flex",
                                            "items-center gap-1 -mt-5 -me-2",
                                        )}
                                    >
                                        {editingId === chat._id ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingId(null);
                                                }}
                                                className="text-gray-400 hover:text-gray-700"
                                            >
                                                <XIcon className="h-3 w-3" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingId(chat._id);
                                                    setEditedName(chat.title);
                                                }}
                                                className="text-gray-400 hover:text-gray-700"
                                            >
                                                <EditIcon className="h-3 w-3" />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteChatId(chat._id);
                                            }}
                                            className={classNames(
                                                "text-gray-400 hover:text-red-500",
                                                editingId === chat._id
                                                    ? "hidden"
                                                    : "block",
                                            )}
                                        >
                                            <Trash2 className="h-3 w-3 flex-shrink-0" />
                                        </button>
                                    </div>
                                )}
                                {!selectMode && editingId !== chat._id && (
                                    <div className="block sm:hidden -me-2 -mt-2">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger className="">
                                                <MoreVertical className="h-3 w-3 text-gray-400" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent>
                                                {/* add Edit and taxonomy options here */}
                                                <DropdownMenuItem
                                                    className="text-sm flex items-center gap-2"
                                                    onClick={() => {
                                                        setEditingId(chat._id);
                                                        setEditedName(
                                                            chat.title,
                                                        );
                                                    }}
                                                >
                                                    <EditIcon className="h-3 w-3" />
                                                    {t("Edit title")}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-sm flex items-center gap-2"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteChatId(
                                                            chat._id,
                                                        );
                                                    }}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                    {t("Delete chat")}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-center pb-2 overflow-hidden text-start w-full">
                                <ul className="w-full">
                                    {!chat?.messages?.length && (
                                        <li className="text-xs text-gray-500 flex gap-1 items-center overflow-auto">
                                            {t("Empty chat")}
                                        </li>
                                    )}
                                    {chat?.messages
                                        ?.slice(-3)
                                        .map((m, index) => (
                                            <li
                                                key={index}
                                                className={classNames(
                                                    "text-xs text-gray-500 dark:text-gray-400 flex gap-1 items-center overflow-auto",
                                                    m?.sender === "user"
                                                        ? "bg-white dark:bg-gray-800"
                                                        : "bg-sky-50 dark:bg-gray-700",
                                                )}
                                            >
                                                <div className="basis-[1rem] flex items-center gap-1">
                                                    {m?.sender === "user" ? (
                                                        <UserCircle className="w-4 h-4 text-gray-300" />
                                                    ) : (
                                                        <img
                                                            src={getLogo(
                                                                language,
                                                            )}
                                                            alt="Logo"
                                                            className={classNames(
                                                                "w-4 h-4",
                                                            )}
                                                        />
                                                    )}
                                                </div>
                                                <div
                                                    className={classNames(
                                                        "basis-[calc(100%-1rem)] truncate py-0.5",
                                                    )}
                                                >
                                                    {m?.payload}
                                                </div>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                            <span className="text-[.7rem] absolute right-2 bottom-2 text-gray-400 text-right">
                                {dayjs(chat.createdAt).fromNow()}
                            </span>
                        </div>
                    ),
            )}
        </div>
    );

    const getCategoryTitle = (key, count) => `${CATEGORIES[key]} (${count})`;

    const { ref, inView } = useInView({
        threshold: 0,
    });

    useEffect(() => {
        if (inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

    if (areChatsLoading) {
        return <Loader />;
    }

    return (
        <div
            className={`${isDocked ? "text-xs" : ""} pb-4 ${selectMode ? "pb-24" : ""}`}
        >
            <div className="mb-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-lg font-semibold">
                            {t("Chat history")}
                        </h1>

                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {data?.pages.flat().length || 0} {t("chats")}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!selectMode ? (
                            <>
                                <button
                                    onClick={() => setSelectMode(true)}
                                    className="lb-outline flex items-center gap-2"
                                >
                                    <CheckSquare className="h-4 w-4" />
                                    {t("Select")}
                                </button>
                                <input
                                    ref={importInputRef}
                                    type="file"
                                    accept="application/json"
                                    className="hidden"
                                    onChange={handleImportFile}
                                />
                                <button
                                    onClick={handleImportClick}
                                    className="lb-outline-secondary font-medium flex items-center gap-2"
                                >
                                    <Upload className="h-4 w-4" />
                                    {t("Import JSON")}
                                </button>
                                <button
                                    onClick={handleCreateNewChat}
                                    className="lb-primary flex items-center gap-2 "
                                >
                                    <Plus className="h-4 w-4" />
                                    {t("New Chat")}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={handleExportSelected}
                                    disabled={selectedIds.size === 0}
                                    className="lb-secondary font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download className="h-4 w-4" />
                                    {t("Export JSON")} ({selectedIds.size})
                                </button>
                                <button
                                    onClick={() => setIsBulkDialogOpen(true)}
                                    disabled={selectedIds.size === 0}
                                    className="lb-outline-danger flex items-center gap-2 disabled:cursor-not-allowed"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {t("Delete")} ({selectedIds.size})
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectMode(false);
                                        setSelectedIds(new Set());
                                    }}
                                    className="lb-outline flex items-center gap-2"
                                >
                                    <XIcon className="h-4 w-4" />
                                    {t("Cancel")}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="chats">
                {Object.entries(categorizedChats).map(
                    ([category, chats]) =>
                        chats.length > 0 && (
                            <div key={category}>
                                <h2 className="text-md font-semibold mt-4 mb-2 border-b border-gray-200 dark:border-gray-700 pb-1">
                                    {t(
                                        getCategoryTitle(
                                            category,
                                            chats.length,
                                        ),
                                    )}
                                </h2>
                                {renderChatElements(chats)}
                            </div>
                        ),
                )}
            </div>
            {hasNextPage && (
                <div
                    ref={ref}
                    className="h-10 flex items-center justify-center"
                >
                    {isFetchingNextPage && <Loader />}
                </div>
            )}

            <AlertDialog
                open={deleteChatId !== null}
                onOpenChange={() => setDeleteChatId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Delete Chat?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete this chat? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            className="lb-danger dark:bg-rose-600 dark:hover:bg-rose-700 dark:text-white"
                            onClick={() => handleDelete(deleteChatId)}
                        >
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {selectMode && (
                <div
                    className="fixed bottom-4 left-0 right-0 z-40 flex justify-center pointer-events-none"
                    role="region"
                    aria-label="Bulk actions"
                >
                    <div className="pointer-events-auto bg-white dark:bg-gray-900 border rounded-md shadow-md px-3 py-2 flex items-center gap-2">
                        <span className="text-sm">
                            {t("Selected")} {selectedIds.size}
                        </span>
                        <button
                            ref={stickyExportButtonRef}
                            onClick={handleExportSelected}
                            disabled={selectedIds.size === 0}
                            className="lb-secondary flex items-center gap-2 disabled:cursor-not-allowed"
                        >
                            <Download className="h-4 w-4" />
                            {t("Export JSON")}
                        </button>
                        <button
                            onClick={() => setIsBulkDialogOpen(true)}
                            disabled={selectedIds.size === 0}
                            className="lb-danger flex items-center gap-2 disabled:cursor-not-allowed"
                        >
                            <Trash2 className="h-4 w-4" />
                            {t("Delete")}
                        </button>
                        <button
                            onClick={() => {
                                setSelectMode(false);
                                setSelectedIds(new Set());
                            }}
                            className="lb-outline flex items-center gap-2"
                        >
                            <XIcon className="h-4 w-4" />
                            {t("Cancel")}
                        </button>
                    </div>
                </div>
            )}

            <AlertDialog
                open={isBulkDialogOpen}
                onOpenChange={setIsBulkDialogOpen}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete selected chats?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete the selected chats? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            className="lb-danger dark:bg-rose-600 dark:hover:bg-rose-700 dark:text-white"
                            onClick={handleBulkDelete}
                        >
                            {t("Delete")} ({selectedIds.size})
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default SavedChats;
