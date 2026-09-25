"use client";
import { useTranslation } from "react-i18next";

export default function TaskRunWaiting({ run }) {
    const { t } = useTranslation();
    if (run?.status !== "waiting") return null;
    return (
        <div
            role="status"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-start text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
            <p className="font-medium">{t("colleagues.runStatus.waiting")}</p>
            <p className="mt-1 text-sm">{t("colleagues.waitingForReplies")}</p>
            <a
                href="/notifications"
                className="mt-2 inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4"
            >
                {t("colleagues.openQuestions")}
            </a>
        </div>
    );
}
