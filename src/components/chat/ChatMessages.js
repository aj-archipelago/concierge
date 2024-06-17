import { clearChat } from "../../stores/chatSlice";
import { useDispatch } from "react-redux";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import { useTranslation } from "react-i18next";
import React from "react";
import { AiOutlineReload } from "react-icons/ai";
import config from "../../../config";
import { convertMessageToMarkdown } from "./ChatMessage";
import dynamic from "next/dynamic";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"));

// Displays the list of messages and a message input box.
function ChatMessages({
    messages = [],
    onSend,
    loading,
    container,
    displayState,
}) {
    const dispatch = useDispatch();
    const { t } = useTranslation();

    messages = messages.map((m) => {
        return Object.assign({}, m, {
            text: m.payload,
        });
    });

    messages = messages.map((message, index) => {
        // post process the message and create a new
        // message object with the updated payload.
        if (message.sender === "labeeb") {
            return Object.assign({}, message, {
                payload: (
                    <React.Fragment key={`outer-${message?.id}`}>
                        {convertMessageToMarkdown(message)}
                    </React.Fragment>
                ),
            });
        } else {
            return message;
        }
    });

    return (
        <div className="h-full flex flex-col gap-3">
            <div className="grow overflow-auto flex flex-col chat-content">
                <div className="hidden justify-between items-center px-3 pb-2 text-xs [.docked_&]:flex">
                    <ChatTopMenuDynamic displayState={displayState} />
                    {messages.length > 0 && (
                        <button
                            className="flex gap-1 items-center hover:underline hover:text-sky-500 active:text-sky-700"
                            onClick={() => {
                                if (window.confirm(t("Are you sure?"))) {
                                    dispatch(clearChat());
                                }
                            }}
                        >
                            <AiOutlineReload />
                            {t("Reset chat")}
                        </button>
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
