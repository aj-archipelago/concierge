"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    X,
    Maximize2,
    Minimize2,
    Square,
    Microscope,
    Trash2,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { setChatBoxPosition } from "../../stores/chatSlice"; // Ensure you have this action in your slice
import ChatContent from "./ChatContent";
import config from "../../../config";
import { useRouter, usePathname } from "next/navigation";
import { AuthContext } from "../../App.js";
import { useGetActiveChat, useUpdateChat } from "../../../app/queries/chats"; // Add this import at the top
import { useEntities } from "../../hooks/useEntities";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef(null);
    const MIN_WIDTH = 200;
    const MAX_WIDTH = 600; // Double the default 300px
    const { t } = useTranslation();
    const { language, direction } = useContext(LanguageContext);
    const router = useRouter();
    const pathname = usePathname(); // Get the current pathname
    const activeChat = useGetActiveChat()?.data;

    const { entities, defaultEntityId } = useEntities(aiName);
    const selectedEntityId = activeChat?.selectedEntityId || defaultEntityId;
    const updateChatHook = useUpdateChat();
    const [isResearchMode, setIsResearchMode] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    useEffect(() => {
        if (activeChat?.researchMode !== undefined) {
            setIsResearchMode(activeChat.researchMode);
        }
    }, [activeChat?.researchMode]);

    const toggleResearchMode = () => {
        const newMode = !isResearchMode;
        setIsResearchMode(newMode);
        if (activeChat?._id) {
            updateChatHook.mutate({
                chatId: activeChat._id,
                researchMode: newMode,
            });
        }
    };

    const handleClearChat = () => {
        if (activeChat?._id) {
            updateChatHook.mutate({
                chatId: activeChat._id,
                messages: [],
                title: "",
            });
        }
        setShowClearConfirm(false);
    };

    const handleResizeStart = useCallback(
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
            resizeRef.current = {
                startX: e.clientX,
                startWidth: dockedWidth || 300,
            };
        },
        [dockedWidth],
    );

    const handleResizeMove = useCallback(
        (e) => {
            if (!isResizing || !resizeRef.current) return;

            // In LTR: dragging left (decreasing clientX) increases width
            // In RTL: dragging right (increasing clientX) increases width
            const deltaX =
                direction === "rtl"
                    ? e.clientX - resizeRef.current.startX
                    : resizeRef.current.startX - e.clientX;

            const newWidth = Math.max(
                MIN_WIDTH,
                Math.min(MAX_WIDTH, resizeRef.current.startWidth + deltaX),
            );

            dispatch(setChatBoxPosition({ width: newWidth }));
        },
        [isResizing, dispatch, direction],
    );

    const handleResizeEnd = useCallback(() => {
        setIsResizing(false);
        resizeRef.current = null;
    }, []);

    useEffect(() => {
        if (isResizing) {
            document.addEventListener("mousemove", handleResizeMove);
            document.addEventListener("mouseup", handleResizeEnd);
            document.body.style.cursor = "ew-resize";
            document.body.style.userSelect = "none";

            return () => {
                document.removeEventListener("mousemove", handleResizeMove);
                document.removeEventListener("mouseup", handleResizeEnd);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
            };
        }
    }, [isResizing, handleResizeMove, handleResizeEnd]);

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
                            className="cursor-pointer"
                        />
                        &nbsp;&nbsp;
                        <Maximize2
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "docked" });
                            }}
                            className="cursor-pointer"
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
                            className="cursor-pointer"
                        />
                        <X
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "closed" });
                            }}
                            className="cursor-pointer"
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
                            className="cursor-pointer"
                        />
                        &nbsp;&nbsp;
                        <X
                            onClick={(e) => {
                                e.stopPropagation();
                                updateChatBox({ position: "closed" });
                            }}
                            className="cursor-pointer"
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
            <div
                className="bg-white dark:bg-gray-800 rounded-md border dark:border-gray-600 overflow-hidden h-full relative"
                style={{
                    width: statePosition === "docked" ? dockedWidth : undefined,
                    minWidth:
                        statePosition === "docked" ? MIN_WIDTH : undefined,
                    maxWidth:
                        statePosition === "docked" ? MAX_WIDTH : undefined,
                }}
            >
                {statePosition === "docked" && (
                    <div
                        className={`absolute top-0 bottom-0 w-1 cursor-ew-resize hover:bg-sky-500 dark:hover:bg-sky-400 z-10 transition-colors ${
                            direction === "rtl" ? "right-0" : "left-0"
                        }`}
                        onMouseDown={handleResizeStart}
                        style={{ cursor: "ew-resize" }}
                    />
                )}
                <div
                    className={`flex flex-col h-full chatbox chatbox-floating chatbox-floating-${statePosition} ${statePosition}`}
                >
                    <div
                        className="bg-zinc-100 dark:bg-gray-700 flex justify-between items-center p-3"
                        onClick={titleBarClick}
                    >
                        <div className="flex items-center gap-2">
                            <Microscope
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleResearchMode();
                                }}
                                className={`cursor-pointer ${
                                    isResearchMode
                                        ? "text-sky-600 dark:text-sky-400"
                                        : ""
                                }`}
                                title={t("Toggle Research Mode")}
                            />
                            <div className="">
                                {`${t("Chat with")} ${t(aiName || config?.chat?.botName)}`}
                            </div>
                        </div>
                        <div className="flex gap-1 items-center">
                            <Trash2
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (activeChat?.messages?.length) {
                                        setShowClearConfirm(true);
                                    }
                                }}
                                className={
                                    activeChat?.messages?.length
                                        ? "cursor-pointer"
                                        : "cursor-not-allowed opacity-50"
                                }
                                title={t("Clear chat")}
                            />
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
                <AlertDialog
                    open={showClearConfirm}
                    onOpenChange={setShowClearConfirm}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t("Clear Chat?")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {t(
                                    "Are you sure you want to clear this chat? This action cannot be undone.",
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                                autoFocus
                                onClick={handleClearChat}
                            >
                                {t("Clear")}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        );
    }
}

export default ChatBox;
