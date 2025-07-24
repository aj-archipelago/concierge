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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
                                            if (editingId !== chat._id) {
                                                try {
                                                    const chatId = chat._id;
                                                    if (
                                                        !chatId ||
                                                        !isValidObjectId(chatId)
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
                                {editingId !== chat._id && (
                                    <div className="block sm:hidden -me-2 -mt-2">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger className="">
                                                <MoreVertical className="h-3 w-3 text-gray-400" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent>
                                                {/* add Edit and taxonomy options here */}
                                                <DropdownMenuItem
                                                    className="text-sm"
                                                    onClick={() => {
                                                        setEditingId(chat._id);
                                                        setEditedName(
                                                            chat.title,
                                                        );
                                                    }}
                                                >
                                                    {t("Edit title")}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteChatId(
                                                            chat._id,
                                                        );
                                                    }}
                                                >
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
        <div className={`${isDocked ? "text-xs" : ""} pb-4`}>
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

                    <button
                        onClick={handleCreateNewChat}
                        className="lb-primary flex items-center gap-2 "
                    >
                        <Plus className="h-4 w-4" />
                        {t("New Chat")}
                    </button>
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
                            onClick={() => handleDelete(deleteChatId)}
                        >
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default SavedChats;
