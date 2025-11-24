"use client";
import React from "react";
import { useTranslation } from "react-i18next";
import { getFileUrl, getFilename } from "./memoryFilesUtils";
import { useFilePreview, renderFilePreview } from "@/src/components/chat/useFilePreview";

export default function HoverPreview({ file }) {
    if (!file) return null;

    const url = getFileUrl(file);
    const filename = getFilename(file);
    const mimeType = file?.mimeType;

    if (!url) return null;

    // Use shared file preview logic
    const fileType = useFilePreview(url, filename, mimeType);

    const { t } = useTranslation();
    
    // Render preview using shared logic (with autoplay for videos in hover preview)
    const preview = renderFilePreview({
        src: url,
        filename,
        fileType,
        className: fileType.isPdf || fileType.isDoc
            ? "w-full h-full rounded border-none"
            : "max-w-full max-h-full object-contain rounded",
        autoPlay: fileType.isVideo, // Autoplay videos in hover preview
        t,
    });

    return (
        <div className="hidden sm:flex fixed z-[100] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden items-center justify-center p-2">
            {preview || (
                <div className="text-gray-500 dark:text-gray-400 text-center p-4">
                    No preview available
                </div>
            )}
        </div>
    );
}
