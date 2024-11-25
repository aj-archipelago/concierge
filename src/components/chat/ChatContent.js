import React, { useCallback, useContext, useMemo, useEffect } from "react";
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
            if (message?.trim()) {
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

                // Show the user message immediately
                await updateChatHook.mutateAsync({
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
                let tool = null;
                let newTitle = null;
                let toolCallbackName = null;
                let toolCallbackId = null;
                let codeRequestId = null;
                try {
                    console.log("result", result);
                    let resultObj;
                    try {
                      resultObj = JSON.parse(result.data.rag_start.result);
                    } catch {
                      resultObj = { response: result.data.rag_start.result };
                    }
                    resultMessage = resultObj?.response || resultObj;
                    tool = result.data.rag_start.tool;
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

                await updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    messages: currentMessages,
                    ...(newTitle && { title: newTitle }),
                    isChatLoading: !!toolCallbackName,
                    ...(toolCallbackId && { toolCallbackId }),
                    ...(codeRequestId && { codeRequestId }),
                });

                if (toolCallbackName && toolCallbackName !== "coding") {
                    const searchResult = await client.query({
                        query: QUERIES.SYS_ENTITY_CONTINUE,
                        variables: {
                            ...variables,
                            generatorPathway: toolCallbackName,
                        },
                    });
                    const { result, tool } =
                        searchResult.data.sys_entity_continue;

                    // Validate the callback result
                    if (!result?.trim()) {
                        throw new Error(
                            "Received empty tool callback response",
                        );
                    }

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
                        payload: result,
                        tool: tool,
                        sentTime: "just now",
                        direction: "incoming",
                        position: "single",
                        sender: "labeeb",
                    });

                    await updateChatHook.mutateAsync({
                        chatId: String(chat?._id),
                        messages: finalMessages,
                        isChatLoading: false,
                    });
                }
            } catch (error) {
                handleError(error);
                // Ensure we set isChatLoading to false when there's an error
                await updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    messages: chat?.messages || [],
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
            selectedSources,
            handleError,
            chatId,
        ],
    );

    useEffect(() => {
        if (chat?.isChatLoading && !chat?.toolCallbackName) {
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
        />
    );
}

export default React.memo(ChatContent);
