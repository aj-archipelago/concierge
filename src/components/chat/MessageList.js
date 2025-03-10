import i18next from "i18next";
import React, { useEffect, useContext, useCallback } from "react";
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
import { AuthContext } from "../../App.js";
import { useGetActiveChat, useUpdateChat } from "../../../app/queries/chats";
import ProgressUpdate from "../editor/ProgressUpdate";
import { useGetAutogenRun } from "../../../app/queries/autogen";

const getLoadState = (message) => {
    const hasImage =
        Array.isArray(message.payload) &&
        message.payload.some((p) => {
            try {
                const obj = JSON.parse(p);
                return obj.type === "image_url";
            } catch (e) {
                return false;
            }
        });

    if (hasImage) {
        return false;
    } else {
        return true;
    }
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

// Displays the list of messages and a message input box.
function MessageList({ messages, bot, loading, chatId }) {
    const { user } = useContext(AuthContext);
    const { aiName } = user;
    const { language } = i18next;
    const { getLogo } = config.global;
    const { t } = useTranslation();
    const [messageLoadState, setMessageLoadState] = React.useState(
        messages.map((m) => {
            return {
                id: m.id,
                loaded: getLoadState(m),
            };
        }),
    );
    const chat = useGetActiveChat()?.data;
    const updateChat = useUpdateChat();
    const codeRequestId = chat?.codeRequestId;
    const getAutogenRun = useGetAutogenRun(codeRequestId);

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
                messages: [...chat.messages, message],
            });
        },
        [chat?.messages, chatId, updateChat],
    );

    useEffect(() => {
        const data = getAutogenRun?.data?.data?.data;
        if (data) {
            setCodeRequestFinalData(data);
        }
    }, [getAutogenRun?.data?.data, setCodeRequestFinalData]);

    const messageLoadStateRef = React.useRef(messageLoadState);

    useEffect(() => {
        // merge load state
        const newMessageLoadState = messages.map((m) => {
            const existing = messageLoadStateRef.current.find(
                (mls) => mls.id === m.id,
            );
            if (existing) {
                return existing;
            }
            return {
                id: m.id,
                loaded: getLoadState(m),
            };
        });

        setMessageLoadState(newMessageLoadState);
    }, [messages]);

    let rowHeight = "h-12 [.docked_&]:h-10";
    let basis =
        "min-w-[3rem] basis-12 [.docked_&]:basis-10 [.docked_&]:min-w-[2.5rem]";
    let buttonWidthClass = "w-12 [.docked_&]:w-10";
    const botName =
        bot === "code"
            ? config?.code?.botName
            : aiName || config?.chat?.botName;

    const renderMessage = (message) => {
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
                                    {getToolMetadata(toolData.toolUsed, t).icon}
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
                            <div className="font-semibold">{t(botName)}</div>
                            <div
                                className="chat-message-bot relative break-words"
                                ref={(el) => {
                                    if (el) {
                                        const images =
                                            el.getElementsByTagName("img");
                                        Array.from(images).forEach((img) => {
                                            if (!img.complete) {
                                                img.addEventListener(
                                                    "load",
                                                    () =>
                                                        handleMessageLoad(
                                                            message.id,
                                                        ),
                                                );
                                            }
                                        });
                                    }
                                }}
                            >
                                {message.payload}
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
                    <div className={classNames(basis, "py-0")}>{avatar}</div>
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
    };

    const handleMessageLoad = (id) => {
        setMessageLoadState((prev) => {
            return prev.map((m) => {
                if (m.id === id) {
                    return {
                        id: m.id,
                        loaded: true,
                    };
                }
                return m;
            });
        });
    };

    const loadComplete = messageLoadState.every((m) => m.loaded);

    return (
        <>
            <ScrollToBottom loadComplete={loadComplete}>
                {messages.length === 0 && (
                    <div className="no-message-message text-gray-400">
                        {t("Send a message to start a conversation")}
                    </div>
                )}
                {messages.map((message, index) => {
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
                                    const src =
                                        obj?.url ||
                                        obj?.image_url?.url ||
                                        obj?.gcs;
                                    if (isVideoUrl(src)) {
                                        // Check if it's a YouTube URL
                                        const youtubeEmbedUrl =
                                            getYoutubeEmbedUrl(src);
                                        if (youtubeEmbedUrl) {
                                            return (
                                                <MemoizedYouTubeEmbed
                                                    key={youtubeEmbedUrl}
                                                    url={youtubeEmbedUrl}
                                                    onLoad={() =>
                                                        handleMessageLoad(
                                                            newMessage.id,
                                                        )
                                                    }
                                                />
                                            );
                                        }
                                        // Regular video
                                        return (
                                            <video
                                                onLoadedData={() => {
                                                    handleMessageLoad(
                                                        newMessage.id,
                                                    );
                                                }}
                                                key={`video-${index}-${index2}`}
                                                src={src}
                                                className="max-h-[20%] max-w-[60%] [.docked_&]:max-w-[90%] rounded border-0 my-2 shadow-lg dark:shadow-black/30"
                                                style={{
                                                    backgroundColor:
                                                        "transparent",
                                                }}
                                                controls
                                                preload="metadata"
                                                playsInline
                                            />
                                        );
                                    } else if (isAudioUrl(src)) {
                                        // Display the audio
                                        return (
                                            <audio
                                                onLoadedData={() => {
                                                    handleMessageLoad(
                                                        newMessage.id,
                                                    );
                                                }}
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
                                                onLoad={() => {
                                                    handleMessageLoad(
                                                        newMessage.id,
                                                    );
                                                }}
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
                                                onLoad={() => {
                                                    handleMessageLoad(
                                                        newMessage.id,
                                                    );
                                                }}
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

                                    // Display the image
                                    return (
                                        <div key={src}>
                                            <img
                                                onLoad={() => {
                                                    handleMessageLoad(
                                                        newMessage.id,
                                                    );
                                                }}
                                                src={src}
                                                alt="uploadedimage"
                                                className="max-h-[20%] max-w-[60%] [.docked_&]:max-w-[90%] rounded border-0 my-2 shadow-lg dark:shadow-black/30"
                                                style={{
                                                    backgroundColor:
                                                        "transparent",
                                                }}
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

                    // process the message and create a new
                    // message object with the updated payload.
                    const processedMessage = Object.assign({}, newMessage, {
                        payload: (
                            <React.Fragment key={`inner-${newMessage.id}`}>
                                {newMessage.sender === "labeeb" ? (
                                    convertMessageToMarkdown(newMessage)
                                ) : (
                                    <div key={`um-${index}`}>{display}</div>
                                )}
                            </React.Fragment>
                        ),
                    });

                    return (
                        <div key={processedMessage.id}>
                            {renderMessage(processedMessage)}
                        </div>
                    );
                })}
                {loading &&
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
                                            initialText={"🤖 Agent coding..."}
                                            codeAgent={true}
                                        />
                                    </div>
                                )}
                            </div>
                        ),
                    })}
            </ScrollToBottom>
        </>
    );
}

export default MessageList;
