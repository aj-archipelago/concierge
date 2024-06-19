import { useTranslation } from "react-i18next";
import {
    useAddChat,
    useDeleteChat,
    useGetActiveChats,
    useGetChats,
    useSetActiveChatId,
} from "../../../app/queries/chats";
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import React from "react";

dayjs.extend(relativeTime);

// Constants
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
    // const activeChats = useGetActiveChats()?.data;

    const handleDelete = async (chatId, e) => {
        e.stopPropagation(); // Prevents setting chat as active when deleting

        // Asking for user confirmation
        const userConfirmed = window.confirm(
            "Are you sure you want to delete this chat?",
        );
        if (!userConfirmed) return;

        try {
            console.log("Deleting chat", chatId);
            if (!chatId) return;
            await deleteChat.mutateAsync({ chatId });
        } catch (error) {
            console.error("Failed to delete chat", error);
        }
    };

    const handleCreateNewChat = async () => {
        console.log("Creating new chat");
        const newChat = await addChat.mutateAsync({ messages: [] });
        console.log("New chat created:", newChat);
        const newChatId = newChat._id;
        setActiveChatId.mutate(newChatId);
        router.push(`/chat/${newChatId}`);
    };

    // Categorize chats
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

    // Categorize saved chats
    const categorizedChats = categorizeChats(savedChats || []);
    const savedChatCount = savedChats?.length || 0;

    const renderChatElements = (chats) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
            {chats.map(
                (chat) =>
                    chat && (
                        <div
                            key={chat._id}
                            onClick={async () => {
                                try {
                                    const chatId = chat._id;
                                    await setActiveChatId.mutateAsync(chatId);
                                    router.push(`/chat/${chatId}`);
                                } catch (error) {
                                    console.error(
                                        "Failed to set active chat ID:",
                                        error,
                                    );
                                }
                            }}
                            className="p-4 border rounded-lg shadow-lg hover:bg-gray-100 cursor-pointer relative"
                        >
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-semibold text-xl">
                                    {t(chat.title) || t("Chat")}
                                </h3>

                                <TrashIcon
                                    onClick={(e) => handleDelete(chat._id, e)}
                                    className="h-4 w-4 text-red-500 hover:text-red-700"
                                />
                            </div>

                            <div className="flex justify-between items-center pb-2">
                                <ul>
                                    {chat?.messages
                                        ?.slice(-3)
                                        .map((m, index) => (
                                            <li
                                                key={index}
                                                className="text-xs text-gray-500"
                                            >
                                                {m.payload.length > 35
                                                    ? `${m.payload.slice(0, 35)}...`
                                                    : m.payload}
                                            </li>
                                        ))}
                                </ul>
                            </div>
                            {/* Display relative time */}
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
                <h1 className="text-2xl font-semibold">
                    {t("Saved Chats")} ({savedChatCount})
                </h1>
                <button onClick={handleCreateNewChat} className="lb-primary">
                    <PlusIcon className="h-6 w-6" />
                    <span className="font-semibold ml-2">
                        {t("Create New Chat")}
                    </span>
                </button>
            </div>

            {/* <div className="text-sm">
                <span className="mr-2 italic">Most recent chats:</span>
                {activeChats?.length > 0 && ( // Display active chats
                   <ul className="inline space-x-3">
                     {activeChats.map((chat, index) => (
                       <span key={chat._id}>
                         <li className="inline">
                           <button onClick={() => router.push(`/chat/${chat._id}`)} 
                           className="py-1  hover:underline"
                            >{chat.title}</button>

                            <TrashIcon
                                onClick={(e) => handleDelete(chat._id, e)}
                                className="inline cursor-pointer h-3.5 w-3.5 mx-2 mb-0.5 text-red-500 hover:text-red-700"
                                />
                         </li>
                         {index < activeChats.length - 1 && <span className="inline">/</span>}
                       </span>
                     ))}
                   </ul>
                )}
            </div> */}
            <div className="chats">
                {Object.entries(categorizedChats).map(
                    ([category, chats]) =>
                        chats.length > 0 && (
                            <div key={category}>
                                <h2 className="text-lg font-semibold mt-4 mb-2 border-b pb-1">
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
