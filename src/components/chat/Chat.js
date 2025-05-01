"use client";

import { useTranslation } from "react-i18next";
import ChatContent from "./ChatContent";
import dynamic from "next/dynamic";
import {
    useUpdateActiveChat,
    useGetActiveChat,
} from "../../../app/queries/chats";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"), {
    loading: () => <div style={{ width: "80px", height: "20px" }}></div>,
});

function Chat({ viewingChat = null }) {
    const { t } = useTranslation();
    const updateActiveChat = useUpdateActiveChat();
    const { data: chat } = useGetActiveChat();
    const { readOnly } = viewingChat || {};
    const publicChatOwner = viewingChat?.owner;

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

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between">
                <ChatTopMenuDynamic />
                {publicChatOwner && (
                    <div className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded shadow-sm">
                        {t("Shared by")}{" "}
                        <span className="font-bold text-blue-600">
                            {publicChatOwner.name || publicChatOwner.username}
                        </span>
                    </div>
                )}
                <div className="flex gap-2">
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
                                updateActiveChat.mutateAsync({
                                    messages: [],
                                    title: "",
                                });
                            }
                        }}
                    >
                        {t("Clear this chat")}
                    </button>
                </div>
            </div>
            <div className="grow overflow-auto">
                <ChatContent viewingChat={viewingChat} />
            </div>
        </div>
    );
}

export default Chat;
