import { NextResponse } from "next/server";
import Chat from "../../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { getClient, QUERIES, SUBSCRIPTIONS } from "../../../../../jobs/graphql.mjs";
import { StreamAccumulator } from "../../../utils/stream-accumulator.mjs";
import { removeArtifactsFromMessages } from "../../_lib";

/**
 * POST /api/chats/[id]/stream
 * 
 * Proxies GraphQL streaming requests through Next.js server.
 * Server subscribes to REQUEST_PROGRESS and streams updates to client via SSE.
 * Server always persists messages on completion, ensuring no data loss.
 */
export async function POST(req, { params }) {
    const { id } = params;
    if (!id) {
        return NextResponse.json(
            { error: "Chat ID is required" },
            { status: 400 },
        );
    }

    let accumulator = null;
    let subscription = null;
    let graphqlClient = null;

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

        if (!conversation || !Array.isArray(conversation)) {
            return NextResponse.json(
                { error: "Conversation history is required" },
                { status: 400 },
            );
        }

        // Initialize GraphQL client
        graphqlClient = await getClient();

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
                entityId: entityId || chat.selectedEntityId || "",
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

        // Initialize accumulator
        accumulator = new StreamAccumulator();

        // Create SSE stream
        const encoder = new TextEncoder();
        let streamClosed = false;
        
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (event, data) => {
                    if (streamClosed) {
                        console.log(`[SSE Stream] Attempted to send ${event} event but stream is already closed`);
                        return;
                    }
                    try {
                        const message = `data: ${JSON.stringify({ event, data })}\n\n`;
                        controller.enqueue(encoder.encode(message));
                    } catch (error) {
                        if (error.code === 'ERR_INVALID_STATE') {
                            console.log(`[SSE Stream] Controller already closed, skipping ${event} event`);
                            streamClosed = true;
                        } else {
                            throw error;
                        }
                    }
                };
                
                const closeStream = () => {
                    if (streamClosed) return;
                    try {
                        controller.close();
                        streamClosed = true;
                    } catch (error) {
                        if (error.code === 'ERR_INVALID_STATE') {
                            console.log(`[SSE Stream] Controller already closed`);
                            streamClosed = true;
                        } else {
                            console.error(`[SSE Stream] Error closing stream:`, error);
                        }
                    }
                };

                try {
                    // Subscribe to REQUEST_PROGRESS
                    subscription = graphqlClient
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
                                    try {
                                        sendEvent("error", { error });
                                        // Persist error state (clear loading, don't save incomplete message)
                                        await persistMessage(
                                            chat,
                                            accumulator,
                                            entityId || chat.selectedEntityId || "",
                                            true, // isError
                                        );
                                    } catch (persistError) {
                                        console.error("Error persisting on stream error:", persistError);
                                    } finally {
                                        closeStream();
                                    }
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
                                    // Wait a bit for any final chunks to arrive
                                    await new Promise((resolve) =>
                                        setTimeout(resolve, 200),
                                    );

                                    // Persist the message (server always persists)
                                    try {
                                        console.log(`[SSE Stream] Stream completed for chat ${chat._id}, persisting message...`);
                                        const persistedChat = await persistMessage(
                                            chat,
                                            accumulator,
                                            entityId || chat.selectedEntityId || "",
                                            false, // isError
                                        );
                                        console.log(`[SSE Stream] Message persisted successfully for chat ${chat._id}. Final message count: ${persistedChat?.messages?.length || 'unknown'}`);
                                        sendEvent("complete", { progress: 1 });
                                    } catch (persistError) {
                                        console.error(`[SSE Stream] Error persisting message for chat ${chat._id}:`, persistError);
                                        sendEvent("error", {
                                            error: "Failed to persist message",
                                        });
                                    } finally {
                                        closeStream();
                                    }
                                }
                            },
                            error: async (error) => {
                                console.error("Subscription error:", error);
                                try {
                                    sendEvent("error", {
                                        error: error.message || String(error),
                                    });
                                    // Try to persist what we have (even if incomplete)
                                    await persistMessage(
                                        chat,
                                        accumulator,
                                        entityId || chat.selectedEntityId || "",
                                        true, // isError
                                    );
                                } catch (persistError) {
                                    console.error("Error persisting on subscription error:", persistError);
                                } finally {
                                    closeStream();
                                }
                            },
                            complete: () => {
                                sendEvent("complete", {});
                                closeStream();
                            },
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
                // Client disconnected - mark stream as closed
                streamClosed = true;
                // Server should continue to receive stream and persist on completion
                // The subscription will complete independently and persistMessage will be called
                // We just stop sending events to the disconnected client
                console.log("Client disconnected from stream, server will continue to persist");
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
        // Cleanup
        if (subscription) {
            subscription.unsubscribe();
        }
        return handleError(error);
    }
}

/**
 * Persist the accumulated message to the chat
 */
async function persistMessage(chat, accumulator, entityId, isError) {
    try {
        const finalMessage = accumulator.buildFinalMessage(entityId);
        if (!finalMessage && !isError) {
            // No content to persist
            console.log(`[persistMessage] No content to persist for chat ${chat._id}`);
            await Chat.findOneAndUpdate(
                { _id: chat._id },
                { isChatLoading: false },
            );
            return null;
        }

        // Re-fetch chat to get latest state (in case client updated it)
        const currentChat = await Chat.findOne({ _id: chat._id });
        if (!currentChat) {
            console.error(`[persistMessage] Chat ${chat._id} not found`);
            return null;
        }

        const messages = currentChat.messages || [];
        const lastStreamingIndex = messages.findLastIndex(
            (m) => m.isStreaming,
        );

        console.log(`[persistMessage] Chat ${chat._id} has ${messages.length} messages, lastStreamingIndex: ${lastStreamingIndex}`);

        const updatedMessages = [...messages];

        if (isError) {
            // For errors, we might not have a complete message
            // Just clear the loading state
            console.log(`[persistMessage] Error case for chat ${chat._id}, clearing loading state`);
            await Chat.findOneAndUpdate(
                { _id: chat._id },
                { isChatLoading: false },
            );
            return null;
        }

        // Remove artifacts before saving
        const messagesWithoutArtifacts = removeArtifactsFromMessages([
            finalMessage,
        ]);
        const messageToSave = messagesWithoutArtifacts[0] || finalMessage;

        if (lastStreamingIndex !== -1) {
            console.log(`[persistMessage] Replacing message at index ${lastStreamingIndex}`);
            updatedMessages[lastStreamingIndex] = messageToSave;
        } else {
            console.log(`[persistMessage] Appending new message (no streaming message found)`);
            updatedMessages.push(messageToSave);
        }

        // Get codeRequestId from accumulated info
        const accumulatedInfo = accumulator.getAccumulatedInfo();
        const codeRequestId = accumulatedInfo.codeRequestId;
        const hasCodeRequest = !!codeRequestId;

        console.log(`[persistMessage] Updating chat ${chat._id} with ${updatedMessages.length} messages, isChatLoading: ${hasCodeRequest}`);

        // Update chat
        const updatedChat = await Chat.findOneAndUpdate(
            { _id: chat._id },
            {
                messages: updatedMessages,
                isChatLoading: hasCodeRequest,
                isUnused: false,
            },
            { new: true },
        );

        console.log(`[persistMessage] Successfully persisted message for chat ${chat._id}. Final message count: ${updatedChat?.messages?.length || 'unknown'}`);
        return updatedChat;
    } catch (error) {
        console.error(`[persistMessage] Error persisting message for chat ${chat._id}:`, error);
        // Still try to clear loading state
        try {
            await Chat.findOneAndUpdate(
                { _id: chat._id },
                { isChatLoading: false },
            );
        } catch (e) {
            console.error("Error clearing loading state:", e);
        }
        return null;
    }
}

