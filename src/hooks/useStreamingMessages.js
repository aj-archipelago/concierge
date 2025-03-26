import { useCallback, useRef, useState, useEffect } from "react";
import { useSubscription } from "@apollo/client";
import { SUBSCRIPTIONS } from "../graphql";
import { processImageUrls } from "../utils/imageUtils.mjs";
import { toast } from "react-toastify";

// Add utility function for chunking text
const chunkText = (text, maxChunkSize = 9) => {
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
    const ephemeralContentRef = useRef(""); // Track ephemeral content separately
    const hasReceivedPersistentRef = useRef(false); // Track if we've received non-ephemeral content
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
    const CHUNK_INTERVAL = 4; // ~225fps for 3x faster rendering (was 13ms)

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
        ephemeralContentRef.current = ""; // Clear ephemeral content
        hasReceivedPersistentRef.current = false; // Reset persistent content flag
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
        const finalContent = streamingMessageRef.current; // Only persistent content is saved

        // Process any image URLs in the final content
        const processedContent = await processImageUrls(
            finalContent,
            window.location.origin,
        );

        const toolString = JSON.stringify({
            ...accumulatedInfoRef.current,
            citations: accumulatedInfoRef.current.citations || [],
        });

        const codeRequestId = accumulatedInfoRef.current.codeRequestId;

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

            // Update chat with both the message and codeRequestId if we have coding tool info
            const hasCodeRequest = !!codeRequestId;

            const updatePayload = {
                chatId: String(chat._id),
                messages: updatedMessages,
                isChatLoading: hasCodeRequest,
            };

            if (hasCodeRequest) {
                updatePayload.codeRequestId = codeRequestId;
                updatePayload.lastCodeRequestId = codeRequestId;
                updatePayload.lastCodeRequestTime = new Date();
            }

            await updateChatHook.mutateAsync(updatePayload);
        } catch (error) {
            console.error("Failed to complete message:", error);
            toast.error("Failed to complete message");
            await updateChatHook.mutateAsync({
                chatId: String(chat?._id),
                isChatLoading: false,
            });
        } finally {
            completingMessageRef.current = false;
        }
    }, [chat, updateChatHook, clearStreamingState]);

    const stopStreaming = useCallback(async () => {
        if (chat?._id) {
            // If there's streaming content, complete the message
            if (streamingMessageRef.current) {
                await completeMessage();
            }

            // Always ensure isChatLoading is set to false when stopping
            await updateChatHook.mutateAsync({
                chatId: String(chat?._id),
                isChatLoading: false,
            });
        }
    }, [chat, completeMessage, updateChatHook]);

    const updateStreamingContent = useCallback(async (newContent, isEphemeral = false) => {
        if (completingMessageRef.current) return;
        
        if (isEphemeral) {
            // For ephemeral content, we're already getting the accumulated content
            // from processChunkQueue
            ephemeralContentRef.current = newContent;
            // Set the display content as the combination of persistent + ephemeral
            setStreamingContent(streamingMessageRef.current + ephemeralContentRef.current);
        } else {
            // This is persistent content - save it and mark that we've received some
            streamingMessageRef.current = newContent;
            hasReceivedPersistentRef.current = true;
            // Clear ephemeral when new persistent comes in
            ephemeralContentRef.current = "";
            setStreamingContent(newContent);
        }
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
        if (chunk.isEphemeral) {
            // For ephemeral chunks, accumulate the ephemeral content
            const newEphemeralContent = ephemeralContentRef.current + chunk.text;
            await updateStreamingContent(newEphemeralContent, true);
        } else {
            // For persistent chunks, update the streaming message
            const newPersistentContent = streamingMessageRef.current + chunk.text;
            await updateStreamingContent(newPersistentContent, false);
        }
        
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
            let isEphemeral = false;

            if (info) {
                try {
                    const parsedInfo =
                        typeof info === "string"
                            ? JSON.parse(info)
                            : typeof info === "object"
                            ? { ...info }
                            : {};
                    
                    // Check if the content is ephemeral
                    isEphemeral = !!parsedInfo.ephemeral;

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

                    // Store accumulated info
                    accumulatedInfoRef.current = {
                        ...accumulatedInfoRef.current,
                        ...parsedInfo,
                    };

                    // Always preserve citations array
                    accumulatedInfoRef.current.citations = [
                        ...(accumulatedInfoRef.current.citations || []),
                        ...(parsedInfo.citations || []),
                    ];
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
                    // Add each chunk with its ephemeral flag
                    chunkQueueRef.current.push(...chunks.map(chunk => ({ 
                        text: chunk,
                        isEphemeral
                    })));

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
            toast.error("Failed to process response data");

            if (chat?._id) {
                await updateChatHook.mutateAsync({
                    chatId: String(chat._id),
                    isChatLoading: false,
                });
            }
            clearStreamingState();
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
        clearStreamingState,
    ]);

    useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
        variables: { requestIds: [subscriptionId] },
        skip: !subscriptionId,
        onData: ({ data }) => {
            if (!data?.data || completingMessageRef.current) return;

            const progress = data.data.requestProgress?.progress;
            const result = data.data.requestProgress?.data;
            const info = data.data.requestProgress?.info;
            const error = data.data.requestProgress?.error;

            if (error) {
                toast.error(error);
                // Clear loading and streaming state when error is detected
                if (chat?._id) {
                    updateChatHook.mutateAsync({
                        chatId: String(chat._id),
                        isChatLoading: false,
                    });
                }
                clearStreamingState();
                return;
            }

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
