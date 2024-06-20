"use client";

import { useTranslation } from "react-i18next";
import ChatContent from "./ChatContent";
import dynamic from "next/dynamic";
import { useUpdateActiveChat } from "../../../app/queries/chats";
// import { useGetActiveChat } from "../../../app/queries/chats"; // Assuming your hooks are in this path
// import SavedChats from "./SavedChats";
// import { AiOutlineSave } from "react-icons/ai";
// import { handleSaveChat } from "./SaveChat";
// import { useApolloClient } from "@apollo/client";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"));

function Chat() {
    const { t } = useTranslation();
    // const addChat = useAddChat();
    // const client = useApolloClient();
    // const chat = useGetActiveChat();
    // const messages = chat?.data?.messages || [];
    const updateActiveChat = useUpdateActiveChat();

    return (
        <div className="flex flex-col gap-3 h-full">
            {/* <h3>{chat?.data?._id}</h3> */}
            <div className="flex justify-between">
                {/* <SavedChats /> */}
                <ChatTopMenuDynamic />
                <div className="flex gap-2">
                    {/* <button
                        className="lb-primary lb-sm flex gap-1 items-center"
                        onClick={() =>
                            handleSaveChat(messages, client, addChat)
                        }
                    >
                        <AiOutlineSave />
                        {t("Save active chat")}
                    </button> */}
                    <button
                        className="lb-outline-secondary lb-sm"
                        size="sm"
                        onClick={() => {
                            if (window.confirm(t("Are you sure?"))) {
                                updateActiveChat.mutateAsync({
                                    messages: [],
                                });
                            }
                        }}
                    >
                        {t("Clear this chat")}
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
