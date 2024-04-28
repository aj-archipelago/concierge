"use client";

import { useContext, useRef } from "react";
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
import { useRouter } from "next/navigation";

function ChatBox() {
    const statePosition = useSelector((state) => state.chat?.chatBox?.position);
    const dispatch = useDispatch();
    const dockedWidth = useSelector((state) => state?.chat?.chatBox?.width);
    const dockedWidthRef = useRef();
    dockedWidthRef.current = dockedWidth;
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);
    const router = useRouter();

    const updateChatBox = (newPosition) => {
        dispatch(setChatBoxPosition(newPosition));
    };

    const titleBarClick = () => {
        if (statePosition === "docked") {
            // updateChatBox({ position: 'full' })
        } else if (statePosition === "full") {
            updateChatBox({ position: "docked" });
        }
    };

    const Actions = () => {
        const lastOpenPosition = useSelector(
            (state) => state.chat?.chatBox?.lastOpenPosition,
        );
        switch (statePosition) {
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
                        <FaWindowMaximize
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push("/chat");
                            }}
                        />
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

    if (statePosition === "full") {
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
    } else if (statePosition === "closed") {
        return (
            <div className="chatbox chatbox-floating chatbox-floating-closed"></div>
        );
    } else {
        return (
            <div className="bg-white rounded border dark:border-gray-300 overflow-hidden h-full">
                <div
                    style={{ width: dockedWidth }}
                    className={`flex flex-col h-full chatbox chatbox-floating chatbox-floating-${statePosition} ${statePosition}`}
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
                    {statePosition !== "closed" && (
                        <div className="grow p-3 overflow-auto">
                            <ChatContent
                                displayState={statePosition}
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
