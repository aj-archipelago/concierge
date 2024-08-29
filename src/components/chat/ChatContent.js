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
                const optimisticUserMessage = {
                    payload: text,
                    sender: "user",
                    sentTime: "just now",
                    direction: "outgoing",
                    position: "single",
                };

                queryClient.setQueryData(
                    ["chat", String(chat?._id)],
                    (oldChat) => ({
                        ...oldChat,
                        messages: [
                            ...(oldChat?.messages || []),
                            optimisticUserMessage,
                        ],
                    }),
                );

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

                        if (codeRequestId) {
                            queryClient.setQueryData(
                                ["codeRequestId", chatId],
                                codeRequestId,
                            );
                            updateChatLoadingState(chatId, true);
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

                // Update the chat title in the cache if there's a new title
                if (newTitle) {
                    queryClient.setQueryData(
                        ["chatTitle", String(chat?._id)],
                        newTitle,
                    );
                }

                // Batch updates in a single operation
                await queryClient.cancelQueries(["chat", String(chat?._id)]);
                queryClient.setQueryData(
                    ["chat", String(chat?._id)],
                    (oldChat) => {
                        const updatedChat = {
                            ...oldChat,
                            messages: [
                                ...(oldChat?.messages || []),
                                optimisticUserMessage,
                                optimisticAIMessage,
                            ],
                        };
                        if (newTitle) {
                            updatedChat.title = newTitle;
                        }
                        return updatedChat;
                    },
                );

                // Confirm updates with the server
                await updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    messages: [
                        ...(chat?.messages || []),
                        optimisticUserMessage,
                        optimisticAIMessage,
                    ],
                    ...(newTitle && { title: newTitle }),
                });

                if (searchRequired) {
                    updateChatLoadingState(chatId, true);
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
                    });
                }
            } catch (error) {
                handleError(error);
            } finally {
                updateChatLoadingState(chatId, false);
            }
        },
        [
            chat,
            updateChatHook,
            queryClient,
            client,
            user,
            memoizedMessages,
            selectedSources,
            handleError,
            updateChatLoadingState,
            chatId,
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
            chatId={chatId}
        />
    );
}

export default React.memo(ChatContent);
