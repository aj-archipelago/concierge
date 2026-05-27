import { NextResponse } from "next/server";
import Chat from "../../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { getClient, QUERIES, SUBSCRIPTIONS } from "../../../../../src/graphql";
import { StreamAccumulator } from "../../../utils/stream-accumulator.mjs";
import {
    buildFileAccessPlan,
    buildRunContext,
} from "../../../../../src/utils/fileAccessPlanUtils";
import config from "../../../../../config";
import {
    sanitizeMessagesForPersistence,
    prepareMessagesForPersistence,
    cleanupStaleStopRequestedIds,
    isSubscriptionStopped,
    removeStoppedSubscription,
    getEntrySubscriptionId,
    buildLastMessagePreview,
} from "../../_lib";
import { buildModelPayloadFromStoredPayload } from "../../../../../src/utils/assistantInlinePayload";
import { NEW_CHAT_ID } from "../../../../utils/chatClientIds";
import { buildMcpAgentConfigForUser } from "../../../utils/mcp-agent-config";

export const dynamic = "force-dynamic";

const activeStreamRegistry = new Map();

function parseEntitiesResult(rawResult) {
    if (Array.isArray(rawResult)) {
        return rawResult;
    }

    if (typeof rawResult !== "string" || rawResult.trim().length === 0) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawResult);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("[SSE Stream] Failed to parse entities result:", error);
        return [];
    }
}

async function resolveChatEntitySelection({
    graphqlClient,
    currentUser,
    requestedEntityId,
    persistedEntityId,
}) {
    const requested = requestedEntityId || "";
    const persisted = persistedEntityId || "";
    const personalEntityId = currentUser?.personalEntityId || "";
    const candidateEntityId = requested || persisted || personalEntityId || "";

    if (!candidateEntityId) {
        return {
            entityId: "",
            persistedEntityId: "",
            repaired: false,
        };
    }

    let entities = [];
    if (currentUser?.contextId) {
        try {
            const entitiesResult = await graphqlClient.query({
                query: QUERIES.SYS_GET_ENTITIES,
                variables: {
                    userId: currentUser.contextId,
                    fresh: "true",
                },
                fetchPolicy: "network-only",
            });
            entities = parseEntitiesResult(
                entitiesResult?.data?.sys_get_entities?.result,
            );
        } catch (error) {
            console.warn(
                "[SSE Stream] Failed to fetch entities for stream request:",
                error,
            );
        }
    }

    const validEntityIds = new Set(
        entities.map((entity) => entity?.id).filter(Boolean),
    );
    if (validEntityIds.size === 0) {
        return {
            entityId: candidateEntityId,
            persistedEntityId: candidateEntityId,
            repaired: false,
        };
    }

    const defaultEntityId =
        (personalEntityId && validEntityIds.has(personalEntityId)
            ? personalEntityId
            : null) ||
        entities.find((entity) => entity?.isDefault)?.id ||
        personalEntityId ||
        "";

    if (candidateEntityId && validEntityIds.has(candidateEntityId)) {
        return {
            entityId: candidateEntityId,
            persistedEntityId: candidateEntityId,
            repaired: false,
        };
    }

    const repairedEntityId = defaultEntityId || candidateEntityId;
    if (candidateEntityId && repairedEntityId !== candidateEntityId) {
        console.warn(
            `[SSE Stream] Repairing stale entityId ${candidateEntityId} to ${repairedEntityId || "(empty)"}`,
        );
    }

    return {
        entityId: repairedEntityId,
        persistedEntityId: repairedEntityId,
        repaired: repairedEntityId !== candidateEntityId,
    };
}

function sanitizeConversationForModel(conversation = []) {
    if (!Array.isArray(conversation)) {
        return [];
    }

    return conversation
        .map((entry) => {
            if (!entry || typeof entry !== "object") {
                return null;
            }

            if (entry.role !== "assistant") {
                return entry;
            }

            const content = buildModelPayloadFromStoredPayload(entry.content);
            if (content == null) {
                return null;
            }
            if (typeof content === "string" && content.trim().length === 0) {
                return null;
            }
            if (Array.isArray(content) && content.length === 0) {
                return null;
            }

            return {
                ...entry,
                content,
            };
        })
        .filter(Boolean);
}

/**
 * Helper function to clear isChatLoading state
 */
async function clearChatLoading(chatId) {
    await Chat.findOneAndUpdate(
        { _id: chatId },
        { isChatLoading: false },
    ).catch((error) => {
        console.error(
            `[SSE Stream] Error clearing isChatLoading for chat ${chatId}:`,
            error,
        );
    });
}

/**
 * POST /api/chats/[id]/stream
 *
 * Simple streaming proxy: Client → Next.js Server → GraphQL Subscription → Backend
 *
 * Architecture:
 * - One client starts a stream by sending conversation
 * - Server subscribes to GraphQL and forwards events via SSE
 * - Server accumulates messages in memory (no buffering)
 * - If client disconnects, server continues accumulating and persists on completion
 * - No reconnection support - if client wants to reconnect, they wait for completion and refresh
 */
export async function POST(req, { params }) {
    const { id } = params;
    if (!id) {
        return NextResponse.json(
            { error: "Chat ID is required" },
            { status: 400 },
        );
    }

    let chatId = id;
    let loadingWasSet = false;
    let currentUser = null;
    let createdChatId = null;

    try {
        currentUser = await getCurrentUser(false);
        let body;
        try {
            body = await req.json();
        } catch (error) {
            const interruptedBody =
                req.signal?.aborted || error instanceof SyntaxError;
            if (interruptedBody) {
                console.warn(
                    "[SSE Stream] Ignoring interrupted request body for chat stream",
                    { chatId: id },
                );
                return NextResponse.json(
                    { error: "Request body was interrupted" },
                    { status: 400 },
                );
            }
            throw error;
        }
        const {
            conversation,
            aiName,
            aiMemorySelfModify,
            title,
            entityId,
            model,
            userInfo,
            clientSideTools,
        } = body;
        const sanitizedConversation =
            sanitizeConversationForModel(conversation);

        let chat = null;

        // Handle the /chat/new bootstrap path by creating the persisted chat
        if (id === NEW_CHAT_ID) {
            let initialUserMessage = null;
            if (Array.isArray(conversation)) {
                for (let i = conversation.length - 1; i >= 0; i -= 1) {
                    const entry = conversation[i];
                    if (
                        entry?.role === "user" &&
                        entry?.content !== undefined &&
                        entry?.content !== null
                    ) {
                        initialUserMessage = entry.content;
                        break;
                    }
                }
            }
            const now = new Date().toISOString();
            const initialMessage = initialUserMessage
                ? {
                      payload: initialUserMessage,
                      sender: "user",
                      sentTime: now,
                      direction: "outgoing",
                      position: "single",
                  }
                : null;
            const preview = initialMessage
                ? buildLastMessagePreview([initialMessage])
                : {};
            const prepared = prepareMessagesForPersistence(
                initialMessage ? [initialMessage] : [],
            );
            // Create a new chat for this user
            const newChat = new Chat({
                userId: currentUser._id,
                messages: prepared.messages,
                title: "",
                isUnused: !initialMessage,
                messageStorageBytes: prepared.messageStorageBytes,
                messagesCompacted: prepared.messagesCompacted,
                messagesCompactedAt: prepared.messagesCompacted
                    ? new Date()
                    : null,
                ...preview,
            });
            await newChat.save();
            chatId = String(newChat._id);
            createdChatId = chatId;
            chat = newChat;
        } else {
            // Get existing chat and verify ownership
            chat = await Chat.findOne({ _id: id, userId: currentUser._id });
        }

        if (!chat) {
            return NextResponse.json(
                { error: "Chat not found" },
                { status: 404 },
            );
        }

        // Require conversation for new streams
        if (!sanitizedConversation.length) {
            return NextResponse.json(
                {
                    error: chat.isChatLoading
                        ? "Stream in progress. Please wait for completion."
                        : "Conversation is required",
                },
                { status: chat.isChatLoading ? 409 : 400 },
            );
        }

        // Initialize accumulator and GraphQL client
        const accumulator = new StreamAccumulator();
        // Start thinking time tracking immediately when stream starts
        // This ensures we capture thinking duration even if no ephemeral content arrives
        // (matches client behavior which starts thinking when streaming begins)
        accumulator.thinkingStartTime = Date.now();
        accumulator.isThinking = true;
        const graphqlClient = getClient();

        const resolvedEntitySelection = await resolveChatEntitySelection({
            graphqlClient,
            currentUser,
            requestedEntityId: entityId,
            persistedEntityId: chat.selectedEntityId,
        });
        const finalEntityId = resolvedEntitySelection.entityId || "";

        if (
            (chat.selectedEntityId || "") !==
            (resolvedEntitySelection.persistedEntityId || "")
        ) {
            await Chat.findOneAndUpdate(
                { _id: chatId, userId: currentUser._id },
                {
                    selectedEntityId:
                        resolvedEntitySelection.persistedEntityId || "",
                },
            ).catch((error) => {
                console.error(
                    `[SSE Stream] Error repairing selectedEntityId for chat ${chatId}:`,
                    error,
                );
            });
            chat.selectedEntityId =
                resolvedEntitySelection.persistedEntityId || "";
        }

        const fileAccessPlan = buildFileAccessPlan({
            userContextId: currentUser?.contextId || null,
            userContextKey: currentUser?.contextKey || null,
            chatId,
            includeUserGlobal: true,
        });
        const runContext = buildRunContext({
            userContextId: currentUser?.contextId || null,
            userContextKey: currentUser?.contextKey || null,
        });

        const { mcpConfig, mcpAvailableServers } =
            await buildMcpAgentConfigForUser(currentUser, {
                logPrefix: "[MCP:stream]",
            });

        // Make sys_entity_agent query to get subscriptionId
        const queryResult = await graphqlClient.query({
            query: QUERIES.SYS_ENTITY_AGENT,
            variables: {
                chatHistory: sanitizedConversation,
                fileAccessPlan,
                contextId: runContext.contextId,
                contextKey: runContext.contextKey,
                aiName,
                aiMemorySelfModify,
                title: title || chat.title,
                chatId: chatId,
                stream: true,
                entityId: finalEntityId,
                model:
                    model ||
                    currentUser.agentModel ||
                    config.cortex.defaultChatModel,
                userInfo,
                clientSideTools: clientSideTools || null,
                mcpConfig,
                mcpAvailableServers,
            },
            fetchPolicy: "network-only",
        });

        const subscriptionId = queryResult.data?.sys_entity_agent?.result;
        if (!subscriptionId) {
            // Clear loading state if it was set (shouldn't be set yet, but be safe)
            if (loadingWasSet) {
                await clearChatLoading(chatId);
            }
            return NextResponse.json(
                { error: "Failed to get subscription ID" },
                { status: 500 },
            );
        }

        // Set isChatLoading: true and store activeSubscriptionId when stream starts
        // Clean up stale stop requested IDs to prevent accumulation
        const currentChat = await Chat.findOne({ _id: chatId });
        const cleanedStopIds = cleanupStaleStopRequestedIds(
            currentChat?.stopRequestedSubscriptionIds || [],
        );

        await Chat.findOneAndUpdate(
            { _id: chatId },
            {
                isChatLoading: true,
                activeSubscriptionId: subscriptionId,
                stopRequestedSubscriptionIds: cleanedStopIds,
            },
        ).catch((error) => {
            // Log but don't fail - stream can continue even if this fails
            console.error(
                `[SSE Stream] Error setting isChatLoading for chat ${chatId}:`,
                error,
            );
        });
        loadingWasSet = true;

        // Create SSE stream
        const encoder = new TextEncoder();
        let clientConnected = true;
        let completionHandled = false; // Track if we've handled completion (progress=1 or error)
        let graphqlSubscription = null; // Store subscription for cleanup

        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (event, data) => {
                    if (!clientConnected) return;
                    try {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({ event, data })}\n\n`,
                            ),
                        );
                    } catch (error) {
                        if (error.code === "ERR_INVALID_STATE") {
                            clientConnected = false;
                        } else {
                            throw error;
                        }
                    }
                };

                const closeStream = () => {
                    if (!clientConnected) return;
                    try {
                        controller.close();
                        clientConnected = false;
                    } catch (error) {
                        if (error.code !== "ERR_INVALID_STATE") {
                            console.error(
                                `[SSE Stream] Error closing stream:`,
                                error,
                            );
                        }
                    }
                };

                const unsubscribe = () => {
                    if (graphqlSubscription) {
                        try {
                            if (
                                typeof graphqlSubscription.unsubscribe ===
                                "function"
                            ) {
                                graphqlSubscription.unsubscribe();
                            } else if (
                                typeof graphqlSubscription.close === "function"
                            ) {
                                graphqlSubscription.close();
                            }
                        } catch (error) {
                            console.error(
                                "[SSE Stream] Error unsubscribing:",
                                error,
                            );
                        }
                        graphqlSubscription = null;
                        activeStreamRegistry.delete(subscriptionId);
                    }
                };

                try {
                    // Send chatId to client (important when new chat was created)
                    if (chatId && id !== chatId) {
                        sendEvent("chatId", { chatId });
                    }

                    // Send subscriptionId so client can inject messages / cancel
                    sendEvent("subscriptionId", { subscriptionId });

                    // Subscribe to REQUEST_PROGRESS
                    graphqlSubscription = graphqlClient
                        .subscribe({
                            query: SUBSCRIPTIONS.REQUEST_PROGRESS,
                            variables: { requestIds: [subscriptionId] },
                        })
                        .subscribe({
                            next: async (result) => {
                                if (!result?.data?.requestProgress) return;

                                const {
                                    progress,
                                    data: resultData,
                                    info,
                                    error,
                                } = result.data.requestProgress;

                                // Handle errors
                                if (error) {
                                    sendEvent("error", { error });
                                    unsubscribe();
                                    persistMessage(
                                        chat,
                                        accumulator,
                                        finalEntityId,
                                        subscriptionId,
                                        true,
                                    ).catch((err) =>
                                        console.error(
                                            "Error persisting on stream error:",
                                            err,
                                        ),
                                    );
                                    closeStream();
                                    return;
                                }

                                // Process info block
                                if (info) {
                                    accumulator.processInfo(info);
                                    sendEvent("info", { info });
                                }

                                // Process result block
                                if (resultData) {
                                    accumulator.processResult(resultData);
                                    sendEvent("data", {
                                        result: resultData,
                                        progress,
                                    });
                                } else if (progress !== undefined) {
                                    sendEvent("progress", { progress });
                                }

                                // Handle completion
                                if (progress === 1) {
                                    completionHandled = true;
                                    unsubscribe();
                                    // Persist message BEFORE telling client it's complete
                                    // This ensures the message is in the database when the client refetches
                                    try {
                                        await persistMessage(
                                            chat,
                                            accumulator,
                                            finalEntityId,
                                            subscriptionId,
                                            false,
                                        );
                                    } catch (err) {
                                        console.error(
                                            `[SSE Stream] Error persisting message for chat ${chat._id}:`,
                                            err,
                                        );
                                    }
                                    sendEvent("complete", { progress: 1 });
                                    closeStream();
                                }
                            },
                            error: (error) => {
                                completionHandled = true;
                                console.error("Subscription error:", error);
                                unsubscribe();
                                sendEvent("error", {
                                    error: error.message || String(error),
                                });
                                closeStream();
                                persistMessage(
                                    chat,
                                    accumulator,
                                    finalEntityId,
                                    subscriptionId,
                                    true,
                                ).catch((err) =>
                                    console.error(
                                        "Error persisting on subscription error:",
                                        err,
                                    ),
                                );
                            },
                            complete: () => {
                                unsubscribe();
                                closeStream();
                                // Only clear loading if we haven't already handled completion
                                // (progress=1 or error already set the appropriate state)
                                if (!completionHandled) {
                                    // Subscription ended unexpectedly (e.g., GraphQL server died)
                                    Chat.findOneAndUpdate(
                                        { _id: chat._id },
                                        { isChatLoading: false },
                                    ).catch((err) =>
                                        console.error(
                                            "Error clearing loading on unexpected subscription close:",
                                            err,
                                        ),
                                    );
                                }
                            },
                        });
                    if (graphqlSubscription) {
                        activeStreamRegistry.set(subscriptionId, {
                            graphqlSubscription,
                            graphqlClient,
                            createdAt: Date.now(),
                        });
                    }
                } catch (error) {
                    console.error("Error setting up subscription:", error);
                    unsubscribe();
                    sendEvent("error", {
                        error: error.message || String(error),
                    });
                    closeStream();
                    // Clear loading state on subscription setup error
                    persistMessage(
                        chat,
                        accumulator,
                        finalEntityId,
                        subscriptionId,
                        true,
                    ).catch((err) =>
                        console.error(
                            "Error persisting on subscription setup error:",
                            err,
                        ),
                    );
                }
            },
            cancel() {
                // Client disconnected - keep subscription running so the
                // server can persist the final assistant message.
                // Completion handlers will unsubscribe and clear loading.
                clientConnected = false;
            },
        });

        // Return SSE response
        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (error) {
        console.error("Error in stream endpoint:", error);
        if (createdChatId && !loadingWasSet && currentUser?._id) {
            await Chat.deleteOne({
                _id: createdChatId,
                userId: currentUser._id,
            }).catch((cleanupError) => {
                console.error(
                    `[SSE Stream] Error deleting failed bootstrap chat ${createdChatId}:`,
                    cleanupError,
                );
            });
        }
        // Clear loading state if it was set before the error occurred
        if (loadingWasSet) {
            await clearChatLoading(chatId).catch(() => {
                // Ignore errors when clearing - we're already in error state
            });
        }
        return handleError(error);
    }
}

/**
 * Persist the accumulated message to the chat
 */
async function persistMessage(
    chat,
    accumulator,
    entityId,
    subscriptionId,
    isError,
) {
    const clearLoading = () =>
        Chat.findOneAndUpdate({ _id: chat._id }, { isChatLoading: false });

    try {
        const finalMessage = accumulator.buildFinalMessage(entityId);
        if (!finalMessage && !isError) {
            await clearLoading();
            return null;
        }

        if (isError) {
            await clearLoading();
            return null;
        }

        // Re-fetch chat to get latest state
        const currentChat = await Chat.findOne({ _id: chat._id });
        if (!currentChat) {
            console.error(`[persistMessage] Chat ${chat._id} not found`);
            return null;
        }

        // Clean up stale stop requested IDs first
        const cleanedStopIds = cleanupStaleStopRequestedIds(
            currentChat.stopRequestedSubscriptionIds || [],
        );

        // Check if stop was requested for THIS specific subscription
        // This prevents race conditions where a new stream clears stopRequested
        // before the old stream finishes
        if (isSubscriptionStopped(cleanedStopIds, subscriptionId)) {
            // Remove this subscriptionId from the array and clear loading state
            const updatedStopIds = removeStoppedSubscription(
                cleanedStopIds,
                subscriptionId,
            );
            await Chat.findOneAndUpdate(
                { _id: chat._id },
                {
                    isChatLoading: false,
                    stopRequestedSubscriptionIds: updatedStopIds,
                    activeSubscriptionId: null,
                },
            );
            return null;
        }

        // Update with cleaned array if it changed (compare actual content, not just length)
        const originalIds = currentChat.stopRequestedSubscriptionIds || [];
        const hasChanged =
            cleanedStopIds.length !== originalIds.length ||
            cleanedStopIds.some((entry, index) => {
                const originalEntry = originalIds[index];
                if (!originalEntry) return true;
                const entryId = getEntrySubscriptionId(entry);
                const originalId = getEntrySubscriptionId(originalEntry);
                return String(entryId) !== String(originalId);
            });
        if (hasChanged) {
            await Chat.findOneAndUpdate(
                { _id: chat._id },
                { stopRequestedSubscriptionIds: cleanedStopIds },
            );
        }

        const messages = sanitizeMessagesForPersistence([
            ...(currentChat.messages || []),
        ]);
        const lastStreamingIndex = messages.findLastIndex((m) => m.isStreaming);
        const messageToSave =
            sanitizeMessagesForPersistence([finalMessage])[0] || finalMessage;

        if (lastStreamingIndex !== -1) {
            messages[lastStreamingIndex] = messageToSave;
        } else {
            messages.push(messageToSave);
        }

        const prepared = prepareMessagesForPersistence(messages);

        // Clear activeSubscriptionId when stream completes
        const updateData = {
            messages: prepared.messages,
            isChatLoading: false,
            isUnused: false,
            activeSubscriptionId: null,
            messageStorageBytes: prepared.messageStorageBytes,
        };
        if (prepared.messagesCompacted) {
            updateData.messagesCompacted = true;
            updateData.messagesCompactedAt = new Date();
        }
        const preview = buildLastMessagePreview([messageToSave]);
        updateData.lastMessagePreview = preview.lastMessagePreview;
        updateData.lastMessageSender = preview.lastMessageSender;
        updateData.lastMessageAt = preview.lastMessageAt;

        return await Chat.findOneAndUpdate({ _id: chat._id }, updateData, {
            new: true,
        });
    } catch (error) {
        console.error(
            `[persistMessage] Error persisting message for chat ${chat._id}:`,
            error,
        );
        await clearLoading().catch(() => {});
        return null;
    }
}
