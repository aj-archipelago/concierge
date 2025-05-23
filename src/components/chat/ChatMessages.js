import React, { useContext, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import dynamic from "next/dynamic";
import { AuthContext } from "../../App.js";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";

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
    streamingContent,
    ephemeralContent,
    isStreaming,
    onStopStreaming,
    thinkingDuration,
    isThinking,
    selectedEntityId,
    entities,
    entityIconSize,
}) {
    const { user } = useContext(AuthContext);
    const { t } = useTranslation();
    const { aiName } = user;
    const messageListRef = useRef(null);

    const handleSendCallback = useCallback(
        (text) => {
            // Reset scroll state when user sends a message
            messageListRef.current?.scrollBottomRef?.current?.resetScrollState();
            onSend(text);
        },
        [onSend],
    );

    const inputPlaceholder = useMemo(() => {
        if (container === "codebox") {
            return t("Ask me to write, explain, or fix code");
        }
        return t("Send a message");
    }, [container, t]);

    return (
        <div className="flex flex-col h-full">
            <div className="hidden justify-between items-center px-3 pb-2 text-xs [.docked_&]:flex">
                <ChatTopMenuDynamic
                    displayState={displayState}
                    publicChatOwner={publicChatOwner}
                />
            </div>
            <div className="grow overflow-auto chat-message-list flex flex-col">
                <MessageList
                    ref={messageListRef}
                    messages={messages}
                    loading={loading && !isStreaming}
                    chatId={chatId}
                    bot={container === "codebox" ? "code" : "chat"}
                    streamingContent={streamingContent}
                    isStreaming={isStreaming}
                    aiName={aiName}
                    ephemeralContent={ephemeralContent}
                    thinkingDuration={thinkingDuration}
                    isThinking={isThinking}
                    selectedEntityId={selectedEntityId}
                    entities={entities}
                    entityIconSize={entityIconSize}
                    onSend={onSend}
                />
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
                    isStreaming={isStreaming}
                    onStopStreaming={onStopStreaming}
                />
            </div>
        </div>
    );
});

export default ChatMessages;
