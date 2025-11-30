"use client";

import React, {
    useState,
    useRef,
    useEffect,
    useContext,
    useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Play, X, FileX, Download } from "lucide-react";
import { getFileIcon, getExtension } from "../../utils/mediaUtils";
import { useFilePreview, renderFilePreview } from "./useFilePreview";
import {
    extractYoutubeVideoId,
    getYoutubeThumbnailUrl,
} from "../../utils/urlUtils";
import { LanguageContext } from "../../contexts/LanguageProvider";

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

    // Helper function to check truncation for a ref
    const checkTruncation = useCallback(
        (ref, hasButton = false) => {
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
            const buttonWidth = hasButton ? 32 : 0; // Approximate button width
            const gap = hasButton ? 8 : 0; // gap-2 = 8px
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

    // Check truncation for all possible refs
    useEffect(() => {
        const rafId = requestAnimationFrame(() => {
            // Check deleted card (no button)
            if (isDeleted && deletedFilenameRef.current) {
                checkTruncation(deletedFilenameRef, false);
            }
            // Check file type card (has button)
            else if (!isDeleted && fileFilenameRef.current) {
                checkTruncation(fileFilenameRef, true);
            }
            // Check non-file type card (has button)
            else if (!isDeleted && nonFileFilenameRef.current) {
                checkTruncation(nonFileFilenameRef, true);
            }
        });
        return () => cancelAnimationFrame(rafId);
    }, [filename, isDeleted, checkTruncation]);

    // Use shared file preview logic for file types
    const fileType = useFilePreview(
        type === "file" ? src : null,
        filename,
        mimeType,
    );

    // Determine if file has a previewable preview (use explicit whitelist)
    const hasFilePreview = type === "file" && fileType.isPreviewable;

    // Standard card width - consistent size for all cards
    const cardWidth = "w-[240px] [.docked_&]:w-[200px]";

    // Preview height - full card height since filename is hidden by default
    const previewHeight = "h-[180px] [.docked_&]:h-[150px]";

    const handleClick = (e) => {
        if (type !== "file" || hasFilePreview) {
            setIsZoomOpen(true);
        }
        // For file cards without previews, let the link handle navigation
    };

    const handleDownload = (e) => {
        e.stopPropagation();
        if (src) {
            window.open(src, "_blank", "noopener,noreferrer");
        }
    };

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
                    <img
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
                        src={src}
                        className="w-full h-full object-cover rounded-t-lg"
                        onLoadedData={onLoad}
                        preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-t-lg">
                        <Play
                            className="w-12 h-12 text-white opacity-80"
                            fill="white"
                        />
                    </div>
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
                        <img
                            src={thumbnailUrl}
                            alt="YouTube thumbnail"
                            className="w-full h-full object-cover"
                            onLoad={onLoad}
                            onError={(e) => {
                                // Fallback to a lower quality thumbnail if maxresdefault fails
                                if (videoId) {
                                    e.target.src = getYoutubeThumbnailUrl(
                                        videoId,
                                        "hqdefault",
                                    );
                                }
                            }}
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
                    t: translationFn,
                });

                if (preview) {
                    // File has a preview (image, video, PDF, whitelisted text files)
                    return (
                        <div
                            className={`w-full ${previewHeight} bg-gray-100 dark:bg-gray-800 rounded-t-lg relative overflow-hidden`}
                        >
                            {preview}
                            {fileType.isVideo && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-t-lg pointer-events-none">
                                    <Play
                                        className="w-12 h-12 text-white opacity-80"
                                        fill="white"
                                    />
                                </div>
                            )}
                        </div>
                    );
                }
            }

            // Fallback to icon for files without previews (clean, no error message)
            return renderIconView({});
        }
        return null;
    };

    const renderZoomContent = () => {
        if (type === "image") {
            return (
                <img
                    src={src}
                    alt={filename || translationFn("Image")}
                    className="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-lg"
                />
            );
        } else if (type === "video") {
            return (
                <video
                    src={src}
                    controls
                    className="max-w-full max-h-[80vh] w-auto h-auto rounded-lg"
                    preload="metadata"
                />
            );
        } else if (type === "youtube") {
            return (
                <iframe
                    src={youtubeEmbedUrl}
                    className="w-full rounded-lg"
                    style={{
                        width: "100%",
                        maxWidth: "900px",
                        aspectRatio: "16/9",
                        backgroundColor: "transparent",
                    }}
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    title="YouTube video player"
                />
            );
        } else if (type === "file" && hasFilePreview) {
            // Render zoom content for files with previews
            const zoomPreview = renderFilePreview({
                src,
                filename,
                fileType,
                className:
                    fileType.isPdf || fileType.isDoc
                        ? "w-full h-[80vh] rounded-lg border-none"
                        : "max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-lg",
                t: translationFn,
            });
            return zoomPreview;
        }
        return null;
    };

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
                    type !== "file" || hasFilePreview
                        ? "cursor-pointer hover:shadow-lg transition-shadow"
                        : ""
                }`}
                onClick={handleClick}
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

            {(type !== "file" || hasFilePreview) && (
                <Dialog open={isZoomOpen} onOpenChange={setIsZoomOpen}>
                    <DialogContent className="max-w-[95vw] max-h-[95vh] p-4 sm:p-6 flex items-center justify-center">
                        <DialogTitle className="sr-only">
                            {type === "image"
                                ? translationFn("Image viewer")
                                : type === "video"
                                  ? translationFn("Video player")
                                  : type === "youtube"
                                    ? translationFn("YouTube video player")
                                    : translationFn("File preview")}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            {filename
                                ? translationFn(
                                      `Viewing ${filename} in full screen`,
                                  )
                                : type === "image"
                                  ? translationFn("View image in full screen")
                                  : type === "video"
                                    ? translationFn(
                                          "View video in full screen",
                                      )
                                    : type === "youtube"
                                      ? translationFn(
                                            "View YouTube video in full screen",
                                        )
                                      : translationFn(
                                            "View file in full screen",
                                        )}
                        </DialogDescription>
                        <div className="w-full flex items-center justify-center relative">
                            {renderZoomContent()}
                            {src && type !== "youtube" && (
                                <button
                                    onClick={handleDownload}
                                    className="absolute top-4 right-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-2 rounded-lg shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
                                    title={
                                        typeof t === "function"
                                            ? t("Download")
                                            : "Download"
                                    }
                                    aria-label={
                                        typeof t === "function"
                                            ? t("Download")
                                            : "Download"
                                    }
                                >
                                    <Download className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
});

export default MediaCard;
