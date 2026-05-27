import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import classNames from "../../../app/utils/class-names";
import { CurrentUserContext } from "../../App";
import { InlineAssistantPayload } from "./BotMessage";
import { useStreamingDisplay } from "../../hooks/useStreamingMessages";
import {
    ASSISTANT_PAYLOAD_ITEM_TYPES,
    parseAssistantPayloadItem,
} from "../../utils/assistantInlinePayload";

const formatLocalizedNumber = (language, value) => {
    try {
        return new Intl.NumberFormat(language).format(value);
    } catch {
        return String(value);
    }
};

const hasRenderableInlineItems = (items = []) =>
    Array.isArray(items) &&
    items.some((item) => {
        const parsed = parseAssistantPayloadItem(item);
        if (!parsed) {
            return typeof item === "string" && item.trim().length > 0;
        }
        if (
            parsed.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TEXT ||
            parsed.type === ASSISTANT_PAYLOAD_ITEM_TYPES.THINKING
        ) {
            return (
                typeof parsed.text === "string" && parsed.text.trim().length > 0
            );
        }
        return true;
    });

const hasInlineThinkingItem = (items = []) =>
    Array.isArray(items) &&
    items.some(
        (item) =>
            parseAssistantPayloadItem(item)?.type ===
            ASSISTANT_PAYLOAD_ITEM_TYPES.THINKING,
    );

const StreamingMessage = React.memo(function StreamingMessage({
    chatId,
    className,
    statusLabel = null,
    isThinkingOverride,
    statusTone = "default",
    compactStatusOnly = false,
}) {
    const streamDisplay = useStreamingDisplay(chatId);
    const content = streamDisplay.streamingContent;
    const inlinePayloadItems = streamDisplay.inlinePayloadItems;
    const thinkingDuration = streamDisplay.thinkingDuration;
    const isThinking =
        isThinkingOverride === undefined
            ? streamDisplay.isThinking
            : isThinkingOverride;
    const { t, i18n } = useTranslation();
    const currentUser = useContext(CurrentUserContext);
    const hasInlineItems = hasRenderableInlineItems(inlinePayloadItems);
    const hasStreamingText =
        typeof content === "string" && content.trim().length > 0;
    const hasVisibleContent = hasInlineItems || hasStreamingText;
    const showThinkingFooter = !hasInlineThinkingItem(inlinePayloadItems);
    const localizedDuration = formatLocalizedNumber(
        i18n.language,
        thinkingDuration,
    );
    const statusClassName =
        statusTone === "danger"
            ? "text-red-500 dark:text-red-300 animate-pulse"
            : "text-transparent bg-gradient-to-r from-gray-900 via-gray-600 to-gray-900 dark:from-gray-100 dark:via-gray-400 dark:to-gray-100 bg-clip-text animate-shimmer bg-[length:200%_100%]";

    return (
        <div
            className={classNames(
                className,
                compactStatusOnly
                    ? "flex ps-2 pt-1 relative group"
                    : "flex bg-white dark:bg-gray-800 ps-2 pt-1 relative group rounded-b-lg rounded-tl-lg rtl:rounded-tl-none rtl:rounded-tr-lg border border-gray-300 dark:border-gray-600",
            )}
        >
            <div
                className={classNames(
                    compactStatusOnly
                        ? "px-2 pb-2 pt-1 [.docked_&]:px-0 [.docked_&]:py-2 w-full"
                        : "px-2 pb-3 pt-2 [.docked_&]:px-0 [.docked_&]:py-3 w-full",
                )}
            >
                <div className="flex flex-col">
                    {hasVisibleContent ? (
                        <div className="chat-message-bot relative break-words">
                            <div className="flex flex-col gap-2">
                                {hasInlineItems ? (
                                    <InlineAssistantPayload
                                        items={inlinePayloadItems}
                                        message={{
                                            id: "streaming-inline-payload",
                                            payload: inlinePayloadItems,
                                            sender: "assistant",
                                        }}
                                        isStreaming={isThinking}
                                        defaultThinkingDuration={
                                            thinkingDuration
                                        }
                                        currentUser={currentUser}
                                    />
                                ) : null}
                                {!hasInlineItems && hasStreamingText ? (
                                    <InlineAssistantPayload
                                        items={[
                                            JSON.stringify({
                                                type: "text",
                                                text: content,
                                            }),
                                        ]}
                                        message={{
                                            id: "streaming-inline-fallback",
                                            sender: "assistant",
                                        }}
                                        isStreaming={isThinking}
                                        defaultThinkingDuration={
                                            thinkingDuration
                                        }
                                        currentUser={currentUser}
                                    />
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                    {showThinkingFooter ? (
                        <div
                            className={classNames(
                                "mt-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
                                statusClassName,
                            )}
                        >
                            {statusLabel ||
                                t("Thinking with duration", {
                                    duration: localizedDuration,
                                })}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
});

StreamingMessage.displayName = "StreamingMessage";
export default StreamingMessage;
