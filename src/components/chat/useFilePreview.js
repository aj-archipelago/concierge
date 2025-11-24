"use client";

import { useMemo } from "react";
import {
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    DOC_EXTENSIONS,
    getExtension,
} from "../../utils/mediaUtils";

/**
 * Hook to determine file type and preview capabilities
 * @param {string} src - File URL
 * @param {string} filename - File name
 * @param {string} mimeType - Optional MIME type
 * @returns {object} File type information
 */
export function useFilePreview(src, filename, mimeType = null) {
    return useMemo(() => {
        if (!src && !filename) {
            return {
                isImage: false,
                isVideo: false,
                isAudio: false,
                isDoc: false,
                isPdf: false,
                extension: null,
            };
        }

        const extension = filename
            ? getExtension(filename)
            : src
              ? getExtension(src)
              : null;

        // Use mimeType if available, otherwise fall back to extension
        // Note: getExtension already returns extension with dot (e.g., ".pdf", ".md")
        const isImage =
            (mimeType && mimeType.startsWith("image/")) ||
            (extension ? IMAGE_EXTENSIONS.includes(extension) : false);
        const isVideo =
            (mimeType && mimeType.startsWith("video/")) ||
            (extension ? VIDEO_EXTENSIONS.includes(extension) : false);
        const isAudio =
            (mimeType && mimeType.startsWith("audio/")) ||
            (extension ? AUDIO_EXTENSIONS.includes(extension) : false);
        const isDoc =
            (mimeType &&
                (mimeType.startsWith("text/") ||
                    mimeType === "application/pdf" ||
                    mimeType.startsWith("application/vnd.") ||
                    mimeType.startsWith("application/msword") ||
                    mimeType.startsWith("application/vnd.ms-"))) ||
            (extension ? DOC_EXTENSIONS.includes(extension) : false);

        // PDF is a special case of doc that browsers render well
        const isPdf = mimeType === "application/pdf" || extension === ".pdf";

        return {
            isImage,
            isVideo,
            isAudio,
            isDoc,
            isPdf,
            extension,
        };
    }, [src, filename, mimeType]);
}

/**
 * Renders a preview for a file based on its type
 * @param {object} params
 * @param {string} params.src - File URL
 * @param {string} params.filename - File name
 * @param {object} params.fileType - Result from useFilePreview
 * @param {string} params.className - Additional CSS classes
 * @param {function} params.onLoad - Load callback
 * @param {boolean} params.autoPlay - For videos, whether to autoplay (default: false)
 * @returns {React.ReactElement|null} Preview element
 */
export function renderFilePreview({
    src,
    filename,
    fileType,
    className = "",
    onLoad,
    autoPlay = false,
    t = null,
}) {
    const { isImage, isVideo, isAudio, isDoc, isPdf } = fileType;
    // Note: t should be passed from the component that calls useTranslation()
    // This function cannot use hooks directly
    const translationFn = t || ((key) => key);

    if (!src) return null;

    if (isImage) {
        return (
            <img
                src={src}
                alt={filename || translationFn("Image")}
                className={className}
                onLoad={onLoad}
            />
        );
    }

    if (isVideo) {
        return (
            <video
                src={src}
                className={className}
                controls
                preload="metadata"
                autoPlay={autoPlay}
                muted={autoPlay}
                loop={autoPlay}
                onLoadedData={onLoad}
            />
        );
    }

    if (isAudio) {
        return (
            <div
                className={`flex flex-col items-center justify-center gap-2 p-4 bg-gray-100 dark:bg-gray-800 ${className}`}
            >
                <div className="text-3xl">🎵</div>
                <div className="text-center text-xs font-medium truncate w-full">
                    {filename}
                </div>
                <audio
                    src={src}
                    controls
                    className="w-full"
                    onLoadedData={onLoad}
                />
            </div>
        );
    }

    if (isPdf) {
        return (
            <div className={`${className} bg-white dark:bg-gray-900`}>
                <iframe
                    src={src}
                    title={filename || translationFn("PDF")}
                    className="w-full h-full"
                    allow="fullscreen"
                    onLoad={onLoad}
                />
            </div>
        );
    }

    if (isDoc) {
        // CSV files don't render well in iframes - show icon instead
        if (
            fileType.extension === ".csv" ||
            filename?.toLowerCase().endsWith(".csv")
        ) {
            return null;
        }

        // For text files, invert in light mode to make white text visible
        // Dark mode works fine without inversion
        const isTextFile =
            fileType.extension &&
            (fileType.extension === ".txt" ||
                fileType.extension === ".md" ||
                fileType.extension === ".json" ||
                fileType.extension === ".js" ||
                fileType.extension === ".ts" ||
                fileType.extension === ".jsx" ||
                fileType.extension === ".tsx" ||
                fileType.extension === ".css" ||
                fileType.extension === ".html" ||
                fileType.extension === ".xml");

        return (
            <div className={`${className} bg-white dark:bg-gray-900`}>
                <iframe
                    src={src}
                    title={filename || translationFn("Document")}
                    className={`w-full h-full ${isTextFile ? "invert dark:invert-0" : ""}`}
                    sandbox="allow-scripts allow-same-origin"
                    allow="fullscreen"
                    onLoad={onLoad}
                />
            </div>
        );
    }

    return null;
}
