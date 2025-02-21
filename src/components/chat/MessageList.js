import i18next from "i18next";
import React, {
    useEffect,
    useCallback,
    useRef,
    useImperativeHandle,
} from "react";
import { useTranslation } from "react-i18next";
import { AiFillFilePdf, AiFillFileText, AiOutlineRobot } from "react-icons/ai";
import { FaUserCircle } from "react-icons/fa";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import { convertMessageToMarkdown } from "./ChatMessage";
import ScrollToBottom from "./ScrollToBottom";
import Loader from "../../../app/components/loader";
import {
    getExtension,
    getFilename,
    isAudioUrl,
    isVideoUrl,
} from "./MyFilePond";
import CopyButton from "../CopyButton";
import { useGetActiveChat, useUpdateChat } from "../../../app/queries/chats";
import ProgressUpdate from "../editor/ProgressUpdate";
import { useGetAutogenRun } from "../../../app/queries/autogen";
import StreamingMessage from "./StreamingMessage";

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

const getToolMetadata = (toolName, t) => {
    const toolIcons = {
        search: "🔍",
        reasoning: "🧠",
        image: "🖼️",
        writing: "💻",
        vision: "👁️",
        default: "🛠️",
        coding: "🤖",
        memory: "🧠",
    };

    const normalizedToolName = toolName?.toLowerCase();
    const icon = toolIcons[normalizedToolName] || toolIcons.default;
    const translatedName = t(`tool.${normalizedToolName || "default"}`);

    return {
        icon,
        translatedName,
    };
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
            className="w-full max-h-[20%] max-w-[60%] [.docked_&]:max-w-[90%] rounded border-0 my-2 shadow-lg dark:shadow-black/30"
            style={{
                minWidth: "360px",
                width: "640px",
                aspectRatio: "16/9",
                backgroundColor: "transparent",
            }}
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
    );
});

// Add this near the top of the file, after imports:
const MemoizedMarkdownMessage = React.memo(
    ({ message }) => {
        return convertMessageToMarkdown(message);
    },
    (prevProps, nextProps) => {
        // If messages are completely identical, no need to re-render
        if (prevProps.message === nextProps.message) {
            return true;
        }

        // If payloads are strings and identical, no need to re-render
        if (
            typeof prevProps.message.payload === "string" &&
            typeof nextProps.message.payload === "string" &&
            prevProps.message.payload === nextProps.message.payload
        ) {
            return true;
        }

        // For array payloads, we need to compare each item
        if (
            Array.isArray(prevProps.message.payload) &&
            Array.isArray(nextProps.message.payload)
        ) {
            if (
                prevProps.message.payload.length !==
                nextProps.message.payload.length
            ) {
                return false;
            }

            // Compare each item in the array
            return prevProps.message.payload.every((item, index) => {
                const nextItem = nextProps.message.payload[index];
                try {
                    const prevObj =
                        typeof item === "string" ? JSON.parse(item) : item;
                    const nextObj =
                        typeof nextItem === "string"
                            ? JSON.parse(nextItem)
                            : nextItem;

                    // For image URLs, only compare the base URL without query parameters
                    if (
                        prevObj.type === "image_url" &&
                        nextObj.type === "image_url"
                    ) {
                        const prevUrl = new URL(
                            prevObj.url ||
                                prevObj.image_url?.url ||
                                prevObj.gcs,
                        ).pathname;
                        const nextUrl = new URL(
                            nextObj.url ||
                                nextObj.image_url?.url ||
                                nextObj.gcs,
                        ).pathname;
                        return prevUrl === nextUrl;
                    }

                    return JSON.stringify(prevObj) === JSON.stringify(nextObj);
                } catch (e) {
                    // If JSON parsing fails, compare as strings
                    return item === nextItem;
                }
            });
        }

        // Default to re-rendering if we can't determine equality
        return false;
    },
);

// Add this component before MessageListContent
const PreloadedImage = React.memo(function PreloadedImage({
    src,
    alt,
    className,
    style,
    onLoad,
}) {
    const [permanentSrc, setPermanentSrc] = React.useState(src);
    const [isLoading, setIsLoading] = React.useState(true);
    const isMounted = React.useRef(true);
    const permanentImageLoaded = React.useRef(false);

    React.useEffect(() => {
        isMounted.current = true;
        setIsLoading(true);
        permanentImageLoaded.current = false;

        return () => {
            isMounted.current = false;
        };
    }, [src]);

    React.useEffect(() => {
        const img = new Image();
        const targetSrc =
            src.includes("/temp/") || src.includes("?temp=true")
                ? src.replace("/temp/", "/").replace("?temp=true", "")
                : src;

        img.onload = () => {
            if (isMounted.current) {
                setPermanentSrc(targetSrc);
                setIsLoading(false);
                permanentImageLoaded.current = true;
                onLoad?.();
            }
        };

        img.src = targetSrc;

        return () => {
            img.onload = null;
        };
    }, [src, onLoad]);

    return (
        <img
            src={permanentSrc}
            alt={alt}
            className={className}
            style={{
                ...style,
                opacity: isLoading ? 0.3 : 1,
                transition: "opacity 0.3s ease-in-out",
            }}
            onLoad={() => {
                if (!isLoading && !permanentImageLoaded.current) {
                    setIsLoading(false);
                    onLoad?.();
                }
            }}
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

                        if (getExtension(src) === ".pdf") {
                            const filename = decodeURIComponent(
                                getFilename(src),
                            );
                            return (
                                <a
                                    key={`pdf-${index}-${index2}`}
                                    className="bg-neutral-100 py-2 ps-2 pe-4 m-2 shadow-md rounded-lg border flex gap-2 items-center"
                                    onLoad={() =>
                                        handleMessageLoad(newMessage.id)
                                    }
                                    href={src}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <AiFillFilePdf
                                        size={40}
                                        className="text-red-600 dark:text-red-400"
                                    />
                                    {filename}
                                </a>
                            );
                        }

                        if (getExtension(src) === ".txt") {
                            const filename = decodeURIComponent(
                                getFilename(src),
                            );
                            return (
                                <a
                                    key={`txt-${index}-${index2}`}
                                    className="bg-neutral-100 py-2 ps-2 pe-4 m-2 shadow-md rounded-lg border flex gap-2 items-center"
                                    onLoad={() =>
                                        handleMessageLoad(newMessage.id)
                                    }
                                    href={src}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <AiFillFileText
                                        size={40}
                                        className="text-red-600 dark:text-red-400"
                                    />
                                    {filename}
                                </a>
                            );
                        }

                        return (
                            <div key={src}>
                                <PreloadedImage
                                    src={src}
                                    alt="uploadedimage"
                                    className="max-h-[20%] max-w-[60%] [.docked_&]:max-w-[90%] rounded border-0 my-2 shadow-lg dark:shadow-black/30"
                                    style={{
                                        backgroundColor: "transparent",
                                    }}
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
            <div key={newMessage.id}>
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
            aiName,
            onSend,
        },
        ref,
    ) {
        const { language } = i18next;
        const { getLogo } = config.global;
        const { t } = useTranslation();
        const scrollBottomRef = useRef(null);

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

        const chat = useGetActiveChat()?.data;
        const updateChat = useUpdateChat();
        const codeRequestId = chat?.codeRequestId;
        const getAutogenRun = useGetAutogenRun(codeRequestId);

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

        const setCodeRequestFinalData = useCallback(
            (data) => {
                const message = {
                    payload: data,
                    sender: "labeeb",
                    sentTime: "just now",
                    direction: "incoming",
                    position: "single",
                    tool: '{"toolUsed":"coding"}',
                };

                updateChat.mutateAsync({
                    chatId,
                    codeRequestId: null,
                    isChatLoading: false,
                    messages: chat?.messages
                        ? [...chat.messages, message]
                        : [message],
                });
            },
            [chatId, updateChat, chat?.messages],
        );

        useEffect(() => {
            const data = getAutogenRun?.data?.data?.data;
            if (data) {
                setCodeRequestFinalData(data);
            }
        }, [getAutogenRun?.data?.data, setCodeRequestFinalData]);

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
                : aiName || config?.chat?.botName;

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

        const renderMessage = useCallback(
            (message) => {
                let avatar;
                const toolData = parseToolData(message.tool);

                if (message.sender === "labeeb") {
                    avatar = toolData?.avatarImage ? (
                        <img
                            src={toolData.avatarImage}
                            alt="Tool Avatar"
                            className={classNames(
                                basis,
                                "p-1",
                                buttonWidthClass,
                                rowHeight,
                                "rounded-full object-cover",
                            )}
                        />
                    ) : bot === "code" ? (
                        <AiOutlineRobot
                            className={classNames(
                                rowHeight,
                                buttonWidthClass,
                                "px-3",
                                "text-gray-400",
                            )}
                        />
                    ) : (
                        <img
                            src={getLogo(language)}
                            alt="Logo"
                            className={classNames(
                                basis,
                                "p-2",
                                buttonWidthClass,
                                rowHeight,
                            )}
                        />
                    );

                    return (
                        <div
                            key={message.id}
                            className="flex bg-sky-50 ps-1 pt-1 relative group"
                        >
                            <div className="flex items-center gap-2 absolute top-3 end-3">
                                {toolData?.toolUsed && (
                                    <div className="tool-badge inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-sky-50 border border-sky-100 text-xs text-sky-600 font-medium w-fit">
                                        <span className="tool-icon">
                                            {
                                                getToolMetadata(
                                                    toolData.toolUsed,
                                                    t,
                                                ).icon
                                            }
                                        </span>
                                        <span className="tool-name">
                                            {t("Used {{tool}} tool", {
                                                tool: getToolMetadata(
                                                    toolData.toolUsed,
                                                    t,
                                                ).translatedName,
                                            })}
                                        </span>
                                    </div>
                                )}
                                <CopyButton
                                    item={message.text}
                                    className="copy-button opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                                />
                            </div>

                            <div className={classNames(basis)}>{avatar}</div>
                            <div
                                className={classNames(
                                    "px-1 pb-3 pt-2 [.docked_&]:px-0 [.docked_&]:py-3 w-full",
                                )}
                            >
                                <div className="flex flex-col">
                                    <div className="font-semibold">
                                        {t(botName)}
                                    </div>
                                    <div
                                        className="chat-message-bot relative break-words"
                                        ref={(el) => messageRef(el, message.id)}
                                    >
                                        <React.Fragment
                                            key={`md-${message.id}`}
                                        >
                                            <MemoizedMarkdownMessage
                                                message={message}
                                            />
                                        </React.Fragment>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                } else {
                    avatar = (
                        <FaUserCircle
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
                            className="flex ps-1 pt-1 relative [&_button]:hidden [&_button]:hover:block"
                        >
                            <CopyButton
                                item={message.text}
                                className="absolute top-3 end-3 opacity-60 hover:opacity-100"
                            />
                            <div className={classNames(basis, "py-0")}>
                                {avatar}
                            </div>
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
                }
            },
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [
                basis,
                bot,
                buttonWidthClass,
                getLogo,
                language,
                messageRef,
                rowHeight,
                t,
            ],
        );

        const loadComplete = messageLoadState.every((m) => m.loaded);

        return (
            <ScrollToBottom ref={scrollBottomRef} loadComplete={loadComplete}>
                <div className="flex flex-col">
                    {messages.length === 0 && !isStreaming && (
                        <div className="no-message-message text-gray-400">
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
                                bot={bot}
                                aiName={aiName}
                            />
                        )}
                        {loading &&
                            !isStreaming &&
                            renderMessage({
                                id: "loading",
                                sender: "labeeb",
                                payload: (
                                    <div className="flex gap-4">
                                        <div className="mt-1 ms-1 mb-1 h-4">
                                            <Loader />
                                        </div>
                                        {codeRequestId && (
                                            <div className="border pt-5 pb-3 px-7 rounded-md bg-white animate-fade-in">
                                                <ProgressUpdate
                                                    requestId={codeRequestId}
                                                    setFinalData={
                                                        setCodeRequestFinalData
                                                    }
                                                    initialText={
                                                        "🤖 Agent coding..."
                                                    }
                                                    codeAgent={true}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ),
                            })}
                    </div>
                </div>
            </ScrollToBottom>
        );
    }),
);

export default MessageList;
