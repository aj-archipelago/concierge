import { NextResponse } from "next/server";
import Chat from "../../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { getClient, QUERIES, SUBSCRIPTIONS } from "../../../../../src/graphql";
import { StreamAccumulator } from "../../../utils/stream-accumulator.mjs";
import {
    removeArtifactsFromMessages,
    cleanupStaleStopRequestedIds,
    isSubscriptionStopped,
    removeStoppedSubscription,
    getEntrySubscriptionId,
} from "../../_lib";

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

    let loadingWasSet = false;

    try {
        const currentUser = await getCurrentUser(false);
        const body = await req.json();

        // Get chat and verify ownership
        const chat = await Chat.findOne({ _id: id, userId: currentUser._id });
        if (!chat) {
            return NextResponse.json(
                { error: "Chat not found" },
                { status: 404 },
            );
        }

        // Extract request data
        const {
            conversation,
            contextId,
            contextKey,
            aiName,
            aiMemorySelfModify,
            title,
            entityId,
            researchMode,
            model,
            userInfo,
        } = body;

        // Require conversation for new streams
        if (!conversation?.length) {
            return NextResponse.json(
                {
                    error: chat.isChatLoading
                        ? "Stream in progress. Please wait for completion."
                        : "Conversation is required",
                },
                { status: chat.isChatLoading ? 409 : 400 },
            );
        }

        // Determine entityId
        const finalEntityId = entityId || chat.selectedEntityId || "";

        // Initialize accumulator and GraphQL client
        const accumulator = new StreamAccumulator();
        // Start thinking time tracking immediately when stream starts
        // This ensures we capture thinking duration even if no ephemeral content arrives
        // (matches client behavior which starts thinking when streaming begins)
        accumulator.thinkingStartTime = Date.now();
        accumulator.isThinking = true;
        const graphqlClient = getClient();

        // Make sys_entity_agent query to get subscriptionId
        const queryResult = await graphqlClient.query({
            query: QUERIES.SYS_ENTITY_AGENT,
            variables: {
                chatHistory: conversation,
                contextId,
                contextKey,
                aiName,
                aiMemorySelfModify,
                title: title || chat.title,
                chatId: id,
                stream: true,
                entityId: finalEntityId,
                researchMode: researchMode || chat.researchMode || false,
                model: model || currentUser.agentModel || "oai-gpt51",
                userInfo,
            },
            fetchPolicy: "network-only",
        });

        const subscriptionId = queryResult.data?.sys_entity_agent?.result;
        if (!subscriptionId) {
            // Clear loading state if it was set (shouldn't be set yet, but be safe)
            if (loadingWasSet) {
                await clearChatLoading(id);
            }
            return NextResponse.json(
                { error: "Failed to get subscription ID" },
                { status: 500 },
            );
        }

        // Set isChatLoading: true and store activeSubscriptionId when stream starts
        // Clean up stale stop requested IDs to prevent accumulation
        const currentChat = await Chat.findOne({ _id: id });
        const cleanedStopIds = cleanupStaleStopRequestedIds(
            currentChat?.stopRequestedSubscriptionIds || [],
        );

        await Chat.findOneAndUpdate(
            { _id: id },
            {
                isChatLoading: true,
                activeSubscriptionId: subscriptionId,
                stopRequestedSubscriptionIds: cleanedStopIds,
            },
        ).catch((error) => {
            // Log but don't fail - stream can continue even if this fails
            console.error(
                `[SSE Stream] Error setting isChatLoading for chat ${id}:`,
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
                    }
                };

                try {
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
                // Client disconnected - unsubscribe and mark as disconnected
                clientConnected = false;
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
                            "[SSE Stream] Error unsubscribing on cancel:",
                            error,
                        );
                    }
                    graphqlSubscription = null;
                }
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
            await clearChatLoading(id).catch(() => {
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

        const messages = [...(currentChat.messages || [])];
        const lastStreamingIndex = messages.findLastIndex((m) => m.isStreaming);
        const messageToSave =
            removeArtifactsFromMessages([finalMessage])[0] || finalMessage;

        if (lastStreamingIndex !== -1) {
            messages[lastStreamingIndex] = messageToSave;
        } else {
            messages.push(messageToSave);
        }

        const hasCodeRequest = !!accumulator.getAccumulatedInfo().codeRequestId;

        // Clear activeSubscriptionId when stream completes (unless there's a code request)
        const updateData = {
            messages,
            isChatLoading: hasCodeRequest,
            isUnused: false,
        };
        if (!hasCodeRequest) {
            updateData.activeSubscriptionId = null;
        }

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
