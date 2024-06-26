import i18next from "i18next";
import React from "react";
import { useTranslation } from "react-i18next";
import { AiFillFilePdf, AiOutlineRobot } from "react-icons/ai";
import { FaUserCircle } from "react-icons/fa";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import { convertMessageToMarkdown } from "./ChatMessage";
import ScrollToBottom from "./ScrollToBottom";
import Loader from "../../../app/components/loader";
import { isVideoUrl } from "./MyFilePond";

// Displays the list of messages and a message input box.
function MessageList({ messages, bot, loading }) {
    const { language } = i18next;
    const { getLogo } = config.global;
    const { t } = useTranslation();

    let rowHeight = "h-12 [.docked_&]:h-10";
    let basis =
        "min-w-[3rem] basis-12 [.docked_&]:basis-10 [.docked_&]:min-w-[2.5rem]";
    let buttonWidthClass = "w-12 [.docked_&]:w-10";
    const botName =
        bot === "code" ? config?.code?.botName : config?.chat?.botName;

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
                    className="flex bg-sky-50 rounded ps-1 pt-1"
                >
                    <div className={classNames(basis)}>{avatar}</div>
                    <div
                        className={classNames(
                            "px-1 py-3 [.docked_&]:px-0 [.docked_&]:py-3",
                        )}
                    >
                        <div className="font-semibold">{t(botName)}</div>
                        <div className="chat-message-bot">
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
                <div key={message.id} className="flex ps-1 pt-1">
                    <div className={classNames(basis, "py-0")}>{avatar}</div>
                    <div
                        className={classNames(
                            "px-1 py-3 [.docked_&]:px-0 [.docked_&]:py-3",
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

    return (
        <>
            <ScrollToBottom>
                {messages.length === 0 && (
                    <div className="no-message-message text-gray-400">
                        {t("Send a message to start a conversation")}
                    </div>
                )}
                {messages.map((message, index) => {
                    let display;
                    if (Array.isArray(message.payload)) {
                        const arr = message.payload.map((t) => {
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
                                                key={index}
                                                src={src}
                                                className="max-h-[20%] max-w-[60%] rounded border bg-white p-1 my-2 dark:border-neutral-700 dark:bg-neutral-800 shadow-lg dark:shadow-black/30"
                                                controls
                                            />
                                        );
                                    }

                                    if (src.endsWith(".pdf")) {
                                        // Display the PDF icon
                                        const filenameWithPrefix = src
                                            .split("/")
                                            .pop();
                                        const filename = filenameWithPrefix
                                            .split("_")
                                            .slice(1)
                                            .join("_");
                                        return (
                                            <div
                                                key={index}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    marginTop: "10px",
                                                }}
                                            >
                                                <AiFillFilePdf
                                                    size={40}
                                                    style={{
                                                        marginRight: "8px",
                                                    }}
                                                />
                                                <i>{filename}</i>
                                            </div>
                                        );
                                    }

                                    // Display the image
                                    return (
                                        <div key={index}>
                                            <img
                                                src={src}
                                                alt="uploadedimage"
                                                className="max-h-[20%] max-w-[60%] rounded border bg-white p-1 my-2 dark:border-neutral-700 dark:bg-neutral-800 shadow-lg dark:shadow-black/30"
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
                        display = message.payload;
                    }

                    // process the message and create a new
                    // message object with the updated payload.
                    message = Object.assign({}, message, {
                        payload: (
                            <React.Fragment key={`inner-${message.id}`}>
                                {message.sender === "labeeb" ? (
                                    convertMessageToMarkdown(message)
                                ) : (
                                    <div key={`um-${index}`}>{display}</div>
                                )}
                            </React.Fragment>
                        ),
                    });

                    return <div key={message.id}>{renderMessage(message)}</div>;
                })}
                {loading &&
                    renderMessage({
                        id: "loading",
                        sender: "labeeb",
                        payload: <Loader />,
                    })}
            </ScrollToBottom>
        </>
    );
}

export default MessageList;
