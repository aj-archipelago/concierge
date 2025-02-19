import { useCallback, useRef, useState, useEffect } from "react";
import { useSubscription } from "@apollo/client";
import { SUBSCRIPTIONS } from "../graphql";
import { processImageUrls } from "../utils/imageUtils";

// Add utility function for chunking text
const chunkText = (text, maxChunkSize = 3) => {
    if (!text || text.length <= maxChunkSize) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        // Try to break at natural boundaries like spaces, periods, or commas
        let chunkSize = Math.min(maxChunkSize, remaining.length);
        let chunk = remaining.slice(0, chunkSize);

        // If we're in the middle of a word and there's more text, try to break at a space
        if (
            remaining.length > chunkSize &&
            !remaining[chunkSize].match(/[\s.,!?]/)
        ) {
            const lastSpace = chunk.lastIndexOf(" ");
            if (lastSpace > 0) {
                chunkSize = lastSpace + 1;
                chunk = remaining.slice(0, chunkSize);
            }
        }

        chunks.push(chunk);
        remaining = remaining.slice(chunkSize);
    }

    return chunks;
};

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
    const chunkQueueRef = useRef([]);
    const lastChunkTimeRef = useRef(0);
    const CHUNK_INTERVAL = 13; // ~75fps for faster rendering

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
        chunkQueueRef.current = [];
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

        // Process any image URLs in the final content
        const processedContent = await processImageUrls(
            finalContent,
            window.location.origin,
        );

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
                payload: processedContent,
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

    const updateStreamingContent = useCallback(async (newContent) => {
        if (completingMessageRef.current) return;
        streamingMessageRef.current = newContent;

        // Process any image URLs in the streaming content
        const processedContent = await processImageUrls(
            newContent,
            window.location.origin,
        );
        setStreamingContent(processedContent);
    }, []);

    const processChunkQueue = useCallback(async () => {
        if (chunkQueueRef.current.length === 0 || completingMessageRef.current)
            return;

        const now = performance.now();
        if (now - lastChunkTimeRef.current < CHUNK_INTERVAL) {
            requestAnimationFrame(processChunkQueue);
            return;
        }

        const chunk = chunkQueueRef.current.shift();
        const newContent = streamingMessageRef.current + chunk;
        await updateStreamingContent(newContent);
        lastChunkTimeRef.current = now;

        if (chunkQueueRef.current.length > 0) {
            requestAnimationFrame(processChunkQueue);
        }
    }, [updateStreamingContent]);

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
                    // Skip processing if info starts with "ERROR:"
                    if (typeof info === "string" && info.startsWith("ERROR:")) {
                        console.warn("Skipping error info:", info);
                        return;
                    }

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
                    // Break content into smaller chunks and queue them
                    const chunks = chunkText(content);
                    chunkQueueRef.current.push(...chunks);

                    // Start processing chunks if not already processing
                    if (chunkQueueRef.current.length > 0) {
                        await processChunkQueue();
                    }
                }
            }

            if (progress === 1) {
                // Wait for all chunks to be processed before completing
                const waitForChunks = async () => {
                    if (chunkQueueRef.current.length > 0) {
                        await new Promise((resolve) => setTimeout(resolve, 10));
                        await waitForChunks();
                        return;
                    }
                    await completeMessage();
                };
                await waitForChunks();
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
            requestAnimationFrame(async () => await processMessageQueue());
        }
    }, [
        chat,
        completeMessage,
        isTitleUpdateInProgress,
        updateChatHook,
        processChunkQueue,
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
