"use client";

import { useMemo, useState, useEffect } from "react";
import mime from "mime-types";
import {
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    DOC_EXTENSIONS,
    getExtension,
} from "../../utils/mediaUtils";

/**
 * Check if a mime type represents a text-based file that can be previewed as plain text.
 * Uses mime-types library to avoid maintaining hardcoded lists.
 * @param {string} mimeType - The mime type to check
 * @returns {boolean} True if the file is text-based and previewable
 */
function isTextBasedMimeType(mimeType) {
    if (!mimeType) return false;

    // text/* types are always text-based
    if (mimeType.startsWith("text/")) return true;

    // Common application/* types that are actually text-based
    const textBasedAppTypes = [
        "application/json",
        "application/xml",
        "application/javascript",
        "application/x-javascript",
        "application/ecmascript",
        "application/x-yaml",
        "application/yaml",
    ];

    return textBasedAppTypes.includes(mimeType);
}

/**
 * Get mime type from extension, with fallback
 * @param {string} extension - File extension (with or without dot)
 * @returns {string|null} Mime type or null
 */
function getMimeType(extension) {
    if (!extension) return null;
    const ext = extension.startsWith(".") ? extension.slice(1) : extension;
    return mime.lookup(ext) || null;
}

/**
 * Check if a URL is from a domain that requires proxying (blob storage)
 */
function needsProxy(url) {
    if (!url) return false;
    try {
        const urlObj = new URL(url);
        const proxyDomains = [
            "ajcortexfilestorage.blob.core.windows.net",
            "storage.googleapis.com",
            "storage.cloud.google.com",
        ];
        return proxyDomains.some((domain) => urlObj.hostname.includes(domain));
    } catch {
        return false;
    }
}

/**
 * Component for rendering text file content by fetching it
 * Handles CORS-friendly text display for CSV, MD, JSON, etc.
 * Uses a proxy endpoint for blob storage URLs to bypass CORS restrictions.
 *
 * @param {boolean} compact - If true, uses smaller text for thumbnail/hover previews
 */
export function TextFilePreview({
    src,
    filename,
    className = "",
    onLoad,
    t,
    compact = false,
}) {
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const translationFn = t || ((key) => key);

    useEffect(() => {
        if (!src) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        // Use proxy for blob storage URLs to bypass CORS
        const fetchUrl = needsProxy(src)
            ? `/api/text-proxy?url=${encodeURIComponent(src)}`
            : src;

        fetch(fetchUrl)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load file: ${response.status}`);
                }
                return response.text();
            })
            .then((text) => {
                setContent(text);
                setLoading(false);
                onLoad?.();
            })
            .catch((err) => {
                console.error("Error loading text file:", err);
                setError(err.message);
                setLoading(false);
            });
    }, [src, onLoad]);

    if (loading) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-gray-50 dark:bg-gray-900`}
            >
                <div
                    className={`text-gray-500 dark:text-gray-400 ${compact ? "text-xs" : ""}`}
                >
                    {translationFn("Loading...")}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-gray-50 dark:bg-gray-900`}
            >
                <div
                    className={`text-red-500 dark:text-red-400 text-center ${compact ? "p-1" : "p-4"}`}
                >
                    <p className={compact ? "text-[8px]" : ""}>
                        {translationFn("Unable to load file")}
                    </p>
                    {!compact && (
                        <p className="text-xs mt-1 text-gray-500">{error}</p>
                    )}
                </div>
            </div>
        );
    }

    // Compact mode: tiny text for thumbnail/hover previews to show more content
    // Full mode: readable text for dialog/full previews
    const textClasses = compact
        ? "p-1 text-[9px] leading-tight text-gray-800 dark:text-gray-200 whitespace-pre font-mono overflow-hidden"
        : "p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words font-mono";

    return (
        <div className={`${className} bg-white dark:bg-gray-900 overflow-auto`}>
            <pre className={textClasses}>{content}</pre>
        </div>
    );
}

/**
 * Hook to determine file type and preview capabilities
 * @param {string} src - File URL (the actual file to preview - may be a converted format)
 * @param {string} filename - Display file name (original filename for display, e.g., "foo.xlsx")
 * @param {string} mimeType - Optional MIME type
 * @returns {object} File type information with explicit previewability flag
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
                isPreviewable: false,
                extension: null,
            };
        }

        // IMPORTANT: For converted files (e.g., docx→md, xlsx→csv), the src URL
        // contains the actual converted file extension, while filename may still
        // show the original name (e.g., "foo.xlsx"). We need to use src for type
        // detection so previews work correctly with the converted format.
        const extension = src
            ? getExtension(src)
            : filename
              ? getExtension(filename)
              : null;

        // Derive mime type from extension if not provided
        const derivedMimeType = mimeType || getMimeType(extension);

        // Determine file categories
        const isImage =
            (derivedMimeType && derivedMimeType.startsWith("image/")) ||
            (extension ? IMAGE_EXTENSIONS.includes(extension) : false);
        const isVideo =
            (derivedMimeType && derivedMimeType.startsWith("video/")) ||
            (extension ? VIDEO_EXTENSIONS.includes(extension) : false);
        const isAudio =
            (derivedMimeType && derivedMimeType.startsWith("audio/")) ||
            (extension ? AUDIO_EXTENSIONS.includes(extension) : false);
        const isDoc =
            (derivedMimeType &&
                (derivedMimeType.startsWith("text/") ||
                    derivedMimeType === "application/pdf" ||
                    derivedMimeType.startsWith("application/vnd.") ||
                    derivedMimeType.startsWith("application/msword") ||
                    derivedMimeType.startsWith("application/vnd.ms-"))) ||
            (extension ? DOC_EXTENSIONS.includes(extension) : false);

        // PDF is a special case of doc that browsers render well
        const isPdf =
            derivedMimeType === "application/pdf" || extension === ".pdf";

        // Text-based files that can be previewed as plain text
        // Uses mime-types library to determine if file is text-based
        const isPreviewableText =
            !isPdf && isTextBasedMimeType(derivedMimeType);

        const isPreviewable = isImage || isVideo || isPdf || isPreviewableText;

        return {
            isImage,
            isVideo,
            isAudio,
            isDoc,
            isPdf,
            isPreviewable,
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
 * @param {boolean} params.compact - For text files, use smaller text for thumbnails/hover (default: false)
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
    compact = false,
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

    if (isDoc && fileType.isPreviewable) {
        // Text-based files are previewable (md, json, csv, etc.)
        // Binary docs like .docx, .xlsx are excluded unless converted

        // Use TextFilePreview component to fetch and display content
        // This handles CORS issues that iframes have with cross-origin text files
        return (
            <TextFilePreview
                src={src}
                filename={filename}
                className={className}
                onLoad={onLoad}
                t={translationFn}
                compact={compact}
            />
        );
    }

    return null;
}
