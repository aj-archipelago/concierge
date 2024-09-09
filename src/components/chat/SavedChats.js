import { useTranslation } from "react-i18next";
import {
    useAddChat,
    useDeleteChat,
    useGetChats,
    useSetActiveChatId,
    useUpdateChat,
} from "../../../app/queries/chats";
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import React, { useState } from "react";
import { isValidObjectId } from "../../utils/helper";

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
    const { data: savedChats } = useGetChats();
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
                            onClick={async () => {
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
                            }}
                            className="p-4 border rounded-lg shadow-lg hover:bg-gray-100 cursor-pointer relative min-h-[135px]"
                        >
                            <div className="flex justify-between items-center mb-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(chat._id);
                                        setEditedName(chat.title);
                                    }}
                                    className="text-gray-500 hover:text-gray-700 mr-2"
                                >
                                    ✎
                                </button>
                                {chat._id && editingId === chat._id ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        className="border-0 ring-1 w-full text-lg bg-gray-50 p-1"
                                        value={editedName}
                                        onChange={(e) =>
                                            setEditedName(e.target.value)
                                        }
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
                                    <h3 className="font-semibold text-md relative">
                                        {t(chat.title) || t("New Chat")}
                                    </h3>
                                )}
                                <TrashIcon
                                    onClick={(e) => handleDelete(chat._id, e)}
                                    className="h-4 w-4 text-red-500 hover:text-red-700 flex-shrink-0"
                                />
                            </div>
                            <div className="flex justify-between items-center pb-2 overflow-hidden">
                                <ul>
                                    {chat?.messages
                                        ?.slice(-3)
                                        .map((m, index) => (
                                            <li
                                                key={index}
                                                className="text-xs text-gray-500 break-words"
                                            >
                                                {m?.payload?.length > 35
                                                    ? `${m.payload.slice(0, 35)}...`
                                                    : m.payload}
                                            </li>
                                        ))}
                                </ul>
                            </div>
                            <span className="text-xs absolute right-2 bottom-2 text-gray-500 text-right">
                                {dayjs(chat.createdAt).fromNow()}
                            </span>
                        </div>
                    ),
            )}
        </div>
    );

    const getCategoryTitle = (key, count) => `${CATEGORIES[key]} (${count})`;

    return (
        <div className={`${isDocked ? "text-xs" : ""}`}>
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-lg font-semibold">
                    {t("Chat history")} ({savedChatCount}) {t("chats")}
                </h1>
                <button onClick={handleCreateNewChat} className="lb-primary">
                    <PlusIcon className="h-4 w-4" />
                    <span className="font-semibold ml-2">
                        {t("Create New Chat")}
                    </span>
                </button>
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
