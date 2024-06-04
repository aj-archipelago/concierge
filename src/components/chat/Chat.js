"use client";

import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { clearChat } from "../../stores/chatSlice";
import ChatContent from "./ChatContent";
import dynamic from "next/dynamic";
import SavedChats from "./SavedChats";
import { useAddChat } from "../../../app/queries/chats"; // Assuming your hooks are in this path
import { AiOutlineSave } from "react-icons/ai";
import { handleSaveChat } from "./SaveChat";
import { useApolloClient } from "@apollo/client";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"));

function Chat() {
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const addChat = useAddChat();
    const client = useApolloClient();
    const messageList = useSelector((state) => state.chat.messages);

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between">
                <SavedChats />
                <ChatTopMenuDynamic />
                <div className="flex gap-2">
                    <button
                        className="lb-primary lb-sm flex gap-1 items-center"
                        onClick={() =>
                            handleSaveChat(messageList, client, addChat)
                        }
                    >
                        <AiOutlineSave />
                        {t("Save active chat")}
                    </button>
                    <button
                        className="lb-danger lb-sm"
                        size="sm"
                        onClick={() => {
                            if (window.confirm(t("Are you sure?"))) {
                                dispatch(clearChat());
                            }
                        }}
                    >
                        {t("Start over")}
                    </button>
                </div>
            </div>
            <div className="grow overflow-auto">
                <ChatContent />
            </div>
        </div>
    );
}

export default Chat;
