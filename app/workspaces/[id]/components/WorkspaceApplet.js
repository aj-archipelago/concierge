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
import { useEffect, useRef, useState, useContext } from "react";
import { RiSendPlane2Fill } from "react-icons/ri";
import TextareaAutosize from "react-textarea-autosize";
import { useSubscription } from "@apollo/client";
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
    cleanJsonCodeBlocks,
} from "./utils";
import VersionNavigator from "./VersionNavigator";
import { toast } from "react-toastify";

export default function WorkspaceApplet() {
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

    // Streaming state
    const [subscriptionId, setSubscriptionId] = useState(null);
    const [streamingContent, setStreamingContent] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const streamingMessageRef = useRef("");
    const messageQueueRef = useRef([]);
    const processingRef = useRef(false);
    const hasStreamingVersionRef = useRef(false); // Track if we've created a temporary streaming version

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
    useEffect(() => {
        if (
            appletQuery.data?.messages?.length > 0 &&
            !allMessagesRef.current?.length
        ) {
            allMessagesRef.current = appletQuery.data.messages || [];
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
            }

            setPublishedVersionIndex(
                typeof appletQuery.data.publishedVersionIndex === "number"
                    ? appletQuery.data.publishedVersionIndex
                    : null,
            );
        }
    }, [appletQuery.data, activeVersionIndex]);

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
    const clearStreamingState = () => {
        streamingMessageRef.current = "";
        setStreamingContent("");
        setSubscriptionId(null);
        setIsStreaming(false);
        messageQueueRef.current = [];
        processingRef.current = false;
        hasStreamingVersionRef.current = false; // Reset streaming version flag
    };

    // Helper function to update HTML versions during streaming
    const updateHtmlVersions = (htmlContent) => {
        const newVersions = [...htmlVersions];

        // During streaming, create or update a temporary version
        if (isStreaming) {
            if (!hasStreamingVersionRef.current) {
                // Create a temporary streaming version for the first time
                newVersions.push(htmlContent);
                setActiveVersionIndex(newVersions.length - 1);
                hasStreamingVersionRef.current = true;
            } else {
                // Update the existing temporary streaming version
                newVersions[newVersions.length - 1] = htmlContent;
            }
        } else {
            // For non-streaming updates, use the current logic
            const currentVersionIndex =
                activeVersionIndex >= 0 ? activeVersionIndex : 0;

            if (newVersions.length <= currentVersionIndex) {
                newVersions.push(htmlContent);
            } else {
                newVersions[currentVersionIndex] = htmlContent;
            }

            if (activeVersionIndex === -1) {
                setActiveVersionIndex(0);
            }
        }

        setHtmlVersions(newVersions);
    };

    // Process message queue for streaming
    const processMessageQueue = async () => {
        if (processingRef.current || messageQueueRef.current.length === 0)
            return;

        processingRef.current = true;
        const message = messageQueueRef.current.shift();

        try {
            const { progress, result, info } = message;

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
                    setStreamingContent(newContent);

                    // Clean the content for HTML extraction
                    const cleanedContent = cleanJsonCodeBlocks(newContent);

                    // Check if this content contains HTML that we can extract and display
                    const htmlContent =
                        extractHtmlFromStreamingContent(cleanedContent);

                    if (htmlContent && htmlContent.html) {
                        // Update the preview with the partial HTML content
                        updateHtmlVersions(htmlContent.html);
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
                            setStreamingContent(newContent);

                            // Clean the content for HTML extraction
                            const cleanedChunkContent =
                                cleanJsonCodeBlocks(newContent);

                            // Check for HTML content in each chunk
                            const chunkHtmlContent =
                                extractHtmlFromStreamingContent(
                                    cleanedChunkContent,
                                );
                            if (chunkHtmlContent && chunkHtmlContent.html) {
                                updateHtmlVersions(chunkHtmlContent.html);
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
                clearStreamingState();

                // Process the final response
                await processFinalResponse(finalContent, wasStreaming);
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
    const processFinalResponse = async (finalContent, wasStreaming) => {
        try {
            let aiMessage = {
                content: finalContent,
                role: "assistant",
                timestamp: new Date().toISOString(),
            };

            let newVersions = htmlVersions;

            // Clean the content for HTML extraction (remove code blocks)
            const cleanedContent = cleanJsonCodeBlocks(finalContent);

            // Try to extract HTML content from the final response
            const htmlContent = extractHtmlFromStreamingContent(cleanedContent);

            if (htmlContent && htmlContent.html) {
                // We have valid HTML content
                // If we were streaming, we need to replace the temporary streaming version
                // Otherwise, create a new version after the current active version
                if (wasStreaming) {
                    // Replace the last version (temporary streaming version) with the final version
                    newVersions = [
                        ...htmlVersions.slice(0, -1),
                        htmlContent.html,
                    ];
                } else {
                    // Create a new version after the current active version
                    newVersions = [
                        ...htmlVersions.slice(0, activeVersionIndex + 1),
                        htmlContent.html,
                    ];
                }
                setHtmlVersions(newVersions);
                setActiveVersionIndex(newVersions.length - 1);

                aiMessage.content = `HTML code generated. Check the preview pane\n\n\n#### Summary of changes:**\n${htmlContent.changes}`;
                aiMessage.linkToVersion = newVersions.length - 1;
            } else {
                // Check if the response contains HTML and changes (legacy format)
                if (
                    typeof finalContent === "object" &&
                    finalContent !== null &&
                    typeof finalContent.html === "string" &&
                    typeof finalContent.changes === "string"
                ) {
                    // If we were streaming, we need to replace the temporary streaming version
                    // Otherwise, create a new version after the current active version
                    if (wasStreaming) {
                        // Replace the last version (temporary streaming version) with the final version
                        newVersions = [
                            ...htmlVersions.slice(0, -1),
                            finalContent.html,
                        ];
                    } else {
                        // Create a new version after the current active version
                        newVersions = [
                            ...htmlVersions.slice(0, activeVersionIndex + 1),
                            finalContent.html,
                        ];
                    }
                    setHtmlVersions(newVersions);
                    setActiveVersionIndex(newVersions.length - 1);

                    aiMessage.content = `HTML code generated. Check the preview pane\n\n\n#### Summary of changes:**\n${finalContent.changes}`;
                    aiMessage.linkToVersion = newVersions.length - 1;
                } else {
                    aiMessage.content = finalContent;
                    if (finalContent.includes("`")) {
                        aiMessage.content = finalContent.replace(/`/g, "");
                    }
                    aiMessage.linkToVersion = newVersions.length - 1;
                }
            }

            // Replace the streaming message instead of adding a new one
            const messagesWithoutStreaming = allMessagesRef.current.filter(
                (msg) => !msg.isStreaming,
            );
            const finalMessages = [...messagesWithoutStreaming, aiMessage];

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
        },
        onComplete: () => {
            // Handle subscription completion silently
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
            hasStreamingVersionRef.current = false; // Reset streaming version flag for new session

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
            { id, data: { publishedVersionIndex: null } },
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
        setActiveVersionIndex(versionIndex);
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
                    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
                        <div className="flex items-center gap-2 text-blue-800 text-sm">
                            <span className="text-blue-600">👁️</span>
                            <span>
                                Read-only mode - Only the workspace owner can
                                make changes
                            </span>
                        </div>
                    </div>
                )}
                <div className="flex justify-between gap-4 h-full overflow-auto bg-gray-100 p-4">
                    {htmlVersions.length > 0 && (
                        <div className="flex flex-col grow overflow-auto">
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
                            <PreviewTabs
                                htmlVersions={htmlVersions}
                                activeVersionIndex={activeVersionIndex}
                                onHtmlChange={handleHtmlChange}
                                isStreaming={isStreaming}
                                isOwner={isOwner}
                                hasStreamingVersion={
                                    hasStreamingVersionRef.current
                                }
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
                                {blockOldVersionChat && isOwner && (
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
                                        streamingContent={streamingContent}
                                        isStreaming={isStreaming}
                                        isOwner={isOwner}
                                    />
                                </div>
                            </div>
                        ) : (
                            selectedLLM &&
                            isOwner && (
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
                                                            e.key === "Enter" &&
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
