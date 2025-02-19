import React, { useEffect, useRef, useState } from "react";
import { convertMessageToMarkdown } from "./ChatMessage";
import { AiOutlineRobot } from "react-icons/ai";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import Loader from "../../../app/components/loader";

const StreamingMessage = React.memo(({ content, bot, aiName }) => {
    const messageRef = useRef(null);
    const contentRef = useRef(null);
    const [loaderPosition, setLoaderPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (messageRef.current) {
            messageRef.current.scrollIntoView({
                behavior: "smooth",
                block: "end",
            });
        }

        // Calculate the position of the loader based on the last character
        if (contentRef.current) {
            const range = document.createRange();
            const contentNode = contentRef.current;

            // Get all text nodes
            const walker = document.createTreeWalker(
                contentNode,
                NodeFilter.SHOW_TEXT,
                null,
                false,
            );

            let lastTextNode = null;
            while (walker.nextNode()) {
                lastTextNode = walker.currentNode;
            }

            if (lastTextNode) {
                range.setStart(lastTextNode, lastTextNode.length);
                range.setEnd(lastTextNode, lastTextNode.length);

                const rect = range.getBoundingClientRect();
                const contentRect = contentNode.getBoundingClientRect();

                setLoaderPosition({
                    x: rect.right - contentRect.left + 4,
                    y: rect.top - contentRect.top,
                });
            }
        }
    }, [content]);

    const { t } = useTranslation();
    const { language } = i18next;
    const { getLogo } = config.global;

    let rowHeight = "h-12 [.docked_&]:h-10";
    let basis =
        "min-w-[3rem] basis-12 [.docked_&]:basis-10 [.docked_&]:min-w-[2.5rem]";
    let buttonWidthClass = "w-12 [.docked_&]:w-10";
    const botName =
        bot === "code"
            ? config?.code?.botName
            : aiName || config?.chat?.botName;

    const avatar =
        bot === "code" ? (
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
            ref={messageRef}
            className="flex bg-sky-50 ps-1 pt-1 relative group"
        >
            <div className={classNames(basis)}>{avatar}</div>
            <div
                className={classNames(
                    "px-1 pb-3 pt-2 [.docked_&]:px-0 [.docked_&]:py-3 w-full",
                )}
            >
                <div className="flex flex-col">
                    <div className="font-semibold text-gray-900">
                        {t(botName)}
                    </div>
                    <div
                        ref={contentRef}
                        className="chat-message-bot relative break-words text-gray-800"
                    >
                        {convertMessageToMarkdown({
                            payload: content,
                            sender: "labeeb",
                        })}
                        <div className="pointer-events-none absolute top-0 left-0 w-full h-full">
                            <div
                                className="absolute"
                                style={{
                                    transform: `translate(${loaderPosition.x}px, ${loaderPosition.y}px)`,
                                    transition: "transform 0.1s ease-out",
                                }}
                            >
                                <Loader size="small" delay={0} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

StreamingMessage.displayName = "StreamingMessage";

export default StreamingMessage;
