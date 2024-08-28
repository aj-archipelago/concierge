import React, { useContext, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AiOutlineReload, AiOutlineSave } from "react-icons/ai";
import dynamic from "next/dynamic";
import { useApolloClient } from "@apollo/client";
import { useAddChat } from "../../../app/queries/chats";
import { handleSaveChat } from "./SaveChat";
import { AuthContext } from "../../App.js";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import config from "../../../config";
import { convertMessageToMarkdown } from "./ChatMessage";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"));

const ChatMessages = React.memo(function ChatMessages({
    messages = [],
    onSend,
    loading,
    container,
    displayState,
    viewingReadOnlyChat,
    publicChatOwner,
    chatId,
}) {
    const { user } = useContext(AuthContext);
    const { aiName } = user;
    const { t } = useTranslation();
    const client = useApolloClient();
    const addChat = useAddChat();

    const processedMessages = useMemo(() => {
        return messages.map((m, index) => {
            const baseMessage = {
                ...m,
                text: m.payload,
            };

            if (m.sender === "labeeb") {
                return {
                    ...baseMessage,
                    payload: (
                        <React.Fragment key={`outer-${m?.id || index}`}>
                            {convertMessageToMarkdown(m)}
                        </React.Fragment>
                    ),
                };
            }
            return baseMessage;
        });
    }, [messages]);

    const handleSaveChatCallback = useCallback(() => {
        handleSaveChat(messages, client, addChat);
    }, [messages, client, addChat]);

    const handleSendCallback = useCallback(
        (message) => {
            onSend(message);
        },
        [onSend],
    );

    const inputPlaceholder = useMemo(() => {
        return container === "chatbox"
            ? t(`Send message`)
            : `${t("Send a message to")} ${t(aiName || config?.chat?.botName)}`;
    }, [container, t, aiName]);

    return (
        <div className="h-full flex flex-col gap-3">
            <div className="grow overflow-auto flex flex-col chat-content">
                <div className="hidden justify-between items-center px-3 pb-2 text-xs [.docked_&]:flex">
                    <ChatTopMenuDynamic
                        displayState={displayState}
                        publicChatOwner={publicChatOwner}
                    />
                    {false && processedMessages.length > 0 && (
                        <div className="flex gap-2">
                            <button
                                className="flex gap-1 items-center hover:underline hover:text-sky-500 active:text-sky-700"
                                onClick={() => {
                                    if (window.confirm(t("Are you sure?"))) {
                                        console.log("Reset chat");
                                    }
                                }}
                            >
                                <AiOutlineReload />
                                {t("Reset chat")}
                            </button>
                            <button
                                className="flex gap-1 items-center hover:underline hover:text-sky-500 active:text-sky-700"
                                onClick={handleSaveChatCallback}
                            >
                                <AiOutlineSave />
                                {t("Save chat")}
                            </button>
                        </div>
                    )}
                </div>
                <div className="grow overflow-auto chat-message-list">
                    <MessageList
                        messages={processedMessages}
                        loading={loading}
                        chatId={chatId} />
                </div>
            </div>
            <div>
                <MessageInput
                    viewingReadOnlyChat={viewingReadOnlyChat}
                    loading={loading}
                    enableRag={true}
                    placeholder={inputPlaceholder}
                    container={container}
                    displayState={displayState}
                    onSend={handleSendCallback}
                />
            </div>
        </div>
    );
});

export default ChatMessages;
