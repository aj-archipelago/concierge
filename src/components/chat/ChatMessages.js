import React, {
    useContext,
    useCallback,
    useMemo,
    useRef,
    useImperativeHandle,
    forwardRef,
} from "react";
import { useTranslation } from "react-i18next";
import { CurrentUserContext } from "../../App.js";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import ChatTopMenu from "./ChatTopMenu";

const ChatMessages = React.memo(
    forwardRef(function ChatMessages(
        {
            messages = [],
            onSend,
            loading,
            container,
            displayState,
            viewingReadOnlyChat,
            publicChatOwner,
            chat,
            chatId,
            pendingUserMessage,
            pendingAssistantMessage,
            waitingForServer,
            sendBlocked,
            isStreaming,
            onStopStreaming,
            onInjectMessage,
            selectedEntityId,
            entities,
            entityIconSize,
            contextId,
            contextKey,
            updateChatHook,
            onLoadOlder,
            hasMoreMessages,
            isLoadingOlder,
        },
        ref,
    ) {
        const user = useContext(CurrentUserContext);
        const { t } = useTranslation();
        const { aiName } = user;
        const messageListRef = useRef(null);
        const messageInputRef = useRef(null);

        // Expose focusInput method to parent via ref
        useImperativeHandle(
            ref,
            () => ({
                focusInput: () => {
                    // Focus the textarea in MessageInput
                    if (messageInputRef.current) {
                        messageInputRef.current.focus();
                    }
                },
            }),
            [],
        );

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
            <div
                data-testid="chat-messages"
                data-chat-id={chatId}
                data-streaming={isStreaming ? "true" : "false"}
                className="flex flex-col h-full"
            >
                <div className="hidden justify-between items-center px-3 pb-2 text-xs [.docked_&]:hidden">
                    <ChatTopMenu
                        displayState={displayState}
                        publicChatOwner={publicChatOwner}
                        chat={chat}
                        contextId={contextId}
                        contextKey={contextKey}
                        updateChatHook={updateChatHook}
                    />
                </div>
                <div
                    data-testid="chat-message-list"
                    className="grow overflow-auto chat-message-list flex flex-col bg-transparent dark:!bg-gray-800"
                >
                    <MessageList
                        ref={messageListRef}
                        messages={messages}
                        pendingUserMessage={pendingUserMessage}
                        pendingAssistantMessage={pendingAssistantMessage}
                        waitingForServer={waitingForServer}
                        loading={loading && !isStreaming}
                        chatId={chatId}
                        bot={container === "codebox" ? "code" : "chat"}
                        isStreaming={isStreaming}
                        isChatLoading={loading}
                        aiName={aiName}
                        selectedEntityId={selectedEntityId}
                        entities={entities}
                        entityIconSize={entityIconSize}
                        onSend={onSend}
                        contextId={contextId}
                        contextKey={contextKey}
                        onLoadOlder={onLoadOlder}
                        hasMoreMessages={hasMoreMessages}
                        isLoadingOlder={isLoadingOlder}
                    />
                </div>
                <div className="flex-shrink-0">
                    <MessageInput
                        ref={messageInputRef}
                        chatId={chatId}
                        viewingReadOnlyChat={viewingReadOnlyChat}
                        loading={loading}
                        sendBlocked={sendBlocked}
                        enableRag={true}
                        placeholder={inputPlaceholder}
                        container={container}
                        displayState={displayState}
                        onSend={handleSendCallback}
                        isStreaming={isStreaming}
                        onStopStreaming={onStopStreaming}
                        onInjectMessage={onInjectMessage}
                    />
                </div>
            </div>
        );
    }),
);

export default ChatMessages;
