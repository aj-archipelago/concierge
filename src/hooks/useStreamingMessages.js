import { useCallback, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { NEW_CHAT_ID } from "../../app/utils/chatClientIds";
import {
    normalizeChatForCache,
    syncInFlightChatCache,
} from "../../app/queries/chats";
import {
    appendAssistantThinkingSummary,
    appendAssistantTextChunk,
    appendAssistantThinkingChunk,
    buildAssistantPayloadFromItems,
    buildInlineAssistantPayload,
    buildLegacyInlineAssistantPayloadItems,
    createAssistantToolEventItem,
    updateAssistantThinkingDuration,
    upsertAssistantToolEvent,
} from "../utils/assistantInlinePayload";

const STREAM_KEY = (chatId) => ["stream", chatId];
const FRAME_FALLBACK_MS = 16;

const scheduleNextPaint = (callback) => {
    let completed = false;
    let rafId = null;
    let timeoutId = null;

    const finish = () => {
        if (completed) return;
        completed = true;
        if (rafId != null && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(rafId);
        }
        if (timeoutId != null) {
            clearTimeout(timeoutId);
        }
        callback();
    };

    if (typeof requestAnimationFrame === "function") {
        rafId = requestAnimationFrame(finish);
    }
    timeoutId = setTimeout(finish, FRAME_FALLBACK_MS);

    return () => {
        if (completed) return;
        completed = true;
        if (rafId != null && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(rafId);
        }
        if (timeoutId != null) {
            clearTimeout(timeoutId);
        }
    };
};

const waitForNextPaint = () =>
    new Promise((resolve) => {
        scheduleNextPaint(resolve);
    });

const getLegacyInlineItems = (state = {}) =>
    buildLegacyInlineAssistantPayloadItems({
        ephemeralContent: state.ephemeralContent,
        toolCalls: state.toolCalls,
        thinkingDuration: state.thinkingDuration,
    });

const getStreamInlineItems = (state = {}) =>
    Array.isArray(state.inlinePayloadItems) &&
    state.inlinePayloadItems.length > 0
        ? state.inlinePayloadItems
        : getLegacyInlineItems(state);

const getToolEventMap = (state = {}) =>
    new Map((state.toolEventMap || []).map(([k, v]) => [k, v]));

export const hasActiveStream = (queryClient, chatId) => {
    const state = queryClient.getQueryData(STREAM_KEY(chatId));
    return !!state?.reader && state?.isStreaming !== false;
};

export function useStreamingMessages({
    chat,
    updateChatHook,
    onClientSideToolCall,
    onChatPromoted,
    onStreamComplete,
    onStreamDetached,
    onServerToolFinish,
}) {
    const queryClient = useQueryClient();
    const chatId = chat?._id ? String(chat._id) : null;
    const promotedStreamChatIdRef = useRef(null);
    const processQueueRef = useRef(null);

    const refs = useRef({
        queue: [],
        processing: false,
        queueScheduled: false,
        processedTools: new Set(),
    });

    const getMirroredStreamChatIds = useCallback(
        (baseChatId = chatId) => {
            const ids = new Set();
            if (baseChatId) {
                ids.add(String(baseChatId));
            }

            if (promotedStreamChatIdRef.current) {
                ids.add(String(promotedStreamChatIdRef.current));
            }

            return [...ids];
        },
        [chatId],
    );

    // Only subscribe to isStreaming changes — display values are read by useStreamingDisplay
    const { data: isStreaming = false } = useQuery({
        queryKey: STREAM_KEY(chatId),
        queryFn: () => queryClient.getQueryData(STREAM_KEY(chatId)) || {},
        select: (data) => !!data?.isStreaming,
        enabled: !!chatId,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const setStream = useCallback(
        (updates) => {
            getMirroredStreamChatIds().forEach((targetChatId) => {
                const current =
                    queryClient.getQueryData(STREAM_KEY(targetChatId)) || {};
                queryClient.setQueryData(STREAM_KEY(targetChatId), {
                    ...current,
                    ...updates,
                });
            });
        },
        [getMirroredStreamChatIds, queryClient],
    );

    const startPendingStream = useCallback(() => {
        if (!chatId) return;
        if (chatId === NEW_CHAT_ID) {
            promotedStreamChatIdRef.current = null;
        }
        const current = queryClient.getQueryData(STREAM_KEY(chatId)) || {};
        if (current.isStreaming) return;
        queryClient.setQueryData(STREAM_KEY(chatId), {
            ...current,
            chatId,
            isStreaming: true,
            reader: current.reader || null,
            streamingContent: current.streamingContent || "",
            thinkingContent: current.thinkingContent || "",
            inlinePayloadItems: current.inlinePayloadItems || [],
            toolEventMap: current.toolEventMap || [],
            activeTextIndex: current.activeTextIndex ?? null,
            activeThinkingIndex: current.activeThinkingIndex ?? null,
            currentResultIsEphemeral: current.currentResultIsEphemeral || false,
            thinkingDuration: current.thinkingDuration || 0,
            isThinking: true,
            startTime: current.startTime || Date.now(),
        });
    }, [chatId, queryClient]);

    const clearStream = useCallback(() => {
        getMirroredStreamChatIds().forEach((targetChatId) => {
            const state = queryClient.getQueryData(STREAM_KEY(targetChatId));
            state?.reader?.cancel?.().catch(() => {});
            queryClient.removeQueries({ queryKey: STREAM_KEY(targetChatId) });
        });
    }, [getMirroredStreamChatIds, queryClient]);

    const stopStreaming = useCallback(async () => {
        clearStream();
        if (chatId) {
            await updateChatHook.mutateAsync({
                chatId,
                isChatLoading: false,
                stopRequested: true,
            });
        }
    }, [chatId, updateChatHook, clearStream]);

    const scheduleProcessQueue = useCallback(() => {
        const r = refs.current;
        if (r.queueScheduled) return;
        r.queueScheduled = true;

        scheduleNextPaint(() => {
            refs.current.queueScheduled = false;
            void processQueueRef.current?.();
        });
    }, []);

    const applyStreamToolMessage = useCallback(
        (toolMessage, state = {}) => {
            if (!toolMessage?.callId) {
                return;
            }

            const {
                type,
                callId,
                icon,
                userMessage,
                success,
                error,
                presentation,
            } = toolMessage;
            const toolEventMap = getToolEventMap(state);
            const existingMeta = toolEventMap.get(callId);
            const existingItem = parseToolEventAtIndex(
                getStreamInlineItems(state),
                existingMeta?.index ?? null,
            );

            if (type === "start") {
                const toolEvent = createAssistantToolEventItem({
                    callId,
                    icon: icon || "🛠️",
                    userMessage: userMessage || "Running...",
                    status: "thinking",
                    presentation:
                        presentation || existingItem?.presentation || "default",
                });
                const nextInline = upsertAssistantToolEvent(
                    getStreamInlineItems(state),
                    toolEvent,
                    existingMeta?.index ?? null,
                );
                toolEventMap.set(callId, { index: nextInline.index });
                setStream({
                    toolEventMap: [...toolEventMap.entries()],
                    inlinePayloadItems: nextInline.items,
                    activeTextIndex: null,
                    activeThinkingIndex: null,
                });
                return;
            }

            if (type === "finish") {
                const toolEvent = {
                    ...(existingItem ||
                        createAssistantToolEventItem({
                            callId,
                            icon: icon || "🛠️",
                            userMessage: userMessage || "Running...",
                            status: "completed",
                        })),
                    icon: icon || existingItem?.icon || "🛠️",
                    userMessage:
                        userMessage ||
                        existingItem?.userMessage ||
                        "Running...",
                    status: success ? "completed" : "failed",
                    error,
                    presentation:
                        presentation || existingItem?.presentation || "default",
                };
                const nextInline = upsertAssistantToolEvent(
                    getStreamInlineItems(state),
                    toolEvent,
                    existingMeta?.index ?? null,
                );
                toolEventMap.set(callId, { index: nextInline.index });
                setStream({
                    toolEventMap: [...toolEventMap.entries()],
                    inlinePayloadItems: nextInline.items,
                });

                if (success) {
                    onServerToolFinish?.();
                }
            }
        },
        [onServerToolFinish, setStream],
    );

    const processQueue = useCallback(async () => {
        const r = refs.current;
        if (r.processing || !r.queue.length) return;

        r.processing = true;
        const msg = r.queue.shift();

        try {
            const state = queryClient.getQueryData(STREAM_KEY(chatId)) || {};

            if (msg.info) {
                let info = msg.info;
                if (typeof info === "string") {
                    try {
                        info = JSON.parse(info);
                    } catch {
                        info = {};
                    }
                }

                if (typeof info.ephemeral === "boolean") {
                    setStream({
                        currentResultIsEphemeral: info.ephemeral,
                    });
                }

                if (
                    info.clientSideTool &&
                    info.toolCallbackId &&
                    !r.processedTools.has(info.toolCallbackId)
                ) {
                    r.processedTools.add(info.toolCallbackId);
                    if (onClientSideToolCall) {
                        Promise.resolve(onClientSideToolCall(info)).catch(
                            () => {},
                        );
                    }
                }

                if (info.toolMessage) {
                    applyStreamToolMessage(info.toolMessage, state);
                }
            }

            if (msg.result) {
                let content;
                try {
                    const p = JSON.parse(msg.result);
                    content =
                        typeof p === "string"
                            ? p
                            : p?.choices?.[0]?.delta?.content ||
                              p?.content ||
                              p?.message;
                } catch {
                    content = msg.result;
                }

                if (content) {
                    const s =
                        queryClient.getQueryData(STREAM_KEY(chatId)) || {};
                    const currentItems = getStreamInlineItems(s);
                    if (s.currentResultIsEphemeral) {
                        const thinkingContent =
                            (s.thinkingContent || s.ephemeralContent || "") +
                            content;
                        const nextInline = appendAssistantThinkingChunk(
                            currentItems,
                            content,
                            s.thinkingDuration || 0,
                            s.activeThinkingIndex ?? null,
                        );
                        setStream({
                            thinkingContent,
                            inlinePayloadItems: nextInline.items,
                            activeThinkingIndex: nextInline.index,
                            activeTextIndex: null,
                        });
                    } else {
                        const newTime = s.startTime
                            ? Math.floor((Date.now() - s.startTime) / 1000)
                            : s.thinkingDuration || 0;
                        const nextInline = appendAssistantTextChunk(
                            currentItems,
                            content,
                            s.activeTextIndex ?? null,
                        );
                        setStream({
                            streamingContent:
                                (s.streamingContent || "") + content,
                            thinkingDuration: newTime,
                            inlinePayloadItems: updateAssistantThinkingDuration(
                                nextInline.items,
                                s.activeThinkingIndex ?? null,
                                newTime,
                            ),
                            activeTextIndex: nextInline.index,
                            activeThinkingIndex: s.activeThinkingIndex ?? null,
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Process queue error:", e);
        }

        r.processing = false;
        if (r.queue.length) {
            scheduleProcessQueue();
        }
    }, [
        applyStreamToolMessage,
        chatId,
        setStream,
        onClientSideToolCall,
        queryClient,
        scheduleProcessQueue,
    ]);
    processQueueRef.current = processQueue;

    const flushPendingQueue = useCallback(async () => {
        while (refs.current.processing || refs.current.queue.length) {
            if (!refs.current.processing && refs.current.queue.length) {
                scheduleProcessQueue();
            }
            await waitForNextPaint();
        }
    }, [scheduleProcessQueue]);

    const setSubscriptionId = useCallback(
        (response) => {
            if (!(response instanceof Response) || !chatId) return;

            promotedStreamChatIdRef.current = null;
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let cancelled = false;
            let resolvedChatId = chatId;
            let endStreamPromise = null;

            const clearDetachedStreamState = () => {
                const targetChatIds = new Set([String(chatId)]);
                if (resolvedChatId) {
                    targetChatIds.add(String(resolvedChatId));
                }

                refs.current.queue = [];
                refs.current.processing = false;
                refs.current.queueScheduled = false;

                targetChatIds.forEach((targetChatId) => {
                    const state = queryClient.getQueryData(
                        STREAM_KEY(targetChatId),
                    );
                    state?.reader?.cancel?.().catch(() => {});
                    queryClient.removeQueries({
                        queryKey: STREAM_KEY(targetChatId),
                    });
                });
            };

            const pendingState =
                queryClient.getQueryData(STREAM_KEY(chatId)) || {};
            queryClient.setQueryData(STREAM_KEY(chatId), {
                ...pendingState,
                chatId,
                isStreaming: true,
                reader,
                streamingContent: pendingState.streamingContent || "",
                thinkingContent: pendingState.thinkingContent || "",
                inlinePayloadItems: pendingState.inlinePayloadItems || [],
                toolEventMap: pendingState.toolEventMap || [],
                activeTextIndex: pendingState.activeTextIndex ?? null,
                activeThinkingIndex: pendingState.activeThinkingIndex ?? null,
                currentResultIsEphemeral:
                    pendingState.currentResultIsEphemeral || false,
                thinkingDuration: pendingState.thinkingDuration || 0,
                isThinking: true,
                startTime: pendingState.startTime || Date.now(),
            });

            const endStream = async () => {
                if (endStreamPromise) {
                    return endStreamPromise;
                }

                endStreamPromise = (async () => {
                    await flushPendingQueue();

                    // 1. Read accumulated stream data before cleanup.
                    //    After promotion, stream updates only go to
                    //    STREAM_KEY(resolvedChatId), so read from there first.
                    const s =
                        (resolvedChatId &&
                            resolvedChatId !== chatId &&
                            queryClient.getQueryData(
                                STREAM_KEY(resolvedChatId),
                            )) ||
                        queryClient.getQueryData(STREAM_KEY(chatId));
                    const content = s?.streamingContent || "";
                    const thinkingContent =
                        s?.thinkingContent || s?.ephemeralContent || "";
                    const duration = s?.startTime
                        ? Math.floor((Date.now() - s.startTime) / 1000)
                        : s?.thinkingDuration || 0;
                    const hasStoredInlineItems =
                        Array.isArray(s?.inlinePayloadItems) &&
                        s.inlinePayloadItems.length > 0;
                    const finalizedInlineItems = hasStoredInlineItems
                        ? appendAssistantThinkingSummary(
                              updateAssistantThinkingDuration(
                                  s.inlinePayloadItems,
                                  s?.activeThinkingIndex ?? null,
                                  duration,
                              ),
                              duration,
                          )
                        : [];

                    // 2. Cancel reader; remove stream state after cache reconciliation
                    s?.reader?.cancel?.().catch(() => {});

                    // 3. Write AI message directly to cached chat (synchronous, uncancelable)
                    const targetChatId = resolvedChatId;
                    const payload = hasStoredInlineItems
                        ? buildAssistantPayloadFromItems(finalizedInlineItems)
                        : buildInlineAssistantPayload({
                              content,
                              thinkingContent,
                              thinkingDuration: duration,
                              toolEvents: s?.toolCalls || [],
                          });
                    const assistantMessage = payload
                        ? {
                              payload,
                              sender: "assistant",
                              sentTime: new Date().toISOString(),
                              direction: "incoming",
                              position: "single",
                              entityId: chat?.selectedEntityId || null,
                              isServerGenerated: true,
                              _id: null,
                              _clientId: `stream-end:${targetChatId}:${Date.now()}`,
                              tool: null,
                              taskId: null,
                              task: null,
                          }
                        : null;
                    onStreamComplete?.({
                        chatId: targetChatId,
                        payload,
                        assistantMessage,
                        content,
                        thinkingContent,
                        thinkingDuration: duration,
                    });

                    // 4. Background reconciliation — server version replaces the
                    //    pending assistant row with the persisted message once the
                    //    backend finishes writing it.
                    //    Delayed to give the server time to persist the AI message
                    //    before we refetch; an immediate invalidation races with DB writes.
                    const chatQuery = queryClient
                        .getQueryCache()
                        .find({ queryKey: ["chat", targetChatId] });
                    if (chatQuery?.options?.queryFn) {
                        setTimeout(() => {
                            queryClient.invalidateQueries({
                                queryKey: ["chat", targetChatId],
                            });
                        }, 3000);
                    }

                    // 5. Clear stream state after the final assistant payload has been emitted.
                    queryClient.removeQueries({ queryKey: STREAM_KEY(chatId) });
                    if (resolvedChatId && resolvedChatId !== chatId) {
                        queryClient.removeQueries({
                            queryKey: STREAM_KEY(resolvedChatId),
                        });
                    }
                })();

                return endStreamPromise;
            };

            const promotePendingChat = (newId) => {
                if (chatId === newId || chatId !== NEW_CHAT_ID) return;
                resolvedChatId = newId;
                promotedStreamChatIdRef.current = newId;
                const cached = queryClient.getQueryData(["chat", chatId]);
                if (cached) {
                    queryClient.setQueryData(
                        ["chat", newId],
                        normalizeChatForCache(cached, {
                            ...cached,
                            _id: newId,
                            isTemporary: false,
                        }),
                    );
                    // Defer removal of old query so React can process the
                    // promotion state updates first.  Removing it synchronously
                    // can briefly null-out urlChat in Chat.js before
                    // setPromotedChatId has been committed, causing a flash.
                    setTimeout(() => {
                        queryClient.removeQueries({
                            queryKey: ["chat", chatId],
                        });
                    }, 0);
                }
                // Copy stream state so hasActiveStream(newId) returns true —
                // prevents useGetChatById from polling the server mid-stream.
                const streamState = queryClient.getQueryData(
                    STREAM_KEY(chatId),
                );
                if (streamState) {
                    queryClient.setQueryData(STREAM_KEY(newId), streamState);
                }
                if (onChatPromoted) {
                    onChatPromoted(newId, chatId);
                } else {
                    queryClient.setQueryData(["activeChats"], (old = []) =>
                        old.map((c) =>
                            String(c._id) === chatId ? { ...c, _id: newId } : c,
                        ),
                    );
                    queryClient.setQueryData(["userChatInfo"], (old) => ({
                        ...old,
                        activeChatId: newId,
                        recentChatIds: [
                            newId,
                            ...(old?.recentChatIds || []).filter(
                                (id) => id !== newId && id !== chatId,
                            ),
                        ],
                    }));
                    window.dispatchEvent(
                        new CustomEvent("chatIdUpdate", {
                            detail: { chatId: newId },
                        }),
                    );
                }
            };

            (async () => {
                try {
                    while (!cancelled) {
                        const { done, value } = await reader.read();
                        if (done) {
                            cancelled = true;
                            await endStream();
                            break;
                        }

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n\n");
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            if (!line.startsWith("data: ")) continue;
                            try {
                                const { event, data: d } = JSON.parse(
                                    line.slice(6),
                                );
                                if (event === "chatId" && d?.chatId)
                                    promotePendingChat(String(d.chatId));
                                else if (
                                    event === "subscriptionId" &&
                                    d?.subscriptionId
                                ) {
                                    const targetId = resolvedChatId;
                                    const cached = queryClient.getQueryData([
                                        "chat",
                                        targetId,
                                    ]);
                                    if (cached) {
                                        syncInFlightChatCache(
                                            queryClient,
                                            targetId,
                                            {
                                                serverChat: cached,
                                                activeSubscriptionId:
                                                    d.subscriptionId,
                                            },
                                        );
                                    }
                                } else if (event === "error") {
                                    cancelled = true;
                                    toast.error(d?.error || "Error");
                                    await endStream();
                                    break;
                                } else if (event === "complete") {
                                    cancelled = true;
                                    await endStream();
                                    break;
                                } else if (
                                    event === "data" ||
                                    event === "info" ||
                                    event === "progress"
                                ) {
                                    refs.current.queue.push({
                                        progress: d?.progress,
                                        result:
                                            event === "data" ? d?.result : null,
                                        info: event === "info" ? d?.info : null,
                                    });
                                    if (!refs.current.processing) {
                                        scheduleProcessQueue();
                                    }
                                }
                            } catch (e) {
                                console.error("Parse error:", e);
                            }
                        }
                    }
                } catch (e) {
                    if (!cancelled) {
                        cancelled = true;
                        const targetChatId = String(
                            resolvedChatId || chatId || "",
                        );
                        const streamStillActive = Boolean(
                            queryClient.getQueryData(
                                STREAM_KEY(targetChatId || chatId),
                            ),
                        );
                        if (!streamStillActive) {
                            return;
                        }
                        console.warn("Stream detached from client:", e);
                        clearDetachedStreamState();
                        if (targetChatId) {
                            queryClient.setQueryData(
                                ["chatSending", targetChatId],
                                null,
                            );
                        }
                        onStreamDetached?.({
                            chatId: targetChatId,
                        });
                    }
                }
            })();
        },
        [
            chatId,
            chat?.selectedEntityId,
            queryClient,
            scheduleProcessQueue,
            flushPendingQueue,
            onChatPromoted,
            onStreamComplete,
            onStreamDetached,
        ],
    );

    useEffect(() => {
        if (!isStreaming) return;
        const interval = setInterval(() => {
            const s = queryClient.getQueryData(STREAM_KEY(chatId)) || {};
            if (s.startTime) {
                const nextDuration = Math.floor(
                    (Date.now() - s.startTime) / 1000,
                );
                setStream({
                    thinkingDuration: nextDuration,
                    inlinePayloadItems: updateAssistantThinkingDuration(
                        getStreamInlineItems(s),
                        s.activeThinkingIndex ?? null,
                        nextDuration,
                    ),
                });
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [isStreaming, queryClient, chatId, setStream]);

    useEffect(() => {
        if (chatId === NEW_CHAT_ID || !isStreaming) {
            promotedStreamChatIdRef.current = null;
        }
    }, [chatId, isStreaming]);

    useEffect(() => {
        if (
            isStreaming &&
            hasActiveStream(queryClient, chatId) &&
            chat?.isChatLoading === false
        ) {
            clearStream();
        }
    }, [isStreaming, chat?.isChatLoading, queryClient, chatId, clearStream]);

    return {
        isStreaming,
        streamingChatId: isStreaming ? chatId : null,
        stopStreaming,
        setIsStreaming: (v) => {
            if (!v) {
                clearStream();
                return;
            }
            startPendingStream();
        },
        setSubscriptionId,
        clearStreamingState: clearStream,
    };
}

// Lightweight hook for components that only need streaming display values.
// Subscribes to all streaming state changes (every SSE chunk).
export function useStreamingDisplay(chatId) {
    const queryClient = useQueryClient();
    const { data: streamState = {} } = useQuery({
        queryKey: STREAM_KEY(chatId),
        queryFn: () => queryClient.getQueryData(STREAM_KEY(chatId)) || {},
        enabled: !!chatId,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    return {
        isStreaming: !!streamState.isStreaming,
        streamingContent: streamState.streamingContent || "",
        inlinePayloadItems: getStreamInlineItems(streamState),
        thinkingDuration: streamState.thinkingDuration || 0,
        isThinking: streamState.isThinking || false,
    };
}

function parseToolEventAtIndex(items, index) {
    if (!Array.isArray(items)) return null;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
        return null;
    }

    try {
        const parsed = JSON.parse(items[index]);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}
