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
import { CurrentUserContext } from "../../App";
import { isClientOnlyChatId } from "../../../app/utils/chatClientIds";
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
import {
    extractCopyTextFromAssistantPayload,
    extractPreviewTextFromStoredPayload,
    parseAssistantPayloadItem,
} from "../../utils/assistantInlinePayload";
import UserAvatar from "../UserAvatar";

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

const isDisconnectedRetryAssistantMessage = (message) => {
    if (!Array.isArray(message?.payload)) {
        return false;
    }

    return message.payload.some((item) => {
        const parsed = parseAssistantPayloadItem(item);
        return (
            parsed?.type === "tool_event" &&
            typeof parsed.callId === "string" &&
            parsed.callId.startsWith("service-unavailable:")
        );
    });
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

const getStableMessageId = (message, index = 0) =>
    String(
        message?._clientId ||
            message?.sentTime ||
            message?.id ||
            message?._id ||
            `${message?.sender || "message"}-${index}`,
    );

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
    if (message.sender !== "assistant") {
        return false;
    }

    // Need a previous message to cluster with
    if (!prevMessage) {
        return false;
    }

    const isTaskMessage = !!message.taskId;
    const prevIsUser = prevMessage.sender !== "assistant";

    // Assistant messages cluster with preceding user messages
    if (!isTaskMessage && prevIsUser) {
        return true;
    }

    return false;
};

// Removed MemoizedYouTubeEmbed - now using MediaCard

const buildRenderedMessagePayload = ({
    message,
    handleMessageLoad,
    isVideoUrl,
    isAudioUrl,
    getExtension,
    getFilename,
    getYoutubeEmbedUrl,
    onDeleteFile,
    t,
}) => {
    let display;
    let textForCopy;

    if (Array.isArray(message.payload) && message.sender === "assistant") {
        display = message.payload;
        textForCopy = extractCopyTextFromAssistantPayload(message.payload);
    } else if (Array.isArray(message.payload)) {
        const arr = message.payload
            .map((payloadItem, index) => {
                try {
                    const obj = JSON.parse(payloadItem);

                    if (
                        obj.hideFromClient === true &&
                        obj.isDeletedFile === true
                    ) {
                        const deletedFilename = obj.deletedFilename || "file";
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
                                key={`deleted-file-${message.id}-${deletedFilename || index}`}
                                type={deletedType}
                                src={null}
                                filename={deletedFilename}
                                isDeleted={true}
                                t={t}
                            />
                        );
                    }

                    if (obj.hideFromClient === true) {
                        return null;
                    }
                    if (obj.type === "text") {
                        return obj.text;
                    } else if (
                        obj.type === "image_url" ||
                        obj.type === "file"
                    ) {
                        const src =
                            obj?.url || obj?.image_url?.url || obj?.file;
                        const displayFilename =
                            obj?.displayFilename || obj?.originalFilename;

                        if (!src) {
                            return null;
                        }

                        let filename;
                        let ext;
                        try {
                            filename =
                                displayFilename ||
                                decodeURIComponent(getFilename(src));
                            ext = getExtension(filename || src);
                        } catch (error) {
                            console.error(
                                "Error extracting filename/extension:",
                                error,
                            );
                            return null;
                        }

                        if (isAudioUrl(src) || isAudioUrl(filename)) {
                            return (
                                <audio
                                    onLoadedData={() =>
                                        handleMessageLoad(message.id)
                                    }
                                    key={`audio-${message.id}-${src || index}`}
                                    src={src}
                                    className="max-h-[20%] max-w-[100%] [.docked_&]:max-w-[80%] rounded-md border bg-white p-1 my-2 dark:border-neutral-700 dark:bg-neutral-800 shadow-lg dark:shadow-black/30"
                                    controls
                                />
                            );
                        }

                        if (
                            obj.type === "file" ||
                            DOC_EXTENSIONS.includes(ext)
                        ) {
                            return (
                                <MediaCard
                                    key={`file-${message.id}-${src || filename || index}`}
                                    type="file"
                                    src={src}
                                    filename={filename}
                                    onDeleteFile={
                                        onDeleteFile && t
                                            ? () =>
                                                  onDeleteFile(
                                                      message.id,
                                                      index,
                                                  )
                                            : undefined
                                    }
                                    t={t}
                                />
                            );
                        }

                        if (isVideoUrl(src) || isVideoUrl(filename)) {
                            const youtubeEmbedUrl = getYoutubeEmbedUrl(src);
                            if (youtubeEmbedUrl) {
                                return (
                                    <MediaCard
                                        key={`youtube-${message.id}-${src || filename || index}`}
                                        type="youtube"
                                        src={src}
                                        filename={filename}
                                        youtubeEmbedUrl={youtubeEmbedUrl}
                                        onLoad={() =>
                                            handleMessageLoad(message.id)
                                        }
                                        onDeleteFile={
                                            onDeleteFile && t
                                                ? () =>
                                                      onDeleteFile(
                                                          message.id,
                                                          index,
                                                      )
                                                : undefined
                                        }
                                        t={t}
                                    />
                                );
                            }
                            return (
                                <MediaCard
                                    key={`video-${message.id}-${src || filename || index}`}
                                    type="video"
                                    src={src}
                                    filename={filename}
                                    onLoad={() => handleMessageLoad(message.id)}
                                    onDeleteFile={
                                        onDeleteFile && t
                                            ? () =>
                                                  onDeleteFile(
                                                      message.id,
                                                      index,
                                                  )
                                            : undefined
                                    }
                                    t={t}
                                />
                            );
                        }

                        const mediaType = IMAGE_EXTENSIONS.includes(ext)
                            ? "image"
                            : "file";

                        return (
                            <MediaCard
                                key={`${mediaType}-${message.id}-${src || filename || index}`}
                                type={mediaType}
                                src={src}
                                filename={filename}
                                onLoad={
                                    mediaType === "image"
                                        ? () => handleMessageLoad(message.id)
                                        : undefined
                                }
                                onDeleteFile={
                                    onDeleteFile && t
                                        ? () => onDeleteFile(message.id, index)
                                        : undefined
                                }
                                t={t}
                            />
                        );
                    }
                    return null;
                } catch (error) {
                    console.error("Invalid JSON:", payloadItem);
                    return payloadItem;
                }
            })
            .filter((item) => item !== null);

        textForCopy = arr.filter((item) => typeof item === "string").join("\n");

        const grouped = [];
        let currentGroup = [];

        arr.forEach((item, index) => {
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
                            key={`media-group-${message.id}-${index}`}
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

        if (currentGroup.length > 0) {
            grouped.push(
                <div
                    key={`media-group-end-${message.id}`}
                    className="flex flex-wrap gap-2 my-2"
                >
                    {currentGroup}
                </div>,
            );
        }

        display = <>{grouped}</>;
    } else {
        display = message.payload;
        textForCopy =
            typeof message.payload === "string"
                ? message.payload
                : extractPreviewTextFromStoredPayload(message.payload) || "";
    }

    return {
        display,
        textForCopy,
    };
};

// Create a memoized component for the static message list content
const MessageListContent = React.memo(function MessageListContent({
    messages,
    pendingUserMessage,
    pendingAssistantMessage,
    waitingForServer,
    isStreaming,
    chatId,
    bot,
    selectedEntityId,
    entities,
    entityIconSize,
    renderMessage,
    handleMessageLoad,
    isVideoUrl,
    isAudioUrl,
    getExtension,
    getFilename,
    getYoutubeEmbedUrl,
    onDeleteFile,
    t,
}) {
    const renderedMessages = messages.map((message, index) => {
        const newMessage = { ...message };
        newMessage.id = getStableMessageId(newMessage, index);
        const { display, textForCopy } = buildRenderedMessagePayload({
            message: newMessage,
            handleMessageLoad,
            isVideoUrl,
            isAudioUrl,
            getExtension,
            getFilename,
            getYoutubeEmbedUrl,
            onDeleteFile,
            t,
        });

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
        const isUserMessage = newMessage.sender !== "assistant";
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
                data-testid={`message-wrapper-${newMessage.id}`}
                className={className}
            >
                {renderMessage({
                    ...newMessage,
                    payload: display,
                    text: textForCopy || newMessage.text || "",
                    messageIndex: index,
                })}
            </div>
        );
    });

    const lastSettledMessage =
        messages.length > 0 ? messages[messages.length - 1] : null;
    const draftAssistantAnchorMessage =
        pendingUserMessage || lastSettledMessage;
    const draftAssistantClustersWithPrevious =
        draftAssistantAnchorMessage &&
        draftAssistantAnchorMessage.sender !== "assistant";

    if (pendingUserMessage) {
        const messageId = getStableMessageId(
            pendingUserMessage,
            messages.length,
        );
        const preparedMessage = {
            ...pendingUserMessage,
            id: messageId,
        };
        const { display, textForCopy } = buildRenderedMessagePayload({
            message: preparedMessage,
            handleMessageLoad,
            isVideoUrl,
            isAudioUrl,
            getExtension,
            getFilename,
            getYoutubeEmbedUrl,
            onDeleteFile,
            t,
        });

        renderedMessages.push(
            <div
                key={messageId}
                id={`message-${messageId}`}
                data-testid={`message-wrapper-${messageId}`}
                className="mb-1"
            >
                {renderMessage({
                    ...preparedMessage,
                    payload: display,
                    text: textForCopy || pendingUserMessage.text || "",
                    messageIndex: messages.length,
                })}
            </div>,
        );
    }

    if (isStreaming) {
        renderedMessages.push(
            <StreamingMessage
                key="streaming"
                chatId={chatId}
                className={classNames(
                    draftAssistantClustersWithPrevious ? "mt-0" : "",
                    "mb-6",
                )}
                bot={bot}
                selectedEntityId={selectedEntityId}
                entities={entities}
                entityIconSize={entityIconSize}
            />,
        );
    } else if (pendingAssistantMessage) {
        if (isDisconnectedRetryAssistantMessage(pendingAssistantMessage)) {
            renderedMessages.push(
                <StreamingMessage
                    key="service-unavailable-retrying"
                    chatId={chatId}
                    className={classNames(
                        draftAssistantClustersWithPrevious ? "mt-0" : "",
                        "mb-6",
                    )}
                    statusLabel={t("Server disconnected - retrying...")}
                    isThinkingOverride={true}
                    statusTone="danger"
                    compactStatusOnly={true}
                />,
            );

            return renderedMessages;
        }

        const messageIndex = messages.length + (pendingUserMessage ? 1 : 0);
        const messageId = getStableMessageId(
            pendingAssistantMessage,
            messageIndex,
        );
        const preparedMessage = {
            ...pendingAssistantMessage,
            id: messageId,
        };
        const { display, textForCopy } = buildRenderedMessagePayload({
            message: preparedMessage,
            handleMessageLoad,
            isVideoUrl,
            isAudioUrl,
            getExtension,
            getFilename,
            getYoutubeEmbedUrl,
            onDeleteFile,
            t,
        });

        renderedMessages.push(
            <div
                key={messageId}
                id={`message-${messageId}`}
                data-testid={`message-wrapper-${messageId}`}
                className={classNames(
                    draftAssistantClustersWithPrevious ? "mt-0" : "",
                    "mb-6",
                )}
            >
                {renderMessage({
                    ...preparedMessage,
                    payload: display,
                    text: textForCopy || pendingAssistantMessage.text || "",
                    messageIndex,
                })}
            </div>,
        );
    } else if (waitingForServer) {
        renderedMessages.push(
            <StreamingMessage
                key="waiting-for-server"
                chatId={chatId}
                className={classNames(
                    draftAssistantClustersWithPrevious ? "mt-0" : "",
                    "mb-6",
                )}
                statusLabel={t("Waiting for response...")}
                isThinkingOverride={true}
            />,
        );
    }

    return renderedMessages;
});

// Displays the list of messages and a message input box.
const MessageList = React.memo(
    React.forwardRef(function MessageList(
        {
            messages,
            pendingUserMessage,
            pendingAssistantMessage,
            waitingForServer,
            bot,
            loading,
            chatId,
            isStreaming,
            isChatLoading,
            onSend,
            selectedEntityId,
            entities,
            entityIconSize,
            contextId,
            contextKey,
            onLoadOlder,
            hasMoreMessages,
            isLoadingOlder,
        },
        ref,
    ) {
        const { language } = i18next;
        const { getLogo } = config.global;
        const { t } = useTranslation();
        const scrollBottomRef = useRef(null);
        const user = useContext(CurrentUserContext);
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
            messages.map((message, index) => ({
                id: getStableMessageId(message, index),
                loaded: false,
                imagesCount: 0,
                loadedImagesCount: 0,
            })),
        );
        const messageLoadStateRef = React.useRef(messageLoadState);
        const prevMessageIdsRef = React.useRef(
            messages
                .map((message, index) => getStableMessageId(message, index))
                .join(","),
        );
        const prevChatIdRef = React.useRef(chatId);
        const messagesRef = React.useRef(messages);
        // Store message element refs to set up image listeners in useEffect
        const messageElementRefsRef = React.useRef(new Map());
        // Store image load listeners to properly clean them up
        const imageListenersRef = React.useRef(new WeakMap());

        // Reset scroll when switching chats
        useEffect(() => {
            const previousChatId = prevChatIdRef.current;
            const isPromotion =
                previousChatId &&
                chatId !== previousChatId &&
                isClientOnlyChatId(previousChatId) &&
                !isClientOnlyChatId(chatId);

            if (chatId !== previousChatId && !isPromotion) {
                scrollBottomRef.current?.resetScrollState();
            }
            prevChatIdRef.current = chatId;
        }, [chatId]);

        useEffect(() => {
            messagesRef.current = messages;
        }, [messages]);

        useEffect(() => {
            const newMessageIds = messages
                .map((message, index) => getStableMessageId(message, index))
                .join(",");
            if (prevMessageIdsRef.current === newMessageIds) return;

            prevMessageIdsRef.current = newMessageIds;
            const newMessageLoadState = messages.map((message, index) => {
                const messageId = getStableMessageId(message, index);
                const existing = messageLoadStateRef.current.find(
                    (mls) => mls.id === messageId,
                );
                if (existing) return existing;

                const messageHasImages = hasImages(message);
                const imageCount = messageHasImages ? countImages(message) : 0;
                return {
                    id: messageId,
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
        const updateChatMutateAsyncRef = React.useRef(
            updateChatHook.mutateAsync,
        );
        const apolloClientRef = React.useRef(apolloClient);
        const userRef = React.useRef(user);

        React.useEffect(() => {
            updateChatMutateAsyncRef.current = updateChatHook.mutateAsync;
        }, [updateChatHook.mutateAsync]);

        React.useEffect(() => {
            apolloClientRef.current = apolloClient;
        }, [apolloClient]);

        React.useEffect(() => {
            userRef.current = user;
        }, [user]);

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
                const latestMessages = messagesRef.current;
                const messageIndex = latestMessages.findIndex(
                    (message, index) =>
                        getStableMessageId(message, index) === messageId,
                );

                if (messageIndex === -1) {
                    console.error("Message not found:", messageId);
                    return;
                }

                const message = latestMessages[messageIndex];

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
                            fileObj.displayFilename ||
                            fileObj.originalFilename ||
                            decodeURIComponent(
                                getFilename(
                                    fileObj?.url ||
                                        fileObj?.image_url?.url ||
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
                    const updatedMessages = latestMessages.map((msg, idx) => {
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
                    await updateChatMutateAsyncRef.current({
                        chatId: String(chatId),
                        messages: updatedMessages,
                    });

                    // Close dialog immediately
                    setFileToDelete(null);

                    // Then do cloud and memory deletion in background (fire and forget)
                    purgeFile({
                        fileObj: normalizedFileObj,
                        apolloClient: apolloClientRef.current,
                        contextId,
                        contextKey,
                        chatId: null, // Skip chat update since we already did it
                        messages: null,
                        updateChatHook: null,
                        t,
                        filename,
                        skipCloudDelete: false,
                        skipUserFileCollection: false, // CFH handles it automatically
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
            [chatId, t, contextId, contextKey],
        );

        const handleMessageLoad = useCallback((messageId) => {
            setMessageLoadState((prev) => {
                let didChange = false;
                const next = prev.map((m) => {
                    if (m.id !== messageId) return m;

                    if (
                        m.loaded ||
                        m.imagesCount === 0 ||
                        m.loadedImagesCount >= m.imagesCount
                    ) {
                        return m;
                    }

                    didChange = true;
                    const newLoadedCount = m.loadedImagesCount + 1;
                    return {
                        ...m,
                        loadedImagesCount: newLoadedCount,
                        loaded: newLoadedCount >= m.imagesCount,
                    };
                });

                if (!didChange) return prev;
                messageLoadStateRef.current = next;
                return next;
            });
        }, []);

        // Callback to update mermaid code in a message
        const handleMermaidFix = useCallback(
            async (messageId, brokenCode, fixedCode) => {
                if (!chatId || !messageId || !brokenCode || !fixedCode) {
                    return;
                }

                // Find the message
                const latestMessages = messagesRef.current;
                const messageIndex = latestMessages.findIndex(
                    (message, index) =>
                        getStableMessageId(message, index) === messageId,
                );

                if (messageIndex === -1) {
                    console.error(
                        "Message not found for mermaid fix:",
                        messageId,
                    );
                    return;
                }

                const message = latestMessages[messageIndex];
                let updatedPayload = message.payload;

                // Normalize code for comparison (remove extra whitespace, normalize line endings)
                const normalizeCode = (code) => {
                    return code
                        .trim()
                        .replace(/\r\n/g, "\n")
                        .replace(/\r/g, "\n")
                        .replace(/\n{3,}/g, "\n\n");
                };

                const normalizedBrokenCode = normalizeCode(brokenCode);

                // Replace the mermaid code block - we know which block it is, just replace it
                const replaceMermaidCode = (text) => {
                    // Find mermaid blocks and replace the one containing brokenCode
                    const mermaidBlockRegex = /```mermaid\s*([\s\S]*?)\s*```/g;
                    let replaced = false;
                    return text.replace(
                        mermaidBlockRegex,
                        (fullMatch, codeContent) => {
                            // If this block matches the broken code (normalized), replace it
                            // Only replace the first match to avoid replacing multiple blocks
                            if (
                                !replaced &&
                                normalizeCode(codeContent) ===
                                    normalizedBrokenCode
                            ) {
                                replaced = true;
                                return `\`\`\`mermaid\n${fixedCode}\n\`\`\``;
                            }
                            return fullMatch;
                        },
                    );
                };

                // Helper to recursively process payload items
                const processPayloadItem = (item) => {
                    if (typeof item === "string") {
                        // Try to parse as JSON in case it's a stringified object
                        try {
                            const parsed = JSON.parse(item);
                            if (parsed && typeof parsed === "object") {
                                // Recursively process object properties
                                if (
                                    parsed.text &&
                                    typeof parsed.text === "string"
                                ) {
                                    const processedText = replaceMermaidCode(
                                        parsed.text,
                                    );
                                    if (processedText !== parsed.text) {
                                        return JSON.stringify({
                                            ...parsed,
                                            text: processedText,
                                        });
                                    }
                                }
                                // Check other string properties
                                const processed = { ...parsed };
                                let changed = false;
                                for (const key in processed) {
                                    if (
                                        typeof processed[key] === "string" &&
                                        key !== "text"
                                    ) {
                                        const processedValue =
                                            replaceMermaidCode(processed[key]);
                                        if (processedValue !== processed[key]) {
                                            processed[key] = processedValue;
                                            changed = true;
                                        }
                                    }
                                }
                                if (changed) {
                                    return JSON.stringify(processed);
                                }
                            }
                        } catch (e) {
                            // Not JSON, treat as plain string
                        }
                        // Process as plain string
                        return replaceMermaidCode(item);
                    }
                    return item;
                };

                // Check if payload contains mermaid blocks before processing
                const payloadStr =
                    typeof updatedPayload === "string"
                        ? updatedPayload
                        : JSON.stringify(updatedPayload);
                const hasMermaidBlocks = /```mermaid/.test(payloadStr);

                if (typeof updatedPayload === "string") {
                    const before = updatedPayload;
                    updatedPayload = processPayloadItem(updatedPayload);
                    // Check if anything changed
                    if (before === updatedPayload) {
                        // Only warn if we actually expected to find a match
                        if (hasMermaidBlocks) {
                            console.warn(
                                "Mermaid code block not found in message payload for replacement",
                                {
                                    messageId,
                                    brokenCodeLength: brokenCode.length,
                                    payloadPreview: String(before).substring(
                                        0,
                                        200,
                                    ),
                                },
                            );
                        }
                        return;
                    }
                } else if (Array.isArray(updatedPayload)) {
                    let changed = false;
                    updatedPayload = updatedPayload.map((item) => {
                        const processed = processPayloadItem(item);
                        if (processed !== item) {
                            changed = true;
                        }
                        return processed;
                    });
                    if (!changed) {
                        // Only warn if we actually expected to find a match
                        if (hasMermaidBlocks) {
                            console.warn(
                                "Mermaid code block not found in message payload for replacement",
                                {
                                    messageId,
                                    brokenCodeLength: brokenCode.length,
                                    payloadType: "array",
                                },
                            );
                        }
                        return;
                    }
                } else {
                    // Payload is neither string nor array - can't process
                    console.warn(
                        "Mermaid fix: unexpected payload format",
                        typeof updatedPayload,
                    );
                    return;
                }

                // Create updated messages array
                const updatedMessages = [...latestMessages];
                updatedMessages[messageIndex] = {
                    ...message,
                    payload: updatedPayload,
                };

                // Update the chat
                try {
                    await updateChatMutateAsyncRef.current({
                        chatId: String(chatId),
                        messages: updatedMessages,
                    });
                    console.log(
                        "Successfully updated message with fixed mermaid code",
                    );
                } catch (error) {
                    console.error(
                        "Error updating message with fixed mermaid code:",
                        error,
                    );
                }
            },
            [chatId],
        );

        const handleImageLoad = useCallback(
            (messageId) => {
                handleMessageLoad(messageId);
            },
            [handleMessageLoad],
        );

        /**
         * Ref callback for message elements. This callback is intentionally side-effect-free
         * to avoid infinite loops during React's commit phase.
         *
         * React calls ref callbacks during the commit phase, and performing side effects
         * (like setting up event listeners or triggering state updates) can cause React
         * to re-render, which triggers the ref callback again, creating an infinite loop.
         *
         * Instead, this callback only stores the element reference in a ref. The actual
         * work of setting up image load listeners is deferred to a useEffect hook that
         * runs after the commit phase completes (using requestAnimationFrame to ensure
         * proper timing). This pattern prevents commit phase issues while still allowing
         * us to track message elements and set up listeners when needed.
         *
         * @param {HTMLElement|null} element - The message element, or null when unmounting
         * @param {string} messageId - The ID of the message
         */
        const messageRef = useCallback((element, messageId) => {
            if (!element) {
                // Cleanup: remove element reference when null
                messageElementRefsRef.current.delete(messageId);
                return;
            }
            // Just store the element reference - don't do any work here
            messageElementRefsRef.current.set(messageId, element);
        }, []);

        // Set up image load listeners in useEffect to avoid commit phase issues
        // Use a separate effect that runs after DOM updates to set up listeners
        useEffect(() => {
            let rafId;
            const cleanupFunctions = [];

            // Use requestAnimationFrame to ensure this runs after React's commit phase
            rafId = requestAnimationFrame(() => {
                messageElementRefsRef.current.forEach((element, messageId) => {
                    const images = element.getElementsByTagName("img");
                    Array.from(images).forEach((img) => {
                        // Skip if we already have a listener for this image
                        if (imageListenersRef.current.has(img)) {
                            return;
                        }

                        // Only add listener if image hasn't loaded yet
                        if (!img.complete) {
                            const listener = () => {
                                handleImageLoad(messageId);
                            };
                            img.addEventListener("load", listener);
                            imageListenersRef.current.set(img, listener);
                            cleanupFunctions.push(() => {
                                img.removeEventListener("load", listener);
                                imageListenersRef.current.delete(img);
                            });
                        }
                    });
                });
            });

            return () => {
                if (rafId) {
                    cancelAnimationFrame(rafId);
                }
                // Clean up all listeners that were added
                cleanupFunctions.forEach((cleanup) => cleanup());
                // Also clean up any remaining listeners from the WeakMap
                imageListenersRef.current = new WeakMap();
            };
        }, [messages, handleImageLoad]);

        const handleReplay = useCallback(
            (messageIndex) => {
                const latestMessages = messagesRef.current;
                if (messageIndex < 0 || messageIndex >= latestMessages.length) {
                    console.error(
                        "Invalid message index for replay:",
                        messageIndex,
                    );
                    return;
                }

                // Get all messages up to the selected message
                const messagesToKeep = latestMessages.slice(0, messageIndex);

                const messageToReplay = {
                    payload: latestMessages[messageIndex].payload,
                    sender: latestMessages[messageIndex].sender,
                    sentTime: new Date().toISOString(),
                    direction: latestMessages[messageIndex].direction,
                    position: latestMessages[messageIndex].position,
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
            [onSend],
        );

        // Callback to trigger scroll when task status updates
        const handleTaskStatusUpdate = useCallback(() => {
            // Scroll messages list to bottom when task status changes
            scrollBottomRef.current?.resetScrollState();
        }, []);

        const renderMessage = useCallback(
            (message) => {
                const toolData = parseToolData(message.tool);

                if (message.sender === "assistant") {
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
                            entityIconSize={entityIconSize}
                            entityIconClasses={classNames(basis)}
                            onLoad={handleMessageLoad}
                            onTaskStatusUpdate={handleTaskStatusUpdate}
                            onMermaidFix={handleMermaidFix}
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
                                    setReplayIndex(message.messageIndex);
                                }}
                                className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            />
                            <CopyButton
                                item={
                                    typeof message.payload === "string"
                                        ? message.payload
                                        : message.text || ""
                                }
                                className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            />
                        </div>
                        <div className="absolute top-[10px] start-3 flex items-center justify-center w-6 h-6 rounded-full bg-sky-200 dark:bg-sky-900/30 overflow-hidden">
                            <UserAvatar
                                src={
                                    userRef.current?.profilePicture ||
                                    userRef.current?.picture
                                }
                                blobPath={
                                    userRef.current?.profilePictureBlobPath
                                }
                                contextId={userRef.current?.contextId}
                                name={userRef.current?.name || "User"}
                                initials={userRef.current?.initials}
                                className="h-full w-full bg-sky-200 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 flex items-center justify-center"
                                initialsClassName="text-xs font-medium leading-none"
                                iconClassName="w-4 h-4"
                            />
                        </div>
                        <div
                            className={classNames(
                                "px-1 pb-3 pt-2 ps-10 [.docked_&]:px-0 [.docked_&]:ps-10 [.docked_&]:py-3 w-full",
                            )}
                        >
                            <div className="chat-message-user whitespace-pre-wrap">
                                {message.payload}
                            </div>
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
                entityIconSize,
                handleTaskStatusUpdate,
                handleMermaidFix,
                handleMessageLoad,
            ],
        );

        const loadComplete = messageLoadState.every((m) => m.loaded);
        const handleReachTop = useCallback(() => {
            if (!hasMoreMessages || isLoadingOlder) return;
            if (typeof onLoadOlder === "function") {
                onLoadOlder();
            }
        }, [hasMoreMessages, isLoadingOlder, onLoadOlder]);

        return (
            <ScrollToBottom
                ref={scrollBottomRef}
                loadComplete={loadComplete}
                onReachTop={handleReachTop}
            >
                <div className="flex flex-col">
                    {messages.length === 0 &&
                        !pendingUserMessage &&
                        !pendingAssistantMessage &&
                        !isStreaming &&
                        !isChatLoading && (
                            <div className="no-message-message text-gray-400 dark:text-gray-500">
                                {t("Send a message to start a conversation")}
                            </div>
                        )}
                    <div className="flex-1 overflow-hidden">
                        <MessageListContent
                            messages={messages}
                            pendingUserMessage={pendingUserMessage}
                            pendingAssistantMessage={pendingAssistantMessage}
                            waitingForServer={waitingForServer}
                            isStreaming={isStreaming}
                            chatId={chatId}
                            bot={bot}
                            selectedEntityId={selectedEntityId}
                            entities={entities}
                            entityIconSize={entityIconSize}
                            renderMessage={renderMessage}
                            handleMessageLoad={handleMessageLoad}
                            isVideoUrl={isVideoUrl}
                            isAudioUrl={isAudioUrl}
                            getExtension={getExtension}
                            getFilename={getFilename}
                            getYoutubeEmbedUrl={getYoutubeEmbedUrl}
                            onDeleteFile={confirmDeleteFile}
                            t={t}
                        />
                        {loading &&
                            !isStreaming &&
                            !waitingForServer &&
                            messages.length === 0 &&
                            !pendingUserMessage &&
                            !pendingAssistantMessage &&
                            renderMessage({
                                id: "loading",
                                sender: "assistant",
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
