"use client";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import TextareaAutosize from "react-textarea-autosize";
import React, { useRef, useEffect, useContext } from "react";
import { RotateCcw, StopCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { extractHtmlFromStreamingContent } from "./utils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";

// Helper function to get display content for streaming messages
function getStreamingDisplayContent(content, isStreaming, t) {
    if (!isStreaming || !content) return content;

    // Use the existing detection mechanism to check if content contains HTML
    const htmlContent = extractHtmlFromStreamingContent(content);

    // If HTML is detected, show a placeholder
    if (htmlContent && htmlContent.html) {
        return "🔄 **" + t("Generating HTML...") + "**";
    }

    return content;
}

function renderWithColorPreviews(text) {
    const hexColorRegex = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = hexColorRegex.exec(text)) !== null) {
        const color = match[0];
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        parts.push(
            <React.Fragment key={match.index}>
                <span style={{ fontFamily: "monospace" }}>{color}</span>
                <span
                    style={{
                        display: "inline-block",
                        width: "1em",
                        height: "1em",
                        background: color,
                        border: "1px solid #ccc",
                        marginLeft: 4,
                        marginRight: 4,
                        verticalAlign: "middle",
                    }}
                    title={color}
                />
            </React.Fragment>,
        );
        lastIndex = match.index + color.length;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
}

export default function ChatInterface({
    messages,
    inputMessage,
    setInputMessage,
    onSendMessage,
    onStopStreaming,
    isLoading,
    blockOldVersionChat,
    showContinueConfirm,
    setShowContinueConfirm,
    showClearConfirm,
    setShowClearConfirm,
    onContinueFromOldVersion,
    onClearChat,
    onMessageClick,
    htmlVersions,
    onReplayMessage,
    streamingContent,
    isStreaming,
    isOwner = true,
}) {
    const { t } = useTranslation();
    const messagesEndRef = useRef(null);
    const { direction } = useContext(LanguageContext);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingContent]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isOwner) {
            onSendMessage();
        }
    };

    const placeholder =
        (messages && messages.length > 0) || htmlVersions.length > 0
            ? isOwner
                ? t("Type your message here...")
                : t("Read-only mode")
            : t("Describe your desired UI in natural language...");

    return (
        <div className="flex flex-col grow overflow-auto h-full">
            <div className="flex-1 grow overflow-auto border rounded-md p-4 bg-white dark:bg-gray-800 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 mb-3">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`mb-6 ${
                            message.role === "user"
                                ? "flex justify-end"
                                : "flex justify-start"
                        }`}
                    >
                        <div
                            className={`max-w-[100%] rounded-lg p-4 shadow-sm ${
                                message.role === "user"
                                    ? "bg-sky-100 text-sky-900 border border-sky-200 dark:border-sky-700 dark:bg-sky-900/20"
                                    : "bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-medium text-gray-600 capitalize dark:text-gray-400">
                                    {message.role === "user"
                                        ? t("You")
                                        : t("Assistant")}
                                </div>
                                {message.role === "user" && isOwner && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onReplayMessage(index);
                                        }}
                                        className="text-xs text-sky-600 hover:text-sky-700 transition-colors p-1 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-full"
                                        title={t("Replay from this message")}
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                            <div className="chat-message-content">
                                <ReactMarkdown
                                    className="prose dark:prose-invert text-sm break-words leading-relaxed"
                                    components={{
                                        p: ({ children }) => (
                                            <p className="m-0 mb-3 last:mb-0">
                                                {React.Children.toArray(
                                                    children,
                                                ).map((child, idx) =>
                                                    typeof child === "string"
                                                        ? renderWithColorPreviews(
                                                              child,
                                                          )
                                                        : child,
                                                )}
                                            </p>
                                        ),
                                        h1: ({ children }) => (
                                            <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">
                                                {children}
                                            </h1>
                                        ),
                                        h2: ({ children }) => (
                                            <h2 className="text-lg font-semibold mb-2 mt-3 first:mt-0">
                                                {children}
                                            </h2>
                                        ),
                                        h3: ({ children }) => (
                                            <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">
                                                {children}
                                            </h3>
                                        ),
                                        ul: ({ children }) => (
                                            <ul className="list-disc list-inside mb-3 space-y-1">
                                                {children}
                                            </ul>
                                        ),
                                        ol: ({ children }) => (
                                            <ol className="list-decimal list-inside mb-3 space-y-1">
                                                {children}
                                            </ol>
                                        ),
                                        li: ({ children }) => (
                                            <li className="text-sm leading-relaxed">
                                                {children}
                                            </li>
                                        ),
                                        blockquote: ({ children }) => (
                                            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 py-2 my-3 bg-gray-50 dark:bg-gray-700 rounded-r dark:text-gray-300">
                                                {children}
                                            </blockquote>
                                        ),
                                        code: ({ children, className }) => {
                                            const isInline = !className;
                                            return isInline ? (
                                                <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                                                    {children}
                                                </code>
                                            ) : (
                                                <code className={className}>
                                                    {children}
                                                </code>
                                            );
                                        },
                                        pre: ({ children }) => (
                                            <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md overflow-x-auto text-sm font-mono mb-3 text-gray-800 dark:text-gray-200">
                                                {children}
                                            </pre>
                                        ),
                                        a: ({ children, href }) => (
                                            <a
                                                href={href}
                                                className="text-sky-600 hover:text-sky-700 underline"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {children}
                                            </a>
                                        ),
                                        strong: ({ children }) => children,
                                        em: ({ children }) => (
                                            <em className="italic text-gray-800">
                                                {children}
                                            </em>
                                        ),
                                    }}
                                >
                                    {message.isStreaming && isStreaming
                                        ? getStreamingDisplayContent(
                                              streamingContent ||
                                                  message.content,
                                              isStreaming,
                                              t,
                                          )
                                        : message.content}
                                </ReactMarkdown>
                                {message.isStreaming && isStreaming && (
                                    <div className="mt-3 flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                                        <div
                                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                            style={{ animationDelay: "0.2s" }}
                                        />
                                        <div
                                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                            style={{ animationDelay: "0.4s" }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading &&
                    !isStreaming &&
                    !messages.some((m) => m.isStreaming) && (
                        <div className="flex justify-start mb-6">
                            <div className="max-w-[85%] rounded-lg p-4 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-medium text-gray-600 capitalize">
                                        {t("Assistant")}
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                                    <div
                                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                        style={{ animationDelay: "0.2s" }}
                                    />
                                    <div
                                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                        style={{ animationDelay: "0.4s" }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                <div ref={messagesEndRef} />
            </div>

            {/* Chat input section */}
            <div className="rounded-md border dark:border-zinc-100 flex-shrink-0 transition-colors duration-200 focus-within:border-gray-400 dark:focus-within:border-gray-500">
                <form
                    className={cn(
                        "flex items-center rounded-md dark:bg-gray-800 transition-colors duration-200",
                        direction === "rtl" ? "flex-row-reverse" : "flex-row",
                    )}
                    onSubmit={handleSubmit}
                >
                    <div className="relative grow">
                        <div className="flex items-center">
                            <TextareaAutosize
                                className={cn(
                                    "w-full border-0 outline-none focus:shadow-none text-sm focus:ring-0 py-3 resize-none dark:bg-transparent px-3 rounded-s max-h-24 overflow-y-auto dark:text-gray-100",
                                    direction === "rtl"
                                        ? "direction-rtl"
                                        : "direction-ltr",
                                    (blockOldVersionChat || !isOwner) &&
                                        "opacity-50 cursor-not-allowed",
                                )}
                                rows={1}
                                value={inputMessage}
                                onChange={(e) =>
                                    setInputMessage(e.target.value)
                                }
                                placeholder={placeholder}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        if (isOwner) {
                                            onSendMessage();
                                        }
                                    }
                                }}
                                autoComplete="on"
                                autoCapitalize="sentences"
                                autoCorrect="on"
                                spellCheck="true"
                                inputMode="text"
                                disabled={
                                    isLoading ||
                                    isStreaming ||
                                    blockOldVersionChat ||
                                    !isOwner
                                }
                            />
                        </div>
                    </div>
                    <div className="px-3 bg-white dark:bg-gray-800 self-stretch flex items-center rounded-e gap-1 transition-colors duration-200">
                        <button
                            type={
                                isStreaming || isLoading ? "button" : "submit"
                            }
                            onClick={
                                isStreaming || isLoading
                                    ? onStopStreaming
                                    : undefined
                            }
                            disabled={
                                !isStreaming &&
                                !isLoading &&
                                (!inputMessage.trim() ||
                                    blockOldVersionChat ||
                                    !isOwner)
                            }
                            className="text-base rtl:rotate-180 text-emerald-500 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 flex items-center justify-center"
                        >
                            {isStreaming || isLoading ? (
                                <StopCircle className="w-5 h-5 text-red-500" />
                            ) : (
                                <span className="rtl:scale-x-[-1]">
                                    <Send className="w-5 h-5 text-gray-400" />
                                </span>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Clear chat dialog */}
            <AlertDialog
                open={showClearConfirm}
                onOpenChange={setShowClearConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Clear Chat?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to clear the chat? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={() => {
                                onClearChat();
                                setShowClearConfirm(false);
                            }}
                        >
                            {t("Clear")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
