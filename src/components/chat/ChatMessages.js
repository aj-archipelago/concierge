import { postProcessMessage } from "./Message";
import { clearChat } from "../../stores/chatSlice";
import { useDispatch, useSelector } from "react-redux";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import { useTranslation } from "react-i18next";
import React from "react";
import DocOptions, { dataSources } from "./DocOptions";
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
    const selectedSources =
        useSelector((state) => state.doc.selectedSources) || [];
    const docs = useSelector((state) => state.doc.docs);

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
        <div className="h-full flex flex-col gap-3">
            <div className="grow overflow-auto flex flex-col chat-content">
                {messages.length > 0 && (
                    <div className="hidden justify-end items-center px-3 pb-2 text-xs [.docked_&]:flex">
                        <button
                            className="flex gap-1 items-center hover:underline hover:text-sky-500 active:text-sky-700"
                            onClick={() => dispatch(clearChat())}
                        >
                            <AiOutlineReload />
                            {t("Reset chat")}
                        </button>
                    </div>
                )}
                <div className="grow overflow-auto chat-message-list">
                    <MessageList messages={messages} loading={loading} />
                </div>
            </div>
            <div>
                {selectedSources?.length > 0 && (
                    <div className="text-gray-300 text-xs ps-3 pb-1">
                        <span className="font-medium">Data sources: </span>
                        <span className="[.docked_&]:hidden text-gray-400">
                            {selectedSources
                                ?.map(
                                    (source) =>
                                        dataSources.find(
                                            (d) => d.key === source,
                                        )?.name,
                                )
                                .join(", ")}
                        </span>
                        <span
                            className="hidden [.docked_&]:inline text-gray-400"
                            title={selectedSources
                                ?.map(
                                    (source) =>
                                        dataSources.find(
                                            (d) => d.key === source,
                                        )?.name,
                                )
                                .join(", ")}
                        >
                            {selectedSources?.length} selected
                        </span>
                    </div>
                )}
                {docs?.length > 0 && (
                    <div className="text-gray-300 text-xs ps-3 pb-1">
                        <span className="font-medium">Files: </span>
                        <span className="[.docked_&]:hidden text-gray-400">
                            {docs?.map((doc) => doc.filename).join(", ")}
                        </span>
                        <span
                            className="hidden [.docked_&]:inline text-gray-400"
                            title={docs?.map((doc) => doc.filename).join(", ")}
                        >
                            {docs?.length} selected
                        </span>
                    </div>
                )}
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
