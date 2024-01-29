import i18next from "i18next";
import React from "react";
import { useTranslation } from "react-i18next";
import { AiOutlineRobot } from "react-icons/ai";
import { FaUserCircle } from "react-icons/fa";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import { highlightCode } from "./ChatMessage";
import ScrollToBottom from "./ScrollToBottom";
import PageLoader from "next/dist/client/page-loader";
import Loader from "../../../app/components/loader";

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
                <div key={message.id} className="flex bg-sky-50 rounded">
                    <div className={classNames(basis)}>{avatar}</div>
                    <div
                        className={classNames(
                            "px-1 py-3 [.docked_&]:px-0 [.docked_&]:py-3",
                        )}
                    >
                        <div className="font-semibold">{botName}</div>
                        <div>{message.payload}</div>
                    </div>
                </div>
            );
        } else {
            avatar = (
                <FaUserCircle
                    className={classNames(
                        rowHeight,
                        buttonWidthClass,
                        "p-3",
                        "text-gray-300",
                    )}
                />
            );
            return (
                <div key={message.id} className="flex">
                    <div className={classNames(basis, "py-0")}>{avatar}</div>
                    <div
                        className={classNames(
                            "px-1 py-3 [.docked_&]:px-0 [.docked_&]:py-3",
                        )}
                    >
                        <div className="font-semibold">You</div>
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
                    <div className="no-message-message text-gray-400">
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
