"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FaWindowClose,
    FaWindowMaximize,
    FaWindowMinimize,
    FaWindowRestore,
} from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { setChatBoxPosition } from "../../stores/chatSlice";
import ChatContent from "./ChatContent";
import config from "../../../config";

function ChatBox() {
    const statePosition = useSelector((state) => state.chat?.chatBox?.position);
    const [position, setPosition] = useState("closed");
    const dispatch = useDispatch();
    // let location = useLocation();
    const dockedWidth = useSelector((state) => state?.chat?.chatBox?.width);
    const dockedWidthRef = useRef();
    dockedWidthRef.current = dockedWidth;
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);

    useEffect(() => {
        setPosition(statePosition);
    }, [statePosition]);

    const updateChatBox = (newPosition) => {
        dispatch(setChatBoxPosition(newPosition));
    };

    const titleBarClick = () => {
        if (position === "docked") {
            // updateChatBox({ position: 'full' })
        } else if (position === "full") {
            updateChatBox({ position: "docked" });
        }
    };

    const Actions = () => {
        const lastOpenPosition = useSelector(
            (state) => state.chat?.chatBox?.lastOpenPosition,
        );
        switch (position) {
            case "closed":
                return (
                    <>
                        <button
                            className="border"
                            onClick={() =>
                                updateChatBox({
                                    position: lastOpenPosition || "docked",
                                })
                            }
                        >
                            <img
                                className="m-0"
                                src={config?.global?.getLogo(language)}
                                alt={config?.global?.siteTitle}
                            />
                            <br></br>
                            {t("CHAT")}
                        </button>
                    </>
                );
            case "opened":
                return (
                    <>
                        <FaWindowMinimize
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "closed" });
                            }}
                        />
                        &nbsp;&nbsp;
                        <FaWindowMaximize
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "docked" });
                            }}
                        />
                    </>
                );
            case "docked":
                return (
                    <>
                        {/* <FaWindowMaximize onClick={(e) => { e.stopPropagation(); updateChatBox({ position: 'full' }) }} />&nbsp;&nbsp; */}
                        <FaWindowClose
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "closed" });
                            }}
                        />
                    </>
                );
            case "full":
                return (
                    <>
                        <FaWindowRestore
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "docked" });
                            }}
                        />
                        &nbsp;&nbsp;
                        <FaWindowClose
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "closed" });
                            }}
                        />
                    </>
                );
            default:
                return null;
        }
    };

    // const mouseDownHandler = (e) => {
    //     const startPosition = e.pageX;
    //     const startSize = document.querySelector('.message-list-container').clientWidth;

    //     const mouseMoveHandler = e => {
    //         const newPosition = language === 'ar' ?
    //             startSize - startPosition + e.pageX :
    //             startSize + startPosition - e.pageX;
    //         let newWidth = Math.min(newPosition, document.body.clientWidth);
    //         newWidth = Math.max(200, newWidth);
    //         updateChatBox({ position: 'docked', width: newWidth });
    //     }

    //     const mouseUpHandler = e => {
    //         document.removeEventListener("mousemove", mouseMoveHandler, false);
    //     }

    //     document.addEventListener("mouseup", mouseUpHandler, { once: true });

    //     const rect = e.target.getBoundingClientRect()
    //     const start = language === 'ar' ? rect.right : rect.left;
    //     if (e.pageX <= start + 5 && e.pageX >= start - 5) {
    //         document.addEventListener("mousemove", mouseMoveHandler, false);
    //     }
    // }

    if (position === "full") {
        return (
            <div className="chat-full-container bg-white">
                <div
                    className="chatbox-floating-title bg-sky-700"
                    onClick={titleBarClick}
                >
                    <div className="chatbox-floating-title-text">
                        {t("Chat")}
                    </div>
                    <Actions />
                </div>
                <ChatContent />
            </div>
        );
    } else if (position === "closed") {
        return (
            <div className="chatbox chatbox-floating chatbox-floating-closed"></div>
        );
    } else {
        return (
            <div className="bg-white rounded border dark:border-gray-300 overflow-hidden">
                <div
                    style={{ width: dockedWidth }}
                    className={`d-md-block chatbox chatbox-floating chatbox-floating-${position}`}
                >
                    <div
                        className="bg-zinc-100 flex justify-between items-center p-3"
                        onClick={titleBarClick}
                    >
                        <div className="">
                            {t(`Chat with ${config?.chat?.botName}`)}
                        </div>
                        <div className="flex gap-1 items-center">
                            <Actions />
                        </div>
                    </div>
                    {position !== "closed" && (
                        <div className="message-list-container">
                            <ChatContent
                                displayState={position}
                                container={"chatbox"}
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

export default ChatBox;
