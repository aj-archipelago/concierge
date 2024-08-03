import React, { useCallback, useContext, useMemo } from "react";
import { useSelector } from "react-redux";
import { useApolloClient } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext } from "../../App.js";
import ChatMessages from "./ChatMessages";
import { QUERIES } from "../../graphql";
import {
    useGetActiveChat,
    useAddMessage,
    useUpdateChat,
} from "../../../app/queries/chats";

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
    const queryClient = useQueryClient();

    const viewingReadOnlyChat = useMemo(
        () => displayState === "full" && viewingChat && viewingChat.readOnly,
        [displayState, viewingChat],
    );

    const chat = viewingReadOnlyChat ? viewingChat : activeChat;
    const chatId = String(chat?._id);
    const memoizedMessages = useMemo(() => chat?.messages || [], [chat]);
    const selectedSources = useSelector((state) => state.doc.selectedSources);
    const addMessage = useAddMessage();
    const updateChatHook = useUpdateChat();
    const publicChatOwner = viewingChat?.owner;

    const updateChatLoadingState = useCallback(
        (id, isLoading) => {
            queryClient.setQueryData(["chatLoadingState", id], isLoading);
        },
        [queryClient],
    );

    const chatLoadingState =
        queryClient.getQueryData(["chatLoadingState", chatId]) || false;

    const updateChat = useCallback(
        (message, tool) => {
            if (message) {
                addMessage.mutate({
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
            updateChatLoadingState(chatId, false);
        },
        [addMessage, chatId, updateChatLoadingState],
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
            updateChatLoadingState(chatId, false);
        },
        [t, updateChat, updateChatLoadingState, chatId],
    );

    const handleSend = useCallback(
        async (text) => {
            try {
                // Optimistic update for the user's message
                const optimisticMessage = {
                    payload: text,
                    sender: "user",
                    sentTime: "just now",
                    direction: "outgoing",
                    position: "single",
                };

                addMessage.mutate({
                    chatId,
                    message: optimisticMessage,
                });

                // Update loading state
                updateChatLoadingState(chatId, true);

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

                try {
                    const resultObj = JSON.parse(result.data.rag_start.result);
                    resultMessage = resultObj?.response;

                    tool = result.data.rag_start.tool;
                    if (tool) {
                        const toolObj = JSON.parse(tool);
                        searchRequired = toolObj?.search;

                        if (
                            !chat?.titleSetByUser &&
                            toolObj?.title &&
                            chat?.title !== toolObj.title
                        ) {
                            updateChatHook.mutate({
                                chatId: String(chat?._id),
                                title: toolObj.title,
                            });
                        }
                    }
                } catch (e) {
                    throw e;
                }

                updateChat(resultMessage, tool);

                if (searchRequired) {
                    updateChatLoadingState(chatId, true);
                    const searchResult = await client.query({
                        query: QUERIES.RAG_GENERATOR_RESULTS,
                        variables,
                    });
                    const { result: message, tool } =
                        searchResult.data.rag_generator_results;
                    updateChat(message, tool);
                }
            } catch (error) {
                handleError(error);
            } finally {
                updateChatLoadingState(chatId, false);
            }
        },
        [
            addMessage,
            chatId,
            updateChatLoadingState,
            memoizedMessages,
            user,
            chat,
            selectedSources,
            client,
            updateChat,
            handleError,
            updateChatHook,
        ],
    );

    return (
        <ChatMessages
            viewingReadOnlyChat={viewingReadOnlyChat}
            publicChatOwner={publicChatOwner}
            loading={chatLoadingState}
            onSend={handleSend}
            messages={memoizedMessages}
            container={container}
            displayState={displayState}
        />
    );
}

export default React.memo(ChatContent);
