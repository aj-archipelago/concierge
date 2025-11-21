import { NextResponse } from "next/server";
import Chat from "../../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { getClient, QUERIES, SUBSCRIPTIONS } from "../../../../../jobs/graphql.mjs";
import { StreamAccumulator } from "../../../utils/stream-accumulator.mjs";
import { removeArtifactsFromMessages } from "../../_lib";

// Track active streams by chatId
// Map<chatId, { accumulator, subscriptionId, entityId, graphqlClient, events, bufferListeners }>
// events: array of { event, data } that have been buffered
// bufferListeners: Set of { sendEvent, lastIndex } - clients listening for new buffer events
const activeStreams = new Map();

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
    let graphqlClient = null;
    let subscriptionId = null;

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

        // Check if there's already an active stream for this chat
        const existingStream = activeStreams.get(id);
        
        // Determine if this is a reconnection or new message send:
        // - If conversation is missing/empty AND existing stream exists → reconnection
        // - If conversation is provided → new message send (close old stream if exists, start new)
        const hasNoConversation = !conversation || !Array.isArray(conversation) || conversation.length === 0;
        const isReconnection = hasNoConversation && !!existingStream;
        
        console.log(`[SSE Stream] POST request for chat ${id}: hasNoConversation=${hasNoConversation}, existingStream=${!!existingStream}, isReconnection=${isReconnection}, activeStreams keys:`, Array.from(activeStreams.keys()));
        
        if (isReconnection) {
            // Reconnection case: no conversation provided and existing stream exists
            console.log(`[SSE Stream] Client reconnecting to existing stream for chat ${id}`);
        } else if (hasNoConversation && !existingStream) {
            // No conversation and no existing stream - check if chat says it's loading
            // If chat.isChatLoading is true but no stream exists, the stream likely completed
            // but the chat wasn't updated yet. Clear the loading state.
            if (chat.isChatLoading) {
                console.log(`[SSE Stream] Chat ${id} has isChatLoading=true but no active stream - stream likely completed, clearing loading state`);
                await Chat.updateOne(
                    { _id: id },
                    { isChatLoading: false },
                );
            }
            console.log(`[SSE Stream] Error: No conversation provided and no existing stream for chat ${id}`);
            return NextResponse.json(
                { error: "No active stream to reconnect to. The stream may have completed." },
                { status: 404 },
            );
        } else {
            // New message send case: conversation provided
            // Close old stream if it exists - we're starting a new one
            if (existingStream) {
                console.log(`[SSE Stream] Closing existing stream for chat ${id} - new message being sent`);
                activeStreams.delete(id);
            }
        }

        // Determine entityId once
        const finalEntityId = entityId || chat.selectedEntityId || "";

        // If reconnecting, reuse existing stream state
        if (isReconnection) {
            accumulator = existingStream.accumulator;
            subscriptionId = existingStream.subscriptionId;
            graphqlClient = existingStream.graphqlClient;
        } else {
            // Initialize new stream
            accumulator = new StreamAccumulator();
            
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
                    entityId: finalEntityId,
                    researchMode: researchMode || chat.researchMode || false,
                    model: model || (researchMode ? "oai-o3" : "oai-gpt41"),
                    userInfo,
                },
                fetchPolicy: "network-only",
            });

            subscriptionId = queryResult.data?.sys_entity_agent?.result;
            if (!subscriptionId) {
                return NextResponse.json(
                    { error: "Failed to get subscription ID" },
                    { status: 500 },
                );
            }
        }

        // Create SSE stream
        const encoder = new TextEncoder();
        let streamClosed = false;
        let clientSendEventRef = null; // Reference to this client's sendEvent function
        
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

                // Helper to clean up stream tracking (declared before try so it's accessible in catch)
                const cleanupStream = () => {
                    activeStreams.delete(id);
                    console.log(`[SSE Stream] Cleaned up stream tracking for chat ${id}`);
                };

                try {
                    // Get or create stream info for tracking
                    let streamInfo;
                    if (isReconnection) {
                        // Reuse existing stream info (client reconnecting to active stream)
                        streamInfo = existingStream;
                    } else {
                        // Create new stream info with empty events array and buffer listeners
                        streamInfo = {
                            accumulator,
                            subscriptionId,
                            entityId: finalEntityId,
                            graphqlClient,
                            events: [], // Buffer: all events stored here
                            bufferListeners: new Set(), // Set of { sendEvent, lastIndex } - clients listening for new buffer events
                        };
                        activeStreams.set(id, streamInfo);
                    }
                    
                    // Store reference for cleanup
                    clientSendEventRef = sendEvent;
                    
                    // Helper to update buffer - subscription ONLY calls this
                    // Buffer updates automatically notify listeners (but subscription doesn't know about clients)
                    const updateBuffer = (event, data) => {
                        // Store event in buffer (only store data/info/progress, not complete/error)
                        if (event === "data" || event === "info" || event === "progress") {
                            const eventIndex = streamInfo.events.length;
                            streamInfo.events.push({ event, data });
                            console.log(`[SSE Stream] Buffered event ${eventIndex + 1}: ${event} for chat ${id}`);
                            
                            // Notify all listeners asynchronously (non-blocking)
                            // Only send to listeners that are caught up (have seen all previous events)
                            // Use process.nextTick for immediate async execution without blocking
                            process.nextTick(() => {
                                streamInfo.bufferListeners.forEach((listener) => {
                                    try {
                                        // If listener's lastIndex matches the index we just added, they're caught up
                                        if (listener.lastIndex === eventIndex) {
                                            listener.sendEvent(event, data);
                                            listener.lastIndex = eventIndex + 1; // Move to next position
                                        }
                                    } catch (error) {
                                        console.error(`[SSE Stream] Error sending to listener:`, error);
                                        // Remove failed listener
                                        streamInfo.bufferListeners.delete(listener);
                                    }
                                });
                            });
                        }
                    };
                    
                    // Helper to send events to clients directly (for non-buffer events like error/complete)
                    const sendToClients = (event, data) => {
                        streamInfo.bufferListeners.forEach((listener) => {
                            try {
                                listener.sendEvent(event, data);
                            } catch (error) {
                                console.error(`[SSE Stream] Error sending to listener:`, error);
                                // Remove failed listener
                                streamInfo.bufferListeners.delete(listener);
                            }
                        });
                    };
                    
                    // Disconnect any existing clients (only one client per chat at a time)
                    if (streamInfo.bufferListeners.size > 0) {
                        console.log(`[SSE Stream] Disconnecting ${streamInfo.bufferListeners.size} existing client(s) for chat ${id} - new client connecting`);
                        streamInfo.bufferListeners.forEach((listener) => {
                            try {
                                // Send a disconnect message (optional - client will handle stream close)
                                listener.sendEvent("error", { error: "Another client connected" });
                            } catch (error) {
                                // Ignore errors - client may already be disconnected
                            }
                        });
                        streamInfo.bufferListeners.clear();
                    }
                    
                    // Client listener: reads entire buffer, then waits for new events
                    const startClientListener = async () => {
                        // First, replay all existing buffer events (catchup)
                        const currentBufferLength = streamInfo.events.length;
                        if (currentBufferLength > 0) {
                            console.log(`[SSE Stream] Replaying ${currentBufferLength} buffered events for client on chat ${id}`);
                            // Small delay to ensure client SSE reader is ready
                            await new Promise(resolve => setTimeout(resolve, 50));
                            for (let i = 0; i < currentBufferLength; i++) {
                                const storedEvent = streamInfo.events[i];
                                console.log(`[SSE Stream] Replaying event ${i + 1}/${currentBufferLength}: ${storedEvent.event}`, storedEvent.data ? Object.keys(storedEvent.data) : 'no data');
                                sendEvent(storedEvent.event, storedEvent.data);
                            }
                            console.log(`[SSE Stream] Finished replaying ${currentBufferLength} events for chat ${id}`);
                        }
                        
                        // Now add client as a listener - it will receive new events as buffer updates
                        const listener = {
                            sendEvent,
                            lastIndex: currentBufferLength, // Track where this client is in the buffer
                        };
                        streamInfo.bufferListeners.add(listener);
                        console.log(`[SSE Stream] Client listener added for chat ${id} (${streamInfo.bufferListeners.size} total listeners, starting at index ${currentBufferLength})`);
                    };
                    
                    // Start the client listener (replays buffer, then listens for new events)
                    // Don't await - start it but return stream immediately
                    startClientListener().catch((error) => {
                        console.error(`[SSE Stream] Error in client listener for chat ${id}:`, error);
                        // Remove listener on error
                        streamInfo.bufferListeners.forEach((listener) => {
                            if (listener.sendEvent === sendEvent) {
                                streamInfo.bufferListeners.delete(listener);
                            }
                        });
                    });
                    
                    // Only subscribe to REQUEST_PROGRESS if this is a new stream (not a reconnection)
                    // On reconnection, the subscription is already active and will continue sending events
                    if (!isReconnection) {
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
                                    try {
                                        sendToClients("error", { error });
                                        // Persist error state (clear loading, don't save incomplete message)
                                        await persistMessage(
                                            chat,
                                            accumulator,
                                            finalEntityId,
                                            true, // isError
                                        );
                                    } catch (persistError) {
                                        console.error("Error persisting on stream error:", persistError);
                                    } finally {
                                        cleanupStream();
                                        closeStream();
                                    }
                                    return;
                                }

                                // Process info block - subscription ONLY updates buffer
                                // Buffer update automatically sends to clients
                                if (info) {
                                    accumulator.processInfo(info);
                                    updateBuffer("info", { info });
                                }

                                // Process result block - subscription ONLY updates buffer
                                // Buffer update automatically sends to clients
                                if (resultData) {
                                    accumulator.processResult(resultData);
                                    updateBuffer("data", {
                                        result: resultData,
                                        progress,
                                    });
                                } else if (progress !== undefined) {
                                    updateBuffer("progress", { progress });
                                }

                                // Handle completion
                                if (progress === 1) {

                                    // Persist the message (server always persists)
                                    try {
                                        console.log(`[SSE Stream] Stream completed for chat ${chat._id}, persisting message...`);
                                        const persistedChat = await persistMessage(
                                            chat,
                                            accumulator,
                                            finalEntityId,
                                            false, // isError
                                        );
                                        console.log(`[SSE Stream] Message persisted successfully for chat ${chat._id}. Final message count: ${persistedChat?.messages?.length || 'unknown'}`);
                                        sendToClients("complete", { progress: 1 });
                                    } catch (persistError) {
                                        console.error(`[SSE Stream] Error persisting message for chat ${chat._id}:`, persistError);
                                        sendToClients("error", {
                                            error: "Failed to persist message",
                                        });
                                    } finally {
                                        cleanupStream();
                                        closeStream();
                                    }
                                }
                            },
                            error: async (error) => {
                                console.error("Subscription error:", error);
                                try {
                                    sendToClients("error", {
                                        error: error.message || String(error),
                                    });
                                    // Try to persist what we have (even if incomplete)
                                    await persistMessage(
                                        chat,
                                        accumulator,
                                        finalEntityId,
                                        true, // isError
                                    );
                                } catch (persistError) {
                                    console.error("Error persisting on subscription error:", persistError);
                                } finally {
                                    cleanupStream();
                                    closeStream();
                                }
                            },
                            complete: () => {
                                sendToClients("complete", {});
                                cleanupStream();
                                closeStream();
                            },
                        });
                    }
                    // On reconnection, subscription is already active - just replay events and let it continue
                } catch (error) {
                    console.error("Error setting up subscription:", error);
                    const streamInfoForError = activeStreams.get(id);
                    if (streamInfoForError) {
                        streamInfoForError.bufferListeners.forEach((listener) => {
                            try {
                                listener.sendEvent("error", {
                                    error: error.message || String(error),
                                });
                            } catch (e) {
                                console.error("Error sending error to listener:", e);
                            }
                        });
                    }
                    cleanupStream();
                    closeStream();
                }
            },
            cancel() {
                // Client disconnected - mark stream as closed
                streamClosed = true;
                // Remove from buffer listeners
                const streamInfo = activeStreams.get(id);
                if (streamInfo && clientSendEventRef) {
                    // Find and remove the listener for this client
                    for (const listener of streamInfo.bufferListeners) {
                        if (listener.sendEvent === clientSendEventRef) {
                            streamInfo.bufferListeners.delete(listener);
                            break;
                        }
                    }
                    console.log(`[SSE Stream] Client disconnected from stream for chat ${id} (${streamInfo.bufferListeners.size} listeners remaining), server will continue to persist`);
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
