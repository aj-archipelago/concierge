import i18next from "i18next";
import React, { useEffect, useContext, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AiFillFilePdf, AiOutlineRobot } from "react-icons/ai";
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
                payload: `<span class="text-indigo-500">🤖 Coding Agent ➡️ </span> ${data}`,
                sender: "labeeb",
                sentTime: "just now",
                direction: "incoming",
                position: "single",
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
        let avatar = (
            <img
                src={getLogo(language)}
                alt="Logo"
                className={classNames(
                    basis,
                    "p-2",
                    "w-12 [.docked_&]:w-10",
                    rowHeight,
                )}
            />
        );

        if (bot === "code") {
            avatar = (
                <AiOutlineRobot
                    className={classNames(
                        rowHeight,
                        buttonWidthClass,
                        "px-3",
                        "text-gray-400",
                    )}
                />
            );
        }

        if (message.sender === "labeeb") {
            return (
                <div
                    key={message.id}
                    className="flex bg-sky-50 ps-1 pt-1 relative [&_.copy-button]:hidden [&_.copy-button]:hover:block"
                >
                    <CopyButton
                        item={message.text}
                        className="absolute top-3 end-3 copy-button opacity-60 hover:opacity-100"
                    />

                    <div className={classNames(basis)}>{avatar}</div>
                    <div
                        className={classNames(
                            "px-1 pb-3 pt-2 [.docked_&]:px-0 [.docked_&]:py-3",
                        )}
                    >
                        <div className="font-semibold">{t(botName)}</div>
                        <div 
                            className="chat-message-bot relative break-words"
                            ref={el => {
                                if (el) {
                                    const images = el.getElementsByTagName('img');
                                    Array.from(images).forEach(img => {
                                        if (!img.complete) {
                                            img.addEventListener('load', () => handleMessageLoad(message.id));
                                        }
                                    });
                                }
                            }}
                        >
                            {message.payload}
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
                                        // Display the video
                                        return (
                                            <video
                                                onLoad={() => {
                                                    handleMessageLoad(
                                                        newMessage.id,
                                                    );
                                                }}
                                                key={`video-${index}-${index2}`}
                                                src={src}
                                                className="max-h-[20%] max-w-[60%] [.docked_&]:max-w-[90%] rounded border bg-white p-1 my-2 dark:border-neutral-700 dark:bg-neutral-800 shadow-lg dark:shadow-black/30"
                                                controls
                                            />
                                        );
                                    } else if (isAudioUrl(src)) {
                                        // Display the audio
                                        return (
                                            <audio
                                                onLoad={() => {
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
                                                className="max-h-[20%] max-w-[60%] [.docked_&]:max-w-[90%] rounded-md border bg-white p-1 my-2 dark:border-neutral-700 dark:bg-neutral-800 shadow-lg dark:shadow-black/30"
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
                                    <div className="border p-4 rounded-md bg-white animate-fade-in">
                                        <ProgressUpdate
                                            requestId={codeRequestId}
                                            setFinalData={
                                                setCodeRequestFinalData
                                            }
                                            initialText={
                                                "🤖 Agent coding in background..."
                                            }
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
