"use client";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import MonacoEditor from "@monaco-editor/react";
import { CheckIcon, Link2Icon } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useContext, useEffect, useRef, useState } from "react";
import { RiSendPlane2Fill } from "react-icons/ri";
import TextareaAutosize from "react-textarea-autosize";
import { ServerContext } from "../../../../src/App";
import {
    useUpdateWorkspaceApplet,
    useWorkspaceApplet,
    useWorkspaceChat,
} from "../../../queries/workspaces";
import ChatInterface from "./ChatInterface";
import PreviewTabs from "./PreviewTabs";
import { getMessagesUpToVersion } from "./utils";
import VersionNavigator from "./VersionNavigator";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog";

function CopyPublishedLinkButton() {
    const [copied, setCopied] = useState(false);
    const serverContext = useContext(ServerContext);
    const { id } = useParams();
    const placeholderLink = `${serverContext.serverUrl}/published/workspaces/${id}/applet`;

    const handleCopy = async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(placeholderLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const handleOpen = (e) => {
        e.stopPropagation();
        window.open(placeholderLink, "_blank", "noopener,noreferrer");
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="inline-flex">
                    <button
                        className={`flex items-center px-2 py-0.5 rounded-full border border-emerald-200 bg-white hover:bg-emerald-50 transition shadow-sm ${copied ? "border-emerald-400 bg-emerald-50" : ""}`}
                        type="button"
                        aria-label="Copy or open published link"
                        tabIndex={0}
                    >
                        <span
                            className={`p-1 rounded-full transition cursor-pointer ${copied ? "bg-emerald-100" : "hover:bg-emerald-100"}`}
                            onClick={handleCopy}
                            title="Copy link"
                        >
                            {copied ? (
                                <CheckIcon className="w-4 h-4 text-emerald-700" />
                            ) : (
                                <Link2Icon className="w-4 h-4 text-emerald-700" />
                            )}
                        </span>
                        <span
                            className="px-1 py-1 rounded-full text-xs font-bold text-emerald-700 underline hover:text-emerald-900 transition cursor-pointer"
                            onClick={handleOpen}
                            title="Open link"
                        >
                            {copied ? "Copied!" : "Open"}
                        </span>
                    </button>
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={10}>
                {copied ? "Copied!" : placeholderLink}
            </TooltipContent>
        </Tooltip>
    );
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

export default function WorkspaceApplet() {
    const { id } = useParams();
    const selectedLLM = "o3mini"; // This will be the default model
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const [previewHtml, setPreviewHtml] = useState(null);
    const [htmlVersions, setHtmlVersions] = useState([]);
    const [activeVersionIndex, setActiveVersionIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const [publishedVersionIndex, setPublishedVersionIndex] = useState(null);
    const allMessagesRef = useRef([]);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showContinueConfirm, setShowContinueConfirm] = useState(false);
    const [isContinuingFromOldVersion, setIsContinuingFromOldVersion] =
        useState(false);

    // Queries and mutations
    const appletQuery = useWorkspaceApplet(id);
    const updateApplet = useUpdateWorkspaceApplet();
    const chatMutation = useWorkspaceChat(id);

    // Reset continuing flag when version changes
    useEffect(() => {
        setIsContinuingFromOldVersion(false);
    }, [activeVersionIndex]);

    // Load initial data
    useEffect(() => {
        if (
            appletQuery.data?.messages?.length > 0 &&
            !allMessagesRef.current?.length
        ) {
            console.log(
                "DEBUG: setMessages - initial load from appletQuery.data",
                {
                    messages: appletQuery.data.messages,
                    activeVersionIndex,
                },
            );
            console.log("DEBUG: About to call setAllMessages - initial load");
            allMessagesRef.current = appletQuery.data.messages || [];
            console.log(
                "DEBUG: About to call setMessages - initial load from appletQuery.data",
            );
            setMessages(
                getMessagesUpToVersion(
                    appletQuery.data.messages,
                    activeVersionIndex,
                ),
            );

            if (appletQuery.data.htmlVersions?.length > 0) {
                setHtmlVersions(
                    appletQuery.data.htmlVersions.map((v) => v.content),
                );
                setActiveVersionIndex(appletQuery.data.htmlVersions.length - 1);
                setPreviewHtml(
                    appletQuery.data.htmlVersions[
                        appletQuery.data.htmlVersions.length - 1
                    ].content,
                );
            }

            setPublishedVersionIndex(
                typeof appletQuery.data.publishedVersionIndex === "number"
                    ? appletQuery.data.publishedVersionIndex
                    : null,
            );
        }
    }, [appletQuery.data]);

    // Update messages when version changes
    useEffect(() => {
        if (
            allMessagesRef.current &&
            allMessagesRef.current.length > 0 &&
            activeVersionIndex !== -1
        ) {
            console.log("DEBUG: setMessages - effect update from allMessages", {
                allMessages: allMessagesRef.current,
                activeVersionIndex,
            });
            console.log(
                "DEBUG: About to call setMessages - version change effect",
            );
            setMessages(
                getMessagesUpToVersion(
                    allMessagesRef.current,
                    activeVersionIndex,
                ),
            );
        }
    }, [activeVersionIndex]);

    const handleSendMessage = async () => {
        if (!inputMessage.trim() || !selectedLLM) return;

        let truncatedAllMessages = allMessagesRef.current;
        let truncatedHtmlVersions = htmlVersions;

        // If continuing from an old version, truncate arrays
        if (isContinuingFromOldVersion) {
            truncatedAllMessages = getMessagesUpToVersion(
                allMessagesRef.current,
                activeVersionIndex,
            );
            truncatedHtmlVersions = htmlVersions.slice(
                0,
                activeVersionIndex + 1,
            );
        }

        const newMessage = {
            content: inputMessage,
            role: "user",
            timestamp: new Date().toISOString(),
        };

        const updatedMessages = [...truncatedAllMessages, newMessage];
        console.log("DEBUG: setMessages - handleSendMessage", {
            updatedMessages,
        });
        console.log("DEBUG: About to call setMessages - handleSendMessage");
        setMessages(updatedMessages);
        setInputMessage("");
        setIsLoading(true);

        try {
            const currentHtml = truncatedHtmlVersions[activeVersionIndex] || "";
            const response = await chatMutation.mutateAsync({
                messages: updatedMessages,
                currentHtml,
            });

            let aiMessage = {
                content: response.message,
                role: "assistant",
                timestamp: new Date().toISOString(),
            };

            let newVersions = truncatedHtmlVersions;
            if (
                typeof response.message === "object" &&
                response.message !== null &&
                typeof response.message.html === "string" &&
                typeof response.message.changes === "string"
            ) {
                newVersions = [
                    ...truncatedHtmlVersions.slice(0, activeVersionIndex + 1),
                    response.message.html,
                ];
                setHtmlVersions(newVersions);
                setPreviewHtml(response.message.html);
                setActiveVersionIndex(newVersions.length - 1);

                aiMessage.content = `HTML code generated. Check the preview pane\n\n\n#### Summary of changes:**\n${response.message.changes}`;
                aiMessage.linkToVersion = newVersions.length - 1;
            } else {
                aiMessage.content = response.message;
                if (response.message.includes("`")) {
                    aiMessage.content = response.message.replace(/`/g, "");
                }
                aiMessage.linkToVersion = newVersions.length - 1;
            }

            const finalMessages = [...updatedMessages, aiMessage];
            console.log("DEBUG: setMessages - after AI response", {
                finalMessages,
                newVersionsLength: newVersions.length - 1,
            });

            console.log("DEBUG: About to call setMessages - after AI response");
            setMessages(
                getMessagesUpToVersion(finalMessages, newVersions.length - 1),
            );
            setIsContinuingFromOldVersion(false);

            allMessagesRef.current = finalMessages;

            updateApplet.mutate({
                id,
                data: {
                    messages: finalMessages,
                    htmlVersions: newVersions,
                },
            });
        } catch (error) {
            console.error("Error calling AI endpoint:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePublishVersion = (versionIdx) => {
        updateApplet.mutate(
            { id, data: { publishedVersionIndex: versionIdx } },
            { onSuccess: () => setPublishedVersionIndex(versionIdx) },
        );
    };

    const handleUnpublish = () => {
        updateApplet.mutate(
            { id, data: { publishedVersionIndex: null } },
            { onSuccess: () => setPublishedVersionIndex(null) },
        );
    };

    const handleClearChat = () => {
        console.log("DEBUG: setMessages - clear chat");
        console.log("DEBUG: About to call setMessages - clear chat");
        allMessagesRef.current = [];
        setMessages([]);
        updateApplet.mutate({ id, data: { messages: [] } });
    };

    const handleHtmlChange = (value, versionIndex) => {
        const newVersions = [...htmlVersions];
        newVersions[versionIndex] = value;
        setHtmlVersions(newVersions);
        setPreviewHtml(value);
    };

    const handleContinueFromOldVersion = () => {
        setIsContinuingFromOldVersion(true);
    };

    const handleMessageClick = (versionIndex) => {
        setActiveVersionIndex(versionIndex);
    };

    const handleReplayMessage = (messageIndex) => {
        // Get all messages up to and including the selected message
        const messageToReplay = allMessagesRef.current[messageIndex];
        const content = messageToReplay.content;
        const messagesToKeep = allMessagesRef.current.slice(0, messageIndex);

        // Update the messages state
        setMessages(messagesToKeep);
        allMessagesRef.current = messagesToKeep;

        // Update the applet with the truncated messages
        updateApplet.mutate({
            id,
            data: {
                messages: messagesToKeep,
            },
        });

        // Send the last message to restart the conversation
        setInputMessage(content);
        setTimeout(() => {
            handleSendMessage();
        }, 100);
    };

    const blockOldVersionChat =
        htmlVersions.length > 0 &&
        activeVersionIndex !== htmlVersions.length - 1 &&
        !isContinuingFromOldVersion;

    return (
        <TooltipProvider>
            <div className="flex flex-col h-full overflow-auto">
                {/* Header with instructions */}
                {/* {messages && messages.length === 0 && (
                    <div className="bg-gray-50 border-b p-4 mb-4">
                        <p className="text-gray-600 mb-2">
                            This section allows you to generate a UI for this
                            workspace. Describe your desired UI in natural language,
                            and see the results appear in real-time. The UI will
                            have access to prompts defined in this workspace.
                        </p>
                    </div>
                )} */}

                <div className="flex justify-between gap-4 h-full overflow-auto bg-gray-100 p-4">
                    {htmlVersions.length > 0 && (
                        <div className="flex flex-col grow overflow-auto">
                            <VersionNavigator
                                activeVersionIndex={activeVersionIndex}
                                setActiveVersionIndex={setActiveVersionIndex}
                                htmlVersions={htmlVersions}
                                setHtmlVersions={setHtmlVersions}
                                publishedVersionIndex={publishedVersionIndex}
                                onPublishVersion={handlePublishVersion}
                                onUnpublish={handleUnpublish}
                                updateApplet={updateApplet}
                                workspaceId={id}
                                setPreviewHtml={setPreviewHtml}
                            />
                            <PreviewTabs
                                htmlVersions={htmlVersions}
                                activeVersionIndex={activeVersionIndex}
                                onHtmlChange={handleHtmlChange}
                            />
                        </div>
                    )}

                    <div
                        className={cn(
                            "flex h-full overflow-auto flex-col",
                            htmlVersions.length > 0 ? "w-80" : "w-full",
                        )}
                    >
                        {/* Remove model selector and keep only Clear button */}
                        <div className="mb-4 flex items-center justify-end gap-4">
                            {messages && messages.length > 0 && (
                                <button
                                    className={cn(
                                        "lb-outline-secondary lb-sm",
                                        blockOldVersionChat &&
                                            "opacity-50 cursor-not-allowed",
                                    )}
                                    onClick={() => setShowClearConfirm(true)}
                                    disabled={blockOldVersionChat}
                                >
                                    Clear chat
                                </button>
                            )}
                        </div>

                        {/* Chat or Message Input */}
                        {(messages && messages.length > 0) ||
                        htmlVersions.length > 0 ? (
                            <div
                                className={cn(
                                    "relative flex-1 grow overflow-hidden",
                                )}
                            >
                                {blockOldVersionChat && (
                                    <>
                                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
                                            <button
                                                className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors"
                                                onClick={() =>
                                                    setShowContinueConfirm(true)
                                                }
                                            >
                                                Continue from here
                                            </button>
                                        </div>
                                        <AlertDialog
                                            open={showContinueConfirm}
                                            onOpenChange={
                                                setShowContinueConfirm
                                            }
                                        >
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>
                                                        Continue from this
                                                        version?
                                                    </AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Continuing from this
                                                        version will remove all
                                                        future versions. This
                                                        action cannot be undone.
                                                        <br />
                                                        <br />
                                                        <span className="text-emerald-600 font-medium">
                                                            Note: Published
                                                            versions are never
                                                            lost.
                                                        </span>
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>
                                                        Cancel
                                                    </AlertDialogCancel>
                                                    <AlertDialogAction
                                                        autoFocus
                                                        onClick={() => {
                                                            handleContinueFromOldVersion();
                                                            setShowContinueConfirm(
                                                                false,
                                                            );
                                                        }}
                                                    >
                                                        Continue
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </>
                                )}
                                <div className="overflow-auto h-full">
                                    <ChatInterface
                                        messages={messages}
                                        inputMessage={inputMessage}
                                        setInputMessage={setInputMessage}
                                        onSendMessage={handleSendMessage}
                                        isLoading={isLoading}
                                        blockOldVersionChat={
                                            blockOldVersionChat
                                        }
                                        showContinueConfirm={
                                            showContinueConfirm
                                        }
                                        setShowContinueConfirm={
                                            setShowContinueConfirm
                                        }
                                        showClearConfirm={showClearConfirm}
                                        setShowClearConfirm={
                                            setShowClearConfirm
                                        }
                                        onContinueFromOldVersion={
                                            handleContinueFromOldVersion
                                        }
                                        onClearChat={handleClearChat}
                                        onMessageClick={handleMessageClick}
                                        htmlVersions={htmlVersions}
                                        onReplayMessage={handleReplayMessage}
                                    />
                                </div>
                            </div>
                        ) : (
                            selectedLLM && (
                                <div className="rounded-md border dark:border-zinc-200 mt-3">
                                    <form
                                        className="flex items-center rounded-md dark:bg-zinc-100"
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }}
                                    >
                                        <div className="relative grow">
                                            <div className="flex items-center">
                                                <TextareaAutosize
                                                    className="w-full border-0 outline-none focus:shadow-none text-sm focus:ring-0 py-3 resize-none dark:bg-zinc-100 px-3 rounded-s max-h-24 overflow-y-auto"
                                                    rows={1}
                                                    value={inputMessage}
                                                    onChange={(e) =>
                                                        setInputMessage(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="Describe your desired UI in natural language..."
                                                    onKeyDown={(e) => {
                                                        if (
                                                            e.key ===
                                                                "Enter" &&
                                                            !e.shiftKey
                                                        ) {
                                                            e.preventDefault();
                                                            handleSendMessage();
                                                        }
                                                    }}
                                                    autoComplete="on"
                                                    autoCapitalize="sentences"
                                                    autoCorrect="on"
                                                    spellCheck="true"
                                                    inputMode="text"
                                                    disabled={isLoading}
                                                />
                                            </div>
                                        </div>
                                        <div className="px-3 bg-white self-stretch flex items-center rounded-e">
                                            <div>
                                                <button
                                                    type="submit"
                                                    disabled={
                                                        !inputMessage.trim() ||
                                                        isLoading
                                                    }
                                                    className="text-base rtl:rotate-180 text-emerald-500 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100 flex items-center justify-center"
                                                >
                                                    {isLoading ? (
                                                        <div className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <RiSendPlane2Fill />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}

function HtmlEditor({ value, onChange }) {
    return (
        <MonacoEditor
            height="100%"
            width="100%"
            language="html"
            theme="vs-dark"
            options={{
                fontSize: 12,
                fontWeight: "normal",
            }}
            value={value}
            onChange={onChange}
        />
    );
}
