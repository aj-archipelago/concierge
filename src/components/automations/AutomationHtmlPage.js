"use client";

import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import AutomationHtmlFrame, { automationHtmlSrc } from "./AutomationHtmlFrame";

export default function AutomationHtmlPage({ automationId, taskId }) {
    const { t } = useTranslation();
    const src = automationHtmlSrc(automationId, taskId);

    return (
        <div className="flex h-full min-h-[calc(100vh-4rem)] flex-col bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
                <a
                    href="/automations"
                    className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t("Back to automations")}
                </a>
                <a
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-sky-600 dark:text-sky-400 hover:underline"
                >
                    {t("Open HTML in new tab")}
                </a>
            </div>
            <AutomationHtmlFrame
                automationId={automationId}
                taskId={taskId}
                className="min-h-0 flex-1"
            />
        </div>
    );
}
