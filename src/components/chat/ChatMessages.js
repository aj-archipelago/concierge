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
    toolCalls,
    isStreaming,
    onStopStreaming,
    thinkingDuration,
    isThinking,
    selectedEntityId,
    entities,
    entityIconSize,
    contextId,
    contextKey,
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
            <div className="hidden justify-between items-center px-3 pb-2 text-xs [.docked_&]:hidden">
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
                    toolCalls={toolCalls}
                    thinkingDuration={thinkingDuration}
                    isThinking={isThinking}
                    selectedEntityId={selectedEntityId}
                    entities={entities}
                    entityIconSize={entityIconSize}
                    onSend={onSend}
                    contextId={contextId}
                    contextKey={contextKey}
                />
            </div>
            <div className="flex-shrink-0">
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
