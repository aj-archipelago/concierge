"use client";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, useContext, useCallback } from "react";
import { useSubscription } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { SUBSCRIPTIONS } from "../../../../src/graphql";
import { AuthContext } from "../../../../src/App";
import {
    useUpdateWorkspaceApplet,
    useWorkspaceApplet,
    useWorkspaceChat,
    useWorkspace,
} from "../../../queries/workspaces";
import ChatInterface from "./ChatInterface";
import PreviewTabs from "./PreviewTabs";
import {
    getMessagesUpToVersion,
    extractHtmlFromStreamingContent,
    detectCodeBlockInStream,
    extractChatContent,
} from "./utils";
import VersionNavigator from "./VersionNavigator";
import { toast } from "react-toastify";

export default function WorkspaceApplet() {
    const { t } = useTranslation();
    const { id } = useParams();
    const { user } = useContext(AuthContext);
    const { data: workspace } = useWorkspace(id);
    const selectedLLM = "o3mini"; // This will be the default model
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const [htmlVersions, setHtmlVersions] = useState([]);
    const [activeVersionIndex, setActiveVersionIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const [publishedVersionIndex, setPublishedVersionIndex] = useState(null);
    const allMessagesRef = useRef([]);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showContinueConfirm, setShowContinueConfirm] = useState(false);
    const [isContinuingFromOldVersion, setIsContinuingFromOldVersion] =
        useState(false);
    const [showCreatingDialog, setShowCreatingDialog] = useState(false);

    // Streaming state
    const [subscriptionId, setSubscriptionId] = useState(null);
    const [streamingContent, setStreamingContent] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const streamingMessageRef = useRef("");
    const messageQueueRef = useRef([]);
    const processingRef = useRef(false);
    const streamingVersionRef = useRef(null); // Track the streaming version index

    // Queries and mutations
    const appletQuery = useWorkspaceApplet(id);
    const updateApplet = useUpdateWorkspaceApplet();
    const chatMutation = useWorkspaceChat(id);

    // Check if user is the owner of the workspace
    const isOwner = user?._id?.toString() === workspace?.owner?.toString();

    // Reset continuing flag when version changes
    useEffect(() => {
        setIsContinuingFromOldVersion(false);
    }, [activeVersionIndex]);

    // Load initial data
    const dataLoadedRef = useRef(false);
    const lastDataRef = useRef(null);

    useEffect(() => {
        if (!appletQuery.data) return;

        // Check if the data has changed significantly (e.g., after clearing chat)
        const currentDataKey = JSON.stringify({
            htmlVersionsLength: appletQuery.data.htmlVersions?.length || 0,
            messagesLength: appletQuery.data.messages?.length || 0,
            publishedVersionIndex: appletQuery.data.publishedVersionIndex,
        });

        if (lastDataRef.current !== currentDataKey) {
            dataLoadedRef.current = false;
            lastDataRef.current = currentDataKey;
        }

        if (dataLoadedRef.current) return;

        // Always load HTML versions if they exist and we don't have any loaded
        if (
            appletQuery.data.htmlVersions?.length > 0 &&
            htmlVersions.length === 0
        ) {
            setHtmlVersions(
                appletQuery.data.htmlVersions.map((v) => v.content),
            );
            setActiveVersionIndex(appletQuery.data.htmlVersions.length - 1);
        }

        // Load messages if they exist and we don't have any loaded
        if (
            appletQuery.data.messages?.length > 0 &&
            !allMessagesRef.current?.length
        ) {
            allMessagesRef.current = appletQuery.data.messages || [];
            setMessages(
                getMessagesUpToVersion(
                    appletQuery.data.messages,
                    activeVersionIndex,
                ),
            );
        }

        // Load published version index if it exists and we don't have one set
        if (
            typeof appletQuery.data.publishedVersionIndex === "number" &&
            publishedVersionIndex === null
        ) {
            setPublishedVersionIndex(appletQuery.data.publishedVersionIndex);
        }

        dataLoadedRef.current = true;
    }, [
        appletQuery.data,
        activeVersionIndex,
        publishedVersionIndex,
        htmlVersions.length,
    ]);

    // Update messages when version changes
    useEffect(() => {
        if (
            allMessagesRef.current &&
            allMessagesRef.current.length > 0 &&
            activeVersionIndex !== -1
        ) {
            setMessages(
                getMessagesUpToVersion(
                    allMessagesRef.current,
                    activeVersionIndex,
                ),
            );
        }
    }, [activeVersionIndex]);

    // Clear streaming state
    // Simple and bulletproof version management
    const createNewVersion = useCallback(
        (htmlContent) => {
            const newVersions = [...htmlVersions, htmlContent];
            const newVersionIndex = newVersions.length - 1;

            setHtmlVersions(newVersions);
            setActiveVersionIndex(newVersionIndex);

            return newVersionIndex;
        },
        [htmlVersions],
    );

    const updateStreamingVersion = useCallback(
        (htmlContent) => {
            if (streamingVersionRef.current === null) {
                // First time streaming - create a new version
                const newVersionIndex = createNewVersion(htmlContent);
                streamingVersionRef.current = newVersionIndex;
                setShowCreatingDialog(true);
            } else {
                // Update existing streaming version
                setHtmlVersions((prev) => {
                    const newVersions = [...prev];
                    newVersions[streamingVersionRef.current] = htmlContent;
                    return newVersions;
                });
            }
        },
        [createNewVersion],
    );

    const clearStreamingState = () => {
        streamingMessageRef.current = "";
        setStreamingContent("");
        setSubscriptionId(null);
        setIsStreaming(false);
        messageQueueRef.current = [];
        processingRef.current = false;
        setShowCreatingDialog(false);

        // Reset streaming version tracking
        streamingVersionRef.current = null;
    };

    const handleStopStreaming = async () => {
        if (!isOwner) return;

        // Clear streaming state immediately
        clearStreamingState();
        setIsLoading(false);

        // Remove the streaming message from the chat
        const messagesWithoutStreaming = allMessagesRef.current.filter(
            (msg) => !msg.isStreaming,
        );
        setMessages(messagesWithoutStreaming);
        allMessagesRef.current = messagesWithoutStreaming;
    };

    // Simple validation to ensure activeVersionIndex is always valid
    useEffect(() => {
        if (htmlVersions.length === 0) {
            if (activeVersionIndex !== -1) {
                setActiveVersionIndex(-1);
            }
        } else if (activeVersionIndex < 0) {
            setActiveVersionIndex(htmlVersions.length - 1);
        } else if (activeVersionIndex >= htmlVersions.length) {
            setActiveVersionIndex(htmlVersions.length - 1);
        }
    }, [htmlVersions.length, activeVersionIndex]);

    // Process message queue for streaming
    const processMessageQueue = async () => {
        if (processingRef.current || messageQueueRef.current.length === 0)
            return;

        processingRef.current = true;
        const message = messageQueueRef.current.shift();

        try {
            const { progress, result } = message;

            if (result) {
                let content = null;
                try {
                    const parsed = JSON.parse(result);

                    // Handle different streaming data formats
                    if (typeof parsed === "string") {
                        content = parsed;
                    } else if (parsed?.choices?.[0]?.delta?.content) {
                        // OpenAI format
                        content = parsed.choices[0].delta.content;
                    } else if (parsed?.choices?.[0]?.text) {
                        // OpenAI completion format
                        content = parsed.choices[0].text;
                    } else if (
                        parsed?.candidates?.[0]?.content?.parts?.[0]?.text
                    ) {
                        // Gemini format
                        content = parsed.candidates[0].content.parts[0].text;
                    } else if (parsed?.content) {
                        content = parsed.content;
                    } else if (parsed?.message) {
                        content = parsed.message;
                    } else if (parsed?.response) {
                        // Ollama format
                        content = parsed.response;
                    } else if (parsed?.message?.content) {
                        // Ollama chat format
                        content = parsed.message.content;
                    }
                } catch (parseError) {
                    content = result;
                }

                if (content) {
                    // Accumulate the raw content for display
                    const newContent = streamingMessageRef.current + content;
                    streamingMessageRef.current = newContent;

                    // Check if we're in a code block or entering one
                    const codeBlockInfo = detectCodeBlockInStream(newContent);

                    if (codeBlockInfo && codeBlockInfo.html) {
                        // We're in a code block - route to preview instead of chat
                        updateStreamingVersion(codeBlockInfo.html);

                        // Show explanatory text in chat, or placeholder if no explanatory text
                        const chatText =
                            codeBlockInfo.chatContent ||
                            "🔄 **" + t("Generating HTML code...") + "**";
                        setStreamingContent(chatText);
                    } else {
                        // Not in a code block - show content in chat
                        setStreamingContent(newContent);
                    }

                    // If this is the first chunk and progress is 1, simulate streaming
                    if (
                        progress === 1 &&
                        !streamingMessageRef.current &&
                        content.length > 50
                    ) {
                        // Break the content into smaller chunks and stream them
                        const chunkSize = Math.max(
                            10,
                            Math.floor(content.length / 20),
                        ); // 20 chunks
                        const chunks = [];
                        for (let i = 0; i < content.length; i += chunkSize) {
                            chunks.push(content.slice(i, i + chunkSize));
                        }

                        // Process chunks with delays to simulate streaming
                        for (let i = 0; i < chunks.length; i++) {
                            const chunk = chunks[i];
                            const newContent =
                                streamingMessageRef.current + chunk;
                            streamingMessageRef.current = newContent;

                            // Check if we're in a code block or entering one
                            const codeBlockInfo =
                                detectCodeBlockInStream(newContent);

                            if (codeBlockInfo && codeBlockInfo.html) {
                                // We're in a code block - route to preview instead of chat
                                updateStreamingVersion(codeBlockInfo.html);

                                // Show explanatory text in chat, or placeholder if no explanatory text
                                const chatText =
                                    codeBlockInfo.chatContent ||
                                    "🔄 **" +
                                        t("Generating HTML code...") +
                                        "**";
                                setStreamingContent(chatText);
                            } else {
                                // Not in a code block - show content in chat
                                setStreamingContent(newContent);
                            }

                            // Add a small delay between chunks (except for the last one)
                            if (i < chunks.length - 1) {
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 50),
                                ); // 50ms delay
                            }
                        }
                    }
                }
            }

            if (progress === 1) {
                // Finalize the streaming message
                const finalContent = streamingMessageRef.current;
                const wasStreaming = isStreaming; // Capture streaming state before clearing
                const streamingVersionIndex = streamingVersionRef.current; // Capture streaming version index before clearing
                clearStreamingState();

                // Process the final response
                await processFinalResponse(
                    finalContent,
                    wasStreaming,
                    streamingVersionIndex,
                );
            }
        } catch (e) {
            clearStreamingState();
            setIsLoading(false);
        }

        processingRef.current = false;

        // Schedule next message processing
        if (messageQueueRef.current.length > 0) {
            requestAnimationFrame(async () => await processMessageQueue());
        }
    };

    // Process final response from streaming
    const processFinalResponse = async (
        finalContent,
        wasStreaming,
        streamingVersionIndex,
    ) => {
        try {
            let aiMessage = {
                content: finalContent,
                role: "assistant",
                timestamp: new Date().toISOString(),
            };

            // Try to extract HTML content from the final response
            const htmlContent = extractHtmlFromStreamingContent(finalContent);

            if (htmlContent && htmlContent.html) {
                // We have valid HTML content
                if (wasStreaming && streamingVersionIndex !== null) {
                    // Finalize the existing streaming version
                    setHtmlVersions((prev) => {
                        const newVersions = [...prev];
                        newVersions[streamingVersionIndex] = htmlContent.html;
                        return newVersions;
                    });
                    aiMessage.linkToVersion = streamingVersionIndex;
                } else {
                    // Create a new version for non-streaming responses
                    const newVersionIndex = createNewVersion(htmlContent.html);
                    aiMessage.linkToVersion = newVersionIndex;
                }

                // Extract the explanatory text for the chat
                const chatText = extractChatContent(finalContent);
                aiMessage.content =
                    chatText ||
                    `${t("HTML code generated. Check the preview pane")}`;
            } else {
                // Check if we were in a code block during streaming
                if (wasStreaming && streamingVersionIndex !== null) {
                    // We were generating HTML but didn't get a complete code block
                    // Extract any explanatory text that was provided
                    const chatText = extractChatContent(finalContent);
                    aiMessage.content =
                        chatText ||
                        `${t("HTML code generated. Check the preview pane")}`;
                    aiMessage.linkToVersion = streamingVersionIndex;
                } else {
                    // No HTML code block found - this is just a chat response
                    aiMessage.content = finalContent;
                    if (finalContent.includes("`")) {
                        aiMessage.content = finalContent.replace(/`/g, "");
                    }
                    aiMessage.linkToVersion = htmlVersions.length - 1;
                }
            }

            // Replace the streaming message instead of adding a new one
            const messagesWithoutStreaming = allMessagesRef.current.filter(
                (msg) => !msg.isStreaming,
            );
            const finalMessages = [...messagesWithoutStreaming, aiMessage];

            setMessages(
                getMessagesUpToVersion(finalMessages, aiMessage.linkToVersion),
            );
            setIsContinuingFromOldVersion(false);

            allMessagesRef.current = finalMessages;

            // Get the current HTML versions to ensure we have the latest state
            const currentHtmlVersions =
                wasStreaming && streamingVersionIndex !== null
                    ? htmlVersions.map((version, index) =>
                          index === streamingVersionIndex
                              ? htmlContent?.html || version
                              : version,
                      )
                    : htmlVersions;

            updateApplet.mutate({
                id,
                data: {
                    messages: finalMessages,
                    htmlVersions: currentHtmlVersions,
                },
            });
        } catch (error) {
            // Handle error silently
        } finally {
            setIsLoading(false);
        }
    };

    // Subscription for streaming updates
    useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
        variables: { requestIds: [subscriptionId] },
        skip: !subscriptionId,
        onData: ({ data }) => {
            if (!data?.data) {
                return;
            }

            const progress = data.data.requestProgress?.progress;
            const result = data.data.requestProgress?.data;
            const info = data.data.requestProgress?.info;
            const error = data.data.requestProgress?.error;

            if (error) {
                clearStreamingState();
                setIsLoading(false);
                return;
            }

            if (result || progress === 1 || info) {
                messageQueueRef.current.push({
                    progress,
                    result: result || null,
                    info,
                });
                if (!processingRef.current) {
                    requestAnimationFrame(() => processMessageQueue());
                }
            }
        },
        onError: (error) => {
            // Handle subscription error silently
            console.error("Subscription error:", error);
            clearStreamingState();
            setIsLoading(false);
        },
        onComplete: () => {
            // Handle subscription completion silently
            // Don't clear streaming state here as it might be handled in processMessageQueue
        },
    });

    const handleSendMessage = async () => {
        if (!inputMessage.trim() || !selectedLLM || !isOwner) return;

        const newMessage = {
            content: inputMessage,
            role: "user",
            timestamp: new Date().toISOString(),
        };

        const updatedMessages = [...allMessagesRef.current, newMessage];
        setMessages(updatedMessages);
        setInputMessage("");
        setIsLoading(true);

        try {
            // Ensure we're using the correct HTML version
            // When continuing from an old version, we want to use that version's HTML
            let currentHtml = "";
            if (
                isContinuingFromOldVersion &&
                activeVersionIndex >= 0 &&
                activeVersionIndex < htmlVersions.length
            ) {
                // Use the active version's HTML (the one we're continuing from)
                currentHtml = htmlVersions[activeVersionIndex] || "";
            } else {
                // Use the latest version's HTML
                currentHtml = htmlVersions[htmlVersions.length - 1] || "";
            }

            const response = await chatMutation.mutateAsync({
                messages: updatedMessages,
                currentHtml,
            });

            // Response is always a requestId for streaming
            setSubscriptionId(response.message);
            setIsStreaming(true);
            setStreamingContent("");
            streamingMessageRef.current = "";
            streamingVersionRef.current = null; // Reset streaming version tracking for new session

            // Add a temporary streaming message
            const streamingMessage = {
                content: "",
                role: "assistant",
                timestamp: new Date().toISOString(),
                isStreaming: true,
            };

            const messagesWithStreaming = [
                ...updatedMessages,
                streamingMessage,
            ];
            setMessages(messagesWithStreaming);
            allMessagesRef.current = messagesWithStreaming;
        } catch (error) {
            setIsLoading(false);
        }
    };

    const handlePublishVersion = (
        versionIdx,
        publishToAppStore,
        appName,
        appIcon,
    ) => {
        if (!isOwner) return;

        // Validate the version index before publishing
        if (versionIdx < 0 || versionIdx >= htmlVersions.length) {
            console.error(
                `Invalid version index for publishing: ${versionIdx}, available versions: 0-${htmlVersions.length - 1}`,
            );
            toast.error(
                `Cannot publish version ${versionIdx + 1} - it doesn't exist`,
            );
            return;
        }

        console.log(
            `Publishing version ${versionIdx + 1} (index ${versionIdx}) of ${htmlVersions.length} total versions`,
        );

        updateApplet.mutate(
            {
                id,
                data: {
                    publishedVersionIndex: versionIdx,
                    publishToAppStore,
                    appName,
                    appIcon,
                },
            },
            {
                onSuccess: () => setPublishedVersionIndex(versionIdx),
                onError: (error) => {
                    toast.error(error?.response?.data?.error || error.message);
                },
            },
        );
    };

    const handleUnpublish = () => {
        if (!isOwner) return;
        updateApplet.mutate(
            {
                id,
                data: {
                    publishToAppStore: false,
                    publishedVersionIndex: null,
                },
            },
            { onSuccess: () => setPublishedVersionIndex(null) },
        );
    };

    const handleClearChat = () => {
        if (!isOwner) return;
        allMessagesRef.current = [];
        setMessages([]);
        updateApplet.mutate({ id, data: { messages: [] } });
    };

    const handleHtmlChange = (value, versionIndex) => {
        if (!isOwner) return;

        // If there are no versions and we're getting content, create the first version
        if (htmlVersions.length === 0 && value.trim()) {
            const newVersions = [value];
            setHtmlVersions(newVersions);
            setActiveVersionIndex(0);

            // Update the server with the new HTML versions
            updateApplet.mutate({
                id,
                data: {
                    htmlVersions: newVersions,
                },
            });
        } else if (htmlVersions.length > 0) {
            // Update existing version
            const newVersions = [...htmlVersions];
            newVersions[versionIndex] = value;
            setHtmlVersions(newVersions);

            // Update the server with the new HTML versions
            updateApplet.mutate({
                id,
                data: {
                    htmlVersions: newVersions,
                },
            });
        }
    };

    const handleContinueFromOldVersion = () => {
        if (!isOwner) return;
        // Find the highest published version index that comes after the current active version
        let maxPublishedIndex = -1;
        if (
            publishedVersionIndex !== null &&
            publishedVersionIndex > activeVersionIndex
        ) {
            maxPublishedIndex = publishedVersionIndex;
        }

        // Determine the cutoff index - keep versions up to the active version,
        // but also preserve any published versions that come after it
        // This ensures that:
        // 1. If continuing from version 2 with no published versions after it, keep versions 0,1,2
        // 2. If continuing from version 2 but version 3 is published, keep versions 0,1,2,3
        const cutoffIndex = Math.max(activeVersionIndex, maxPublishedIndex);

        // Truncate HTML versions
        const newHtmlVersions = htmlVersions.slice(0, cutoffIndex + 1);

        // Truncate messages - find the last message that links to the cutoff version or earlier
        // This ensures we keep all messages that were part of versions up to the cutoff version
        let lastMessageIndex = -1;
        for (let i = allMessagesRef.current.length - 1; i >= 0; i--) {
            const message = allMessagesRef.current[i];
            if (
                message.linkToVersion !== undefined &&
                message.linkToVersion <= cutoffIndex
            ) {
                lastMessageIndex = i;
                break;
            }
        }

        // If no message links to the cutoff version or earlier, keep all messages
        const newMessages =
            lastMessageIndex >= 0
                ? allMessagesRef.current.slice(0, lastMessageIndex + 1)
                : allMessagesRef.current;

        // Keep the active version as the one we're continuing from (don't jump to published version)
        // The active version should remain the same as when "continue from here" was clicked
        // But ensure it doesn't exceed the new array length
        const newActiveVersionIndex = Math.min(
            activeVersionIndex,
            newHtmlVersions.length - 1,
        );

        // Update all state synchronously
        setHtmlVersions(newHtmlVersions);
        setMessages(newMessages);
        allMessagesRef.current = newMessages;
        setActiveVersionIndex(newActiveVersionIndex);
        setIsContinuingFromOldVersion(true);

        // Update the server with the truncated data
        updateApplet.mutate({
            id,
            data: {
                messages: newMessages,
                htmlVersions: newHtmlVersions,
            },
        });
    };

    const handleMessageClick = (versionIndex) => {
        // Ensure the version index is within bounds
        if (versionIndex >= 0 && versionIndex < htmlVersions.length) {
            setActiveVersionIndex(versionIndex);
        } else {
            console.warn(
                `Invalid version index: ${versionIndex}, max: ${htmlVersions.length - 1}`,
            );
        }
    };

    const handleReplayMessage = (messageIndex) => {
        if (!isOwner) return;
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
                {!isOwner && (
                    <div className="bg-sky-50 dark:bg-sky-900/20 border-b border-sky-200 dark:border-sky-700 px-4 py-2">
                        <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300 text-sm">
                            <span className="text-sky-600">👁️</span>
                            <span>
                                {t(
                                    "Read-only mode - Only the workspace owner can make changes",
                                )}
                            </span>
                        </div>
                    </div>
                )}
                <div className="flex justify-between gap-4 h-full overflow-auto bg-gray-100 dark:bg-gray-900 p-4">
                    <div className="flex flex-col flex-1 min-w-0 overflow-auto">
                        {htmlVersions.length > 0 && (
                            <VersionNavigator
                                activeVersionIndex={activeVersionIndex}
                                setActiveVersionIndex={setActiveVersionIndex}
                                htmlVersions={htmlVersions}
                                setHtmlVersions={setHtmlVersions}
                                publishedVersionIndex={publishedVersionIndex}
                                setPublishedVersionIndex={
                                    setPublishedVersionIndex
                                }
                                onPublishVersion={handlePublishVersion}
                                onUnpublish={handleUnpublish}
                                updateApplet={updateApplet}
                                workspaceId={id}
                                isOwner={isOwner}
                            />
                        )}
                        <PreviewTabs
                            htmlVersions={htmlVersions}
                            activeVersionIndex={activeVersionIndex}
                            onHtmlChange={handleHtmlChange}
                            isStreaming={isStreaming}
                            isOwner={isOwner}
                            hasStreamingVersion={
                                streamingVersionRef.current !== null
                            }
                            showCreatingDialog={showCreatingDialog}
                            isLoading={appletQuery.isLoading}
                            isCurrentVersionPublished={
                                publishedVersionIndex !== null &&
                                activeVersionIndex === publishedVersionIndex
                            }
                        />
                    </div>

                    <div className="w-80 flex-shrink-0 flex h-full overflow-auto flex-col">
                        {/* Remove model selector and keep only Clear button */}
                        <div className="mb-4 flex items-center justify-end gap-4">
                            {messages && messages.length > 0 && isOwner && (
                                <button
                                    className={cn(
                                        "lb-outline-secondary lb-sm",
                                        blockOldVersionChat &&
                                            "opacity-50 cursor-not-allowed",
                                    )}
                                    onClick={() => setShowClearConfirm(true)}
                                    disabled={blockOldVersionChat}
                                >
                                    {t("Clear chat")}
                                </button>
                            )}
                        </div>

                        {/* Chat Interface - Always show */}
                        <div
                            className={cn(
                                "relative flex-1 grow overflow-hidden",
                            )}
                        >
                            {blockOldVersionChat && isOwner && (
                                <>
                                    <div className="absolute inset-0 bg-white/5 backdrop-blur-sm flex items-center justify-center z-10">
                                        <button
                                            className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors"
                                            onClick={() =>
                                                setShowContinueConfirm(true)
                                            }
                                        >
                                            {t("Continue from here")}
                                        </button>
                                    </div>
                                    <AlertDialog
                                        open={showContinueConfirm}
                                        onOpenChange={setShowContinueConfirm}
                                    >
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>
                                                    {t(
                                                        "Continue from this version?",
                                                    )}
                                                </AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    {t(
                                                        "Continuing from this version will remove all future versions. This action cannot be undone.",
                                                    )}
                                                    <br />
                                                    <br />
                                                    <span className="text-emerald-600 font-medium">
                                                        {t(
                                                            "Note: Published versions are never lost.",
                                                        )}
                                                    </span>
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>
                                                    {t("Cancel")}
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
                                                    {t("Continue")}
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
                                    onStopStreaming={handleStopStreaming}
                                    isLoading={isLoading}
                                    blockOldVersionChat={blockOldVersionChat}
                                    showContinueConfirm={showContinueConfirm}
                                    setShowContinueConfirm={
                                        setShowContinueConfirm
                                    }
                                    showClearConfirm={showClearConfirm}
                                    setShowClearConfirm={setShowClearConfirm}
                                    onContinueFromOldVersion={
                                        handleContinueFromOldVersion
                                    }
                                    onClearChat={handleClearChat}
                                    onMessageClick={handleMessageClick}
                                    htmlVersions={htmlVersions}
                                    onReplayMessage={handleReplayMessage}
                                    streamingContent={streamingContent}
                                    isStreaming={isStreaming}
                                    isOwner={isOwner}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}
