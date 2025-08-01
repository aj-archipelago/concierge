"use client";

import { useCallback, useContext, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Maximize2, Minimize2, Square } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { setChatBoxPosition } from "../../stores/chatSlice"; // Ensure you have this action in your slice
import ChatContent from "./ChatContent";
import config from "../../../config";
import { useRouter, usePathname } from "next/navigation";
import { AuthContext } from "../../App.js";
import { useGetActiveChat } from "../../../app/queries/chats"; // Add this import at the top
import { useEntities } from "../../hooks/useEntities";

function ChatBox() {
    const { user } = useContext(AuthContext);
    const { aiName } = user;

    const statePosition = useSelector((state) => state.chat?.chatBox?.position);
    const lastOpenPosition = useSelector(
        (state) => state.chat?.chatBox?.lastOpenPosition,
    );
    const dispatch = useDispatch();
    const dockedWidth = useSelector((state) => state?.chat?.chatBox?.width);
    const dockedWidthRef = useRef();
    dockedWidthRef.current = dockedWidth;
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);
    const router = useRouter();
    const pathname = usePathname(); // Get the current pathname
    const activeChat = useGetActiveChat()?.data;

    const { entities, defaultEntityId } = useEntities(aiName);
    const selectedEntityId = activeChat?.selectedEntityId || defaultEntityId;

    const updateChatBox = useCallback(
        (newPosition) => {
            dispatch(setChatBoxPosition(newPosition));
        },
        [dispatch],
    );

    const titleBarClick = () => {
        if (statePosition === "docked") {
            // updateChatBox({ position: 'full' })
        } else if (statePosition === "full") {
            updateChatBox({ position: "docked" });
        }
    };

    useEffect(() => {
        if (pathname === "/chat" || pathname.startsWith("/chat/")) {
            // Store the previous position before changing to 'full'
            if (statePosition !== "closed") {
                updateChatBox({ position: "closed" });
            }
        } else {
            // Restore to the last open position if it's different from current
            if (statePosition !== lastOpenPosition) {
                updateChatBox({ position: lastOpenPosition });
            }
        }
    }, [lastOpenPosition, pathname, statePosition, updateChatBox]);

    const Actions = () => {
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
                        <Minimize2
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "closed" });
                            }}
                        />
                        &nbsp;&nbsp;
                        <Maximize2
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
                        <Maximize2
                            onClick={(e) => {
                                e.stopPropagation();
                                const chatId = activeChat?._id;
                                router.push(
                                    chatId ? `/chat/${chatId}` : "/chat",
                                );
                            }}
                        />
                        <X
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
                        <Square
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "docked" });
                            }}
                        />
                        &nbsp;&nbsp;
                        <X
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
            <div className="chat-full-container bg-white dark:bg-gray-800">
                <div
                    className="chatbox-floating-title bg-sky-700 rounded-t"
                    onClick={titleBarClick}
                >
                    <div className="chatbox-floating-title-text">
                        {t("Chat")}
                    </div>
                    <Actions />
                </div>
                <ChatContent
                    entities={entities}
                    selectedEntityId={selectedEntityId}
                    entityIconSize="lg"
                />
            </div>
        );
    } else if (statePosition === "closed") {
        return (
            <div className="chatbox chatbox-floating rounded-t chatbox-floating-closed"></div>
        );
    } else {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-md border dark:border-gray-600 overflow-hidden h-full">
                <div
                    style={{ width: dockedWidth }}
                    className={`flex flex-col h-full chatbox chatbox-floating chatbox-floating-${statePosition} ${statePosition}`}
                >
                    <div
                        className="bg-zinc-100 dark:bg-gray-700 flex justify-between items-center p-3"
                        onClick={titleBarClick}
                    >
                        <div className="">
                            {`${t("Chat with")} ${t(aiName || config?.chat?.botName)}`}
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
                                entities={entities}
                                selectedEntityId={selectedEntityId}
                                entityIconSize="sm"
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

export default ChatBox;
