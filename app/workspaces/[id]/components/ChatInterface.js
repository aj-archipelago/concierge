"use client";
import { cn } from "@/lib/utils";
import { RiSendPlane2Fill } from "react-icons/ri";
import ReactMarkdown from "react-markdown";
import TextareaAutosize from "react-textarea-autosize";
import React, { useRef, useEffect } from "react";
import { RotateCcw } from "lucide-react";
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

// Helper function to get display content for streaming messages
function getStreamingDisplayContent(content, isStreaming) {
    if (!isStreaming || !content) return content;

    // Use the existing detection mechanism to check if content contains HTML
    const htmlContent = extractHtmlFromStreamingContent(content);

    // If HTML is detected, show a placeholder
    if (htmlContent && htmlContent.html) {
        return "🔄 **Generating HTML...**";
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
    const messagesEndRef = useRef(null);

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
                ? "Type your message here..."
                : "Read-only mode"
            : "Describe your desired UI in natural language...";

    return (
        <div className="flex flex-col grow overflow-auto h-full">
            <div className="flex-1 grow overflow-auto border rounded-md p-4 bg-white scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 mb-3">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`mb-4 ${
                            message.role === "user"
                                ? "flex justify-end"
                                : "flex justify-start"
                        }`}
                    >
                        <div
                            className={`max-w-[80%] rounded-md p-3 ${
                                message.role === "user"
                                    ? "bg-sky-100 text-sky-900"
                                    : "bg-gray-100 text-gray-900"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <div className="text-xs text-gray-600 capitalize">
                                    {message.role === "user"
                                        ? "You"
                                        : "Assistant"}
                                </div>
                                {message.role === "user" && isOwner && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onReplayMessage(index);
                                        }}
                                        className="text-xs text-sky-600 hover:text-sky-700 transition-colors p-1 hover:bg-sky-50 rounded-full"
                                        title="Replay from this message"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                            <ReactMarkdown
                                className="prose dark:prose-invert text-sm break-words"
                                components={{
                                    p: ({ children }) => (
                                        <p className="m-0">
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
                                }}
                            >
                                {message.isStreaming && isStreaming
                                    ? getStreamingDisplayContent(
                                          streamingContent || message.content,
                                          isStreaming,
                                      )
                                    : message.content}
                            </ReactMarkdown>
                            {message.isStreaming && isStreaming && (
                                <div className="mt-2 flex items-center space-x-2">
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
                ))}
                {isLoading &&
                    !isStreaming &&
                    !messages.some((m) => m.isStreaming) && (
                        <div className="flex justify-start mb-4">
                            <div className="max-w-[80%] rounded-md p-3 bg-gray-100 text-gray-900">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="text-xs text-gray-600 capitalize">
                                        Assistant
                                    </div>
                                </div>
                                <div className="mt-2 flex items-center space-x-2">
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
            <div className="rounded-md border dark:border-zinc-200 flex-shrink-0">
                <form
                    className="flex items-center rounded-md dark:bg-zinc-100"
                    onSubmit={handleSubmit}
                >
                    <div className="relative grow">
                        <div className="flex items-center">
                            <TextareaAutosize
                                className={cn(
                                    "w-full border-0 outline-none focus:shadow-none text-sm focus:ring-0 py-3 resize-none dark:bg-zinc-100 px-3 rounded-s max-h-24 overflow-y-auto",
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
                    <div className="px-3 bg-white self-stretch flex items-center rounded-e">
                        <div>
                            <button
                                type="submit"
                                disabled={
                                    !inputMessage.trim() ||
                                    isLoading ||
                                    isStreaming ||
                                    blockOldVersionChat ||
                                    !isOwner
                                }
                                className="text-base rtl:rotate-180 text-emerald-500 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100 flex items-center justify-center"
                            >
                                {isLoading || isStreaming ? (
                                    <div className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <RiSendPlane2Fill />
                                )}
                            </button>
                        </div>
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
                        <AlertDialogTitle>Clear Chat?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to clear the chat? This action
                            cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={() => {
                                onClearChat();
                                setShowClearConfirm(false);
                            }}
                        >
                            Clear
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
