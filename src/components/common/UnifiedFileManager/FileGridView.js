"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Check,
    MoreVertical,
    Eye,
    Download,
    Pencil,
    Trash2,
    Play,
} from "lucide-react";
import {
    getFilePreviewUrl,
    getFileThumbnailUrl,
    getFilename,
    formatFileSize,
} from "@/src/components/common/FileManager";
import MediaThumbnail from "@/src/components/common/MediaThumbnail";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from "@/src/utils/mediaUtils";

const CARD_SELECT_DELAY_MS = 220;
const UNAVAILABLE_PREVIEW_STATUSES = new Set([
    "pending",
    "processing",
    "queued",
    "failed",
    "error",
]);

function hasExtension(filename, extensions) {
    const extension = String(filename || "")
        .split(".")
        .pop()
        ?.toLowerCase();

    return extensions.some(
        (supportedExtension) =>
            supportedExtension.replace(/^\./, "").toLowerCase() === extension,
    );
}

function hasUnavailablePreviewStatus(file) {
    const status = String(file?._mediaItem?.status || file?.status || "")
        .trim()
        .toLowerCase();
    return UNAVAILABLE_PREVIEW_STATUSES.has(status);
}

function isPlayableFile(file, filename) {
    return Boolean(getPlayableFileKind(file, filename));
}

function getPlayableFileKind(file, filename) {
    const mediaType = String(file?._mediaItem?.type || file?.type || "")
        .trim()
        .toLowerCase();
    if (mediaType === "video" || mediaType === "audio") return mediaType;

    const mimeType = String(file?.mimeType || file?.contentType || "")
        .trim()
        .toLowerCase();
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";

    if (hasExtension(filename, VIDEO_EXTENSIONS)) return "video";
    if (hasExtension(filename, AUDIO_EXTENSIONS)) return "audio";

    return null;
}

/**
 * Thumbnail card for a single file in grid view.
 */
function FileGridCard({
    file,
    index,
    isSelected,
    onSelect,
    files,
    onPreview,
    onDownload,
    onRename,
    onDelete,
    enableFilenameEdit,
    renderFileOverlay,
    renderFileStatus,
}) {
    const { t } = useTranslation();
    const url = getFilePreviewUrl(file);
    const thumbnailUrl = getFileThumbnailUrl(file);
    const filename = getFilename(file);
    const playableKind = getPlayableFileKind(file, filename);
    const [isPlayingInline, setIsPlayingInline] = useState(false);
    const showPlayCue =
        !isPlayingInline &&
        Boolean(url) &&
        !hasUnavailablePreviewStatus(file) &&
        isPlayableFile(file, filename);
    const [menuOpen, setMenuOpen] = useState(false);
    const selectTimerRef = useRef(null);
    const inlinePlayerRef = useRef(null);
    const clearPendingSelect = () => {
        if (selectTimerRef.current) {
            window.clearTimeout(selectTimerRef.current);
            selectTimerRef.current = null;
        }
    };
    const stopCardSelection = (event) => {
        event.stopPropagation();
    };
    const runMenuAction = (event, action) => {
        event.stopPropagation();
        action?.(file);
    };
    const handlePlayCueClick = (event) => {
        event.stopPropagation();
        setIsPlayingInline(true);
    };
    const handleCardClick = (event) => {
        if (event.shiftKey) {
            event.preventDefault();
        }
        const selectionEvent = {
            shiftKey: event.shiftKey,
            preventDefault: () => {},
        };

        clearPendingSelect();
        selectTimerRef.current = window.setTimeout(() => {
            selectTimerRef.current = null;
            onSelect(file, files, index, selectionEvent);
        }, CARD_SELECT_DELAY_MS);
    };
    const handleCardDoubleClick = (event) => {
        event.stopPropagation();
        clearPendingSelect();
        onPreview?.(file);
    };

    useEffect(
        () => () => {
            if (selectTimerRef.current) {
                window.clearTimeout(selectTimerRef.current);
            }
        },
        [],
    );

    useEffect(() => {
        setIsPlayingInline(false);
    }, [filename, url]);

    useEffect(() => {
        if (!isPlayingInline) return undefined;

        const handleOutsidePointerDown = (event) => {
            if (inlinePlayerRef.current?.contains(event.target)) return;
            setIsPlayingInline(false);
        };

        document.addEventListener("pointerdown", handleOutsidePointerDown);
        return () => {
            document.removeEventListener(
                "pointerdown",
                handleOutsidePointerDown,
            );
        };
    }, [isPlayingInline]);

    return (
        <div
            className={`relative group rounded-lg border transition-all cursor-pointer overflow-hidden select-none ${
                isSelected
                    ? "border-sky-500 dark:border-sky-400 ring-2 ring-sky-200 dark:ring-sky-800"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
            data-testid={`file-grid-card-${index}`}
            onClick={handleCardClick}
            onDoubleClick={handleCardDoubleClick}
        >
            <div className="w-full aspect-square bg-gray-50 dark:bg-gray-800 relative">
                <MediaThumbnail
                    src={url}
                    filename={filename}
                    mimeType={file?.mimeType || file?.contentType}
                    mediaType={file?._mediaItem?.type || file?.type}
                    mediaStatus={file?._mediaItem?.status || file?.status}
                    mediaError={file?._mediaItem?.error || file?.error}
                    thumbnailSrc={thumbnailUrl}
                    className="w-full h-full"
                    showVideoControls={false}
                />
                {isPlayingInline && playableKind && url && (
                    <div
                        ref={inlinePlayerRef}
                        className="absolute inset-0 z-10 flex items-center justify-center bg-black"
                        onClick={stopCardSelection}
                        onDoubleClick={stopCardSelection}
                        onPointerDown={stopCardSelection}
                    >
                        {playableKind === "video" ? (
                            <video
                                data-testid="media-inline-video-player"
                                src={url}
                                className="h-full w-full object-contain"
                                controls
                                autoPlay
                                playsInline
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-900 via-slate-900 to-fuchsia-950 p-3">
                                <audio
                                    data-testid="media-inline-audio-player"
                                    src={url}
                                    className="w-full"
                                    controls
                                    autoPlay
                                />
                            </div>
                        )}
                    </div>
                )}
                {showPlayCue && (
                    <div
                        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity ${
                            isSelected
                                ? "opacity-60"
                                : "opacity-80 group-hover:opacity-100"
                        }`}
                    >
                        <button
                            type="button"
                            data-testid="media-play-cue"
                            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-black/35 text-white shadow-sm backdrop-blur-[1px] transition-colors hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white dark:border-white/40 dark:bg-black/45 dark:hover:bg-black/60"
                            aria-label={`${t("Play")} ${filename}`}
                            onClick={handlePlayCueClick}
                            onDoubleClick={stopCardSelection}
                            onPointerDown={stopCardSelection}
                        >
                            <Play className="ms-0.5 h-5 w-5 fill-white" />
                        </button>
                    </div>
                )}
                {renderFileOverlay?.(file)}

                {/* Selection checkbox overlay */}
                <div
                    className={`absolute start-2 top-2 ${isSelected || "opacity-0 group-hover:opacity-100"} transition-opacity`}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(file, files, index, e);
                        }}
                        className={`flex items-center justify-center w-5 h-5 rounded border-2 transition-colors ${
                            isSelected
                                ? "bg-sky-600 border-sky-600 dark:bg-sky-500 dark:border-sky-500"
                                : "bg-white/80 dark:bg-gray-900/80 border-gray-300 dark:border-gray-500 hover:border-sky-500"
                        }`}
                    >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                    </button>
                </div>

                {/* Context menu overlay */}
                <div
                    className="absolute end-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={stopCardSelection}
                    onDoubleClick={stopCardSelection}
                    onPointerDown={stopCardSelection}
                >
                    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                onClick={stopCardSelection}
                                onPointerDown={stopCardSelection}
                                className="flex items-center justify-center w-6 h-6 rounded bg-white/80 dark:bg-gray-900/80 hover:bg-white dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-600 transition-colors"
                            >
                                <MoreVertical className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            sideOffset={4}
                            onClick={stopCardSelection}
                            onPointerDown={stopCardSelection}
                        >
                            {onPreview && (
                                <DropdownMenuItem
                                    onSelect={(event) =>
                                        runMenuAction(event, onPreview)
                                    }
                                >
                                    <Eye className="w-4 h-4 me-2" />
                                    {t("Preview")}
                                </DropdownMenuItem>
                            )}
                            {onDownload && (
                                <DropdownMenuItem
                                    onSelect={(event) =>
                                        runMenuAction(event, onDownload)
                                    }
                                >
                                    <Download className="w-4 h-4 me-2" />
                                    {t("Download")}
                                </DropdownMenuItem>
                            )}
                            {enableFilenameEdit && onRename && (
                                <DropdownMenuItem
                                    onSelect={(event) =>
                                        runMenuAction(event, onRename)
                                    }
                                >
                                    <Pencil className="w-4 h-4 me-2" />
                                    {t("Rename")}
                                </DropdownMenuItem>
                            )}
                            {onDelete && (
                                <DropdownMenuItem
                                    onSelect={(event) =>
                                        runMenuAction(event, onDelete)
                                    }
                                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                                >
                                    <Trash2 className="w-4 h-4 me-2" />
                                    {t("Delete")}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* File info */}
            <div className="px-2 py-1.5 min-w-0">
                <p
                    className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate"
                    title={filename}
                >
                    {filename}
                </p>
                {renderFileStatus?.(file)}
                <p className="text-[10px] text-gray-400 tabular-nums">
                    {file.size ? formatFileSize(file.size) : ""}
                </p>
            </div>
        </div>
    );
}

/**
 * FileGridView - grid/thumbnail view of files.
 *
 * @param {Object} props
 * @param {Array} props.files - Files to display
 * @param {Set} props.selectedIds - Currently selected file IDs
 * @param {Function} props.getFileId - Get stable ID for a file
 * @param {Function} props.onSelectFile - (file, orderedFiles, index, event) selection handler
 * @param {Function} props.onPreview - Open file preview
 * @param {Function} props.onDownload - Download a single file
 * @param {Function} props.onRename - Start rename on a file
 * @param {Function} props.onDelete - Request delete of a file
 * @param {boolean} props.enableFilenameEdit - Enable rename action
 */
export default function FileGridView({
    files = [],
    selectedIds = new Set(),
    getFileId,
    onSelectFile,
    onPreview,
    onDownload,
    onRename,
    onDelete,
    enableFilenameEdit = true,
    renderFileOverlay,
    renderFileStatus,
}) {
    if (files.length === 0) return null;

    return (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain min-w-0 p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {files.map((file, index) => {
                    const fileId = getFileId(file);
                    return (
                        <FileGridCard
                            key={fileId}
                            file={file}
                            files={files}
                            index={index}
                            isSelected={selectedIds.has(fileId)}
                            onSelect={onSelectFile}
                            onPreview={onPreview}
                            onDownload={onDownload}
                            onRename={onRename}
                            onDelete={onDelete}
                            enableFilenameEdit={enableFilenameEdit}
                            renderFileOverlay={renderFileOverlay}
                            renderFileStatus={renderFileStatus}
                        />
                    );
                })}
            </div>
        </div>
    );
}
