"use client";
import React from "react";
import {
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    DOC_EXTENSIONS,
} from "@/src/utils/mediaUtils";
import { getFileUrl, getFilename, getFileExtension } from "./memoryFilesUtils";

export default function HoverPreview({ file }) {
    if (!file) return null;

    const url = getFileUrl(file);
    const filename = getFilename(file);
    const mimeType = file?.mimeType;
    const extension = getFileExtension(filename);

    if (!url) return null;

    // Use mimeType if available (from Cortex indexing), otherwise fall back to extension
    const isImage =
        (mimeType && mimeType.startsWith("image/")) ||
        (extension ? IMAGE_EXTENSIONS.includes(`.${extension}`) : false);
    const isVideo =
        (mimeType && mimeType.startsWith("video/")) ||
        (extension ? VIDEO_EXTENSIONS.includes(`.${extension}`) : false);
    const isAudio =
        (mimeType && mimeType.startsWith("audio/")) ||
        (extension ? AUDIO_EXTENSIONS.includes(`.${extension}`) : false);
    const isDoc =
        (mimeType &&
            (mimeType.startsWith("text/") ||
                mimeType === "application/pdf" ||
                mimeType.startsWith("application/vnd.") ||
                mimeType.startsWith("application/msword") ||
                mimeType.startsWith("application/vnd.ms-"))) ||
        (extension ? DOC_EXTENSIONS.includes(`.${extension}`) : false);

    // PDF is a special case of doc that browsers render well
    const isPdf = mimeType === "application/pdf" || extension === "pdf";

    return (
        <div className="hidden sm:flex fixed z-[100] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden items-center justify-center p-2">
            {isImage && (
                <img
                    src={url}
                    alt={filename}
                    className="max-w-full max-h-full object-contain rounded"
                />
            )}
            {isVideo && (
                <video
                    src={url}
                    controls
                    autoPlay
                    muted
                    loop
                    className="max-w-full max-h-full object-contain rounded"
                />
            )}
            {isAudio && (
                <div className="flex flex-col items-center justify-center gap-4 w-full p-4">
                    <div className="text-4xl">🎵</div>
                    <div className="text-center text-sm font-medium truncate w-full">
                        {filename}
                    </div>
                    <audio src={url} controls className="w-full" />
                </div>
            )}
            {/* For PDFs use iframe which allows permissions policy control */}
            {isPdf && (
                <iframe
                    src={url}
                    title={filename}
                    className="w-full h-full rounded border-none"
                    allow="fullscreen"
                />
            )}
            {/* For text files, use iframe */}
            {isDoc && !isPdf && (
                <iframe
                    src={url}
                    title={filename}
                    className="w-full h-full rounded border-none"
                    sandbox="allow-scripts allow-same-origin" // allow-scripts needed for some PDF viewers
                    allow="fullscreen"
                />
            )}
            {!isImage && !isVideo && !isAudio && !isDoc && (
                <div className="text-gray-500 dark:text-gray-400 text-center p-4">
                    No preview available
                </div>
            )}
        </div>
    );
}
