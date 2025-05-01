import React, {
    useCallback,
    useContext,
    useMemo,
    useEffect,
    useRef,
} from "react";
import { useApolloClient } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { AuthContext } from "../../App.js";
import ChatMessages from "./ChatMessages";
import { QUERIES } from "../../graphql";
import { useGetActiveChat, useUpdateChat } from "../../../app/queries/chats";
import { processImageUrls } from "../../utils/imageUtils.mjs";
import { useStreamingMessages } from "../../hooks/useStreamingMessages";
import { useQueryClient } from "@tanstack/react-query";
import { useRunTask } from "../../../app/queries/notifications";

const contextMessageCount = 50;

function ChatContent({
    displayState = "full",
    container = "chatpage",
    viewingChat = null,
    selectedEntityId: selectedEntityIdFromProp,
}) {
    const { t } = useTranslation();
    const client = useApolloClient();
    const { user } = useContext(AuthContext);
    const activeChatHookData = useGetActiveChat();
    const updateChatHook = useUpdateChat();
    const queryClient = useQueryClient();
    const runTask = useRunTask();
    const viewingReadOnlyChat = useMemo(
        () => displayState === "full" && viewingChat && viewingChat.readOnly,
        [displayState, viewingChat],
    );

    const chat = viewingReadOnlyChat ? viewingChat : activeChatHookData?.data;
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
        ephemeralContent,
        stopStreaming,
        setIsStreaming,
        setSubscriptionId,
        clearStreamingState,
        thinkingDuration,
        isThinking,
    } = useStreamingMessages({
        chat,
        updateChatHook,
        currentEntityId: selectedEntityIdFromProp,
    });

    const handleError = useCallback((error) => {
        toast.error(error.message);
    }, []);

    const getMessagePayload = useCallback(
        (message) => {
            if (message.taskId) {
                const notification = queryClient.getQueryData([
                    "tasks",
                    message.taskId,
                ]);
                if (notification) {
                    return `Status: ${notification.status}\n                Progress: ${notification.progress || 0}\n                Type: ${notification.type}\n                Original Message: ${message.payload}`;
                }
            }
            return message.payload;
        },
        [queryClient],
    );

    // Add a ref to track which code requests have been processed
    const processedCodeRequestIds = useRef(new Set());

    const handleSend = useCallback(
        async (text) => {
            try {
                // Reset streaming state (important before sending)
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
                    messages: userMessages.map((m) => ({
                        ...m,
                        payload: getMessagePayload(m),
                    })),
                    isChatLoading: true,
                    selectedEntityId: selectedEntityIdFromProp,
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
                            ? {
                                  role: "assistant",
                                  content: getMessagePayload(m),
                              }
                            : { role: "user", content: m.payload },
                    );

                conversation.push({ role: "user", content: text });

                const { contextId, aiMemorySelfModify, aiName, aiStyle } = user;

                // Use entity ID directly from the prop
                const currentSelectedEntityId = selectedEntityIdFromProp || "";

                const variables = {
                    chatHistory: conversation,
                    contextId,
                    // Use entity ID as aiName if available, else fallback to default
                    aiName: currentSelectedEntityId || user.aiName,
                    aiMemorySelfModify,
                    aiStyle,
                    title: chat?.title,
                    chatId,
                    stream: true,
                    entityId: currentSelectedEntityId,
                };

                // Perform RAG start query
                const result = await client.query({
                    query: QUERIES.SYS_ENTITY_AGENT,
                    variables,
                    fetchPolicy: "network-only",
                });

                const subscriptionId = result.data?.sys_entity_agent?.result;
                if (subscriptionId) {
                    // Set streaming state BEFORE setting subscription ID
                    setIsStreaming(true);

                    // Finally set the subscription ID which will trigger the subscription
                    setSubscriptionId(subscriptionId);

                    return; // Make sure we return here to prevent non-streaming handling
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
                            result.data.sys_entity_agent.result,
                        );
                    } catch {
                        resultObj = result.data.sys_entity_agent.result;
                    }
                    resultMessage = resultObj;
                    tool = result.data.sys_entity_agent.tool;
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
                    entityId: currentSelectedEntityId,
                });

                // Use messages directly without processing
                const currentMessagesToUpdate = currentMessages;

                // Create a task if codeRequestId is present in the tool
                if (
                    codeRequestId &&
                    !processedCodeRequestIds.current.has(codeRequestId)
                ) {
                    // Mark this codeRequestId as processed
                    processedCodeRequestIds.current.add(codeRequestId);

                    // Create the task first
                    await runTask.mutateAsync({
                        type: "coding",
                        codeRequestId: codeRequestId,
                        chatId: String(chat?._id),
                        source: "chat",
                    });
                }

                // Update the chat (never setting codeRequestId field)
                await updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    messages: currentMessagesToUpdate?.map((m) => ({
                        ...m,
                        payload: getMessagePayload(m),
                    })),
                    ...(newTitle && { title: newTitle }),
                    isChatLoading: !!toolCallbackName && !codeRequestId,
                    ...(toolCallbackId && { toolCallbackId }),
                    selectedEntityId: currentSelectedEntityId,
                });

                if (toolCallbackName && toolCallbackName !== "coding") {
                    const searchResult = await client.query({
                        query: QUERIES.SYS_ENTITY_CONTINUE,
                        variables: {
                            ...variables,
                            generatorPathway: toolCallbackName,
                        },
                        fetchPolicy: "network-only",
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
                        messages: finalMessagesToUpdate?.map((m) => ({
                            ...m,
                            payload: getMessagePayload(m),
                        })),
                        isChatLoading: false,
                        selectedEntityId: currentSelectedEntityId,
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
                    messages: errorMessagesToUpdate?.map((m) => ({
                        ...m,
                        payload: getMessagePayload(m),
                    })),
                    isChatLoading: false,
                    selectedEntityId: selectedEntityIdFromProp,
                });
            }
        },
        [
            chat,
            chatId,
            getMessagePayload,
            client,
            updateChatHook,
            handleError,
            t,
            clearStreamingState,
            memoizedMessages,
            runTask,
            t,
            updateChatHook,
            user,
            setIsStreaming,
            setSubscriptionId,
            handleError,
            selectedEntityIdFromProp,
        ],
    );

    useEffect(() => {
        // Only reset loading state if there's no active operation in progress
        if (
            chat?.isChatLoading &&
            !chat?.toolCallbackName &&
            !chat?.toolCallbackId
        ) {
            updateChatHook.mutateAsync({
                chatId: String(chat._id),
                messages:
                    chat.messages ||
                    []?.map((m) => ({
                        ...m,
                        payload: getMessagePayload(m),
                    })),
                isChatLoading: false,
                selectedEntityId: selectedEntityIdFromProp,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Update the streaming effect with guardrails
    useEffect(() => {
        const checkForCodeRequestInLatestMessage = async () => {
            // Only proceed if we were streaming but now it's stopped and we have messages
            if (!isStreaming && chat?.messages?.length > 0) {
                try {
                    // Get the latest message
                    const latestMessage =
                        chat.messages[chat.messages.length - 1];

                    // Skip if it's not from the assistant or doesn't have a tool
                    if (
                        latestMessage.sender !== "labeeb" ||
                        !latestMessage.tool
                    ) {
                        return;
                    }

                    // Parse the tool JSON
                    const tool = JSON.parse(latestMessage.tool);

                    // Check if there's a codeRequestId and we haven't processed it yet
                    if (
                        tool?.codeRequestId &&
                        !processedCodeRequestIds.current.has(tool.codeRequestId)
                    ) {
                        // Mark this codeRequestId as processed
                        processedCodeRequestIds.current.add(tool.codeRequestId);

                        // Create the task - the server will handle adding the progress message
                        await runTask.mutateAsync({
                            type: "coding",
                            codeRequestId: tool.codeRequestId,
                            chatId: String(chat._id),
                            source: "chat",
                        });
                    }
                } catch (error) {
                    console.error(
                        "Error checking latest message for code request:",
                        error,
                    );
                }
            }
        };

        checkForCodeRequestInLatestMessage();
    }, [isStreaming, chat, runTask, updateChatHook]);

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
            ephemeralContent={ephemeralContent}
            onStopStreaming={stopStreaming}
            thinkingDuration={thinkingDuration}
            isThinking={isThinking}
            selectedEntityId={selectedEntityIdFromProp}
        />
    );
}

export default React.memo(ChatContent);
