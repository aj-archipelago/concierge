import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import { useTranslation } from "react-i18next";
import React from "react";
import { AiOutlineReload, AiOutlineSave } from "react-icons/ai";
import config from "../../../config";
import { convertMessageToMarkdown } from "./ChatMessage";
import dynamic from "next/dynamic";
import { useAddChat } from "../../../app/queries/chats";
import { useApolloClient } from "@apollo/client";
import { handleSaveChat } from "./SaveChat";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"));

function ChatMessages({
    messages = [],
    onSend,
    loading,
    container,
    displayState,
}) {
    const { t } = useTranslation();
    const client = useApolloClient();
    const addChat = useAddChat();
    const originalMessages = messages;

    messages = Array.isArray(messages)
        ? messages.map((message, index) => {
              if (message.sender === "labeeb") {
                  return {
                      ...message,
                      payload: (
                          <React.Fragment key={`outer-${message?.id}`}>
                              {convertMessageToMarkdown(message)}
                          </React.Fragment>
                      ),
                  };
              }
              return message;
          })
        : [];

    return (
        <div className="h-full flex flex-col gap-3">
            <div className="grow overflow-auto flex flex-col chat-content">
                <div className="hidden justify-between items-center px-3 pb-2 text-xs [.docked_&]:flex">
                    {/* <SavedChats displayState={displayState} /> */}
                    <ChatTopMenuDynamic displayState={displayState} />
                    {false && messages.length > 0 && (
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
                                onClick={() =>
                                    handleSaveChat(
                                        originalMessages,
                                        client,
                                        addChat,
                                    )
                                }
                            >
                                <AiOutlineSave />
                                {t("Save chat")}
                            </button>
                        </div>
                    )}
                </div>
                <div className="grow overflow-auto chat-message-list">
                    <MessageList messages={messages} loading={loading} />
                </div>
            </div>
            <div>
                <MessageInput
                    loading={loading}
                    enableRag={true}
                    placeholder={
                        container === "chatbox"
                            ? t(`Send message`)
                            : t(`Send a message to ${config?.chat?.botName}`)
                    }
                    container={container}
                    displayState={displayState}
                    onSend={(message) => onSend(message)}
                />
            </div>
        </div>
    );
}

export default ChatMessages;
