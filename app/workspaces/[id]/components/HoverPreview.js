"use client";
import React from "react";
import {
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    DOC_EXTENSIONS,
} from "@/src/utils/mediaUtils";
import { getFileUrl, getFilename } from "./memoryFilesUtils";

export default function HoverPreview({ file }) {
    if (!file) return null;

    const url = getFileUrl(file);
    const filename = getFilename(file);
    const extension = filename.split(".").pop()?.toLowerCase();

    if (!url) return null;

    const isImage = IMAGE_EXTENSIONS.includes(`.${extension}`);
    const isVideo = VIDEO_EXTENSIONS.includes(`.${extension}`);
    const isAudio = AUDIO_EXTENSIONS.includes(`.${extension}`);
    const isDoc = DOC_EXTENSIONS.includes(`.${extension}`);

    // PDF is a special case of doc that browsers render well
    const isPdf = extension === "pdf";

    return (
        <div className="hidden sm:block fixed z-[100] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center p-2">
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
            {/* For PDFs use specific object tag or embed which often works better than iframe for PDFs */}
            {isPdf && (
                <object
                    data={url}
                    type="application/pdf"
                    className="w-full h-full rounded"
                >
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                        <div className="text-4xl">📄</div>
                        <div className="text-center text-sm">
                            PDF Preview not available
                        </div>
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-sky-600 hover:underline"
                        >
                            Open PDF
                        </a>
                    </div>
                </object>
            )}
            {/* For text files, use iframe */}
            {isDoc && !isPdf && (
                <iframe
                    src={url}
                    title={filename}
                    className="w-full h-full rounded border-none"
                    sandbox="allow-scripts allow-same-origin" // allow-scripts needed for some PDF viewers
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
