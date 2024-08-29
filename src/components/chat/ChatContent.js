import React, { useCallback, useContext, useMemo } from "react";
import { useSelector } from "react-redux";
import { useApolloClient } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { AuthContext } from "../../App.js";
import ChatMessages from "./ChatMessages";
import { QUERIES } from "../../graphql";
import { useGetActiveChat, useUpdateChat } from "../../../app/queries/chats";

const contextMessageCount = 50;

function ChatContent({
    displayState = "full",
    container = "chatpage",
    viewingChat = null,
}) {
    const { t } = useTranslation();
    const client = useApolloClient();
    const { user } = useContext(AuthContext);
    const activeChat = useGetActiveChat()?.data;

    const viewingReadOnlyChat = useMemo(
        () => displayState === "full" && viewingChat && viewingChat.readOnly,
        [displayState, viewingChat],
    );

    const chat = viewingReadOnlyChat ? viewingChat : activeChat;
    const chatId = String(chat?._id);
    const memoizedMessages = useMemo(() => chat?.messages || [], [chat]);
    const selectedSources = useSelector((state) => state.doc.selectedSources);
    const updateChatHook = useUpdateChat();
    const publicChatOwner = viewingChat?.owner;
    const isChatLoading = chat?.isChatLoading;

    const updateChat = useCallback(
        (message, tool, isChatLoading = false) => {
            const messages = chat?.messages || [];
            if (message) {
                messages.push({
                    chatId,
                    message: {
                        payload: message,
                        tool: tool,
                        sentTime: "just now",
                        direction: "incoming",
                        position: "single",
                        sender: "labeeb",
                    },
                });
            }

            updateChatHook.mutateAsync({
                chatId,
                isChatLoading,
                messages,
            });
        },
        [chatId, updateChatHook, chat],
    );

    const handleError = useCallback(
        (error) => {
            toast.error(error.message);
            updateChat(
                t(
                    "Something went wrong trying to respond to your request. Please try something else or start over to continue.",
                ),
                null,
            );
        },
        [t, updateChat],
    );

    const handleSend = useCallback(
        async (text) => {
            try {
                // Optimistic update for the user's message
                const optimisticUserMessage = {
                    payload: text,
                    sender: "user",
                    sentTime: "just now",
                    direction: "outgoing",
                    position: "single",
                };

                updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    messages: [
                        ...(chat?.messages || []),
                        optimisticUserMessage,
                    ],
                    isChatLoading: true,
                });

                // Prepare conversation history
                const conversation = memoizedMessages
                    .slice(-contextMessageCount)
                    .filter((m) => {
                        if (!m.tool) return true;
                        try {
                            const tool = JSON.parse(m.tool);
                            return !tool.hideFromModel;
                        } catch (e) {
                            console.error("Invalid JSON in tool:", e);
                            return true;
                        }
                    })
                    .map((m) =>
                        m.sender === "labeeb"
                            ? { role: "assistant", content: m.payload }
                            : { role: "user", content: m.payload },
                    );

                conversation.push({ role: "user", content: text });

                const { contextId, aiMemorySelfModify, aiName, aiStyle } = user;

                const variables = {
                    chatHistory: conversation,
                    contextId,
                    aiName,
                    aiMemorySelfModify,
                    aiStyle,
                    title: chat?.title,
                    chatId,
                };

                if (selectedSources && selectedSources.length > 0) {
                    variables.dataSources = selectedSources;
                }

                // Perform RAG start query
                const result = await client.query({
                    query: QUERIES.RAG_START,
                    variables,
                });

                let resultMessage = "";
                let searchRequired = false;
                let tool = null;
                let newTitle = null;
                let codeRequestId = null;

                try {
                    const resultObj = JSON.parse(result.data.rag_start.result);
                    resultMessage = resultObj?.response;

                    tool = result.data.rag_start.tool;
                    if (tool) {
                        const toolObj = JSON.parse(tool);
                        searchRequired = toolObj?.search;
                        codeRequestId = toolObj?.codeRequestId;

                        if (
                            !chat?.titleSetByUser &&
                            toolObj?.title &&
                            chat?.title !== toolObj.title
                        ) {
                            newTitle = toolObj.title;
                        }
                    }
                } catch (e) {
                    console.error("Error parsing result:", e);
                }

                // Optimistic update for AI's response
                const optimisticAIMessage = {
                    payload: resultMessage,
                    tool: tool,
                    sentTime: "just now",
                    direction: "incoming",
                    position: "single",
                    sender: "labeeb",
                };

                const isChatLoading = !!(searchRequired || codeRequestId);

                // Confirm updates with the server
                await updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    messages: [
                        ...(chat?.messages || []),
                        optimisticUserMessage,
                        optimisticAIMessage,
                    ],
                    ...(newTitle && { title: newTitle }),
                    isChatLoading,
                    codeRequestId,
                });

                if (searchRequired) {
                    const searchResult = await client.query({
                        query: QUERIES.RAG_GENERATOR_RESULTS,
                        variables,
                    });
                    const { result: searchMessage, tool: searchTool } =
                        searchResult.data.rag_generator_results;

                    await updateChatHook.mutateAsync({
                        chatId: String(chat?._id),
                        messages: [
                            ...(chat?.messages || []),
                            {
                                payload: searchMessage,
                                tool: searchTool,
                                sentTime: "just now",
                                direction: "incoming",
                                position: "single",
                                sender: "labeeb",
                            },
                        ],
                        isChatLoading: false,
                    });
                }
            } catch (error) {
                handleError(error);
            }
        },
        [
            chat,
            updateChatHook,
            client,
            user,
            memoizedMessages,
            selectedSources,
            handleError,
            chatId,
        ],
    );

    return (
        <ChatMessages
            viewingReadOnlyChat={viewingReadOnlyChat}
            publicChatOwner={publicChatOwner}
            loading={isChatLoading}
            onSend={handleSend}
            messages={memoizedMessages}
            container={container}
            displayState={displayState}
            chatId={chatId}
        />
    );
}

export default React.memo(ChatContent);
