import { assistantChatContext } from "../../../utils/assistant-progress.mjs";
import { issueAgentToolsToken } from "../../../utils/agent-tool-capabilities.mjs";
import { requireColleague } from "../../../utils/colleagues.js";
import { questionContext } from "../../../utils/assistant-coordination.mjs";
import { NextResponse } from "next/server";
import Chat from "../../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../../utils/auth";
import {
    getClient,
    QUERIES,
    SUBSCRIPTIONS,
} from "../../../utils/cortex-client.js";
import { StreamAccumulator } from "../../../utils/stream-accumulator.mjs";
import {
    buildFileAccessPlan,
    buildRunContext,
} from "../../../../../src/utils/fileAccessPlanUtils";
import config from "../../../../../config";
import {
    cleanupStaleStopRequestedIds,
    isSubscriptionStopped,
    removeStoppedSubscription,
    getEntrySubscriptionId,
    getChatForOwnerWrite,
} from "../../_lib";
import { appendChatMessage } from "../../message-store.js";
import { buildModelPayloadFromStoredPayload } from "../../../../../src/utils/assistantInlinePayload";
import { buildMcpAgentConfigForUser } from "../../../utils/mcp-agent-config";
import { resolveChatEntitySelection } from "../../_lib/resolveChatEntitySelection";

export const dynamic = "force-dynamic";

const activeStreamRegistry = new Map();

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
    params = await params;
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

        if (id === "new") {
            return NextResponse.json(
                { error: "Create a chat before starting a stream" },
                { status: 400 },
            );
        }

        const loaded = await getChatForOwnerWrite(id, currentUser._id);
        if (!loaded.ok) {
            return NextResponse.json(
                { error: loaded.error },
                { status: loaded.status },
            );
        }
        chat = loaded.chat;

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
            getEntitiesQuery: QUERIES.SYS_GET_ENTITIES,
        });
        const finalEntityId = resolvedEntitySelection.entityId || "";
        const entityOptions = finalEntityId
            ? await requireColleague(currentUser, finalEntityId).catch(
                  (error) => {
                      // Legacy chats can still target the deployment default,
                      // which is deliberately absent from assistant management.
                      // Cortex validates that target before executing the chat.
                      if (
                          error.status === 404 &&
                          !finalEntityId.startsWith("colleague-")
                      )
                          return null;
                      throw error;
                  },
              )
            : null;

        if (
            (chat.selectedEntityId || "") !==
            (resolvedEntitySelection.persistedEntityId || "")
        ) {
            await Chat.findOneAndUpdate(
                { _id: chatId },
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
        const taskQuestion = await questionContext(
            currentUser,
            chat,
            finalEntityId,
        );
        const liveTasks = await assistantChatContext(
            currentUser,
            chat,
            finalEntityId,
        );
        const taskContext = [taskQuestion, liveTasks]
            .filter(Boolean)
            .join("\n\n");
        const queryResult = await graphqlClient.query({
            query: QUERIES.SYS_ENTITY_AGENT,
            variables: {
                chatHistory: taskContext
                    ? [
                          { role: "system", content: taskContext },
                          ...sanitizedConversation,
                      ]
                    : sanitizedConversation,
                fileAccessPlan,
                contextId: runContext.contextId,
                contextKey: runContext.contextKey,
                aiName,
                aiMemorySelfModify:
                    entityOptions?.memoryLearning ?? aiMemorySelfModify,
                title: title || chat.title,
                chatId: chatId,
                stream: true,
                entityId: finalEntityId,
                model:
                    entityOptions?.model ||
                    model ||
                    currentUser.agentModel ||
                    config.cortex.defaultChatModel,
                userInfo,
                clientSideTools: clientSideTools || null,
                agentToolsToken: await issueAgentToolsToken(
                    currentUser,
                    entityOptions?.id || currentUser.personalEntityId,
                    undefined,
                    { chatId },
                ),
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
        let completionPromise = null;
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

                const finishStream = (streamError = null) => {
                    if (completionHandled) return completionPromise;
                    completionHandled = true;
                    unsubscribe();
                    completionPromise = (async () => {
                        try {
                            const savedMessage = await persistMessage(
                                chat,
                                accumulator,
                                finalEntityId,
                                subscriptionId,
                                Boolean(streamError),
                            );
                            if (streamError) {
                                sendEvent("error", {
                                    error: streamError,
                                    code: "CHAT_STREAM_INTERRUPTED",
                                    persisted: Boolean(savedMessage),
                                });
                            } else {
                                sendEvent("complete", {
                                    progress: 1,
                                    persisted: Boolean(savedMessage),
                                });
                            }
                        } catch (error) {
                            console.error(
                                "[SSE Stream] Final message save failed:",
                                error,
                            );
                            sendEvent("error", {
                                error: "The reply could not be saved. Copy it before leaving this page.",
                                code: "CHAT_MESSAGE_SAVE_FAILED",
                                persisted: false,
                            });
                        } finally {
                            closeStream();
                        }
                    })();
                    return completionPromise;
                };

                try {
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
                                if (completionHandled) return;

                                const {
                                    progress,
                                    data: resultData,
                                    info,
                                    error,
                                } = result.data.requestProgress;

                                // Process info block
                                if (info) {
                                    accumulator.processInfo(info);
                                    let clientInfo = info;
                                    if (error) {
                                        try {
                                            clientInfo = JSON.stringify({
                                                ...(typeof info === "string"
                                                    ? JSON.parse(info)
                                                    : info),
                                                clientSideTool: false,
                                            });
                                        } catch {
                                            clientInfo = null;
                                        }
                                    }
                                    // Preserve terminal metadata without starting a new
                                    // browser action after the provider has failed.
                                    if (clientInfo)
                                        sendEvent("info", { info: clientInfo });
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

                                // Terminal frames can contain both text and an error.
                                // Accumulate that text before preserving the partial reply.
                                if (error || progress === 1) {
                                    await finishStream(error || null);
                                }
                            },
                            error: (error) => {
                                console.error("Subscription error:", error);
                                return finishStream(
                                    error.message || String(error),
                                );
                            },
                            complete: () => {
                                return finishStream(
                                    "The connection ended before the reply finished.",
                                );
                            },
                        });
                    if (completionHandled) {
                        // A terminal event can arrive before subscribe returns.
                        unsubscribe();
                    } else if (graphqlSubscription) {
                        activeStreamRegistry.set(subscriptionId, {
                            graphqlSubscription,
                            graphqlClient,
                            createdAt: Date.now(),
                        });
                    }
                } catch (error) {
                    console.error("Error setting up subscription:", error);
                    await finishStream(error.message || String(error));
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
        Chat.updateOne(
            { _id: chat._id, activeSubscriptionId: subscriptionId },
            { $set: { isChatLoading: false, activeSubscriptionId: null } },
        );

    try {
        const finalMessage = accumulator.buildFinalMessage(entityId);
        if (!finalMessage) {
            await clearLoading();
            return null;
        }

        // Re-fetch chat to get latest state
        const currentChat = await Chat.findOne({ _id: chat._id });
        if (!currentChat) {
            throw new Error(`Chat ${chat._id} no longer exists`);
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
                { _id: chat._id, activeSubscriptionId: subscriptionId },
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
                { _id: chat._id, activeSubscriptionId: subscriptionId },
                { stopRequestedSubscriptionIds: cleanedStopIds },
            );
        }

        if (isError) {
            finalMessage.tool = JSON.stringify({
                ...JSON.parse(finalMessage.tool || "{}"),
                streamStatus: "interrupted",
            });
        }
        const messageToSave = await appendChatMessage(
            currentChat,
            finalMessage,
            {
                dedupeKey: `stream:${subscriptionId}`,
            },
        );
        // The reply is durable even if this metadata cleanup fails.
        await clearLoading().catch((error) =>
            console.error("[persistMessage] Loading cleanup failed:", error),
        );
        return messageToSave;
    } catch (error) {
        console.error(
            `[persistMessage] Error persisting message for chat ${chat._id}:`,
            error,
        );
        await clearLoading().catch(() => {});
        throw error;
    }
}
