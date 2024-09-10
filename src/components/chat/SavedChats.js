import { useTranslation } from "react-i18next";
import {
    useAddChat,
    useDeleteChat,
    useGetChats,
    useSetActiveChatId,
    useUpdateChat,
} from "../../../app/queries/chats";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import React, { useState } from "react";
import { isValidObjectId } from "../../utils/helper";
import { BotIcon, EditIcon, TrashIcon, UserIcon, XIcon } from "lucide-react";
import classNames from "../../../app/utils/class-names";
import Loader from "../../../app/components/loader";

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
    const { data: savedChats, isLoading: areChatsLoading } = useGetChats();
    const setActiveChatId = useSetActiveChatId();
    const router = useRouter();
    const addChat = useAddChat();
    const updateChat = useUpdateChat();

    const [editingId, setEditingId] = useState(null);
    const [editedName, setEditedName] = useState("");

    const handleCreateNewChat = async () => {
        try {
            const { _id } = await addChat.mutateAsync({ messages: [] });
            router.push(`/chat/${String(_id)}`);
        } catch (error) {
            console.error("Error adding chat:", error);
        }
    };

    const handleDelete = async (chatId, e) => {
        e.stopPropagation();

        const userConfirmed = window.confirm(
            t("Are you sure you want to delete this chat?"),
        );
        if (!userConfirmed) return;

        try {
            if (!chatId) return;
            await deleteChat.mutateAsync({ chatId });
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

    const categorizeChats = (chats) => {
        const categories = {
            today: [],
            yesterday: [],
            thisWeek: [],
            thisMonth: [],
            older: [],
        };

        const now = dayjs();
        chats.forEach((chat) => {
            const chatDate = dayjs(chat.createdAt);
            if (chatDate.isSame(now, "day")) {
                categories.today.push(chat);
            } else if (chatDate.isSame(now.subtract(1, "day"), "day")) {
                categories.yesterday.push(chat);
            } else if (chatDate.isAfter(now.subtract(7, "days"), "day")) {
                categories.thisWeek.push(chat);
            } else if (chatDate.isSame(now, "month")) {
                categories.thisMonth.push(chat);
            } else {
                categories.older.push(chat);
            }
        });

        return categories;
    };

    const categorizedChats = categorizeChats(savedChats || []);
    const savedChatCount = savedChats?.length || 0;

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
                                                console.log("chat._od", editingId, chat._id);
                                                try {
                                                    const chatId = chat._id;
                                                    if (!chatId || !isValidObjectId(chatId))
                                                        return;
                                                    await setActiveChatId.mutateAsync(chatId);
                                                    router.push(`/chat/${chatId}`);
                                                } catch (error) {
                                                    console.error(
                                                        "Failed to set active chat ID:",
                                                        error,
                                                        chat,
                                                    );
                                                }
                                            }
                                        }}
                                        className="font-semibold text-md relative grow text-start hover:text-sky-500 cursor-pointer">
                                        {t(chat.title) || t("New Chat")}
                                    </h3>
                                )}
                                <div className={
                                    classNames(
                                        editingId === chat._id ? "flex" : "hidden group-hover:flex",
                                        "items-center gap-1 -mt-5 -me-2",
                                    )}>
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
                                        onClick={(e) => handleDelete(chat._id, e)}
                                        className={classNames(
                                            "text-gray-400 hover:text-red-500",
                                            editingId === chat._id ? "hidden" : "block",
                                        )}

                                    >
                                        <TrashIcon
                                            className="h-3 w-3 flex-shrink-0"
                                        />
                                    </button>
                                </div>
                            </div>
                            <div className="flex justify-between items-center pb-2 overflow-hidden text-start w-full">
                                <ul className="w-full">
                                    {chat?.messages
                                        ?.slice(-3)
                                        .map((m, index) => (
                                            <li
                                                key={index}
                                                className="text-xs text-gray-500 flex gap-1 items-center overflow-auto"
                                            >
                                                <div className="basis-4 flex items-center gap-1">
                                                    {m?.sender === "user" ? <UserIcon className="h-3 w-3 text-sky-500" /> : <BotIcon className="h-3 w-3 text-sky-500" />}:
                                                </div>
                                                <div className="grow truncate">{m?.payload}</div>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                            <span className="text-xs absolute right-2 bottom-2 text-gray-400 text-right">
                                {dayjs(chat.createdAt).fromNow()}
                            </span>
                        </div>
                    ),
            )}
        </div>
    );

    const getCategoryTitle = (key, count) => `${CATEGORIES[key]} (${count})`;

    if (areChatsLoading) {
        return <Loader />
    }

    return (
        <div className={`${isDocked ? "text-xs" : ""}`}>
            <div className="mb-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-lg font-semibold">
                            {t("Chat history")}
                        </h1>

                        <div className="text-sm text-gray-500">
                            {savedChatCount} {t("chats")}
                        </div>
                    </div>

                    <button onClick={handleCreateNewChat} className="lb-primary flex items-center gap-2 ">
                        <PlusIcon className="h-4 w-4" />
                        {t("New Chat")}
                    </button>
                </div>
            </div>
            <div className="chats">
                {Object.entries(categorizedChats).map(
                    ([category, chats]) =>
                        chats.length > 0 && (
                            <div key={category}>
                                <h2 className="text-md font-semibold mt-4 mb-2 border-b pb-1">
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
        </div>
    );
}

export default SavedChats;
