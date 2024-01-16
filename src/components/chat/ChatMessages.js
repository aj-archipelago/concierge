import { postProcessMessage } from "./Message";
import { clearChat } from "../../stores/chatSlice";
import { useDispatch } from "react-redux";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import { useTranslation } from "react-i18next";
import React from "react";
import DocOptions from "./DocOptions";
import { AiOutlineReload } from "react-icons/ai";
import config from "../../../config";

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

    messages = messages.map((message, index) => {
        // post process the message and create a new
        // message object with the updated payload.
        return Object.assign({}, message, {
            payload: (
                <React.Fragment key={`outer-${message?.id}`}>
                    {postProcessMessage(
                        message.payload,
                        message.postProcessData,
                        message.tool,
                    )}
                </React.Fragment>
            ),
        });
    });

    return (
        <>
            <div
                className="d-flex flex-column chat-content message-container"
                style={{ height: "calc(100vh - 187px)" }}
            >
                <div className="flex justify-between items-center p-3 text-xs">
                    <DocOptions />
                    <button
                        className="flex gap-1 items-center hover:underline hover:text-sky-500 active:text-sky-700"
                        onClick={() => dispatch(clearChat())}
                    >
                        <AiOutlineReload />
                        {t("Reset chat")}
                    </button>
                </div>
                <div className="flex-grow-1 overflow-auto chat-message-list">
                    <MessageList messages={messages} />
                </div>
                <MessageInput
                    loading={loading}
                    placeholder={
                        container === "chatbox"
                            ? t(`Send to ${config?.chat?.botName}`)
                            : t(`Send a message to ${config?.chat?.botName}`)
                    }
                    container={container}
                    displayState={displayState}
                    onSend={(message) => onSend(message)}
                />
            </div>
        </>
    );
}

export default ChatMessages;
