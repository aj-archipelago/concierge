import i18next from "i18next";
import React from "react";
import { useTranslation } from "react-i18next";
import { AiOutlineRobot } from "react-icons/ai";
import { FaUser } from "react-icons/fa";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import { highlightCode } from "./ChatMessage";
import ScrollToBottom from "./ScrollToBottom";

// Displays the list of messages and a message input box.
function MessageList({ messages, bot, size = "docked" }) {
    const { language } = i18next;
    const { getLogo } = config.global;
    const { t } = useTranslation();

    let rowHeight = size === "full" ? "h-12" : "h-10";
    let basis = size === "full" ? "basis-12" : "basis-10";
    let buttonWidthClass = size === "full" ? "w-[50px]" : "w-10";

    const renderMessage = (message) => {
        let avatar = (
            <img
                src={getLogo(language)}
                alt="Logo"
                className={classNames(rowHeight, basis, "p-2")}
            />
        );

        if (bot === "code") {
            avatar = (
                <AiOutlineRobot
                    className={classNames(
                        rowHeight,
                        buttonWidthClass,
                        "p-2 mt-1",
                        "text-gray-400",
                    )}
                />
            );
        }

        if (message.sender === "labeeb") {
            return (
                <div
                    key={message.id}
                    className="flex border-b dark:border-gray-200 bg-sky-50"
                >
                    <div
                        className={classNames(
                            basis,
                            size === "full" ? "py-3" : "",
                        )}
                    >
                        {avatar}
                    </div>
                    <div
                        className={classNames(
                            size === "full" ? "px-3 py-5" : "py-2 ps-1 pe-2",
                            "flex items-center flex-1",
                        )}
                    >
                        <div>{message.payload}</div>
                    </div>
                </div>
            );
        } else {
            avatar = (
                <FaUser
                    className={classNames(
                        rowHeight,
                        buttonWidthClass,
                        "p-3",
                        "text-gray-300",
                    )}
                />
            );
            return (
                <div
                    key={message.id}
                    className="flex border-b dark:border-gray-200"
                >
                    <div
                        className={classNames(
                            basis,
                            size === "full" ? "py-3" : "",
                        )}
                    >
                        {avatar}
                    </div>
                    <div
                        className={classNames(
                            size === "full" ? "px-3 py-5" : "py-2",
                            "flex items-center",
                        )}
                    >
                        <div>{message.payload}</div>
                    </div>
                </div>
            );
        }
    };

    return (
        <>
            <ScrollToBottom>
                {messages.length === 0 && (
                    <div className="no-message-message">
                        {t("Send a message to start a conversation")}
                    </div>
                )}
                {messages.map((message, index) => {
                    // post process the message and create a new
                    // message object with the updated payload.
                    message = Object.assign({}, message, {
                        payload: (
                            <React.Fragment key={`inner-${message.id}`}>
                                {highlightCode(message.payload, "pre")}
                            </React.Fragment>
                        ),
                    });

                    return renderMessage(message);
                })}
            </ScrollToBottom>
        </>
    );
}

export default MessageList;
