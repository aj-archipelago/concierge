"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2, Music, Play } from "lucide-react";
import { getFileIcon } from "@/src/utils/mediaUtils";
import {
    useFilePreview,
    renderFilePreview,
} from "@/src/components/chat/useFilePreview";
import {
    extractYoutubeVideoId,
    getYoutubeThumbnailUrl,
    isYoutubeUrl,
} from "@/src/utils/urlUtils";
import { getDownloadUrl } from "@/src/utils/fileDownloadUtils";

/**
 * Shared media thumbnail. Used wherever the app shows a small preview of a
 * user file: file browser grid + list, hover preview, chat composer chips,
 * media gallery tiles.
 *
 * Renders an inline preview (image / video / YouTube / PDF / text). Videos
 * autoplay muted+looped so the thumbnail itself shows motion. Falls back to
 * the file-type icon when no preview is possible. A loader sits over the
 * preview until onLoad fires; a Play affordance overlays YouTube and any
 * non-autoplaying video.
 *
 * The container is sized by the parent via `className` (e.g. "w-20 h-20",
 * "w-full aspect-square"). Set `autoPlayVideo={false}` for very small
 * thumbnails where motion would be distracting.
 */
export default function MediaThumbnail({
    src,
    filename,
    mimeType,
    mediaType,
    className = "",
    objectFit = "cover",
    autoPlayVideo = true,
    showVideoControls = true,
    showPlayOverlay = true,
    playIconSize = "w-8 h-8",
    iconSize = "w-10 h-10",
    mediaStatus,
    mediaError,
    thumbnailSrc,
    compact = false,
}) {
    const { t } = useTranslation();
    const normalizedStatus = String(mediaStatus || "").toLowerCase();
    const isProcessingMedia = ["pending", "processing", "queued"].includes(
        normalizedStatus,
    );
    const isFailedMedia = ["failed", "error"].includes(normalizedStatus);
    const errorMessage =
        typeof mediaError === "string"
            ? mediaError
            : mediaError?.message || mediaError?.error || "";

    const displayThumbnailSrc = thumbnailSrc
        ? getDownloadUrl(thumbnailSrc)
        : null;
    const isYouTube = src ? isYoutubeUrl(src) : false;
    const youtubeVideoId = isYouTube && src ? extractYoutubeVideoId(src) : null;
    const youtubeThumbnail = youtubeVideoId
        ? getYoutubeThumbnailUrl(youtubeVideoId, "hqdefault")
        : null;

    const fileType = useFilePreview(src, filename, mimeType);
    const isVideoMedia = mediaType === "video" || fileType.isVideo;
    const isAudioMedia =
        mediaType === "audio" ||
        fileType.isAudio ||
        String(mimeType || "").startsWith("audio/");

    const [mediaLoaded, setMediaLoaded] = useState(false);
    useEffect(() => {
        setMediaLoaded(false);
    }, [src, displayThumbnailSrc]);

    const fitClass =
        objectFit === "contain" ? "object-contain" : "object-cover";

    let body;
    if (isFailedMedia) {
        body = (
            <div
                className={`flex h-full w-full flex-col items-center justify-center border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 ${
                    compact ? "p-0" : "gap-1.5 p-2"
                }`}
                title={errorMessage || t("Media generation failed")}
            >
                <AlertCircle className={`${iconSize} opacity-90`} />
                {!compact && (
                    <span className="max-w-full truncate text-xs font-medium">
                        {t("Failed")}
                    </span>
                )}
            </div>
        );
    } else if (isProcessingMedia) {
        body = (
            <div
                className={`flex h-full w-full flex-col items-center justify-center bg-slate-900 text-sky-100 ${
                    compact ? "p-0" : "gap-2 p-3"
                }`}
            >
                <Loader2 className={`${iconSize} animate-spin opacity-90`} />
                {!compact && (
                    <span className="max-w-full truncate text-xs font-medium">
                        {t("Processing")}
                    </span>
                )}
            </div>
        );
    } else if (isAudioMedia) {
        body = (
            <div
                className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-cyan-900 via-slate-900 to-fuchsia-950 text-cyan-100 ${
                    compact ? "p-0" : "gap-2 p-3"
                }`}
            >
                <Music className={`${iconSize} opacity-90`} />
                {!compact && (
                    <div
                        className="flex h-10 w-full max-w-32 items-end justify-center gap-0.5"
                        aria-hidden="true"
                    >
                        {Array.from({ length: 18 }).map((_, index) => (
                            <span
                                key={index}
                                className="w-1 rounded-full bg-cyan-200/80"
                                style={{
                                    height: `${20 + ((index * 17) % 64)}%`,
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    } else if (displayThumbnailSrc) {
        body = (
            <img
                src={displayThumbnailSrc}
                alt={filename || t("Video thumbnail")}
                className={`w-full h-full ${fitClass}`}
                loading="lazy"
                decoding="async"
                onLoad={() => setMediaLoaded(true)}
            />
        );
    } else if (isYouTube && youtubeThumbnail) {
        body = (
            <img
                src={youtubeThumbnail}
                alt={filename || t("YouTube video")}
                className={`w-full h-full ${fitClass}`}
                loading="lazy"
                decoding="async"
                onLoad={() => setMediaLoaded(true)}
                onError={(e) => {
                    if (youtubeVideoId) {
                        e.target.src = getYoutubeThumbnailUrl(
                            youtubeVideoId,
                            "hqdefault",
                        );
                    }
                }}
            />
        );
    } else if (isVideoMedia) {
        body = (
            <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                <Play className={`${iconSize} opacity-70`} />
            </div>
        );
    } else if (src && fileType.isPreviewable) {
        body = renderFilePreview({
            src,
            filename,
            fileType,
            className:
                fileType.isPdf || fileType.isDoc
                    ? "w-full h-full"
                    : `w-full h-full ${fitClass}`,
            onLoad: () => setMediaLoaded(true),
            autoPlay: autoPlayVideo && fileType.isVideo,
            showVideoControls,
            compact: true,
            t,
        });
    } else {
        const FileIcon = getFileIcon(filename || "");
        body = (
            <FileIcon
                className={`${iconSize} text-gray-300 dark:text-gray-600`}
            />
        );
    }

    const needsLoading =
        !isFailedMedia &&
        !isProcessingMedia &&
        !isAudioMedia &&
        ((Boolean(displayThumbnailSrc) && !mediaLoaded) ||
            fileType.isImage ||
            isYouTube);
    const showPlay =
        !isFailedMedia &&
        !isProcessingMedia &&
        showPlayOverlay &&
        (isYouTube || (fileType.isVideo && !autoPlayVideo));

    return (
        <div
            className={`relative overflow-hidden flex items-center justify-center ${className}`}
        >
            {body}
            {needsLoading && !mediaLoaded && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                </div>
            )}
            {showPlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                    <Play
                        className={`${playIconSize} text-white opacity-80`}
                        fill="white"
                    />
                </div>
            )}
        </div>
    );
}
