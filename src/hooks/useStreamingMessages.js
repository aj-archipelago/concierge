import { useCallback, useEffect } from "react";
import { toast } from "react-toastify";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
    commitStreamCompleteAssistant,
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
const CLIENT_TOOL_HEARTBEAT_INTERVAL_MS = 5000;
const streamSessions = new Map();

function peekStreamSession(chatId) {
    if (!chatId) return null;
    return streamSessions.get(String(chatId)) || null;
}

function getStreamSession(chatId) {
    if (!chatId) return null;
    const key = String(chatId);
    let session = streamSessions.get(key);
    if (!session) {
        session = {
            chatId: key,
            queue: [],
            processing: false,
            queueScheduled: false,
            processedTools: new Set(),
            clientToolHeartbeats: new Map(),
            pendingClientTools: new Map(),
            activeSubscriptionId: null,
            reader: null,
            callbacks: {},
            chatSnapshot: null,
            queryClient: null,
        };
        streamSessions.set(key, session);
    }
    return session;
}

function deleteStreamSession(chatId) {
    if (!chatId) return;
    const key = String(chatId);
    const session = streamSessions.get(key);
    session?.clientToolHeartbeats?.forEach((stop) => stop());
    session?.clientToolHeartbeats?.clear();
    streamSessions.delete(key);
}

function resolveClientToolInfo(session, info = {}) {
    const requestId =
        info.requestId ||
        session?.activeSubscriptionId ||
        session?.chatSnapshot?.activeSubscriptionId ||
        session?.queryClient?.getQueryData?.(["chat", session.chatId])
            ?.activeSubscriptionId ||
        null;
    return {
        ...info,
        chatId: info.chatId || session?.chatId || null,
        ...(requestId ? { requestId: String(requestId) } : {}),
    };
}

function startClientToolHeartbeat(session, info) {
    const toolCallbackId = info?.toolCallbackId;
    if (!session || !toolCallbackId) return () => {};

    const existing = session.clientToolHeartbeats?.get(toolCallbackId);
    if (existing) return existing;

    const sendHeartbeat = () => {
        const toolInfo = resolveClientToolInfo(session, info);
        Promise.resolve(
            session.callbacks?.onClientSideToolHeartbeat?.(toolInfo),
        ).catch(() => {});
    };
    const intervalId = setInterval(
        sendHeartbeat,
        CLIENT_TOOL_HEARTBEAT_INTERVAL_MS,
    );
    const stop = () => {
        clearInterval(intervalId);
        session.clientToolHeartbeats?.delete(toolCallbackId);
    };

    session.clientToolHeartbeats ||= new Map();
    session.clientToolHeartbeats.set(toolCallbackId, stop);
    sendHeartbeat();
    return stop;
}

function dispatchClientSideTool(session, info) {
    const toolInfo = resolveClientToolInfo(session, info);
    startClientToolHeartbeat(session, toolInfo);
    const toolHandler = session.callbacks?.onClientSideToolCall;
    if (!toolHandler) {
        session.pendingClientTools ||= new Map();
        session.pendingClientTools.set(toolInfo.toolCallbackId, toolInfo);
        return;
    }
    session.pendingClientTools?.delete(toolInfo.toolCallbackId);
    Promise.resolve(toolHandler(toolInfo))
        .catch(() => {})
        .finally(() => {
            session.clientToolHeartbeats?.get(toolInfo.toolCallbackId)?.();
        });
}

function flushPendingClientTools(session) {
    if (!session?.pendingClientTools?.size) return;
    if (!session.callbacks?.onClientSideToolCall) return;
    for (const pending of [...session.pendingClientTools.values()]) {
        dispatchClientSideTool(session, pending);
    }
}

function isCurrentStreamSessionRun(chatId, session, streamRunId) {
    if (!chatId || !session) return false;
    return (
        streamSessions.get(String(chatId)) === session &&
        session.streamRunId === streamRunId
    );
}

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

export function mergeStreamCache(current, updates = {}) {
    const base =
        current && typeof current === "object" && !Array.isArray(current)
            ? current
            : {};
    return {
        ...base,
        ...updates,
        isStreaming:
            updates.isStreaming !== undefined
                ? updates.isStreaming
                : !!base.isStreaming,
        reader:
            updates.reader !== undefined ? updates.reader : base.reader || null,
    };
}

export function useStreamingMessages({
    chat,
    currentEntityId = chat?.selectedEntityId,
    updateChatHook,
    onClientSideToolCall,
    onClientSideToolHeartbeat,
    onStreamComplete,
    onStreamDetached,
    onServerToolFinish,
}) {
    const queryClient = useQueryClient();
    const chatId = chat?._id ? String(chat._id) : null;

    useEffect(() => {
        const session = getStreamSession(chatId);
        if (!session) return;
        session.queryClient = queryClient;
        session.chatSnapshot = chat || null;
        session.callbacks = {
            onClientSideToolCall,
            onClientSideToolHeartbeat,
            onStreamComplete,
            onStreamDetached,
            onServerToolFinish,
        };
        flushPendingClientTools(session);
    }, [
        chatId,
        chat,
        queryClient,
        onClientSideToolCall,
        onClientSideToolHeartbeat,
        onStreamComplete,
        onStreamDetached,
        onServerToolFinish,
    ]);

    const getMirroredStreamChatIds = useCallback(
        (baseChatId = chatId) => {
            const ids = new Set();
            if (baseChatId) {
                ids.add(String(baseChatId));
            }

            return [...ids];
        },
        [chatId],
    );

    // Only subscribe to isStreaming changes — display values are read by useStreamingDisplay
    const { data: isStreaming = false } = useQuery({
        queryKey: STREAM_KEY(chatId),
        queryFn: () => ({ isStreaming: false }),
        select: (data) => !!data?.isStreaming,
        enabled: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const setStream = useCallback(
        (updates) => {
            getMirroredStreamChatIds().forEach((targetChatId) => {
                const current = queryClient.getQueryData(
                    STREAM_KEY(targetChatId),
                );
                queryClient.setQueryData(
                    STREAM_KEY(targetChatId),
                    mergeStreamCache(current, updates),
                );
            });
        },
        [getMirroredStreamChatIds, queryClient],
    );

    const startPendingStream = useCallback(() => {
        if (!chatId) return;
        getStreamSession(chatId);
        const current = queryClient.getQueryData(STREAM_KEY(chatId)) || {};
        if (current.isStreaming) return;
        queryClient.setQueryData(STREAM_KEY(chatId), {
            ...current,
            chatId,
            entityId: currentEntityId,
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
    }, [chatId, currentEntityId, queryClient]);

    const clearStream = useCallback(() => {
        getMirroredStreamChatIds().forEach((targetChatId) => {
            const state = queryClient.getQueryData(STREAM_KEY(targetChatId));
            state?.reader?.cancel?.().catch(() => {});
            queryClient.removeQueries({ queryKey: STREAM_KEY(targetChatId) });
            deleteStreamSession(targetChatId);
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
        const session = getStreamSession(chatId);
        if (!session || session.queueScheduled) return;
        session.queueScheduled = true;

        scheduleNextPaint(() => {
            session.queueScheduled = false;
            void session.processQueue?.();
        });
    }, [chatId]);

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
                mediaTask,
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
                const toolEvent = createAssistantToolEventItem({
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
                    mediaTask: success
                        ? mediaTask || existingItem?.mediaTask
                        : null,
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
                });

                if (success) {
                    const session = getStreamSession(chatId);
                    session?.callbacks?.onServerToolFinish?.();
                }
            }
        },
        [chatId, setStream],
    );

    const processQueue = useCallback(async () => {
        const session = getStreamSession(chatId);
        if (!session || session.processing || !session.queue.length) return;

        session.processing = true;
        const msg = session.queue.shift();

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
                    !session.processedTools.has(info.toolCallbackId)
                ) {
                    session.processedTools.add(info.toolCallbackId);
                    dispatchClientSideTool(session, info);
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

        session.processing = false;
        if (session.queue.length) {
            scheduleProcessQueue();
        }
    }, [
        applyStreamToolMessage,
        chatId,
        setStream,
        queryClient,
        scheduleProcessQueue,
    ]);

    useEffect(() => {
        const session = getStreamSession(chatId);
        if (!session) return;
        session.processQueue = processQueue;
    }, [chatId, processQueue]);

    const flushPendingQueue = useCallback(async () => {
        const session = getStreamSession(chatId);
        while (session?.processing || session?.queue.length) {
            if (!session.processing && session.queue.length) {
                scheduleProcessQueue();
            }
            await waitForNextPaint();
        }
    }, [chatId, scheduleProcessQueue]);

    const setSubscriptionId = useCallback(
        (response) => {
            if (!(response instanceof Response) || !chatId) return;

            const session = getStreamSession(chatId);
            if (!session) return;
            session.processQueue = processQueue;
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let cancelled = false;
            let endStreamPromise = null;
            session.queue = [];
            session.processing = false;
            session.queueScheduled = false;
            session.processedTools = new Set();
            session.terminalStatus = null;
            session.pendingClientTools = new Map();
            session.clientToolHeartbeats?.forEach((stop) => stop());
            session.clientToolHeartbeats = new Map();
            session.reader = reader;
            session.streamRunId = (session.streamRunId || 0) + 1;
            const streamRunId = session.streamRunId;

            const clearDetachedStreamState = () => {
                if (!isCurrentStreamSessionRun(chatId, session, streamRunId)) {
                    return;
                }
                const targetChatIds = new Set([String(chatId)]);

                session.queue = [];
                session.processing = false;
                session.queueScheduled = false;

                targetChatIds.forEach((targetChatId) => {
                    const state = queryClient.getQueryData(
                        STREAM_KEY(targetChatId),
                    );
                    state?.reader?.cancel?.().catch(() => {});
                    queryClient.removeQueries({
                        queryKey: STREAM_KEY(targetChatId),
                    });
                    deleteStreamSession(targetChatId);
                });
            };

            const pendingState =
                queryClient.getQueryData(STREAM_KEY(chatId)) || {};
            queryClient.setQueryData(STREAM_KEY(chatId), {
                ...pendingState,
                chatId,
                entityId:
                    pendingState.entityId ||
                    session.chatSnapshot?.selectedEntityId ||
                    null,
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

            let outcome = "done";
            const endStream = async () => {
                if (endStreamPromise) {
                    return endStreamPromise;
                }

                endStreamPromise = (async () => {
                    await flushPendingQueue();
                    if (
                        !isCurrentStreamSessionRun(chatId, session, streamRunId)
                    ) {
                        return;
                    }

                    // 1. Read accumulated stream data before cleanup.
                    const s = queryClient.getQueryData(STREAM_KEY(chatId));
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
                    const targetChatId = chatId;
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
                              entityId:
                                  s?.entityId ||
                                  session.chatSnapshot?.selectedEntityId ||
                                  null,
                              isServerGenerated: true,
                              _id: null,
                              _clientId: `stream-end:${targetChatId}:${Date.now()}`,
                              tool: session.terminalStatus
                                  ? JSON.stringify({
                                        streamStatus: session.terminalStatus,
                                    })
                                  : null,
                              taskId: null,
                              task: null,
                          }
                        : null;
                    if (assistantMessage) {
                        commitStreamCompleteAssistant(
                            queryClient,
                            targetChatId,
                            assistantMessage,
                        );
                    }
                    session.callbacks?.onStreamComplete?.({
                        chatId: targetChatId,
                        payload,
                        assistantMessage,
                        content,
                        thinkingContent,
                        thinkingDuration: duration,
                        outcome,
                    });

                    // Native tools can publish inbox messages during this turn.
                    // Refresh once on completion, without waiting for the poll.
                    queryClient.invalidateQueries({ queryKey: ["inbox"] });

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
                    deleteStreamSession(chatId);
                })();

                return endStreamPromise;
            };

            session.endStream = endStream;

            (async () => {
                try {
                    while (!cancelled) {
                        if (
                            !isCurrentStreamSessionRun(
                                chatId,
                                session,
                                streamRunId,
                            )
                        ) {
                            cancelled = true;
                            break;
                        }
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
                                if (
                                    event === "subscriptionId" &&
                                    d?.subscriptionId
                                ) {
                                    const targetId = chatId;
                                    const cached = queryClient.getQueryData([
                                        "chat",
                                        targetId,
                                    ]);
                                    session.activeSubscriptionId =
                                        d.subscriptionId;
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
                                    session.terminalStatus =
                                        d?.code === "CHAT_MESSAGE_SAVE_FAILED"
                                            ? "save_failed"
                                            : "interrupted";
                                    outcome = "error";
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
                                    session.queue.push({
                                        progress: d?.progress,
                                        result:
                                            event === "data" ? d?.result : null,
                                        info: event === "info" ? d?.info : null,
                                    });
                                    if (event === "info") {
                                        let info = d?.info;
                                        if (typeof info === "string") {
                                            try {
                                                info = JSON.parse(info);
                                            } catch {
                                                info = {};
                                            }
                                        }
                                        if (
                                            info?.clientSideTool &&
                                            info.toolCallbackId &&
                                            !session.processedTools.has(
                                                info.toolCallbackId,
                                            )
                                        ) {
                                            session.processedTools.add(
                                                info.toolCallbackId,
                                            );
                                            // Tool execution must not wait for text paint,
                                            // which browsers can suspend in a background tab.
                                            dispatchClientSideTool(
                                                session,
                                                info,
                                            );
                                        }
                                    }
                                    if (!session.processing) {
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
                        const targetChatId = String(chatId || "");
                        if (
                            !isCurrentStreamSessionRun(
                                targetChatId,
                                session,
                                streamRunId,
                            )
                        ) {
                            return;
                        }
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
                        session.callbacks?.onStreamDetached?.({
                            chatId: targetChatId,
                        });
                    }
                }
            })();
        },
        [
            chatId,
            queryClient,
            processQueue,
            scheduleProcessQueue,
            flushPendingQueue,
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
        if (!isStreaming || chat?.isChatLoading !== false || !chatId) {
            return;
        }
        const session = peekStreamSession(chatId);
        if (typeof session?.endStream === "function") {
            void session.endStream();
        }
    }, [isStreaming, chat?.isChatLoading, chatId]);

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
    const { data: streamState = {} } = useQuery({
        queryKey: STREAM_KEY(chatId),
        queryFn: () => ({ isStreaming: false }),
        enabled: false,
        staleTime: Infinity,
        gcTime: Infinity,
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
