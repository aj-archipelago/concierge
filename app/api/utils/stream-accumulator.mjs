/**
 * Shared message accumulation logic for streaming messages
 * Extracted from useStreamingMessages hook for server-side use
 */

import {
    appendAssistantThinkingSummary,
    appendAssistantTextChunk,
    appendAssistantThinkingChunk,
    buildAssistantPayloadFromItems,
    buildInlineAssistantPayload,
    createAssistantToolEventItem,
    updateAssistantThinkingDuration,
    upsertAssistantToolEvent,
} from "../../../src/utils/assistantInlinePayload";

export class StreamAccumulator {
    constructor() {
        this.streamingMessage = "";
        this.ephemeralContent = "";
        this.inlinePayloadItems = [];
        this.activeTextIndex = null;
        this.activeThinkingIndex = null;
        this.hasReceivedPersistent = false;
        this.accumulatedInfo = {};
        this.toolCallsMap = new Map();
        this.toolCallIndexMap = new Map();
        this.thinkingStartTime = null;
        this.accumulatedThinkingTime = 0;
        this.isThinking = false;
    }

    /**
     * Process an info block from the stream
     */
    processInfo(info) {
        if (!info) return;

        try {
            const parsedInfo =
                typeof info === "string"
                    ? JSON.parse(info)
                    : typeof info === "object"
                      ? { ...info }
                      : {};

            // Handle structured tool messages
            if (parsedInfo.toolMessage) {
                this.updateToolCalls(parsedInfo.toolMessage);
            }

            // Store accumulated info
            this.accumulatedInfo = {
                ...this.accumulatedInfo,
                ...parsedInfo,
            };

            // Always preserve citations array
            this.accumulatedInfo.citations = [
                ...(this.accumulatedInfo.citations || []),
                ...(parsedInfo.citations || []),
            ];
        } catch (e) {
            console.error("Failed to parse info block:", e);
        }
    }

    /**
     * Process a result block from the stream
     */
    processResult(result) {
        if (!result) return false; // Return true if content was processed

        try {
            const parsed = JSON.parse(result);
            let content;
            if (typeof parsed === "string") {
                content = parsed;
            } else if (parsed?.choices?.[0]?.delta?.content) {
                content = parsed.choices[0].delta.content;
            } else if (parsed?.content) {
                content = parsed.content;
            } else if (parsed?.message) {
                content = parsed.message;
            }

            if (content) {
                const isEphemeral = !!this.accumulatedInfo.ephemeral;

                if (isEphemeral) {
                    this.ephemeralContent += content;
                    if (this.thinkingStartTime === null) {
                        this.thinkingStartTime = Date.now();
                    }
                    const nextInline = appendAssistantThinkingChunk(
                        this.inlinePayloadItems,
                        content,
                        this.getThinkingDuration(),
                        this.activeThinkingIndex,
                    );
                    this.inlinePayloadItems = nextInline.items;
                    this.activeThinkingIndex = nextInline.index;
                    this.activeTextIndex = null;
                } else {
                    this.streamingMessage += content;
                    this.hasReceivedPersistent = true;
                    const nextInline = appendAssistantTextChunk(
                        this.inlinePayloadItems,
                        content,
                        this.activeTextIndex,
                    );
                    this.inlinePayloadItems = updateAssistantThinkingDuration(
                        nextInline.items,
                        this.activeThinkingIndex,
                        this.getThinkingDuration(),
                    );
                    this.activeTextIndex = nextInline.index;
                    this.activeThinkingIndex = null;
                }
                return true;
            }
        } catch {
            // If parsing fails, treat as raw string content
            const isEphemeral = !!this.accumulatedInfo.ephemeral;
            if (isEphemeral) {
                this.ephemeralContent += result;
                if (this.thinkingStartTime === null) {
                    this.thinkingStartTime = Date.now();
                }
                const nextInline = appendAssistantThinkingChunk(
                    this.inlinePayloadItems,
                    result,
                    this.getThinkingDuration(),
                    this.activeThinkingIndex,
                );
                this.inlinePayloadItems = nextInline.items;
                this.activeThinkingIndex = nextInline.index;
                this.activeTextIndex = null;
            } else {
                this.streamingMessage += result;
                this.hasReceivedPersistent = true;
                const nextInline = appendAssistantTextChunk(
                    this.inlinePayloadItems,
                    result,
                    this.activeTextIndex,
                );
                this.inlinePayloadItems = updateAssistantThinkingDuration(
                    nextInline.items,
                    this.activeThinkingIndex,
                    this.getThinkingDuration(),
                );
                this.activeTextIndex = nextInline.index;
                this.activeThinkingIndex = null;
            }
            return true;
        }

        return false;
    }

    /**
     * Update tool calls tracking
     */
    updateToolCalls(toolMessage) {
        if (!toolMessage || !toolMessage.callId) return;

        const {
            type,
            callId,
            icon,
            userMessage,
            success,
            error,
            presentation,
        } = toolMessage;
        const existingItem = this.toolCallsMap.get(callId);
        const existingIndex = this.toolCallIndexMap.get(callId) ?? null;

        if (type === "start") {
            const toolEvent = createAssistantToolEventItem({
                callId,
                icon: icon || "🛠️",
                userMessage: userMessage || "Running tool...",
                status: "thinking",
                presentation:
                    presentation || existingItem?.presentation || "default",
            });
            const nextInline = upsertAssistantToolEvent(
                this.inlinePayloadItems,
                toolEvent,
                existingIndex,
            );
            this.inlinePayloadItems = nextInline.items;
            this.toolCallIndexMap.set(callId, nextInline.index);
            this.toolCallsMap.set(callId, toolEvent);
            if (existingIndex === null) {
                this.activeTextIndex = null;
                this.activeThinkingIndex = null;
            }
        } else if (type === "finish") {
            const toolEvent = {
                ...(existingItem ||
                    createAssistantToolEventItem({
                        callId,
                        icon: icon || "🛠️",
                        userMessage: userMessage || "Running tool...",
                        status: success ? "completed" : "failed",
                    })),
                icon: icon || existingItem?.icon || "🛠️",
                userMessage:
                    userMessage ||
                    existingItem?.userMessage ||
                    "Running tool...",
                status: success ? "completed" : "failed",
                error: error || null,
                presentation:
                    presentation || existingItem?.presentation || "default",
            };
            const nextInline = upsertAssistantToolEvent(
                this.inlinePayloadItems,
                toolEvent,
                existingIndex,
            );
            this.inlinePayloadItems = nextInline.items;
            this.toolCallIndexMap.set(callId, nextInline.index);
            this.toolCallsMap.set(callId, toolEvent);
        }
    }

    /**
     * Get the final thinking duration
     */
    getThinkingDuration() {
        let finalDuration = this.accumulatedThinkingTime;
        if (this.thinkingStartTime !== null) {
            finalDuration = Math.floor(
                (Date.now() - this.thinkingStartTime) / 1000,
            );
        }
        return finalDuration;
    }

    /**
     * Build the final message object
     */
    buildFinalMessage(currentEntityId) {
        // Check if we have any content to save
        const hasContent =
            this.streamingMessage ||
            this.ephemeralContent ||
            this.toolCallsMap.size > 0;

        if (!hasContent) return null;

        const finalContent = this.hasReceivedPersistent
            ? this.streamingMessage
            : "";

        const toolString = JSON.stringify({
            ...this.accumulatedInfo,
            citations: this.accumulatedInfo.citations || [],
        });

        const finalEphemeralContent = this.ephemeralContent;
        const finalToolCalls = Array.from(this.toolCallsMap.values());
        const finalDuration = this.getThinkingDuration();
        const finalizedItems = appendAssistantThinkingSummary(
            updateAssistantThinkingDuration(
                this.inlinePayloadItems,
                this.activeThinkingIndex,
                finalDuration,
            ),
            finalDuration,
        );
        const payload =
            buildAssistantPayloadFromItems(finalizedItems) ||
            buildInlineAssistantPayload({
                content: finalContent,
                thinkingContent: finalEphemeralContent,
                thinkingDuration: finalDuration,
                toolEvents: finalToolCalls,
            });

        return {
            payload,
            tool: toolString,
            sentTime: new Date().toISOString(),
            direction: "incoming",
            position: "single",
            sender: "assistant",
            entityId: currentEntityId,
            isServerGenerated: true,
            isStreaming: false,
        };
    }

    /**
     * Get accumulated info
     */
    getAccumulatedInfo() {
        return { ...this.accumulatedInfo };
    }

    /**
     * Reset the accumulator
     */
    reset() {
        this.streamingMessage = "";
        this.ephemeralContent = "";
        this.inlinePayloadItems = [];
        this.activeTextIndex = null;
        this.activeThinkingIndex = null;
        this.hasReceivedPersistent = false;
        this.accumulatedInfo = {};
        this.toolCallsMap.clear();
        this.toolCallIndexMap.clear();
        this.thinkingStartTime = null;
        this.accumulatedThinkingTime = 0;
        this.isThinking = false;
    }
}
