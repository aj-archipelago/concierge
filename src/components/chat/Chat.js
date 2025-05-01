"use client";

import { useTranslation } from "react-i18next";
import ChatContent from "./ChatContent";
import dynamic from "next/dynamic";
import {
    useUpdateActiveChat,
    useGetActiveChat,
} from "../../../app/queries/chats";
import { useContext, useState, useEffect } from "react";
import { AuthContext } from "../../App";
import { FaPlus, FaTimes, FaCommentDots } from "react-icons/fa";
import { predefinedEntities } from "../../config/entities";
import EntityIcon from "./EntityIcon";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import config from "../../../config";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"), {
    loading: () => <div style={{ width: "80px", height: "20px" }}></div>,
});

function Chat({ viewingChat = null }) {
    const { t } = useTranslation();
    const updateActiveChat = useUpdateActiveChat();
    const { data: chat } = useGetActiveChat();
    const activeChatId = chat?._id;
    const { user } = useContext(AuthContext);
    const { readOnly } = viewingChat || {};
    const publicChatOwner = viewingChat?.owner;
    const [selectedEntityId, setSelectedEntityId] = useState(
        chat?.selectedEntityId || "",
    );

    // Sync local state with fetched chat data
    useEffect(() => {
        const entityIdFromChat = chat?.selectedEntityId || "";
        if (entityIdFromChat !== selectedEntityId) {
            setSelectedEntityId(entityIdFromChat);
        }
    }, [chat?.selectedEntityId]); // Dependency: run only when fetched entityId changes

    const handleShareOrCopy = async () => {
        const shareUrl = `${window.location.origin}/chat/${chat._id}`;

        if (chat?.isPublic) {
            await navigator.clipboard.writeText(shareUrl);
            alert(t("Share URL copied to clipboard!"));
        } else {
            if (window.confirm(t("Make this chat public?"))) {
                await updateActiveChat.mutateAsync({ isPublic: true });
                document.body.focus(); // Refocus the document
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await navigator.clipboard.writeText(shareUrl);
                alert(t("Chat made public. Share URL copied to clipboard!"));
            }
        }
    };

    const defaultAiName = user?.aiName || "Labeeb";

    const handleEntityChange = (value) => {
        const newEntityId = value === defaultAiName ? "" : value;
        setSelectedEntityId(newEntityId);
        if (activeChatId) {
            updateActiveChat.mutate({
                chatId: activeChatId,
                selectedEntityId: newEntityId,
            });
        }
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between items-center">
                <ChatTopMenuDynamic />
                {publicChatOwner && (
                    <div className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded shadow-sm">
                        {t("Shared by")}{" "}
                        <span className="font-bold text-blue-600">
                            {publicChatOwner.name || publicChatOwner.username}
                        </span>
                    </div>
                )}
                <div className="flex gap-2 items-center">
                    <Select
                        value={selectedEntityId || defaultAiName}
                        onValueChange={handleEntityChange}
                        disabled={readOnly}
                    >
                        <SelectTrigger
                            className={`w-auto text-sm h-7 lb-outline ${readOnly ? "cursor-not-allowed opacity-50" : ""}`}
                            aria-label={t("Select Speaker")}
                        >
                            <SelectValue placeholder={t("Select Speaker")} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem
                                className="text-sm"
                                value={defaultAiName}
                            >
                                {t(defaultAiName)}
                            </SelectItem>
                            {predefinedEntities.map((entity) => (
                                <SelectItem
                                    className="text-sm"
                                    key={entity.id}
                                    value={entity.id}
                                >
                                    {t(entity.name)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <button
                        disabled={readOnly}
                        className={`lb-sm lb-outline ${chat?.isPublic ? "" : "lb-primary"}`}
                        onClick={handleShareOrCopy}
                    >
                        {chat?.isPublic ? t("Copy Share URL") : t("Share")}
                    </button>
                    <button
                        disabled={readOnly}
                        className="lb-outline-secondary lb-sm"
                        size="sm"
                        onClick={() => {
                            if (window.confirm(t("Are you sure?"))) {
                                if (activeChatId) {
                                    updateActiveChat.mutate({
                                        chatId: activeChatId,
                                        messages: [],
                                        title: "",
                                    });
                                }
                            }
                        }}
                    >
                        {t("Clear this chat")}
                    </button>
                </div>
            </div>
            <div className="grow overflow-auto">
                <ChatContent
                    viewingChat={viewingChat}
                    streamingEnabled={user.streamingEnabled}
                    selectedEntityId={selectedEntityId}
                />
            </div>
        </div>
    );
}

export default Chat;
