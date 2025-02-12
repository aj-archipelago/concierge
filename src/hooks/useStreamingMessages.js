import { useCallback, useRef, useState } from "react";
import { useSubscription } from "@apollo/client";
import { SUBSCRIPTIONS } from "../graphql";

export function useStreamingMessages({ chat, updateChatHook }) {
    const streamingMessageRef = useRef("");
    const messageQueueRef = useRef([]);
    const processingRef = useRef(false);
    const [subscriptionId, setSubscriptionId] = useState(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");

    const clearStreamingState = useCallback(() => {
        streamingMessageRef.current = "";
        setStreamingContent("");
        setSubscriptionId(null);
        setIsStreaming(false);
        messageQueueRef.current = [];
        processingRef.current = false;
    }, []);

    // Helper to commit streaming message in a consistent way
    const commitStreamingMessage = useCallback(async () => {
        if (!chat?._id || !streamingMessageRef.current) return;

        const baseMessages = (chat.messages || []).filter(
            (m) => !m.isStreaming,
        );
        await updateChatHook.mutateAsync({
            chatId: String(chat._id),
            messages: [
                ...baseMessages,
                {
                    payload: streamingMessageRef.current,
                    sentTime: "just now",
                    direction: "incoming",
                    position: "single",
                    sender: "labeeb",
                    isStreaming: true,
                },
            ],
            isChatLoading: false,
        });
    }, [chat, updateChatHook]);

    const stopStreaming = useCallback(async () => {
        if (!chat?._id) return;

        if (streamingMessageRef.current) {
            await commitStreamingMessage();
        }

        clearStreamingState();
    }, [chat, commitStreamingMessage, clearStreamingState]);

    // Modified streamChunkedContent to work with promises and simulate streaming
    const streamChunkedContent = useCallback((content, resolve) => {
        // Break into larger chunks for more efficient processing
        const chunks = content.match(/[\s\S]{1,50}(?=\s|$)/g) || [content];
        let currentIndex = 0;
        let rafId = null;
        let batchSize = 3; // Process multiple chunks per frame

        // Add the content to our ref immediately
        streamingMessageRef.current += content;

        const processNextBatch = () => {
            // If we've processed all chunks, clean up and resolve
            if (currentIndex >= chunks.length) {
                if (rafId) cancelAnimationFrame(rafId);
                resolve();
                return;
            }

            // Process a batch of chunks
            const endIndex = Math.min(currentIndex + batchSize, chunks.length);
            const partialContent = chunks.slice(0, endIndex).join("");

            // Update the visible content
            setStreamingContent(
                streamingMessageRef.current.slice(
                    0,
                    streamingMessageRef.current.length -
                        content.length +
                        partialContent.length,
                ),
            );

            currentIndex = endIndex;

            // Schedule next batch with a controlled delay
            rafId = setTimeout(() => {
                requestAnimationFrame(processNextBatch);
            }, 50); // Ensure at least 50ms between updates
        };

        requestAnimationFrame(processNextBatch);

        // Cleanup function
        return () => {
            if (rafId) clearTimeout(rafId);
        };
    }, []);

    // Process messages from the queue
    const processMessageQueue = useCallback(async () => {
        if (processingRef.current || messageQueueRef.current.length === 0)
            return;

        processingRef.current = true;
        const message = messageQueueRef.current.shift();

        try {
            const { progress, result } = message;

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
                    if (content.length > 50) {
                        await new Promise((resolve) => {
                            streamChunkedContent(content, resolve);
                        });
                    } else {
                        streamingMessageRef.current += content;
                        setStreamingContent(streamingMessageRef.current);
                    }
                }

                if (progress === 1 && streamingMessageRef.current) {
                    await commitStreamingMessage();

                    // Clear streaming state and refs
                    streamingMessageRef.current = "";
                    setStreamingContent("");
                    setSubscriptionId(null);
                    setIsStreaming(false);
                }
            }
        } catch (e) {
            console.error("Failed to process subscription data:", e);
        }

        processingRef.current = false;
        // Process next message if any
        if (messageQueueRef.current.length > 0) {
            setTimeout(() => processMessageQueue(), 0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chat, commitStreamingMessage, streamChunkedContent]);

    useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
        variables: { requestIds: [subscriptionId] },
        skip: !subscriptionId,
        onData: ({ data }) => {
            if (!data?.data) return;

            const progress = data.data.requestProgress?.progress;
            const result = data.data.requestProgress?.data;

            // Add new message to queue
            if (result) {
                try {
                    JSON.parse(result);

                    messageQueueRef.current.push({ progress, result });
                    // Trigger processing if not already processing
                    if (!processingRef.current) {
                        processMessageQueue();
                    }
                } catch (e) {
                    messageQueueRef.current.push({ progress, result });
                    if (!processingRef.current) {
                        processMessageQueue();
                    }
                }
            }

            // Always queue a progress=1 message to ensure completion
            if (progress === 1) {
                messageQueueRef.current.push({
                    progress,
                    result: result || null,
                });
                if (!processingRef.current) {
                    processMessageQueue();
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
    };
}
