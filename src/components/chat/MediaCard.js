"use client";

import React, {
    useState,
    useRef,
    useEffect,
    useContext,
    useCallback,
    useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { Play, X, FileX, Download } from "lucide-react";
import { getFileIcon, getExtension } from "../../utils/mediaUtils";
import { useFilePreview, renderFilePreview } from "./useFilePreview";
import {
    extractYoutubeVideoId,
    getYoutubeThumbnailUrl,
} from "../../utils/urlUtils";
import {
    getDownloadUrl,
    getFilename as getCleanFilename,
} from "../../utils/fileDownloadUtils";
import { FilePreviewDialog } from "../common/FileManager";
import { LanguageContext } from "../../contexts/LanguageProvider";

/**
 * Image component with automatic fallback to proxy on CORS/ORB errors
 */
// Non-Azure blob domains that need proxying (Azure *.blob.core.windows.net matched via endsWith)
const BLOB_DOMAINS = [
    "storage.googleapis.com",
    "storage.cloud.google.com",
    "127.0.0.1:10000", // Azurite local dev
];

const ImageWithFallback = React.memo(function ImageWithFallback({
    src,
    alt,
    className,
    style,
    onLoad,
    onError,
    ...props
}) {
    // Get proxied URL if needed — uses getDownloadUrl which strips SAS tokens
    // so the proxy URL is stable and the browser can cache long-term.
    const getProxiedUrl = useCallback((url) => {
        if (!url || url.includes("/api/image-proxy")) return url;
        return getDownloadUrl(url);
    }, []);

    // For known blob domains, skip straight to proxy (direct fetch always fails CORS)
    const needsProxy = useMemo(() => {
        if (!src || src.includes("/api/image-proxy")) return false;
        try {
            const { hostname, host } = new URL(src);
            return (
                hostname.endsWith(".blob.core.windows.net") ||
                BLOB_DOMAINS.some((d) => host === d)
            );
        } catch {
            return false;
        }
    }, [src]);

    const [useProxy, setUseProxy] = useState(needsProxy);
    const [imageSrc, setImageSrc] = useState(
        needsProxy ? getProxiedUrl(src) : src,
    );
    const onLoadRef = useRef(onLoad);
    const hasNotifiedLoadRef = useRef(false);

    useEffect(() => {
        onLoadRef.current = onLoad;
    }, [onLoad]);

    // Update image src when src prop changes
    useEffect(() => {
        if (needsProxy) {
            setUseProxy(true);
            setImageSrc(getProxiedUrl(src));
        } else {
            setUseProxy(false);
            setImageSrc(src);
        }
    }, [src, needsProxy, getProxiedUrl]);

    useEffect(() => {
        hasNotifiedLoadRef.current = false;
    }, [imageSrc]);

    // Handle image load errors — fallback to proxy, then call onError if proxy also fails
    const handleImageError = useCallback(() => {
        if (!useProxy && src) {
            setUseProxy(true);
            setImageSrc(getProxiedUrl(src));
        } else if (onError) {
            onError();
        }
    }, [useProxy, src, getProxiedUrl, onError]);

    const notifyLoadOnce = useCallback(() => {
        if (hasNotifiedLoadRef.current) return;
        hasNotifiedLoadRef.current = true;
        if (onLoadRef.current) {
            onLoadRef.current();
        }
    }, []);

    const handleImageLoad = useCallback(() => {
        notifyLoadOnce();
    }, [notifyLoadOnce]);

    // Handle cached images: when the browser serves from cache, the native
    // load event can fire synchronously before React attaches its listener,
    // so onLoad never fires and the caller's spinner stays forever.
    // This ref callback checks img.complete on mount and calls onLoad.
    const imgRef = useCallback(
        (img) => {
            if (img && img.complete && img.naturalWidth > 0) {
                notifyLoadOnce();
            }
        },
        [notifyLoadOnce],
    );

    return (
        <img
            ref={imgRef}
            src={imageSrc}
            alt={alt}
            className={className}
            style={style}
            loading="lazy"
            decoding="async"
            onLoad={handleImageLoad}
            onError={handleImageError}
            {...props}
        />
    );
});

export { ImageWithFallback };

const MediaCard = React.memo(function MediaCard({
    type, // 'image' | 'video' | 'youtube' | 'file'
    src,
    filename,
    youtubeEmbedUrl,
    mimeType, // Optional MIME type for better file type detection
    onLoad,
    onDeleteFile,
    t,
    className = "",
    isDeleted = false, // Whether this file has been deleted
}) {
    const [isZoomOpen, setIsZoomOpen] = useState(false);
    const [isFilenameTruncated, setIsFilenameTruncated] = useState(false);
    const [scrollDistance, setScrollDistance] = useState(0);
    const deletedFilenameRef = useRef(null);
    const fileFilenameRef = useRef(null);
    const nonFileFilenameRef = useRef(null);
    const { t: tHook } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    const translationFn = typeof t === "function" ? t : tHook;
    const previewSrc = useMemo(() => getDownloadUrl(src), [src]);

    // Helper function to check truncation for a ref
    const checkTruncation = useCallback(
        (ref, actionCount = 0) => {
            if (!ref.current) return;
            const element = ref.current;
            const container = element.parentElement;
            if (!container) return;

            // Create a temporary element to measure full width
            const tempElement = document.createElement("span");
            tempElement.style.cssText =
                "position: absolute; visibility: hidden; white-space: nowrap; font-size: 0.75rem;";
            tempElement.textContent = filename || "";
            document.body.appendChild(tempElement);
            const fullWidth = tempElement.offsetWidth;
            document.body.removeChild(tempElement);

            // Get available width from container
            const containerPadding = 24; // px-3 = 12px on each side
            const buttonWidth = actionCount > 0 ? actionCount * 32 : 0;
            const gap = actionCount > 0 ? actionCount * 8 : 0;
            const availableWidth =
                container.clientWidth - containerPadding - buttonWidth - gap;

            const isTruncated = fullWidth > availableWidth;
            if (isTruncated) {
                const distance = fullWidth - availableWidth;
                setIsFilenameTruncated(true);
                setScrollDistance(Math.max(0, distance));
            } else {
                setIsFilenameTruncated(false);
                setScrollDistance(0);
            }
        },
        [filename],
    );

    // Use shared file preview logic for file types
    const fileType = useFilePreview(
        type === "file" ? src : null,
        filename,
        mimeType,
    );

    // Determine if file has a previewable preview (use explicit whitelist)
    const hasFilePreview = type === "file" && fileType.isPreviewable;
    const canDownload =
        Boolean(src) &&
        !isDeleted &&
        (type === "file" || type === "image" || type === "video");

    // Standard card width - consistent size for all cards
    const cardWidth = "w-[240px] [.docked_&]:w-[200px]";

    // Preview height - full card height since filename is hidden by default
    const previewHeight = "h-[180px] [.docked_&]:h-[150px]";

    // Build a synthetic file object for FilePreviewDialog
    const fileObj = useMemo(
        () => (src ? { url: src, displayFilename: filename, mimeType } : null),
        [src, filename, mimeType],
    );

    // Shared function to render icon + extension view
    const renderIconView = ({
        iconColor = "text-gray-500 dark:text-gray-400",
        extensionColor = "text-gray-600 dark:text-gray-400",
        bgColor = "bg-neutral-100 dark:bg-gray-700",
        showDeletedText = false,
    }) => {
        const Icon = getFileIcon(filename);
        const fileExtension = filename
            ? getExtension(filename).replace(".", "").toUpperCase() || ""
            : "";
        return (
            <div
                className={`w-full ${previewHeight} ${bgColor} rounded-t-lg flex flex-col items-center justify-center gap-2`}
            >
                <Icon className={`w-16 h-16 ${iconColor}`} />
                {fileExtension && (
                    <span
                        className={`text-xs font-medium ${extensionColor} uppercase tracking-wide`}
                    >
                        {fileExtension}
                    </span>
                )}
                {showDeletedText && (
                    <span className="text-xs text-red-500 dark:text-red-400 italic">
                        {translationFn("File deleted")}
                    </span>
                )}
            </div>
        );
    };

    const renderPreview = () => {
        if (type === "image") {
            return (
                <div
                    className={`w-full ${previewHeight} rounded-t-lg overflow-hidden`}
                >
                    <ImageWithFallback
                        src={src}
                        alt={filename || translationFn("Image")}
                        className="w-full h-full object-cover media-card-image"
                        style={{ maxWidth: "100%", maxHeight: "100%" }}
                        onLoad={onLoad}
                    />
                </div>
            );
        } else if (type === "video") {
            return (
                <div
                    className={`w-full ${previewHeight} bg-gray-900 rounded-t-lg relative flex items-center justify-center`}
                >
                    <video
                        src={previewSrc}
                        data-testid="media-card-video-preview"
                        className="w-full h-full object-cover rounded-t-lg"
                        onLoadedData={onLoad}
                        preload="metadata"
                        autoPlay
                        muted
                        loop
                        playsInline
                    />
                </div>
            );
        } else if (type === "youtube") {
            // Extract video ID from embed URL for thumbnail
            const videoId = youtubeEmbedUrl
                ? extractYoutubeVideoId(youtubeEmbedUrl)
                : null;
            const thumbnailUrl = videoId
                ? getYoutubeThumbnailUrl(videoId, "maxresdefault")
                : null;

            return (
                <div
                    className={`w-full ${previewHeight} bg-gray-900 rounded-t-lg relative flex items-center justify-center overflow-hidden`}
                >
                    {thumbnailUrl ? (
                        <ImageWithFallback
                            src={thumbnailUrl}
                            alt="YouTube thumbnail"
                            className="w-full h-full object-cover"
                            onLoad={onLoad}
                        />
                    ) : (
                        <div className="w-full h-full bg-gray-800" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-t-lg">
                        <Play
                            className="w-12 h-12 text-white opacity-90"
                            fill="white"
                        />
                    </div>
                </div>
            );
        } else if (type === "file") {
            // Try to render a preview if available (only for whitelisted types)
            if (fileType.isPreviewable) {
                const previewClassName =
                    fileType.isPdf || fileType.isDoc
                        ? `w-full h-full rounded-t-lg border-none`
                        : fileType.isImage
                          ? `w-full h-full object-cover media-card-image`
                          : `w-full h-full object-cover rounded-t-lg`;

                const preview = renderFilePreview({
                    src,
                    filename,
                    fileType,
                    className: previewClassName,
                    onLoad,
                    autoPlay: fileType.isVideo,
                    t: translationFn,
                    compact: true, // Use compact text for card thumbnail
                });

                if (preview) {
                    return (
                        <div
                            className={`w-full ${previewHeight} bg-gray-100 dark:bg-gray-800 rounded-t-lg relative overflow-hidden`}
                        >
                            {preview}
                        </div>
                    );
                }
            }

            // Fallback to icon for files without previews (clean, no error message)
            return renderIconView({});
        }
        return null;
    };

    // Download handler for FilePreviewDialog
    const handlePreviewDownload = useCallback(
        async (file, e) => {
            e?.stopPropagation?.();
            const url = file?.url || src;
            if (!url) return;
            const proxyUrl = getDownloadUrl(url);
            const name = getCleanFilename(file) || filename || "";
            try {
                const response = await fetch(proxyUrl);
                if (!response.ok)
                    throw new Error(`Download failed: ${response.status}`);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = blobUrl;
                link.download = name;
                link.style.display = "none";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
            } catch (err) {
                console.error("Download error:", err);
                window.open(proxyUrl, "_blank", "noopener,noreferrer");
            }
        },
        [src, filename],
    );

    const fileActionCount =
        type === "file" && !isDeleted
            ? (canDownload ? 1 : 0) + (onDeleteFile ? 1 : 0)
            : 0;
    const nonFileActionCount = !isDeleted
        ? (canDownload ? 1 : 0) + (onDeleteFile ? 1 : 0)
        : 0;

    // Check truncation for all possible refs
    useEffect(() => {
        const rafId = requestAnimationFrame(() => {
            // Check deleted card (no button)
            if (isDeleted && deletedFilenameRef.current) {
                checkTruncation(deletedFilenameRef, 0);
            }
            // Check file type card (has button)
            else if (!isDeleted && fileFilenameRef.current) {
                checkTruncation(fileFilenameRef, fileActionCount);
            }
            // Check non-file type card (has button)
            else if (!isDeleted && nonFileFilenameRef.current) {
                checkTruncation(nonFileFilenameRef, nonFileActionCount);
            }
        });
        return () => cancelAnimationFrame(rafId);
    }, [
        filename,
        isDeleted,
        checkTruncation,
        fileActionCount,
        nonFileActionCount,
    ]);

    const handleClick = useCallback(
        (e) => {
            if (type === "file" && !hasFilePreview) {
                handlePreviewDownload(fileObj, e);
                return;
            }

            if (type !== "file" || hasFilePreview) {
                setIsZoomOpen(true);
            }
        },
        [type, hasFilePreview, handlePreviewDownload, fileObj],
    );

    const handleKeyDown = useCallback(
        (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            handleClick(e);
        },
        [handleClick],
    );

    // If deleted, render as simplified ghost card with red tint
    if (isDeleted) {
        const Icon = type === "file" ? getFileIcon(filename) : null;
        return (
            <div
                className={`${cardWidth} ${previewHeight} rounded-lg border border-red-200 dark:border-red-800/50 shadow-md overflow-hidden pointer-events-none bg-red-50/50 dark:bg-red-900/10 relative group`}
            >
                {Icon ? (
                    <div className="w-full h-full rounded-lg bg-red-50/50 dark:bg-red-900/10 relative">
                        {renderIconView({
                            iconColor: "text-red-300 dark:text-red-600",
                            extensionColor: "text-red-500 dark:text-red-400",
                            bgColor: "bg-transparent",
                            showDeletedText: true,
                        })}
                    </div>
                ) : (
                    <div className="w-full h-full rounded-lg flex flex-col items-center justify-center gap-2 bg-red-50/50 dark:bg-red-900/10 relative">
                        <FileX className="w-16 h-16 text-red-300 dark:text-red-600" />
                        <span className="text-xs text-red-500 dark:text-red-400 italic">
                            {translationFn("File deleted")}
                        </span>
                    </div>
                )}
                {filename && (
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="overflow-hidden">
                            <span
                                ref={deletedFilenameRef}
                                className={`text-xs text-white text-start ${
                                    isFilenameTruncated
                                        ? "whitespace-nowrap inline-block group-hover:animate-scroll-text"
                                        : "truncate block"
                                }`}
                                style={
                                    isFilenameTruncated
                                        ? {
                                              "--scroll-distance": isRTL
                                                  ? `${scrollDistance}px`
                                                  : `-${scrollDistance}px`,
                                          }
                                        : {}
                                }
                                dir="auto"
                            >
                                {filename}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <>
            <div
                className={`${cardWidth} ${className} bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md overflow-hidden relative group ${
                    (type !== "file" || hasFilePreview || canDownload) &&
                    !isDeleted
                        ? "cursor-pointer hover:shadow-lg transition-shadow"
                        : ""
                }`}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                role={
                    (type !== "file" || hasFilePreview || canDownload) &&
                    !isDeleted
                        ? "button"
                        : undefined
                }
                tabIndex={
                    (type !== "file" || hasFilePreview || canDownload) &&
                    !isDeleted
                        ? 0
                        : undefined
                }
            >
                {renderPreview()}
                {filename && (
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        {type === "file" ? (
                            <div
                                className="flex items-center justify-between gap-2"
                                dir="auto"
                            >
                                <div className="flex-1 min-w-0 overflow-hidden">
                                    <span
                                        ref={fileFilenameRef}
                                        className={`text-xs text-white text-start ${
                                            isFilenameTruncated
                                                ? "whitespace-nowrap inline-block group-hover:animate-scroll-text"
                                                : "truncate block"
                                        }`}
                                        style={
                                            isFilenameTruncated
                                                ? {
                                                      "--scroll-distance": isRTL
                                                          ? `${scrollDistance}px`
                                                          : `-${scrollDistance}px`,
                                                  }
                                                : {}
                                        }
                                    >
                                        {filename}
                                    </span>
                                </div>
                                {canDownload && (
                                    <button
                                        onClick={(e) =>
                                            handlePreviewDownload(fileObj, e)
                                        }
                                        className="hover:bg-white/20 rounded p-1 transition-colors flex-shrink-0 pointer-events-auto"
                                        title={translationFn("Download")}
                                        aria-label={translationFn("Download")}
                                    >
                                        <Download className="w-4 h-4 text-white" />
                                    </button>
                                )}
                                {onDeleteFile && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onDeleteFile();
                                        }}
                                        className="hover:bg-white/20 rounded p-1 transition-colors flex-shrink-0 order-last rtl:order-first pointer-events-auto"
                                        title={
                                            typeof t === "function"
                                                ? t("Remove file from chat")
                                                : "Remove file from chat"
                                        }
                                        aria-label={
                                            typeof t === "function"
                                                ? t("Remove file from chat")
                                                : "Remove file from chat"
                                        }
                                    >
                                        <X className="w-4 h-4 text-white" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div
                                className="flex items-center justify-between gap-2"
                                dir="auto"
                            >
                                <div className="flex-1 min-w-0 overflow-hidden">
                                    <span
                                        ref={nonFileFilenameRef}
                                        className={`text-xs text-white text-start ${
                                            isFilenameTruncated
                                                ? "whitespace-nowrap inline-block group-hover:animate-scroll-text"
                                                : "truncate block"
                                        }`}
                                        style={
                                            isFilenameTruncated
                                                ? {
                                                      "--scroll-distance": isRTL
                                                          ? `${scrollDistance}px`
                                                          : `-${scrollDistance}px`,
                                                  }
                                                : {}
                                        }
                                    >
                                        {filename}
                                    </span>
                                </div>
                                {canDownload && (
                                    <button
                                        onClick={(e) =>
                                            handlePreviewDownload(fileObj, e)
                                        }
                                        className="hover:bg-white/20 rounded p-1 transition-colors flex-shrink-0 pointer-events-auto"
                                        title={translationFn("Download")}
                                        aria-label={translationFn("Download")}
                                    >
                                        <Download className="w-4 h-4 text-white" />
                                    </button>
                                )}
                                {onDeleteFile && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteFile();
                                        }}
                                        className="hover:bg-white/20 rounded p-1 transition-colors flex-shrink-0 order-last rtl:order-first pointer-events-auto"
                                        title={
                                            typeof t === "function"
                                                ? t("Remove file from chat")
                                                : "Remove file from chat"
                                        }
                                        aria-label={
                                            typeof t === "function"
                                                ? t("Remove file from chat")
                                                : "Remove file from chat"
                                        }
                                    >
                                        <X className="w-4 h-4 text-white" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {(type !== "file" || hasFilePreview) && isZoomOpen && (
                <FilePreviewDialog
                    file={fileObj}
                    onClose={() => setIsZoomOpen(false)}
                    onDownload={handlePreviewDownload}
                    t={translationFn}
                />
            )}
        </>
    );
});

export default MediaCard;
