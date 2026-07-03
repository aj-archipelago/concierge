"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useAddChat } from "../../../app/queries/chats";
import { openCanvasArticleInChat } from "@/src/utils/openCanvasArticle";

export default function ArticleSharedRoutePage({ articleId }) {
    const { t } = useTranslation();
    const router = useRouter();
    const dispatch = useDispatch();
    const addChat = useAddChat();
    const openedRef = useRef(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!articleId || openedRef.current) return;
        openedRef.current = true;

        openCanvasArticleInChat({
            articleId,
            addChat,
            dispatch,
            router,
            t,
        }).catch((err) => {
            console.error("Error opening shared article:", err);
            setError(err);
        });
    }, [articleId, addChat, dispatch, router, t]);

    if (error) {
        return (
            <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {t("Article not found")}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t(
                        "This article may have been deleted, or you may not have access to it.",
                    )}
                </p>
                <a
                    href="/chat"
                    className="inline-flex items-center gap-2 text-sm text-sky-600 hover:underline dark:text-sky-400"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t("Back to chat")}
                </a>
            </div>
        );
    }

    return (
        <div className="flex min-h-[50vh] items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t("Opening article...")}
            </div>
        </div>
    );
}
