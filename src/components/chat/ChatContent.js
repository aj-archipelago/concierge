import React, { useCallback, useContext, useMemo, useEffect } from "react";
import { useApolloClient } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { AuthContext } from "../../App.js";
import ChatMessages from "./ChatMessages";
import { QUERIES } from "../../graphql";
import { useGetActiveChat, useUpdateChat } from "../../../app/queries/chats";
import { useDeleteAutogenRun } from "../../../app/queries/autogen.js";
import { processImageUrls } from "../../utils/imageUtils.mjs";
import { useStreamingMessages } from "../../hooks/useStreamingMessages";
import { useQueryClient } from "@tanstack/react-query";

const contextMessageCount = 50;

function ChatContent({
    displayState = "full",
    container = "chatpage",
    viewingChat = null,
    streamingEnabled = false,
}) {
    const { t } = useTranslation();
    const client = useApolloClient();
    const { user } = useContext(AuthContext);
    const activeChat = useGetActiveChat();
    const updateChatHook = useUpdateChat();
    const deleteAutogenRun = useDeleteAutogenRun();
    const queryClient = useQueryClient();

    const viewingReadOnlyChat = useMemo(
        () => displayState === "full" && viewingChat && viewingChat.readOnly,
        [displayState, viewingChat],
    );

    const chat = viewingReadOnlyChat ? viewingChat : activeChat?.data;
    const chatId = String(chat?._id);

    // Simple approach - if we have a chat ID but no messages, refetch once
    useEffect(() => {
        if (
            chat &&
            chat._id &&
            (!chat.messages || chat.messages.length === 0)
        ) {
            queryClient.refetchQueries({ queryKey: ["chat", chat._id] });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chat?._id]); // Only run when the chat ID changes

    const memoizedMessages = useMemo(() => chat?.messages || [], [chat]);
    const publicChatOwner = viewingChat?.owner;
    const isChatLoading = chat?.isChatLoading;

    const {
        isStreaming,
        streamingContent,
        stopStreaming,
        setIsStreaming,
        setSubscriptionId,
        clearStreamingState,
    } = useStreamingMessages({ chat, updateChatHook });

    const handleError = useCallback((error) => {
        toast.error(error.message);
    }, []);

    const handleSend = useCallback(
        async (text) => {
            try {
                // Reset streaming state
                clearStreamingState();

                // Optimistic update for the user's message
                const optimisticUserMessage = {
                    payload: text,
                    sender: "user",
                    sentTime: "just now",
                    direction: "outgoing",
                    position: "single",
                };

                // Use messages directly without processing
                const userMessages = [
                    ...(chat?.messages || []),
                    optimisticUserMessage,
                ];

                // Show the user message immediately
                await updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    messages: userMessages,
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

                const codeRequestIdParam =
                    new Date() - new Date(chat?.lastCodeRequestTime) <
                    30 * 60 * 1000
                        ? chat?.lastCodeRequestId
                        : "";
                if (codeRequestIdParam) {
                    await deleteAutogenRun.mutateAsync(codeRequestIdParam);
                }

                const variables = {
                    chatHistory: conversation,
                    contextId,
                    aiName,
                    aiMemorySelfModify,
                    aiStyle,
                    title: chat?.title,
                    chatId,
                    codeRequestId: codeRequestIdParam,
                    stream: streamingEnabled,
                };

                // Perform RAG start query
                const result = await client.query({
                    query: QUERIES.SYS_ENTITY_START,
                    variables,
                    fetchPolicy: 'network-only'
                });

                // If streaming is enabled, handle subscription setup
                if (streamingEnabled) {
                    const subscriptionId =
                        result.data?.sys_entity_start?.result;
                    if (subscriptionId) {
                        // Set streaming state BEFORE setting subscription ID
                        setIsStreaming(true);

                        // Finally set the subscription ID which will trigger the subscription
                        setSubscriptionId(subscriptionId);

                        return; // Make sure we return here to prevent non-streaming handling
                    }
                }

                // Non-streaming response handling
                let resultMessage = "";
                let tool = null;
                let newTitle = null;
                let toolCallbackName = null;
                let toolCallbackId = null;
                let codeRequestId = null;
                try {
                    let resultObj;
                    try {
                        resultObj = JSON.parse(
                            result.data.sys_entity_start.result,
                        );
                    } catch {
                        resultObj = result.data.sys_entity_start.result;
                    }
                    resultMessage = resultObj;
                    tool = result.data.sys_entity_start.tool;
                    if (tool) {
                        const toolObj = JSON.parse(tool);
                        toolCallbackName = toolObj?.toolCallbackName;
                        toolCallbackId = toolObj?.toolCallbackId;
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
                    throw new Error("Failed to parse AI response");
                }

                // Only proceed if we have a valid response
                if (!resultMessage?.trim()) {
                    throw new Error("Received empty response from AI");
                }

                // Process any image URLs in the response
                resultMessage = await processImageUrls(
                    resultMessage,
                    window.location.origin,
                );

                // Get current messages and check if we need to replace a hidden message
                let currentMessages = [
                    ...(chat?.messages || []),
                    optimisticUserMessage,
                ];
                if (currentMessages.length >= 2) {
                    const lastMessage =
                        currentMessages[currentMessages.length - 1];
                    const prevMessage =
                        currentMessages[currentMessages.length - 2];
                    if (prevMessage?.sender === "labeeb" && prevMessage?.tool) {
                        try {
                            const tool = JSON.parse(prevMessage.tool);
                            if (tool.hideFromModel) {
                                // Remove the previous hidden message
                                currentMessages = [
                                    ...currentMessages.slice(0, -2),
                                    lastMessage,
                                ];
                            }
                        } catch (e) {
                            console.error("Invalid JSON in tool:", e);
                        }
                    }
                }

                // Add the new response
                currentMessages.push({
                    payload: resultMessage,
                    tool: tool,
                    sentTime: "just now",
                    direction: "incoming",
                    position: "single",
                    sender: "labeeb",
                });

                // Use messages directly without processing
                const currentMessagesToUpdate = currentMessages;

                await updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    messages: currentMessagesToUpdate,
                    ...(newTitle && { title: newTitle }),
                    isChatLoading: !!toolCallbackName,
                    ...(toolCallbackId && { toolCallbackId }),
                    ...(codeRequestId && {
                        codeRequestId,
                        lastCodeRequestId: codeRequestId,
                        lastCodeRequestTime: new Date(),
                    }),
                });

                if (toolCallbackName && toolCallbackName !== "coding") {
                    const searchResult = await client.query({
                        query: QUERIES.SYS_ENTITY_CONTINUE,
                        variables: {
                            ...variables,
                            generatorPathway: toolCallbackName,
                        },
                        fetchPolicy: 'network-only'
                    });
                    const { result, tool } =
                        searchResult.data.sys_entity_continue;

                    // Validate the callback result
                    if (!result?.trim()) {
                        throw new Error(
                            "Received empty tool callback response",
                        );
                    }

                    // Process any image URLs in the tool callback response
                    const processedResult = await processImageUrls(
                        result,
                        window.location.origin,
                    );

                    // Check again for hidden message before adding the tool callback response
                    const finalMessages = currentMessages.slice();
                    const lastMsg = finalMessages[finalMessages.length - 1];
                    if (lastMsg?.sender === "labeeb" && lastMsg?.tool) {
                        try {
                            const lastTool = JSON.parse(lastMsg.tool);
                            if (lastTool.hideFromModel) {
                                finalMessages.pop();
                            }
                        } catch (e) {
                            console.error("Invalid JSON in tool:", e);
                        }
                    }

                    finalMessages.push({
                        payload: processedResult,
                        tool: tool,
                        sentTime: "just now",
                        direction: "incoming",
                        position: "single",
                        sender: "labeeb",
                    });

                    // Use messages directly without processing
                    const finalMessagesToUpdate = finalMessages;

                    await updateChatHook.mutateAsync({
                        chatId: String(chat?._id),
                        messages: finalMessagesToUpdate,
                        isChatLoading: false,
                    });
                }
            } catch (error) {
                setIsStreaming(false);
                handleError(error);

                // Use error messages directly without processing
                const errorMessagesToUpdate = [
                    ...(chat?.messages || []),
                    {
                        payload: text,
                        sender: "user",
                        sentTime: "just now",
                        direction: "outgoing",
                        position: "single",
                    },
                    {
                        payload: t(
                            "Something went wrong trying to respond to your request. Please try something else or start over to continue.",
                        ),
                        sender: "labeeb",
                        sentTime: "just now",
                        direction: "incoming",
                        position: "single",
                    },
                ];

                await updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    messages: errorMessagesToUpdate,
                    isChatLoading: false,
                });
            }
        },
        [
            chat,
            updateChatHook,
            client,
            user,
            memoizedMessages,
            handleError,
            t,
            chatId,
            clearStreamingState,
            deleteAutogenRun,
            setIsStreaming,
            setSubscriptionId,
            streamingEnabled,
        ],
    );

    useEffect(() => {
        // Only reset loading state if there's no active operation in progress
        if (
            chat?.isChatLoading &&
            !chat?.toolCallbackName &&
            !chat?.codeRequestId &&
            !chat?.toolCallbackId
        ) {
            updateChatHook.mutateAsync({
                chatId: String(chat._id),
                messages: chat.messages || [],
                isChatLoading: false,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            onStopStreaming={stopStreaming}
        />
    );
}

export default React.memo(ChatContent);
