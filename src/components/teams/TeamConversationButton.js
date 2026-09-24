"use client";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSetActiveChatId } from "../../../app/queries/chats";
import { setChatBoxPosition, focusChatInput } from "../../stores/chatSlice";

export default function TeamConversationButton({
    chatId,
    label,
    compact = false,
    className = "",
}) {
    const activate = useSetActiveChatId();
    const dispatch = useDispatch();
    const router = useRouter();
    const { t } = useTranslation();
    const [failed, setFailed] = useState(false);
    if (!chatId) return null;
    return (
        <span className="inline-flex flex-col items-start gap-1">
            <button
                type="button"
                title={label || t("teams.openConversation")}
                aria-label={label || t("teams.openConversation")}
                disabled={activate.isPending}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-60 dark:bg-sky-500 dark:text-gray-950 dark:hover:bg-sky-400 ${className}`}
                onClick={async () => {
                    setFailed(false);
                    try {
                        await activate.mutateAsync(chatId);
                        if (
                            window.matchMedia?.("(max-width: 639px)")?.matches
                        ) {
                            router.push(`/chat/${chatId}`);
                            return;
                        }
                        dispatch(setChatBoxPosition({ position: "docked" }));
                        dispatch(focusChatInput());
                    } catch {
                        setFailed(true);
                    }
                }}
            >
                {activate.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                    <MessageCircle className="h-4 w-4" />
                )}
                <span className={compact ? "hidden sm:inline" : undefined}>
                    {label || t("teams.openConversation")}
                </span>
            </button>
            {failed && (
                <span
                    role="alert"
                    className="text-xs text-red-700 dark:text-red-300"
                >
                    {t("teams.chatOpenError")}
                </span>
            )}
        </span>
    );
}
