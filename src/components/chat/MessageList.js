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
import { UserCircle } from "lucide-react";
import Loader from "../../../app/components/loader";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import {
    getExtension,
    getFilename,
    isAudioUrl,
    isVideoUrl,
    DOC_EXTENSIONS,
    getFileIcon,
} from "../../utils/mediaUtils";
import CopyButton from "../CopyButton";
import ReplayButton from "../ReplayButton";
import ChatImage from "../images/ChatImage";
import { AuthContext } from "../../App";
import BotMessage from "./BotMessage";
import ScrollToBottom from "./ScrollToBottom";
import StreamingMessage from "./StreamingMessage";
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

// Add memoized YouTube component
const MemoizedYouTubeEmbed = React.memo(({ url, onLoad }) => {
    return (
        <iframe
            title={`YouTube video ${url.split("/").pop()}`}
            onLoad={onLoad}
            src={url}
            className="w-full rounded border-0 my-2 shadow-lg dark:shadow-black/30"
            style={{
                width: "100%",
                maxWidth: "640px",
                aspectRatio: "16/9",
                backgroundColor: "transparent",
            }}
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
    );
});

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
}) {
    return messages.map((message, index) => {
        const newMessage = { ...message };
        if (!newMessage.id) {
            newMessage.id = newMessage._id || index;
        }
        let display;
        if (Array.isArray(newMessage.payload)) {
            const arr = newMessage.payload.map((t, index2) => {
                try {
                    const obj = JSON.parse(t);
                    if (obj.type === "text") {
                        return obj.text;
                    } else if (obj.type === "image_url") {
                        const src = obj?.url || obj?.image_url?.url || obj?.gcs;
                        const originalFilename = obj?.originalFilename;
                        if (isVideoUrl(src)) {
                            const youtubeEmbedUrl = getYoutubeEmbedUrl(src);
                            if (youtubeEmbedUrl) {
                                return (
                                    <MemoizedYouTubeEmbed
                                        key={youtubeEmbedUrl}
                                        url={youtubeEmbedUrl}
                                        onLoad={() =>
                                            handleMessageLoad(newMessage.id)
                                        }
                                    />
                                );
                            }
                            return (
                                <video
                                    onLoadedData={() =>
                                        handleMessageLoad(newMessage.id)
                                    }
                                    key={`video-${index}-${index2}`}
                                    src={src}
                                    className="max-h-[20%] max-w-[60%] [.docked_&]:max-w-[90%] rounded border-0 my-2 shadow-lg dark:shadow-black/30"
                                    style={{
                                        backgroundColor: "transparent",
                                    }}
                                    controls
                                    preload="metadata"
                                    playsInline
                                />
                            );
                        } else if (isAudioUrl(src)) {
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

                        // Use original filename if available, otherwise extract from URL
                        const filename =
                            originalFilename ||
                            decodeURIComponent(getFilename(src));
                        const ext = getExtension(src);

                        if (DOC_EXTENSIONS.includes(ext)) {
                            const Icon = getFileIcon(filename);
                            return (
                                <a
                                    key={`file-${index}-${index2}`}
                                    className="bg-neutral-100 dark:bg-gray-700 py-2 ps-2 pe-4 m-2 shadow-md rounded-lg border dark:border-gray-600 flex gap-2 items-center"
                                    onLoad={() =>
                                        handleMessageLoad(newMessage.id)
                                    }
                                    href={src}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Icon className="w-6 h-6 text-red-500" />
                                    {filename}
                                </a>
                            );
                        }

                        return (
                            <div key={src}>
                                <ChatImage
                                    src={src}
                                    alt="uploadedimage"
                                    onLoad={() =>
                                        handleMessageLoad(newMessage.id)
                                    }
                                />
                            </div>
                        );
                    }
                    return null;
                } catch (e) {
                    console.error("Invalid JSON:", t);
                    return t;
                }
            });
            display = <>{arr}</>;
        } else {
            display = newMessage.payload;
        }

        return (
            <div key={newMessage.id} id={`message-${newMessage.id}`}>
                {renderMessage({ ...newMessage, payload: display })}
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
            thinkingDuration,
            isThinking,
            selectedEntityId,
            entities,
            entityIconSize,
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

        const rowHeight = "h-12 [.docked_&]:h-10";
        const basis =
            "min-w-[3rem] basis-12 [.docked_&]:basis-10 [.docked_&]:min-w-[2.5rem]";
        const buttonWidthClass = "w-12 [.docked_&]:w-10";
        const botName =
            bot === "code"
                ? config?.code?.botName
                : defaultAiName || config?.chat?.botName;

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
                        />
                    );
                }
                const avatar = (
                    <UserCircle
                        className={classNames(
                            rowHeight,
                            buttonWidthClass,
                            "p-2",
                            "text-gray-300",
                        )}
                    />
                );
                return (
                    <div
                        key={message.id}
                        className="flex ps-1 pt-1 relative group"
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
                        <div className={classNames(basis)}>{avatar}</div>
                        <div
                            className={classNames(
                                "px-1 pb-3 pt-2 [.docked_&]:px-0 [.docked_&]:py-3",
                            )}
                        >
                            <div className="font-semibold">{t("You")}</div>
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
                t,
                botName,
                selectedEntityId,
                entities,
                entityIconSize,
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
                        />
                        {isStreaming && (
                            <StreamingMessage
                                content={streamingContent}
                                ephemeralContent={ephemeralContent}
                                bot={bot}
                                thinkingDuration={thinkingDuration}
                                isThinking={isThinking}
                                selectedEntityId={selectedEntityId}
                                entities={entities}
                                entityIconSize={entityIconSize}
                            />
                        )}
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
            </ScrollToBottom>
        );
    }),
);

export default MessageList;
