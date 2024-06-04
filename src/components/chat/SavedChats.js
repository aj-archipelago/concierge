import { useContext, useState } from "react";
import { useDispatch } from "react-redux";
import { AuthContext } from "../../App";
import { useTranslation } from "react-i18next";
import { useDeleteChat } from "../../../app/queries/chats";
import { setMessages } from "../../stores/chatSlice";
import { AiOutlineMessage } from "react-icons/ai";

function SavedChats({ displayState }) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const savedChats = user?.savedChats;
    const deleteChat = useDeleteChat();
    const dispatch = useDispatch();
    const isDocked = displayState === "docked";
    const [isVisible, setIsVisible] = useState(false);

    const handleDelete = async (chatId) => {
        try {
            if (!chatId) return;
            await deleteChat.mutateAsync({ chatId });
        } catch (error) {
            console.error("Failed to delete chat", error);
        }
    };

    const setActiveChat = (chat) => {
        const newMessages = chat.messages || [];
        dispatch(setMessages(newMessages));
    };

    const handleToggleVisibility = () => {
        setIsVisible(!isVisible);
    };

    if (!savedChats || savedChats.length === 0) {
        return <div className="chats">{t("No saved chats")}</div>;
    }

    const savedChatCount = savedChats.length;

    const chatElements = (
        <ul className="text-xs">
            {savedChats.map(
                (chat, index) =>
                    chat && (
                        <li key={chat?._id}>
                            {index + 1} -{" "}
                            {t(chat?.title) || t("Chat") + " " + (index + 1)}
                            <button
                                onClick={() => setActiveChat(chat)}
                                className="ml-2 text-blue-500"
                            >
                                {t("Set Active")}
                            </button>
                            <button
                                onClick={() => handleDelete(chat?._id)}
                                className="ml-2 text-red-500"
                            >
                                {t("Delete")}
                            </button>
                        </li>
                    ),
            )}
        </ul>
    );

    return (
        <div className={`${isDocked ? "text-xs" : ""}`}>
            {!isDocked ? (
                <button
                    type="button"
                    onClick={handleToggleVisibility}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-blue-800"
                >
                    Saved Chats
                    <span className="inline-flex items-center justify-center w-5 h-4 ms-2 text-xs font-semibold text-blue-800 bg-blue-200 rounded-full">
                        {savedChatCount}
                    </span>
                </button>
            ) : (
                <span
                    className="underline cursor-pointer select-none flex gap-1 items-center hover:underline hover:text-sky-500 active:text-sky-700"
                    onClick={handleToggleVisibility}
                    style={{ userSelect: "none" }}
                >
                    <AiOutlineMessage />
                    {t("{{count}} Saved Chats", { count: savedChatCount })}
                </span>
            )}
            {isVisible && <div className="chats">{chatElements}</div>}
        </div>
    );
}

export default SavedChats;
