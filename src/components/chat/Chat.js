"use client";

import { useTranslation } from "react-i18next";
import ChatContent from "./ChatContent";
import dynamic from "next/dynamic";
import {
    useUpdateActiveChat,
    useGetActiveChat,
} from "../../../app/queries/chats";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"));

function Chat() {
    const { t } = useTranslation();
    const updateActiveChat = useUpdateActiveChat();
    const { data: chat } = useGetActiveChat();
    const { readOnly } = chat || {};

    const handleShareOrCopy = async () => {
        const shareUrl = `${window.location.origin}/chat/${chat._id}`;

        if (chat?.isPublic) {
            await navigator.clipboard.writeText(shareUrl);
            alert(t("Share URL copied to clipboard!"));
        } else {
            if (window.confirm(t("Make this chat public?"))) {
                await updateActiveChat.mutateAsync({ isPublic: true });
                await navigator.clipboard.writeText(shareUrl);
                alert(t("Chat made public. Share URL copied to clipboard!"));
            }
        }
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between">
                <ChatTopMenuDynamic />
                {!readOnly && (
                    <div className="flex gap-2">
                        <button
                            className={`lb-sm lb-outline ${chat?.isPublic ? "" : "lb-primary"}`}
                            onClick={handleShareOrCopy}
                        >
                            {chat?.isPublic ? t("Copy Share URL") : t("Share")}
                        </button>
                        <button
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
                )}
            </div>
            <div className="grow overflow-auto">
                <ChatContent />
            </div>
        </div>
    );
}

export default Chat;
