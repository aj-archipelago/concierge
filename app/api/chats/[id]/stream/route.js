import { NextResponse } from "next/server";
import Chat from "../../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../../utils/auth";
import {
    getClient,
    QUERIES,
    SUBSCRIPTIONS,
} from "../../../../../jobs/graphql.mjs";
import { StreamAccumulator } from "../../../utils/stream-accumulator.mjs";
import { removeArtifactsFromMessages } from "../../_lib";

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
            aiStyle,
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
        const graphqlClient = await getClient();

        // Make sys_entity_agent query to get subscriptionId
        const queryResult = await graphqlClient.query({
            query: QUERIES.SYS_ENTITY_AGENT,
            variables: {
                chatHistory: conversation,
                contextId,
                contextKey,
                aiName,
                aiMemorySelfModify,
                aiStyle,
                title: title || chat.title,
                chatId: id,
                stream: true,
                entityId: finalEntityId,
                researchMode: researchMode || chat.researchMode || false,
                model: model || (researchMode ? "oai-o3" : "oai-gpt41"),
                userInfo,
            },
            fetchPolicy: "network-only",
        });

        const subscriptionId = queryResult.data?.sys_entity_agent?.result;
        if (!subscriptionId) {
            return NextResponse.json(
                { error: "Failed to get subscription ID" },
                { status: 500 },
            );
        }

        // Set isChatLoading: true on server when stream starts
        // This ensures refetches will show correct loading state
        await Chat.findOneAndUpdate({ _id: id }, { isChatLoading: true }).catch(
            (error) => {
                // Log but don't fail - stream can continue even if this fails
                console.error(
                    `[SSE Stream] Error setting isChatLoading for chat ${id}:`,
                    error,
                );
            },
        );

        // Create SSE stream
        const encoder = new TextEncoder();
        let clientConnected = true;

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

                try {
                    // Subscribe to REQUEST_PROGRESS
                    graphqlClient
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
                                    persistMessage(
                                        chat,
                                        accumulator,
                                        finalEntityId,
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
                                    sendEvent("complete", { progress: 1 });
                                    closeStream();
                                    persistMessage(
                                        chat,
                                        accumulator,
                                        finalEntityId,
                                        false,
                                    ).catch((err) =>
                                        console.error(
                                            `[SSE Stream] Error persisting message for chat ${chat._id}:`,
                                            err,
                                        ),
                                    );
                                }
                            },
                            error: (error) => {
                                console.error("Subscription error:", error);
                                sendEvent("error", {
                                    error: error.message || String(error),
                                });
                                closeStream();
                                persistMessage(
                                    chat,
                                    accumulator,
                                    finalEntityId,
                                    true,
                                ).catch((err) =>
                                    console.error(
                                        "Error persisting on subscription error:",
                                        err,
                                    ),
                                );
                            },
                            complete: () => closeStream(),
                        });
                } catch (error) {
                    console.error("Error setting up subscription:", error);
                    sendEvent("error", {
                        error: error.message || String(error),
                    });
                    closeStream();
                }
            },
            cancel() {
                // Client disconnected - mark as disconnected but continue accumulating
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
        return handleError(error);
    }
}

/**
 * Persist the accumulated message to the chat
 */
async function persistMessage(chat, accumulator, entityId, isError) {
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

        return await Chat.findOneAndUpdate(
            { _id: chat._id },
            {
                messages,
                isChatLoading: hasCodeRequest,
                isUnused: false,
            },
            { new: true },
        );
    } catch (error) {
        console.error(
            `[persistMessage] Error persisting message for chat ${chat._id}:`,
            error,
        );
        await clearLoading().catch(() => {});
        return null;
    }
}
