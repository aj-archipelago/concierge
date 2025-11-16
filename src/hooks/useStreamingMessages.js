import { useCallback, useRef, useState, useEffect } from "react";
import { useSubscription } from "@apollo/client";
import { SUBSCRIPTIONS } from "../graphql";
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

export function useStreamingMessages({
    chat,
    updateChatHook,
    currentEntityId,
}) {
    const streamingMessageRef = useRef("");
    const ephemeralContentRef = useRef(""); // Track ephemeral content separately
    const hasReceivedPersistentRef = useRef(false); // Track if we've received non-ephemeral content
    const messageQueueRef = useRef([]);
    const processingRef = useRef(false);
    const accumulatedInfoRef = useRef({});
    const updateTimeoutRef = useRef(null);
    const pendingTitleUpdateRef = useRef(null);
    const transitionTimeoutRef = useRef(null);
    const [subscriptionId, setSubscriptionId] = useState(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [ephemeralContent, setEphemeralContent] = useState(""); // Add state for ephemeral content
    const [streamingTool, setStreamingTool] = useState(null);
    const [thinkingDuration, setThinkingDuration] = useState(0); // Add thinking duration state
    const [isThinking, setIsThinking] = useState(false);
    const completingMessageRef = useRef(false);
    const chunkQueueRef = useRef([]);
    const lastChunkTimeRef = useRef(0);
    const CHUNK_INTERVAL = 4; // ~225fps for 3x faster rendering (was 13ms)
    const startTimeRef = useRef(null); // Track when current thinking period started
    const accumulatedThinkingTimeRef = useRef(0); // Track cumulative thinking time across all periods

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

    // Record the start time when streaming begins and update thinking duration
    useEffect(() => {
        if (isStreaming && startTimeRef.current === null) {
            startTimeRef.current = Date.now();
            accumulatedThinkingTimeRef.current = 0; // Reset accumulated time when streaming starts
            setThinkingDuration(0);
            setIsThinking(true);
        }
    }, [isStreaming]);

    // Update thinking duration while streaming (cumulative)
    useEffect(() => {
        if (isStreaming && startTimeRef.current && isThinking) {
            const interval = setInterval(() => {
                const currentPeriodTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
                setThinkingDuration(
                    accumulatedThinkingTimeRef.current + currentPeriodTime,
                );
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [isStreaming, isThinking]);

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
        setEphemeralContent("");
        setSubscriptionId(null);
        setIsStreaming(false);
        setStreamingTool(null);
        setThinkingDuration(0); // Reset thinking duration
        setIsThinking(false);
        messageQueueRef.current = [];
        processingRef.current = false;
        chunkQueueRef.current = [];
        startTimeRef.current = null; // Reset start time
        accumulatedThinkingTimeRef.current = 0; // Reset accumulated thinking time
    }, []);

    const completeMessage = useCallback(async () => {
        if (
            !chat?._id ||
            (!streamingMessageRef.current && !ephemeralContentRef.current) ||
            completingMessageRef.current
        )
            return;

        completingMessageRef.current = true;

        // If we have no persistent content but do have ephemeral content, use the ephemeral content
        let finalContent = streamingMessageRef.current;
        if (!hasReceivedPersistentRef.current && ephemeralContentRef.current) {
            finalContent = ephemeralContentRef.current;
        }

        const processedContent = finalContent;

        const toolString = JSON.stringify({
            ...accumulatedInfoRef.current,
            citations: accumulatedInfoRef.current.citations || [],
        });

        const codeRequestId = accumulatedInfoRef.current.codeRequestId;

        const finalEphemeralContent = ephemeralContentRef.current;

        // Capture final thinking duration before clearing state
        let finalThinkingDuration = thinkingDuration;
        if (isThinking && startTimeRef.current !== null) {
            const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
            finalThinkingDuration = accumulatedThinkingTimeRef.current + elapsed;
        }

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
                sentTime: new Date().toISOString(),
                direction: "incoming",
                position: "single",
                sender: "labeeb",
                entityId: currentEntityId,
                isStreaming: false,
                ephemeralContent: finalEphemeralContent || "",
                thinkingDuration: finalThinkingDuration,
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
    }, [
        chat,
        updateChatHook,
        clearStreamingState,
        thinkingDuration,
        isThinking,
        currentEntityId,
    ]);

    const stopStreaming = useCallback(async () => {
        if (chat?._id) {
            try {
                // If there's streaming content, complete the message
                if (streamingMessageRef.current) {
                    await completeMessage();
                }
            } catch (error) {
                console.error("Error completing message during stop:", error);
            } finally {
                // Always ensure isChatLoading is set to false when stopping
                await updateChatHook.mutateAsync({
                    chatId: String(chat?._id),
                    isChatLoading: false,
                });
                // Clear all streaming state
                clearStreamingState();
                // Reset subscription ID to stop any ongoing requests
                setSubscriptionId(null);
            }
        }
    }, [
        chat,
        completeMessage,
        updateChatHook,
        clearStreamingState,
        setSubscriptionId,
    ]);

    const updateStreamingContent = useCallback(
        async (newContent, isEphemeral = false) => {
            if (completingMessageRef.current) return;
            if (newContent.trim() === "") return;

            if (isEphemeral) {
                // For ephemeral content, update the ephemeral content state
                ephemeralContentRef.current = newContent;
                setEphemeralContent(newContent);
                
                // If we're not currently thinking (e.g., we received persistent content before),
                // restart the thinking counter to capture interstitial time between tool calls
                if (!isThinking && isStreaming) {
                    // Accumulate the previous thinking period if there was one
                    if (startTimeRef.current !== null) {
                        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                        accumulatedThinkingTimeRef.current += elapsed;
                    }
                    // Start a new thinking period
                    startTimeRef.current = Date.now();
                    setIsThinking(true);
                }
            } else {
                // This is persistent content - save it and mark that we've received some
                // If we were thinking, accumulate the elapsed time before stopping
                if (isThinking && startTimeRef.current !== null) {
                    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                    accumulatedThinkingTimeRef.current += elapsed;
                    startTimeRef.current = null;
                }
                setIsThinking(false);
                streamingMessageRef.current = newContent;
                hasReceivedPersistentRef.current = true;
                setStreamingContent(newContent);
            }
        },
        [isThinking, isStreaming],
    );

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
            const newEphemeralContent =
                ephemeralContentRef.current + chunk.text;
            await updateStreamingContent(newEphemeralContent, true);
        } else {
            // For persistent chunks, update the streaming message
            const newPersistentContent =
                streamingMessageRef.current + chunk.text;
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
                    chunkQueueRef.current.push(
                        ...chunks.map((chunk) => ({
                            text: chunk,
                            isEphemeral,
                        })),
                    );

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
        ephemeralContent,
        stopStreaming,
        setIsStreaming,
        setSubscriptionId,
        streamingMessageRef,
        clearStreamingState,
        streamingTool,
        thinkingDuration,
        isThinking,
    };
}
