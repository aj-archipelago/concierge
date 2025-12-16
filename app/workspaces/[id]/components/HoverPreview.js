"use client";
import React from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { getFileUrl, getFilename } from "./memoryFilesUtils";
import {
    useFilePreview,
    renderFilePreview,
} from "@/src/components/chat/useFilePreview";
import {
    isYoutubeUrl,
    extractYoutubeVideoId,
    getYoutubeThumbnailUrl,
} from "@/src/utils/urlUtils";

export default function HoverPreview({ file }) {
    // Hooks must be called unconditionally before any early returns
    const { t } = useTranslation();
    const isRtl = i18next.language === "ar";

    const url = file ? getFileUrl(file) : null;
    const filename = file ? getFilename(file) : null;
    const mimeType = file?.mimeType;

    // Check if URL is YouTube
    const isYouTube = url ? isYoutubeUrl(url) : false;
    const youtubeVideoId = isYouTube && url ? extractYoutubeVideoId(url) : null;
    const youtubeThumbnail = youtubeVideoId
        ? getYoutubeThumbnailUrl(youtubeVideoId, "maxresdefault")
        : null;

    // Use shared file preview logic (hooks must be called unconditionally)
    const fileType = useFilePreview(url, filename, mimeType);

    if (!file) return null;
    if (!url) return null;

    // Render preview - show YouTube thumbnail in hover preview
    let preview = null;
    if (isYouTube && youtubeThumbnail) {
        preview = (
            <div className="relative w-full h-full">
                <img
                    src={youtubeThumbnail}
                    alt={filename || t("YouTube video")}
                    className="w-full h-full object-cover rounded"
                    onError={(e) => {
                        // Fallback to lower quality thumbnail
                        if (youtubeVideoId) {
                            e.target.src = getYoutubeThumbnailUrl(
                                youtubeVideoId,
                                "hqdefault",
                            );
                        }
                    }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
                    <svg
                        className="w-12 h-12 text-white opacity-90"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </div>
            </div>
        );
    } else {
        // Render preview using shared logic (with autoplay for videos in hover preview)
        preview = renderFilePreview({
            src: url,
            filename,
            fileType,
            className:
                fileType.isPdf || fileType.isDoc
                    ? "w-full h-full rounded border-none"
                    : "max-w-full max-h-full object-contain rounded",
            autoPlay: fileType.isVideo, // Autoplay videos in hover preview
            t,
        });
    }

    return (
        <div className="hidden sm:flex fixed z-[100] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden items-center justify-center p-2">
            {preview || (
                <div
                    className={`text-gray-500 dark:text-gray-400 text-center p-4 ${isRtl ? "text-right" : ""}`}
                >
                    {t("No preview available")}
                </div>
            )}
        </div>
    );
}
