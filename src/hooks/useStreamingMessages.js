import { useCallback, useRef, useState, useEffect } from "react";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";

export function useStreamingMessages({
    chat,
    updateChatHook,
    currentEntityId,
}) {
    const queryClient = useQueryClient();
    const streamingMessageRef = useRef("");
    const ephemeralContentRef = useRef(""); // Track ephemeral content separately
    const hasReceivedPersistentRef = useRef(false); // Track if we've received non-ephemeral content
    const messageQueueRef = useRef([]);
    const processingRef = useRef(false);
    const accumulatedInfoRef = useRef({});
    const [subscriptionId, setSubscriptionId] = useState(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [ephemeralContent, setEphemeralContent] = useState(""); // Add state for ephemeral content
    const [toolCalls, setToolCalls] = useState([]); // Track tool calls with their status
    const [thinkingDuration, setThinkingDuration] = useState(0); // Add thinking duration state
    const [isThinking, setIsThinking] = useState(false);
    const startTimeRef = useRef(null); // Track when current thinking period started
    const accumulatedThinkingTimeRef = useRef(0); // Track cumulative thinking time across all periods
    const isThinkingRef = useRef(false); // Track thinking state with ref for synchronous access
    const toolCallsMapRef = useRef(new Map()); // Map<callId, { icon, userMessage, status }>
    const streamReaderRef = useRef(null); // Ref to the stream reader for cancellation

    // Record the start time when streaming begins and update thinking duration
    useEffect(() => {
        if (isStreaming && startTimeRef.current === null) {
            startTimeRef.current = Date.now();
            accumulatedThinkingTimeRef.current = 0; // Reset accumulated time when streaming starts
            setThinkingDuration(0);
            setIsThinking(true);
            isThinkingRef.current = true; // Update ref synchronously
        }
    }, [isStreaming]);

    // Update thinking duration while streaming (cumulative)
    useEffect(() => {
        if (isStreaming && startTimeRef.current && isThinking) {
            const interval = setInterval(() => {
                const currentPeriodTime = Math.floor(
                    (Date.now() - startTimeRef.current) / 1000,
                );
                setThinkingDuration(
                    accumulatedThinkingTimeRef.current + currentPeriodTime,
                );
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [isStreaming, isThinking]);

    const clearStreamingState = useCallback(() => {
        streamingMessageRef.current = "";
        ephemeralContentRef.current = ""; // Clear ephemeral content
        hasReceivedPersistentRef.current = false; // Reset persistent content flag
        accumulatedInfoRef.current = {};
        setStreamingContent("");
        setEphemeralContent("");
        setToolCalls([]);
        setSubscriptionId(null);
        setIsStreaming(false);
        setThinkingDuration(0); // Reset thinking duration
        setIsThinking(false);
        isThinkingRef.current = false; // Update ref
        messageQueueRef.current = [];
        processingRef.current = false;
        startTimeRef.current = null; // Reset start time
        accumulatedThinkingTimeRef.current = 0; // Reset accumulated thinking time
        toolCallsMapRef.current.clear(); // Clear tool calls map
        streamReaderRef.current = null; // Clear stream reader ref
    }, []);

    const stopStreaming = useCallback(async () => {
        if (chat?._id) {
            // Cancel the stream reader immediately if it exists
            if (streamReaderRef.current) {
                streamReaderRef.current.cancel().catch(() => {
                    // Ignore cancellation errors
                });
                streamReaderRef.current = null;
            }
            // Set stopRequested flag and clear loading state on server
            // This sets the stop request flag, which will be checked against the subscription ID
            // on the server to prevent persisting the message
            await updateChatHook.mutateAsync({
                chatId: String(chat?._id),
                isChatLoading: false,
                stopRequested: true,
            });
            // Clear all streaming state immediately (includes setting subscriptionId to null)
            clearStreamingState();
        }
    }, [chat, updateChatHook, clearStreamingState]);

    // Track tool calls by callId
    const updateToolCalls = useCallback((toolMessage) => {
        if (!toolMessage || !toolMessage.callId) return;

        const { type, callId, icon, userMessage, success, error } = toolMessage;

        if (type === "start") {
            // Add or update tool call as active
            toolCallsMapRef.current.set(callId, {
                icon: icon || "🛠️",
                userMessage: userMessage || "Running tool...",
                status: "thinking",
            });
        } else if (type === "finish") {
            // Update tool call as completed
            const existing = toolCallsMapRef.current.get(callId);
            if (existing) {
                toolCallsMapRef.current.set(callId, {
                    ...existing,
                    status: success ? "completed" : "failed",
                    error: error || null,
                });
            }
        }

        // Convert map to array for state
        const toolCallsArray = Array.from(toolCallsMapRef.current.values());
        setToolCalls(toolCallsArray);
    }, []);

    const updateStreamingContent = useCallback(
        async (newContent, isEphemeral = false) => {
            if (newContent.trim() === "") return;

            if (isEphemeral) {
                // For ephemeral content, update the ephemeral content state
                ephemeralContentRef.current = newContent;
                setEphemeralContent(newContent);

                // If we're receiving ephemeral content while streaming, we should be thinking
                // Use ref for reliable synchronous access to thinking state
                const currentlyThinking = isThinkingRef.current || isThinking;

                // Helper to accumulate elapsed time and reset start time
                const accumulateThinkingTime = () => {
                    if (startTimeRef.current !== null) {
                        const elapsed = Math.floor(
                            (Date.now() - startTimeRef.current) / 1000,
                        );
                        accumulatedThinkingTimeRef.current += elapsed;
                        startTimeRef.current = null;
                    }
                };

                // Helper to start a new thinking period
                const startThinkingPeriod = () => {
                    startTimeRef.current = Date.now();
                    setIsThinking(true);
                    isThinkingRef.current = true;
                };

                // If we're not currently thinking (e.g., we received persistent content before),
                // restart the thinking counter to capture interstitial time between tool calls
                if (!currentlyThinking && isStreaming) {
                    accumulateThinkingTime();
                    startThinkingPeriod();
                } else if (currentlyThinking && startTimeRef.current === null) {
                    // If we're thinking but don't have a start time, set it now
                    startTimeRef.current = Date.now();
                }
            } else {
                // This is persistent content - save it and mark that we've received some
                // If we were thinking, accumulate the elapsed time before stopping
                const wasThinking = isThinkingRef.current || isThinking;
                if (wasThinking && startTimeRef.current !== null) {
                    const elapsed = Math.floor(
                        (Date.now() - startTimeRef.current) / 1000,
                    );
                    accumulatedThinkingTimeRef.current += elapsed;
                    startTimeRef.current = null;
                }
                setIsThinking(false);
                isThinkingRef.current = false;
                streamingMessageRef.current = newContent;
                hasReceivedPersistentRef.current = true;
                setStreamingContent(newContent);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- isStreaming and isThinking are intentionally omitted - refs (isThinkingRef) are used for synchronous access, and the callback should not recreate on every state change
        [],
    );

    const processMessageQueue = useCallback(async () => {
        if (processingRef.current || messageQueueRef.current.length === 0)
            return;

        processingRef.current = true;
        const message = messageQueueRef.current.shift();

        try {
            const { result, info } = message;
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

                    // Handle structured tool messages
                    if (parsedInfo.toolMessage) {
                        updateToolCalls(parsedInfo.toolMessage);

                        // If we receive a tool start message, we should be thinking
                        if (
                            parsedInfo.toolMessage.type === "start" &&
                            isStreaming
                        ) {
                            if (!isThinkingRef.current && !isThinking) {
                                // Start thinking period if not already thinking
                                if (startTimeRef.current === null) {
                                    startTimeRef.current = Date.now();
                                    accumulatedThinkingTimeRef.current = 0;
                                }
                                setIsThinking(true);
                                isThinkingRef.current = true;
                            }
                        }

                        // Tool messages should trigger processing even without result content
                        // The tool call update above will cause a re-render
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
                    // Update content directly - React will batch updates efficiently
                    if (isEphemeral) {
                        await updateStreamingContent(
                            ephemeralContentRef.current + content,
                            true,
                        );
                    } else {
                        await updateStreamingContent(
                            streamingMessageRef.current + content,
                            false,
                        );
                    }
                }
            }

            // Progress 1 means completion - handled by SSE complete event
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
        if (messageQueueRef.current.length > 0) {
            requestAnimationFrame(async () => await processMessageQueue());
        }
    }, [
        chat,
        updateChatHook,
        updateStreamingContent,
        clearStreamingState,
        updateToolCalls,
        isStreaming,
        isThinking,
    ]);

    // Refs to hold latest values of dependencies for the SSE effect
    // This allows the SSE effect to run only once per subscriptionId
    const latestChatRef = useRef(chat);
    const latestUpdateChatHookRef = useRef(updateChatHook);
    const latestClearStreamingStateRef = useRef(clearStreamingState);
    const latestProcessMessageQueueRef = useRef(processMessageQueue);
    const latestQueryClientRef = useRef(queryClient);
    const latestCurrentEntityIdRef = useRef(currentEntityId);

    useEffect(() => {
        latestChatRef.current = chat;
        latestUpdateChatHookRef.current = updateChatHook;
        latestClearStreamingStateRef.current = clearStreamingState;
        latestProcessMessageQueueRef.current = processMessageQueue;
        latestQueryClientRef.current = queryClient;
        latestCurrentEntityIdRef.current = currentEntityId;
    });

    // Handle SSE stream - subscriptionId must be a Response object (from fetch)
    useEffect(() => {
        if (!subscriptionId) return;

        // Check if subscriptionId is a Response object (from fetch)
        if (!(subscriptionId instanceof Response)) return;

        let cancelled = false;
        const reader = subscriptionId.body.getReader();
        streamReaderRef.current = reader; // Store reader ref for cancellation
        const decoder = new TextDecoder();
        let buffer = "";

        const readStream = async () => {
            try {
                while (!cancelled) {
                    const { done, value } = await reader.read();

                    if (done) {
                        // Stream completed - server should have persisted
                        // Refetch the complete persisted message BEFORE clearing streaming state
                        // This prevents flash (streaming disappears -> nothing -> message appears)
                        if (!cancelled && latestChatRef.current?._id) {
                            const chatId = String(latestChatRef.current._id);
                            // Refetch and wait for it to complete before clearing streaming
                            await latestQueryClientRef.current.refetchQueries({
                                queryKey: ["chat", chatId],
                            });
                            // Now clear streaming state - complete message is already in cache
                            latestClearStreamingStateRef.current();
                        } else if (!cancelled) {
                            latestClearStreamingStateRef.current();
                        }
                        break;
                    }

                    // Decode chunk and add to buffer
                    buffer += decoder.decode(value, { stream: true });

                    // Process complete SSE messages (lines ending with \n\n)
                    const lines = buffer.split("\n\n");
                    buffer = lines.pop() || ""; // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (cancelled) break;
                        if (line.startsWith("data: ")) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                const { event, data: eventData } = data;

                                if (event === "error") {
                                    toast.error(
                                        eventData?.error || "Stream error",
                                    );
                                    if (latestChatRef.current?._id) {
                                        const chatId = String(
                                            latestChatRef.current._id,
                                        );
                                        // Refetch before clearing to prevent flash
                                        await latestQueryClientRef.current.refetchQueries(
                                            {
                                                queryKey: ["chat", chatId],
                                            },
                                        );
                                        await latestUpdateChatHookRef.current.mutateAsync(
                                            {
                                                chatId,
                                                isChatLoading: false,
                                            },
                                        );
                                    }
                                    latestClearStreamingStateRef.current();
                                    return;
                                }

                                if (event === "complete") {
                                    // Server has persisted the complete message
                                    // Refetch BEFORE clearing streaming state to prevent flash
                                    if (latestChatRef.current?._id) {
                                        const chatId = String(
                                            latestChatRef.current._id,
                                        );
                                        // Refetch and wait for complete message before clearing streaming
                                        await latestQueryClientRef.current.refetchQueries(
                                            {
                                                queryKey: ["chat", chatId],
                                            },
                                        );
                                    }
                                    // Now clear streaming state - complete message is already in cache
                                    latestClearStreamingStateRef.current();
                                    return;
                                }

                                // Process data, info, and progress events
                                if (
                                    event === "data" ||
                                    event === "info" ||
                                    event === "progress"
                                ) {
                                    messageQueueRef.current.push({
                                        progress: eventData?.progress,
                                        result:
                                            event === "data"
                                                ? eventData?.result
                                                : null,
                                        info:
                                            event === "info"
                                                ? eventData?.info
                                                : null,
                                    });
                                    if (!processingRef.current) {
                                        requestAnimationFrame(() =>
                                            latestProcessMessageQueueRef.current(),
                                        );
                                    }
                                }
                            } catch (e) {
                                console.error("Error parsing SSE message:", e);
                            }
                        }
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Error reading SSE stream:", error);
                    toast.error("Stream connection error");
                    if (latestChatRef.current?._id) {
                        const chatId = String(latestChatRef.current._id);
                        // Refetch before clearing to prevent flash
                        await latestQueryClientRef.current.refetchQueries({
                            queryKey: ["chat", chatId],
                        });
                        await latestUpdateChatHookRef.current.mutateAsync({
                            chatId,
                            isChatLoading: false,
                        });
                    }
                    latestClearStreamingStateRef.current();
                }
            }
        };

        readStream();

        // Cleanup on unmount
        return () => {
            cancelled = true;
            streamReaderRef.current = null;
            reader.cancel().catch(() => {
                // Ignore cancellation errors
            });
        };
    }, [subscriptionId, queryClient]);

    return {
        isStreaming,
        streamingContent,
        ephemeralContent,
        toolCalls,
        stopStreaming,
        setIsStreaming,
        setSubscriptionId,
        streamingMessageRef,
        clearStreamingState,
        thinkingDuration,
        isThinking,
    };
}
