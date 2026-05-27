"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import {
    useFilePreview,
    renderFilePreview,
} from "@/src/components/chat/useFilePreview";

export default function FilePreviewTabContent({ initialContent, isActive }) {
    const { t } = useTranslation();

    const url = initialContent?.url || null;
    const filename =
        initialContent?.filename || initialContent?.title || "file";
    const mimeType = initialContent?.mimeType || "";
    const title = initialContent?.title || filename;
    const inlineContent = initialContent?.content ?? null;
    const fileType = useFilePreview(url, filename, mimeType);

    const preview = renderFilePreview({
        src: url,
        filename,
        fileType,
        className: "w-full h-full",
        t,
        inlineContent,
        isActive,
    });

    if (!preview) {
        return null;
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <div className="px-4 py-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                        {title}
                    </p>
                </div>
                <div className="px-4 py-2 flex items-center gap-2 min-h-[32px] border-t border-gray-200/60 dark:border-gray-700/60 bg-white/50 dark:bg-gray-800/50">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {t(fileType.previewLabel) || fileType.previewLabel}
                    </span>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">{preview}</div>
        </div>
    );
}
