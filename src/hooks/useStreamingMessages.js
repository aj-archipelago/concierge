import { useCallback, useRef, useState, useEffect } from "react";
import { useSubscription } from "@apollo/client";
import { SUBSCRIPTIONS } from "../graphql";

export function useStreamingMessages({ chat, updateChatHook }) {
    const streamingMessageRef = useRef("");
    const messageQueueRef = useRef([]);
    const processingRef = useRef(false);
    const accumulatedInfoRef = useRef({});
    const updateTimeoutRef = useRef(null);
    const pendingTitleUpdateRef = useRef(null);
    const updatedTitleRef = useRef(null);
    const transitionTimeoutRef = useRef(null);
    const [subscriptionId, setSubscriptionId] = useState(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [streamingTool, setStreamingTool] = useState(null);
    const [isTitleUpdateInProgress, setTitleUpdateInProgress] = useState(false);
    const completingMessageRef = useRef(false);

    // Cleanup function for timeouts
    useEffect(() => {
        // Capture the ref value inside the effect
        const timeoutRef = updateTimeoutRef;
        const transitionRef = transitionTimeoutRef;
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            if (transitionRef.current) {
                clearTimeout(transitionRef.current);
            }
        };
    }, []);

    const clearStreamingState = useCallback(() => {
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        if (transitionTimeoutRef.current) {
            clearTimeout(transitionTimeoutRef.current);
        }
        streamingMessageRef.current = "";
        accumulatedInfoRef.current = {};
        pendingTitleUpdateRef.current = null;
        completingMessageRef.current = false;
        setStreamingContent("");
        setSubscriptionId(null);
        setIsStreaming(false);
        setStreamingTool(null);
        setTitleUpdateInProgress(false);
        messageQueueRef.current = [];
        processingRef.current = false;
    }, []);

    const completeMessage = useCallback(async () => {
        if (
            !chat?._id ||
            !streamingMessageRef.current ||
            completingMessageRef.current
        )
            return;

        completingMessageRef.current = true;
        const finalContent = streamingMessageRef.current; // Capture final content
        const toolString = JSON.stringify({
            ...accumulatedInfoRef.current,
            citations: accumulatedInfoRef.current.citations || [],
        });

        // Clear streaming state first
        clearStreamingState();

        try {
            // Find the last streaming message index, if it exists
            const messages = chat.messages || [];
            const lastStreamingIndex = messages.findLastIndex(
                (m) => m.isStreaming,
            );

            // If we found a streaming message, replace it; otherwise append
            const updatedMessages = [...messages];
            const newMessage = {
                payload: finalContent,
                tool: toolString,
                sentTime: "just now",
                direction: "incoming",
                position: "single",
                sender: "labeeb",
                isStreaming: false,
            };

            if (lastStreamingIndex !== -1) {
                updatedMessages[lastStreamingIndex] = newMessage;
            } else {
                updatedMessages.push(newMessage);
            }

            await updateChatHook.mutateAsync({
                chatId: String(chat._id),
                messages: updatedMessages,
                isChatLoading: false,
            });
        } catch (error) {
            console.error("Failed to complete message:", error);
        } finally {
            completingMessageRef.current = false;
        }
    }, [chat, updateChatHook, clearStreamingState]);

    const stopStreaming = useCallback(async () => {
        if (!chat?._id || !streamingMessageRef.current) return;
        await completeMessage();
    }, [chat, completeMessage]);

    const updateStreamingContent = useCallback(
        (newContent) => {
            if (completingMessageRef.current) return;

            streamingMessageRef.current = newContent;
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }

            // Only update if content has actually changed
            updateTimeoutRef.current = setTimeout(() => {
                if (
                    !completingMessageRef.current &&
                    streamingContent !== streamingMessageRef.current
                ) {
                    setStreamingContent(streamingMessageRef.current);
                }
            }, 16); // Approximately 60fps (1000ms/60 ≈ 16.67ms)
        },
        [streamingContent],
    );

    const processMessageQueue = useCallback(async () => {
        if (
            processingRef.current ||
            messageQueueRef.current.length === 0 ||
            completingMessageRef.current
        )
            return;

        processingRef.current = true;
        const message = messageQueueRef.current.shift();

        try {
            const { progress, result, info } = message;

            if (info) {
                try {
                    const parsedInfo =
                        typeof info === "string"
                            ? JSON.parse(info)
                            : typeof info === "object"
                              ? { ...info }
                              : {};

                    if (
                        parsedInfo.title &&
                        chat &&
                        !chat.titleSetByUser &&
                        chat.title !== parsedInfo.title &&
                        updatedTitleRef.current !== parsedInfo.title
                    ) {
                        // Mark the title as updated to prevent duplicate mutations
                        updatedTitleRef.current = parsedInfo.title;
                        if (!isTitleUpdateInProgress) {
                            setTitleUpdateInProgress(true);
                            updateChatHook
                                .mutateAsync({
                                    chatId: String(chat._id),
                                    title: parsedInfo.title,
                                })
                                .finally(() => {
                                    setTitleUpdateInProgress(false);
                                });
                        }
                    }

                    // Preserve all existing properties unless explicitly overwritten
                    const newAccumulatedInfo = {
                        ...accumulatedInfoRef.current,
                    };

                    // Only update properties that are present in parsedInfo
                    Object.entries(parsedInfo).forEach(([key, value]) => {
                        if (value !== undefined && value !== null) {
                            newAccumulatedInfo[key] = value;
                        }
                    });

                    // Always preserve citations array
                    newAccumulatedInfo.citations = [
                        ...(accumulatedInfoRef.current.citations || []),
                        ...(parsedInfo.citations || []),
                    ];

                    accumulatedInfoRef.current = newAccumulatedInfo;
                } catch (e) {
                    console.error("Failed to parse info block:", e);
                }
            }

            if (result) {
                let content;
                try {
                    const parsed = JSON.parse(result);
                    if (typeof parsed === "string") {
                        content = parsed;
                    } else if (parsed?.choices?.[0]?.delta?.content) {
                        content = parsed.choices[0].delta.content;
                    } else if (parsed?.content) {
                        content = parsed.content;
                    } else if (parsed?.message) {
                        content = parsed.message;
                    }
                } catch {
                    content = result;
                }

                if (content) {
                    updateStreamingContent(
                        streamingMessageRef.current + content,
                    );
                }
            }

            if (progress === 1) {
                await completeMessage();
            }
        } catch (e) {
            console.error("Failed to process subscription data:", e);
        }

        processingRef.current = false;

        // Schedule next message processing
        if (
            messageQueueRef.current.length > 0 &&
            !completingMessageRef.current
        ) {
            requestAnimationFrame(() => processMessageQueue());
        }
    }, [
        chat,
        updateStreamingContent,
        completeMessage,
        isTitleUpdateInProgress,
        updateChatHook,
    ]);

    useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
        variables: { requestIds: [subscriptionId] },
        skip: !subscriptionId,
        onData: ({ data }) => {
            if (!data?.data || completingMessageRef.current) return;

            const progress = data.data.requestProgress?.progress;
            const result = data.data.requestProgress?.data;
            const info = data.data.requestProgress?.info;

            if (result || progress === 1 || info) {
                messageQueueRef.current.push({
                    progress,
                    result: result || null,
                    info,
                });
                if (!processingRef.current) {
                    requestAnimationFrame(() => processMessageQueue());
                }
            }
        },
    });

    return {
        isStreaming,
        streamingContent,
        stopStreaming,
        setIsStreaming,
        setSubscriptionId,
        streamingMessageRef,
        clearStreamingState,
        streamingTool,
    };
}
