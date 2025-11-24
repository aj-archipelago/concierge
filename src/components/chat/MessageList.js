import i18next from "i18next";
import React, {
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useContext,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { User } from "lucide-react";
import Loader from "../../../app/components/loader";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import {
    getExtension,
    getFilename,
    isAudioUrl,
    isVideoUrl,
    DOC_EXTENSIONS,
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
} from "../../utils/mediaUtils";
import CopyButton from "../CopyButton";
import ReplayButton from "../ReplayButton";
import MediaCard from "./MediaCard";
import { AuthContext } from "../../App";
import BotMessage from "./BotMessage";
import ScrollToBottom from "./ScrollToBottom";
import StreamingMessage from "./StreamingMessage";
import { useUpdateChat } from "../../../app/queries/chats";
import { useApolloClient } from "@apollo/client";
import {
    purgeFile,
    createFilePlaceholder,
} from "../../../app/workspaces/[id]/components/chatFileUtils";
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

const hasImages = (message) => {
    if (!Array.isArray(message.payload)) return false;

    return message.payload.some((p) => {
        try {
            const obj = JSON.parse(p);
            return obj.type === "image_url";
        } catch (e) {
            return false;
        }
    });
};

const countImages = (message) => {
    if (!Array.isArray(message.payload)) return 0;

    return message.payload.reduce((count, p) => {
        try {
            const obj = JSON.parse(p);
            return obj.type === "image_url" ? count + 1 : count;
        } catch (e) {
            return count;
        }
    }, 0);
};

const parseToolData = (toolString) => {
    if (!toolString) return null;
    try {
        const toolObj = JSON.parse(toolString);
        return {
            avatarImage: toolObj.avatarImage,
            toolUsed: toolObj.toolUsed,
        };
    } catch (e) {
        console.error("Invalid JSON in tool:", e);
        return null;
    }
};

const getYoutubeEmbedUrl = (url) => {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === "youtu.be") {
            const videoId = urlObj.pathname.slice(1);
            return `https://www.youtube.com/embed/${videoId}`;
        } else if (
            urlObj.hostname === "youtube.com" ||
            urlObj.hostname === "www.youtube.com"
        ) {
            const videoId = urlObj.searchParams.get("v");
            return `https://www.youtube.com/embed/${videoId}`;
        }
    } catch (err) {
        return null;
    }
    return null;
};

/**
 * Determines if a message should cluster with the previous message.
 * Centralized logic for message grouping.
 *
 * Rules:
 * - User messages NEVER cluster (always start a new group)
 * - Assistant messages ALWAYS cluster with preceding user messages
 * - Coding agent messages ALWAYS cluster with whatever precedes them
 *
 * @param {Object} message - Current message
 * @param {Object|null} prevMessage - Previous message
 * @param {Object|null} nextMessage - Next message (unused but kept for API consistency)
 * @returns {boolean} - True if message should cluster with previous
 */
const shouldClusterWithPrevious = (message, prevMessage, nextMessage) => {
    // User messages always start a new group
    if (message.sender !== "labeeb") {
        return false;
    }

    // Need a previous message to cluster with
    if (!prevMessage) {
        return false;
    }

    const isCodingAgentMessage = !!message.taskId;
    const prevIsUser = prevMessage.sender !== "labeeb";

    // Assistant messages (non-coding agent) cluster with preceding user messages
    if (!isCodingAgentMessage && prevIsUser) {
        return true;
    }

    // Coding agent messages cluster with whatever precedes them (assistant or coding agent)
    if (isCodingAgentMessage && !prevIsUser) {
        return true;
    }

    return false;
};

// Removed MemoizedYouTubeEmbed - now using MediaCard

// Create a memoized component for the static message list content
const MessageListContent = React.memo(function MessageListContent({
    messages,
    renderMessage,
    handleMessageLoad,
    isVideoUrl,
    isAudioUrl,
    getExtension,
    getFilename,
    getYoutubeEmbedUrl,
    onDeleteFile,
    t,
    isStreaming = false,
}) {
    return messages.map((message, index) => {
        const newMessage = { ...message };
        if (!newMessage.id) {
            newMessage.id = newMessage._id || index;
        }
        let display;
        if (Array.isArray(newMessage.payload)) {
            const arr = newMessage.payload
                .map((t, index2) => {
                    try {
                        const obj = JSON.parse(t);

                        // Show deleted file indicator if it's a deleted file placeholder
                        if (
                            obj.hideFromClient === true &&
                            obj.isDeletedFile === true
                        ) {
                            const deletedFilename =
                                obj.deletedFilename || "file";
                            // Determine file type from extension for ghost card
                            const deletedExt = getExtension(deletedFilename);
                            let deletedType = "file";
                            if (
                                isVideoUrl(deletedFilename) ||
                                VIDEO_EXTENSIONS.includes(deletedExt)
                            ) {
                                deletedType = "video";
                            } else if (IMAGE_EXTENSIONS.includes(deletedExt)) {
                                deletedType = "image";
                            }

                            return (
                                <MediaCard
                                    key={`deleted-file-${index}-${index2}`}
                                    type={deletedType}
                                    src={null}
                                    filename={deletedFilename}
                                    isDeleted={true}
                                    t={t}
                                />
                            );
                        }

                        // Skip other items marked to be hidden from client
                        if (obj.hideFromClient === true) {
                            return null;
                        }
                        if (obj.type === "text") {
                            return obj.text;
                        } else if (obj.type === "image_url") {
                            const src =
                                obj?.url || obj?.image_url?.url || obj?.gcs;
                            const originalFilename = obj?.originalFilename;

                            // Use original filename if available, otherwise extract from URL
                            if (!src) {
                                return null;
                            }

                            let filename;
                            let ext;
                            try {
                                filename =
                                    originalFilename ||
                                    decodeURIComponent(getFilename(src));
                                ext = getExtension(src);
                            } catch (e) {
                                console.error(
                                    "Error extracting filename/extension:",
                                    e,
                                );
                                return null;
                            }

                            // Handle audio files separately (keep existing audio player)
                            if (isAudioUrl(src)) {
                                return (
                                    <audio
                                        onLoadedData={() =>
                                            handleMessageLoad(newMessage.id)
                                        }
                                        key={`audio-${index}-${index2}`}
                                        src={src}
                                        className="max-h-[20%] max-w-[100%] [.docked_&]:max-w-[80%] rounded-md border bg-white p-1 my-2 dark:border-neutral-700 dark:bg-neutral-800 shadow-lg dark:shadow-black/30"
                                        controls
                                    />
                                );
                            }

                            // Handle document files with MediaCard
                            if (DOC_EXTENSIONS.includes(ext)) {
                                return (
                                    <MediaCard
                                        key={`file-${index}-${index2}`}
                                        type="file"
                                        src={src}
                                        filename={filename}
                                        onDeleteFile={
                                            onDeleteFile && t
                                                ? () =>
                                                      onDeleteFile(
                                                          newMessage.id,
                                                          index2,
                                                      )
                                                : undefined
                                        }
                                        t={t}
                                    />
                                );
                            }

                            // Handle videos (including YouTube)
                            if (isVideoUrl(src)) {
                                const youtubeEmbedUrl = getYoutubeEmbedUrl(src);
                                if (youtubeEmbedUrl) {
                                    return (
                                        <MediaCard
                                            key={`youtube-${index}-${index2}`}
                                            type="youtube"
                                            src={src}
                                            filename={filename}
                                            youtubeEmbedUrl={youtubeEmbedUrl}
                                            onLoad={() =>
                                                handleMessageLoad(newMessage.id)
                                            }
                                            onDeleteFile={
                                                onDeleteFile && t
                                                    ? () =>
                                                          onDeleteFile(
                                                              newMessage.id,
                                                              index2,
                                                          )
                                                    : undefined
                                            }
                                            t={t}
                                        />
                                    );
                                }
                                return (
                                    <MediaCard
                                        key={`video-${index}-${index2}`}
                                        type="video"
                                        src={src}
                                        filename={filename}
                                        onLoad={() =>
                                            handleMessageLoad(newMessage.id)
                                        }
                                        onDeleteFile={
                                            onDeleteFile && t
                                                ? () =>
                                                      onDeleteFile(
                                                          newMessage.id,
                                                          index2,
                                                      )
                                                : undefined
                                        }
                                        t={t}
                                    />
                                );
                            }

                            // Handle images
                            return (
                                <MediaCard
                                    key={`image-${index}-${index2}`}
                                    type="image"
                                    src={src}
                                    filename={filename}
                                    onLoad={() =>
                                        handleMessageLoad(newMessage.id)
                                    }
                                    onDeleteFile={
                                        onDeleteFile && t
                                            ? () =>
                                                  onDeleteFile(
                                                      newMessage.id,
                                                      index2,
                                                  )
                                            : undefined
                                    }
                                    t={t}
                                />
                            );
                        }
                        return null;
                    } catch (e) {
                        console.error("Invalid JSON:", t);
                        return t;
                    }
                })
                .filter((item) => item !== null); // Remove null items (hidden from client)

            // Group consecutive MediaCard components together so they can be on the same line
            const grouped = [];
            let currentGroup = [];

            arr.forEach((item, idx) => {
                // Check if item is a MediaCard component (all media types: image, video, youtube, file)
                const isMediaCard =
                    React.isValidElement(item) &&
                    (item.key?.includes("image-") ||
                        item.key?.includes("video-") ||
                        item.key?.includes("youtube-") ||
                        item.key?.includes("file-"));

                if (isMediaCard) {
                    currentGroup.push(item);
                } else {
                    if (currentGroup.length > 0) {
                        grouped.push(
                            <div
                                key={`media-group-${idx}`}
                                className="flex flex-wrap gap-2 my-2"
                            >
                                {currentGroup}
                            </div>,
                        );
                        currentGroup = [];
                    }
                    grouped.push(item);
                }
            });

            // Add any remaining media group
            if (currentGroup.length > 0) {
                grouped.push(
                    <div
                        key={`media-group-end`}
                        className="flex flex-wrap gap-2 my-2"
                    >
                        {currentGroup}
                    </div>,
                );
            }

            display = <>{grouped}</>;
        } else {
            display = newMessage.payload;
        }

        // Determine clustering using centralized logic
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const nextMessage =
            index < messages.length - 1 ? messages[index + 1] : null;
        const nextNextMessage =
            index < messages.length - 2 ? messages[index + 2] : null;
        const clusterWithPrevious = shouldClusterWithPrevious(
            newMessage,
            prevMessage,
            nextMessage,
        );

        // Check if next message will cluster with this one (to control spacing)
        const nextWillCluster = nextMessage
            ? shouldClusterWithPrevious(
                  nextMessage,
                  newMessage,
                  nextNextMessage,
              )
            : false;
        // User messages always have reduced bottom margin (assistant/streaming always cluster with them)
        const isUserMessage = newMessage.sender !== "labeeb";
        const shouldReduceBottomMargin = nextWillCluster || isUserMessage;

        // Control spacing at the list level based on clustering
        // Spacing is controlled by bottom margin of each message
        // If clustering with previous, remove top margin to eliminate gap
        // Bottom margin: reduced if next message will cluster or if streaming will cluster, normal otherwise
        const spacingClasses = [];
        if (clusterWithPrevious) {
            spacingClasses.push("mt-0");
        }
        spacingClasses.push(shouldReduceBottomMargin ? "mb-1" : "mb-6");
        const className = classNames(...spacingClasses);

        return (
            <div
                key={newMessage.id}
                id={`message-${newMessage.id}`}
                className={className}
            >
                {renderMessage({
                    ...newMessage,
                    payload: display,
                })}
            </div>
        );
    });
});

// Displays the list of messages and a message input box.
const MessageList = React.memo(
    React.forwardRef(function MessageList(
        {
            messages,
            bot,
            loading,
            chatId,
            streamingContent,
            isStreaming,
            onSend,
            ephemeralContent,
            toolCalls,
            thinkingDuration,
            isThinking,
            selectedEntityId,
            entities,
            entityIconSize,
            contextId,
            contextKey,
        },
        ref,
    ) {
        const { language } = i18next;
        const { getLogo } = config.global;
        const { t } = useTranslation();
        const scrollBottomRef = useRef(null);
        const { user } = useContext(AuthContext);
        const defaultAiName = user?.aiName;
        const [replayIndex, setReplayIndex] = useState(null);
        const [fileToDelete, setFileToDelete] = useState(null);

        // Forward scrollBottomRef to parent
        useImperativeHandle(
            ref,
            () => ({
                scrollBottomRef,
            }),
            [],
        );

        const [messageLoadState, setMessageLoadState] = React.useState(
            messages.map((m) => ({
                id: m.id,
                loaded: false,
                imagesCount: 0,
                loadedImagesCount: 0,
            })),
        );
        const messageLoadStateRef = React.useRef(messageLoadState);
        const prevMessageIdsRef = React.useRef(
            messages.map((m) => m?.id).join(","),
        );
        const prevStreamingContentRef = React.useRef(streamingContent);
        const prevChatIdRef = React.useRef(chatId);

        // Reset scroll when switching chats
        useEffect(() => {
            if (chatId !== prevChatIdRef.current) {
                scrollBottomRef.current?.resetScrollState();
                prevChatIdRef.current = chatId;
            }
        }, [chatId]);

        // Track streaming content updates without forcing scroll
        React.useEffect(() => {
            prevStreamingContentRef.current = streamingContent;
        }, [streamingContent]);

        useEffect(() => {
            const newMessageIds = messages.map((m) => m?.id).join(",");
            if (prevMessageIdsRef.current === newMessageIds) return;

            prevMessageIdsRef.current = newMessageIds;
            const newMessageLoadState = messages.map((m) => {
                const existing = messageLoadStateRef.current.find(
                    (mls) => mls.id === m.id,
                );
                if (existing) return existing;

                const messageHasImages = hasImages(m);
                const imageCount = messageHasImages ? countImages(m) : 0;
                return {
                    id: m.id,
                    loaded: !messageHasImages, // If no images, mark as loaded immediately
                    imagesCount: imageCount,
                    loadedImagesCount: 0,
                };
            });

            messageLoadStateRef.current = newMessageLoadState;
            setMessageLoadState(newMessageLoadState);
        }, [messages]);

        const updateChatHook = useUpdateChat();
        const apolloClient = useApolloClient();

        const rowHeight = "h-12 [.docked_&]:h-10";
        const basis =
            "min-w-[3rem] basis-12 [.docked_&]:basis-10 [.docked_&]:min-w-[2.5rem]";
        const buttonWidthClass = "w-12 [.docked_&]:w-10";
        const botName =
            bot === "code"
                ? config?.code?.botName
                : defaultAiName || config?.chat?.botName;

        const confirmDeleteFile = useCallback((messageId, fileIndex) => {
            setFileToDelete({ messageId, fileIndex });
        }, []);

        const deleteFileFromMessage = useCallback(
            async (messageId, fileIndex) => {
                if (!chatId) {
                    console.error("Cannot delete file: chatId is required");
                    return;
                }

                // Find the message containing the file
                const messageIndex = messages.findIndex(
                    (m) => m.id === messageId || m._id === messageId,
                );

                if (messageIndex === -1) {
                    console.error("Message not found:", messageId);
                    return;
                }

                const message = messages[messageIndex];

                // Check if message has an array payload
                if (!Array.isArray(message.payload)) {
                    console.error(
                        "Cannot delete file: message payload is not an array",
                    );
                    return;
                }

                // Parse file object and extract filename
                let fileObj = null;
                let filename = null;
                try {
                    fileObj = JSON.parse(message.payload[fileIndex]);
                    if (
                        fileObj.type === "image_url" ||
                        fileObj.type === "file"
                    ) {
                        filename =
                            fileObj.originalFilename ||
                            decodeURIComponent(
                                getFilename(
                                    fileObj?.url ||
                                        fileObj?.image_url?.url ||
                                        fileObj?.gcs ||
                                        fileObj?.file,
                                ),
                            );
                    }
                } catch (e) {
                    console.error("Error parsing file object:", e);
                }

                if (!fileObj) {
                    console.error("Could not parse file object");
                    return;
                }

                // Normalize file object for memory files matching
                // matchesFile expects url at top level, not in image_url.url
                const normalizedFileObj = {
                    ...fileObj,
                    url: fileObj.url || fileObj.image_url?.url || null,
                };

                // Update UI immediately by replacing file with placeholder
                // Then do cloud/memory deletion in background
                try {
                    // First, update chat message immediately for fast UI response
                    const placeholder = createFilePlaceholder(
                        fileObj,
                        t,
                        filename,
                    );
                    const updatedMessages = messages.map((msg, idx) => {
                        if (
                            idx === messageIndex &&
                            Array.isArray(msg.payload)
                        ) {
                            const updatedPayload = [...msg.payload];
                            updatedPayload[fileIndex] = placeholder;
                            return { ...msg, payload: updatedPayload };
                        }
                        return msg;
                    });

                    // Update chat immediately
                    await updateChatHook.mutateAsync({
                        chatId: String(chatId),
                        messages: updatedMessages,
                    });

                    // Close dialog immediately
                    setFileToDelete(null);

                    // Then do cloud and memory deletion in background (fire and forget)
                    purgeFile({
                        fileObj: normalizedFileObj,
                        apolloClient,
                        contextId,
                        contextKey,
                        chatId: null, // Skip chat update since we already did it
                        messages: null,
                        updateChatHook: null,
                        t,
                        filename,
                        skipCloudDelete: false,
                        skipMemoryFiles: false, // Ensure memory files are removed
                    }).catch((error) => {
                        console.error(
                            "Background file deletion failed:",
                            error,
                        );
                        // Errors are logged but don't affect UX
                    });
                } catch (error) {
                    console.error("Failed to delete file:", error);
                    setFileToDelete(null);
                    // TODO: Show user-friendly error message
                }
            },
            [
                chatId,
                messages,
                updateChatHook,
                t,
                contextId,
                contextKey,
                apolloClient,
            ],
        );

        const handleMessageLoad = useCallback((messageId) => {
            setMessageLoadState((prev) =>
                prev.map((m) => {
                    if (m.id === messageId) {
                        const newLoadedCount = m.loadedImagesCount + 1;
                        return {
                            ...m,
                            loadedImagesCount: newLoadedCount,
                            loaded: newLoadedCount >= m.imagesCount,
                        };
                    }
                    return m;
                }),
            );
        }, []);

        const handleImageLoad = useCallback(
            (messageId) => {
                handleMessageLoad(messageId);
            },
            [handleMessageLoad],
        );

        const messageRef = useCallback(
            (element, messageId) => {
                if (!element) return;

                const images = element.getElementsByTagName("img");
                Array.from(images).forEach((img) => {
                    // Remove any existing listeners first
                    img.removeEventListener("load", () =>
                        handleImageLoad(messageId),
                    );

                    if (!img.complete) {
                        img.addEventListener("load", () =>
                            handleImageLoad(messageId),
                        );
                    }
                });
            },
            [handleImageLoad],
        );

        const handleReplay = useCallback(
            (messageIndex) => {
                if (messageIndex < 0 || messageIndex >= messages.length) {
                    console.error(
                        "Invalid message index for replay:",
                        messageIndex,
                    );
                    return;
                }

                // Get all messages up to the selected message
                const messagesToKeep = messages.slice(0, messageIndex);

                const messageToReplay = {
                    payload: messages[messageIndex].payload,
                    sender: messages[messageIndex].sender,
                    sentTime: new Date().toISOString(),
                    direction: messages[messageIndex].direction,
                    position: messages[messageIndex].position,
                };

                if (!messageToReplay || !messageToReplay.payload) {
                    console.error(
                        "Invalid message for replay:",
                        messageToReplay,
                    );
                    return;
                }

                onSend(messageToReplay, messagesToKeep);
                scrollBottomRef.current?.resetScrollState();
            },
            [messages, onSend],
        );

        // Callback to trigger scroll when task status updates
        const handleTaskStatusUpdate = useCallback(() => {
            // Scroll messages list to bottom when task status changes
            scrollBottomRef.current?.resetScrollState();
        }, []);

        const renderMessage = useCallback(
            (message) => {
                const toolData = parseToolData(message.tool);

                if (message.sender === "labeeb") {
                    return (
                        <BotMessage
                            message={message}
                            toolData={toolData}
                            bot={bot}
                            basis={basis}
                            buttonWidthClass={buttonWidthClass}
                            rowHeight={rowHeight}
                            getLogo={getLogo}
                            language={language}
                            botName={botName}
                            messageRef={messageRef}
                            selectedEntityId={selectedEntityId}
                            entities={entities}
                            entityIconSize={entityIconSize}
                            entityIconClasses={classNames(basis)}
                            onLoad={() => handleMessageLoad(message.id)}
                            onTaskStatusUpdate={handleTaskStatusUpdate}
                        />
                    );
                }

                return (
                    <div
                        key={message.id}
                        className="flex bg-sky-100 dark:bg-gray-600 ps-1 pt-1 relative group rounded-t-lg rounded-br-lg rtl:rounded-br-none rtl:rounded-bl-lg"
                    >
                        <div className="flex items-center gap-2 absolute top-3 end-3">
                            <ReplayButton
                                onClick={() => {
                                    // Get the index from the MessageListContent component
                                    const index = messages.findIndex((m) => {
                                        // Compare both id and _id to handle different message structures
                                        return (
                                            m.id === message.id ||
                                            m._id === message.id
                                        );
                                    });
                                    setReplayIndex(index);
                                }}
                                className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            />
                            <CopyButton
                                item={
                                    typeof message.payload === "string"
                                        ? message.payload
                                        : ""
                                }
                                className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            />
                        </div>
                        <div className="absolute top-[10px] start-3 flex items-center justify-center w-6 h-6 rounded-full bg-sky-200 dark:bg-sky-900/30">
                            <User className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div
                            className={classNames(
                                "px-1 pb-3 pt-2 ps-10 [.docked_&]:px-0 [.docked_&]:py-3 w-full",
                            )}
                        >
                            <pre className="chat-message-user">
                                {message.payload}
                            </pre>
                        </div>
                    </div>
                );
            },
            [
                basis,
                bot,
                buttonWidthClass,
                getLogo,
                language,
                messageRef,
                rowHeight,
                botName,
                selectedEntityId,
                entities,
                entityIconSize,
                handleTaskStatusUpdate,
                messages,
                handleMessageLoad,
            ],
        );

        const loadComplete = messageLoadState.every((m) => m.loaded);

        return (
            <ScrollToBottom ref={scrollBottomRef} loadComplete={loadComplete}>
                <div className="flex flex-col">
                    {messages.length === 0 && !isStreaming && (
                        <div className="no-message-message text-gray-400 dark:text-gray-500">
                            {t("Send a message to start a conversation")}
                        </div>
                    )}
                    <div className="flex-1 overflow-hidden">
                        <MessageListContent
                            messages={messages}
                            renderMessage={renderMessage}
                            handleMessageLoad={handleMessageLoad}
                            isVideoUrl={isVideoUrl}
                            isAudioUrl={isAudioUrl}
                            getExtension={getExtension}
                            getFilename={getFilename}
                            getYoutubeEmbedUrl={getYoutubeEmbedUrl}
                            onDeleteFile={confirmDeleteFile}
                            t={t}
                            isStreaming={isStreaming}
                        />
                        {isStreaming &&
                            (() => {
                                // Streaming messages should always cluster with previous user message
                                const lastMessage =
                                    messages.length > 0
                                        ? messages[messages.length - 1]
                                        : null;
                                const prevIsUser =
                                    lastMessage &&
                                    lastMessage.sender !== "labeeb";
                                const shouldCluster = prevIsUser;

                                // Apply clustering spacing
                                const streamingClasses = [];
                                if (shouldCluster) {
                                    streamingClasses.push("mt-0");
                                }
                                streamingClasses.push("mb-6"); // Normal bottom margin for streaming

                                return (
                                    <div
                                        className={classNames(
                                            ...streamingClasses,
                                        )}
                                    >
                                        <StreamingMessage
                                            content={streamingContent}
                                            ephemeralContent={ephemeralContent}
                                            toolCalls={toolCalls}
                                            bot={bot}
                                            thinkingDuration={thinkingDuration}
                                            isThinking={isThinking}
                                            selectedEntityId={selectedEntityId}
                                            entities={entities}
                                            entityIconSize={entityIconSize}
                                        />
                                    </div>
                                );
                            })()}
                        {loading &&
                            !isStreaming &&
                            renderMessage({
                                id: "loading",
                                sender: "labeeb",
                                entityId: selectedEntityId,
                                payload: (
                                    <div className="flex gap-4">
                                        <div className="mt-1 ms-1 mb-1 h-4">
                                            <Loader />
                                        </div>
                                    </div>
                                ),
                            })}
                    </div>
                </div>

                <AlertDialog
                    open={replayIndex !== null}
                    onOpenChange={() => setReplayIndex(null)}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t("Replay from this point?")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {t(
                                    "This will replay the conversation from this point. All messages after this one will be removed. Continue?",
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                                autoFocus
                                onClick={() => {
                                    handleReplay(replayIndex);
                                    setReplayIndex(null);
                                }}
                            >
                                {t("Continue")}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <AlertDialog
                    open={fileToDelete !== null}
                    onOpenChange={(open) => {
                        if (!open) setFileToDelete(null);
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t("Remove file from chat?")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {t(
                                    "Are you sure you want to remove this file from the chat? This action cannot be undone.",
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                                autoFocus
                                onClick={() => {
                                    if (fileToDelete) {
                                        deleteFileFromMessage(
                                            fileToDelete.messageId,
                                            fileToDelete.fileIndex,
                                        );
                                    }
                                }}
                            >
                                {t("Remove")}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </ScrollToBottom>
        );
    }),
);

export default MessageList;
