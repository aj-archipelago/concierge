"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import i18next from "i18next";
import {
    Check,
    ArrowUpDown,
    ChevronUp,
    ChevronDown,
    Download,
    FileText,
    Loader2,
    Upload,
} from "lucide-react";
import {
    useFilePreview,
    renderFilePreview,
} from "@/src/components/chat/useFilePreview";
import { isYoutubeUrl, getYoutubeEmbedUrl } from "@/src/utils/urlUtils";
import MediaThumbnail from "@/src/components/common/MediaThumbnail";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useItemSelection } from "@/src/components/images/hooks/useItemSelection";
import BulkActionsBar from "@/src/components/common/BulkActionsBar";
import FilterInput from "@/src/components/common/FilterInput";
import EmptyState from "@/src/components/common/EmptyState";
import { createFileId } from "@/src/components/common/fileIdUtils";
import {
    getFileUrl as _getFileUrl,
    getFilename as _getFilename,
    getDownloadUrl,
    INVALID_FILENAME_CHARS,
} from "@/src/utils/fileDownloadUtils";

// ============================================================================
// Utility functions for file handling
// ============================================================================

// Re-export from fileDownloadUtils (canonical source) with FileManager-specific defaults.
// Wraps through the image proxy so blob URLs are stable (SAS tokens stripped) and
// the browser can cache responses long-term via the proxy's Cache-Control headers.
export function getFileUrl(file) {
    return getDownloadUrl(_getFileUrl(file));
}

const TEXT_PREVIEW_EXTENSIONS = new Set([
    "bash",
    "c",
    "clj",
    "cpp",
    "cs",
    "css",
    "csv",
    "dart",
    "dockerfile",
    "erl",
    "ex",
    "exs",
    "go",
    "graphql",
    "h",
    "hpp",
    "hs",
    "htm",
    "html",
    "java",
    "js",
    "json",
    "jsx",
    "kt",
    "less",
    "lua",
    "makefile",
    "md",
    "mdx",
    "php",
    "pl",
    "proto",
    "py",
    "r",
    "rb",
    "rs",
    "scala",
    "scss",
    "sh",
    "sql",
    "swift",
    "tf",
    "toml",
    "ts",
    "tsx",
    "txt",
    "vue",
    "xml",
    "yaml",
    "yml",
    "zsh",
]);

function getFileExtension(value) {
    if (!value) return "";
    const cleanValue = String(value).split("?")[0].split("#")[0];
    const filename = cleanValue.split("/").pop() || "";
    const lastDotIndex = filename.lastIndexOf(".");
    return lastDotIndex > 0
        ? filename.slice(lastDotIndex + 1).toLowerCase()
        : "";
}

function isTextPreviewFile(file, url) {
    const mimeType = file?.mimeType || "";
    if (
        mimeType.startsWith("text/") ||
        [
            "application/ecmascript",
            "application/javascript",
            "application/json",
            "application/xml",
            "application/x-javascript",
            "application/x-yaml",
            "application/yaml",
        ].includes(mimeType)
    ) {
        return true;
    }

    const extension =
        getFileExtension(_getFilename(file)) ||
        getFileExtension(file?.filename) ||
        getFileExtension(file?.name) ||
        getFileExtension(url);

    return TEXT_PREVIEW_EXTENSIONS.has(extension);
}

export function getFilePreviewUrl(file) {
    if (typeof file === "string") {
        return TEXT_PREVIEW_EXTENSIONS.has(getFileExtension(file))
            ? file
            : getDownloadUrl(file);
    }

    const url = file?.converted?.url || _getFileUrl(file);
    return isTextPreviewFile(file, url) ? url : getDownloadUrl(url);
}

export function getFileThumbnailUrl(file) {
    if (typeof file !== "object" || file === null) return null;
    const media = file._mediaItem || file;
    const thumbnailUrl =
        media.thumbnailAzureUrl ||
        media.thumbnailUrl ||
        media.posterUrl ||
        media.thumbnailGcsUrl ||
        file.thumbnailUrl ||
        file.posterUrl ||
        null;

    return thumbnailUrl ? getDownloadUrl(thumbnailUrl) : null;
}

export function getFilename(file) {
    return _getFilename(file) || "Unnamed file";
}

/**
 * Get file date for sorting/display
 */
export function getFileDate(file) {
    if (typeof file !== "object") return null;
    const dateStr =
        file?.modifiedDate ||
        file?.lastModified ||
        file?.lastAccessed ||
        file?.addedDate ||
        file?.uploadedAt;
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
}

/**
 * Short date for file lists, using the app i18n locale (not the browser default).
 */
export function formatFileListDate(fileDate) {
    if (!fileDate) return "—";
    const d = fileDate instanceof Date ? fileDate : new Date(fileDate);
    if (isNaN(d.getTime())) return "—";
    const locale = i18next.resolvedLanguage || i18next.language || "en";
    const isArabic = /^ar/i.test(locale);
    return d.toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
        ...(isArabic ? { calendar: "gregory" } : {}),
    });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export { createFileId };

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Sortable column header component
 */
function SortableHeader({
    children,
    sortKey,
    currentSort,
    currentDirection,
    onSort,
    className = "",
}) {
    const isRtl = i18next.language === "ar";
    const isActive = currentSort === sortKey;
    const Icon = isActive
        ? currentDirection === "asc"
            ? ChevronUp
            : ChevronDown
        : ArrowUpDown;

    return (
        <TableHead
            className={`h-9 px-2 sm:px-3 ${isRtl ? "text-right" : "text-left"} ${className}`}
        >
            <button
                onClick={() => onSort(sortKey)}
                className={`flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-gray-100 transition-colors text-gray-600 dark:text-gray-400 ${isRtl ? "flex-row-reverse" : ""}`}
            >
                {children}
                <Icon
                    className={`h-3.5 w-3.5 ${isActive ? "text-sky-600 dark:text-sky-400" : ""}`}
                />
            </button>
        </TableHead>
    );
}

/**
 * Hover preview component
 * Exported for use in other components
 */
export function HoverPreview({ file }) {
    const url = file ? getFilePreviewUrl(file) : null;
    const filename = file ? getFilename(file) : null;
    if (!file || !url) return null;

    return (
        <div className="hidden sm:flex fixed z-[100] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden items-center justify-center p-2">
            <MediaThumbnail
                src={url}
                filename={filename}
                mimeType={file?.mimeType}
                className="w-full h-full rounded"
                objectFit="contain"
            />
        </div>
    );
}

/**
 * File Preview Dialog Component
 */
export function FilePreviewDialog({
    file,
    onClose,
    onDownload,
    t,
    autoPlay = false,
}) {
    const isRtl = i18next.language === "ar";
    const url = file ? getFilePreviewUrl(file) : null;
    const filename = file ? getFilename(file) : null;
    const mimeType = file?.mimeType;
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const isYouTube = url ? isYoutubeUrl(url) : false;
    const youtubeEmbedUrl = isYouTube && url ? getYoutubeEmbedUrl(url) : null;

    const fileType = useFilePreview(url, filename, mimeType);

    // Reset loading state when file changes
    useEffect(() => {
        setMediaLoaded(false);
    }, [file]);

    // Media types that need loading (images, videos, iframes)
    const needsLoading = fileType.isImage || fileType.isVideo || isYouTube;

    const preview = url ? (
        isYouTube && youtubeEmbedUrl ? (
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
                title={t("YouTube video player")}
                onLoad={() => setMediaLoaded(true)}
            />
        ) : (
            renderFilePreview({
                src: url,
                filename,
                fileType,
                className:
                    fileType.isPdf || fileType.isDoc
                        ? "w-full max-h-[80vh] rounded border-none"
                        : "max-w-full max-h-[80vh] object-contain rounded",
                onLoad: () => setMediaLoaded(true),
                autoPlay: fileType.isVideo || autoPlay,
                t,
            })
        )
    ) : null;

    const hasPreview = preview !== null;
    const showSpinner = hasPreview && needsLoading && !mediaLoaded;

    return (
        <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className={`${showSpinner ? "w-[400px] h-[400px]" : "max-w-[95vw] max-h-[95vh]"} p-4 sm:p-6 flex items-center justify-center ${isRtl ? "text-right" : ""}`}
            >
                <DialogTitle className="sr-only">
                    {isYouTube ? t("YouTube video player") : t("File preview")}
                </DialogTitle>
                <DialogDescription className="sr-only">
                    {filename
                        ? t("Viewing {{filename}} in full screen", { filename })
                        : isYouTube
                          ? t("View YouTube video in full screen")
                          : t("View file in full screen")}
                </DialogDescription>
                <div className="w-full flex items-center justify-center relative">
                    {showSpinner && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    )}
                    {hasPreview ? (
                        <div>{preview}</div>
                    ) : (
                        <div
                            className={`text-gray-500 dark:text-gray-400 text-center p-8 ${isRtl ? "text-right" : ""}`}
                        >
                            <div className="mb-4">
                                {filename ? (
                                    <p className="text-lg font-medium">
                                        {filename}
                                    </p>
                                ) : (
                                    <p className="text-lg font-medium">
                                        {t("No preview available")}
                                    </p>
                                )}
                            </div>
                            <p className="text-sm">
                                {t(
                                    "Preview is not available for this file type",
                                )}
                            </p>
                        </div>
                    )}
                    {url && !showSpinner && (
                        <button
                            onClick={async (e) => {
                                if (downloading) return;
                                setDownloading(true);
                                try {
                                    await onDownload(file, e);
                                } finally {
                                    setDownloading(false);
                                }
                            }}
                            disabled={downloading}
                            className={`absolute bottom-4 ${isRtl ? "left-4" : "right-4"} bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-2 rounded-lg shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10`}
                            title={
                                isYouTube ? t("Open in YouTube") : t("Download")
                            }
                            aria-label={
                                isYouTube ? t("Open in YouTube") : t("Download")
                            }
                        >
                            {downloading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Download className="w-5 h-5" />
                            )}
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================================
// Main FileManager Component
// ============================================================================

/**
 * Unified FileManager component for displaying and managing files
 *
 * @param {Object} props
 * @param {Array} props.files - Array of file objects to display
 * @param {boolean} props.isLoading - Whether files are loading
 * @param {Function} props.onRefetch - Function to refetch files
 * @param {Function} props.onDelete - Async function to delete files (receives array of file objects)
 * @param {Function} props.onDownload - Optional async function to download files (receives array of file objects)
 * @param {boolean} props.isDownloading - Optional flag indicating if download is in progress
 * @param {Function} props.onUploadClick - Optional callback when upload button is clicked (parent handles actual upload UI)
 * @param {Function} props.onUpdateMetadata - Optional async function to update file metadata
 * @param {string} props.title - Title for the file list
 * @param {React.ReactNode} props.titleExtra - Optional extra content to render after file count in header
 * @param {React.ReactNode} props.filterExtra - Optional extra content to render on the same line as the filter
 * @param {string} props.emptyTitle - Title for empty state
 * @param {string} props.emptyDescription - Description for empty state
 * @param {string} props.noMatchTitle - Title when filter has no results
 * @param {string} props.noMatchDescription - Description when filter has no results
 * @param {boolean} props.showDateColumn - Whether to show the date column
 * @param {boolean} props.enableFilenameEdit - Whether filenames are editable
 * @param {boolean} props.enableHoverPreview - Whether to show hover previews
 * @param {boolean} props.enableBulkActions - Whether to enable multi-select and bulk actions
 * @param {boolean} props.enableFilter - Whether to show the filter input
 * @param {boolean} props.enableSort - Whether columns are sortable
 * @param {boolean} props.optimisticDelete - Whether to use optimistic delete
 * @param {string} props.containerHeight - CSS height for the scrollable container
 * @param {Object} props.customActions - Custom actions for the bulk actions bar
 * @param {string} props.selectionMode - "bulk" (default) or "controlled" - whether selection is managed internally or externally
 * @param {Set<string>} props.selectedIds - For controlled mode: Set of selected file IDs
 * @param {Function} props.onSelectionChange - For controlled mode: callback when selection changes (receives Set<string>)
 * @param {Function} props.rowActions - Optional function that receives (file) and returns ReactNode for per-row action buttons
 * @param {React.ReactNode} props.headerContent - Optional custom content to render in the header area (replaces default header)
 */
export default function FileManager({
    files = [],
    isLoading = false,
    onRefetch,
    onDelete,
    onDownload,
    isDownloading = false,
    onUploadClick,
    onUpdateMetadata,
    title,
    titleExtra,
    filterExtra,
    emptyTitle,
    emptyDescription,
    noMatchTitle,
    noMatchDescription,
    showDateColumn = true,
    enableFilenameEdit = false,
    enableHoverPreview = true,
    enableBulkActions = true,
    enableFilter = true,
    enableSort = true,
    optimisticDelete = true,
    containerHeight = "60vh",
    customActions = null,
    selectionMode = "bulk",
    selectedIds: externalSelectedIds = null,
    onSelectionChange = null,
    rowActions = null,
    headerContent = null,
    emptyStateFilterExtra = null,
}) {
    const { t } = useTranslation();
    const isRtl = i18next.language === "ar";

    // Local state for files (for optimistic updates)
    const [localFiles, setLocalFiles] = useState(files);
    const [filterText, setFilterText] = useState("");
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
    const [sortKey, setSortKey] = useState("date");
    const [sortDirection, setSortDirection] = useState("desc");
    const [editingFileId, setEditingFileId] = useState(null);
    const [editingFilename, setEditingFilename] = useState("");
    const [hoveredFile, setHoveredFile] = useState(null);
    const [previewFile, setPreviewFile] = useState(null);
    const [deletingFileIds, setDeletingFileIds] = useState(new Set());
    const containerRef = useRef(null);
    const hoverTimeoutRef = useRef(null);
    const filenameInputRef = useRef(null);

    // Update local files when prop changes, deduplicating by identity.
    // The same content hash can appear in multiple scopes (chat + global),
    // and files without blobPath fall back to hash — causing key collisions.
    useEffect(() => {
        const seen = new Set();
        const deduped = files.filter((file) => {
            const key =
                file?.blobPath ||
                file?._id ||
                file?.hash ||
                file?.url ||
                getFilename(file);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        setLocalFiles(deduped);
    }, [files]);

    // Get file ID helper
    const getFileId = useCallback((file) => createFileId(file), []);

    // Selection hook (only used in bulk mode)
    const {
        selectedIds: internalSelectedIds,
        selectedObjects: internalSelectedObjects,
        clearSelection,
        toggleSelection,
        selectRange,
        setSelectedIds,
        setSelectedObjects,
        lastSelectedId,
        setLastSelectedId,
    } = useItemSelection(getFileId);

    // Use external selection in controlled mode, internal in bulk mode
    const isControlledMode = selectionMode === "controlled";

    // Hover handlers
    const handleMouseEnter = useCallback((file) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredFile(file);
        }, 300);
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        setHoveredFile(null);
    }, []);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }
        };
    }, []);

    // Filter files
    const filteredFiles = useMemo(() => {
        if (!filterText.trim()) return localFiles;
        const searchLower = filterText.toLowerCase();
        return localFiles.filter((file) => {
            const filename = getFilename(file).toLowerCase();
            return filename.includes(searchLower);
        });
    }, [localFiles, filterText]);

    // Sort files
    const sortedFiles = useMemo(() => {
        if (!enableSort) return filteredFiles;
        const filesCopy = [...filteredFiles];

        filesCopy.sort((a, b) => {
            if (sortKey === "filename") {
                const nameA = getFilename(a).toLowerCase();
                const nameB = getFilename(b).toLowerCase();
                const comparison = nameA.localeCompare(nameB);
                return sortDirection === "asc" ? comparison : -comparison;
            } else if (sortKey === "size") {
                const sizeA = a?.size || 0;
                const sizeB = b?.size || 0;
                const comparison = sizeB - sizeA;
                return sortDirection === "asc" ? -comparison : comparison;
            } else {
                // Sort by date
                const dateA = getFileDate(a);
                const dateB = getFileDate(b);
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                const comparison = dateB.getTime() - dateA.getTime();
                return sortDirection === "asc" ? -comparison : comparison;
            }
        });

        return filesCopy;
    }, [filteredFiles, sortKey, sortDirection, enableSort]);

    // Use external selection in controlled mode, internal in bulk mode
    // Must be computed after sortedFiles is defined
    const selectedIds = isControlledMode
        ? externalSelectedIds || new Set()
        : internalSelectedIds;

    const selectedObjects = isControlledMode
        ? sortedFiles.filter((file) => selectedIds.has(getFileId(file)))
        : internalSelectedObjects;

    const handleSort = useCallback(
        (key) => {
            if (!enableSort) return;
            if (sortKey === key) {
                setSortDirection(sortDirection === "asc" ? "desc" : "asc");
            } else {
                setSortKey(key);
                setSortDirection(key === "date" ? "desc" : "asc");
            }
        },
        [sortKey, sortDirection, enableSort],
    );

    // Delete files handler
    const handleRemoveFiles = useCallback(
        async (filesToRemove) => {
            if (!onDelete || filesToRemove.length === 0) return;

            const validFiles = filesToRemove.filter(
                (file) => typeof file === "object",
            );
            if (validFiles.length === 0) {
                clearSelection();
                return;
            }

            const fileIdsToRemove = new Set(
                validFiles.map((file) => getFileId(file)),
            );

            if (optimisticDelete) {
                // Optimistically remove files from local state
                setLocalFiles((prev) =>
                    prev.filter(
                        (file) => !fileIdsToRemove.has(getFileId(file)),
                    ),
                );
                clearSelection();

                // Delete files in background
                onDelete(validFiles)
                    .then(async () => {
                        if (onRefetch) {
                            await new Promise((resolve) =>
                                setTimeout(resolve, 200),
                            );
                            await onRefetch();
                        }
                    })
                    .catch((error) => {
                        console.error("Failed to delete files:", error);
                        if (onRefetch) onRefetch();
                    });
            } else {
                // Show loading state and wait for delete
                setDeletingFileIds(fileIdsToRemove);
                try {
                    await onDelete(validFiles);
                    clearSelection();
                    if (onRefetch) await onRefetch();
                } catch (error) {
                    console.error("Failed to delete files:", error);
                } finally {
                    setDeletingFileIds(new Set());
                }
            }
        },
        [onDelete, onRefetch, getFileId, clearSelection, optimisticDelete],
    );

    const handleBulkDelete = useCallback(() => {
        setShowBulkDeleteConfirm(false);
        handleRemoveFiles(selectedObjects);
    }, [selectedObjects, handleRemoveFiles]);

    // Selection handlers
    const handleSelectFile = useCallback(
        (file, index, e) => {
            // Prevent text selection when shift-clicking for range select
            if (e.shiftKey) {
                e.preventDefault();
            }
            const fileId = getFileId(file);

            if (isControlledMode) {
                // Controlled mode: notify parent of selection change
                if (!onSelectionChange) return;

                // Use externalSelectedIds directly to avoid stale closures
                const currentSelectedIds = externalSelectedIds || new Set();
                const newSelectedIds = new Set(currentSelectedIds);

                if (e.shiftKey && lastSelectedId !== null) {
                    // Range selection in controlled mode
                    const lastIndex = sortedFiles.findIndex(
                        (f) => getFileId(f) === lastSelectedId,
                    );
                    if (lastIndex !== -1 && index !== -1) {
                        const start = Math.min(lastIndex, index);
                        const end = Math.max(lastIndex, index);
                        for (let i = start; i <= end; i++) {
                            const rangeFileId = getFileId(sortedFiles[i]);
                            newSelectedIds.add(rangeFileId);
                        }
                    }
                } else {
                    // Toggle single file
                    if (newSelectedIds.has(fileId)) {
                        newSelectedIds.delete(fileId);
                    } else {
                        newSelectedIds.add(fileId);
                    }
                }
                onSelectionChange(newSelectedIds);
                setLastSelectedId(fileId);
                return;
            }

            // Bulk mode: use internal selection
            if (e.shiftKey && lastSelectedId !== null) {
                const lastIndex = sortedFiles.findIndex(
                    (f) => getFileId(f) === lastSelectedId,
                );
                if (lastIndex !== -1 && index !== -1) {
                    const start = Math.min(lastIndex, index);
                    const end = Math.max(lastIndex, index);
                    selectRange(sortedFiles, start, end);
                    setLastSelectedId(fileId);
                    return;
                }
            }
            toggleSelection(file);
            setLastSelectedId(fileId);
        },
        [
            sortedFiles,
            lastSelectedId,
            toggleSelection,
            selectRange,
            getFileId,
            setLastSelectedId,
            isControlledMode,
            onSelectionChange,
            externalSelectedIds,
        ],
    );

    const handleOpenFile = useCallback((file, e) => {
        e.stopPropagation();
        setPreviewFile(file);
    }, []);

    const handleDownload = useCallback(async (file, e) => {
        e?.stopPropagation?.();
        const url = getFileUrl(file);
        if (!url) return;
        const proxyUrl = getDownloadUrl(url);
        const name = getFilename(file) || "";
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
            // Fallback: open directly
            window.open(proxyUrl, "_blank", "noopener,noreferrer");
        }
    }, []);

    // Filename editing handlers
    useEffect(() => {
        if (editingFileId && filenameInputRef.current) {
            filenameInputRef.current.focus();
            filenameInputRef.current.select();
        }
    }, [editingFileId]);

    useEffect(() => {
        if (editingFileId) {
            const fileStillExists = localFiles.some(
                (file) => getFileId(file) === editingFileId,
            );
            if (!fileStillExists) {
                setEditingFileId(null);
                setEditingFilename("");
            }
        }
    }, [localFiles, editingFileId, getFileId]);

    const handleStartEdit = useCallback(
        (file, e) => {
            if (!enableFilenameEdit) return;
            e.stopPropagation();
            const fileId = getFileId(file);
            const currentFilename = getFilename(file);
            setEditingFileId(fileId);
            setEditingFilename(currentFilename);
        },
        [getFileId, enableFilenameEdit],
    );

    const handleSaveFilename = useCallback(
        async (file) => {
            if (!onUpdateMetadata) return;

            const trimmedFilename = editingFilename.trim();
            if (!trimmedFilename) {
                setEditingFileId(null);
                setEditingFilename("");
                return;
            }

            if (INVALID_FILENAME_CHARS.test(trimmedFilename)) {
                toast.error(t("Filename contains invalid characters."));
                return;
            }

            if (trimmedFilename.length > 255) {
                toast.error(t("Filename is too long."));
                return;
            }

            const fileId = getFileId(file);

            // Optimistically update local state
            setLocalFiles((prev) =>
                prev.map((f) =>
                    getFileId(f) === fileId
                        ? { ...f, displayFilename: trimmedFilename }
                        : f,
                ),
            );

            setEditingFileId(null);
            setEditingFilename("");

            // Save in background
            onUpdateMetadata(file, { displayFilename: trimmedFilename })
                .then(async () => {
                    if (onRefetch) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 200),
                        );
                        await onRefetch();
                    }
                })
                .catch((error) => {
                    console.error("Failed to save filename:", error);
                    toast.error(t("Failed to save filename."));
                    if (onRefetch) onRefetch();
                });
        },
        [editingFilename, onUpdateMetadata, onRefetch, t, getFileId],
    );

    const handleCancelEdit = useCallback(() => {
        setEditingFileId(null);
        setEditingFilename("");
    }, []);

    const handleFilenameKeyDown = useCallback(
        (e, file) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                handleSaveFilename(file);
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                handleCancelEdit();
            }
        },
        [handleSaveFilename, handleCancelEdit],
    );

    // Select all handler
    const allSelected =
        selectedIds.size === sortedFiles.length && sortedFiles.length > 0;

    const handleSelectAll = useCallback(() => {
        if (isControlledMode) {
            // Controlled mode: notify parent
            if (!onSelectionChange) return;
            if (allSelected) {
                onSelectionChange(new Set());
            } else {
                const newSelectedIds = new Set(
                    sortedFiles.map((file) => getFileId(file)),
                );
                onSelectionChange(newSelectedIds);
            }
        } else {
            // Bulk mode: use internal selection
            if (allSelected) {
                clearSelection();
            } else {
                const newSelectedIds = new Set(
                    sortedFiles.map((file) => getFileId(file)),
                );
                setSelectedIds(newSelectedIds);
                setSelectedObjects([...sortedFiles]);
            }
        }
    }, [
        allSelected,
        sortedFiles,
        clearSelection,
        getFileId,
        setSelectedIds,
        setSelectedObjects,
        isControlledMode,
        onSelectionChange,
    ]);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    {t("Loading files...")}
                </span>
            </div>
        );
    }

    // Empty state
    if (localFiles.length === 0) {
        return (
            <EmptyState
                icon={<FileText className="w-12 h-12 text-gray-400" />}
                title={emptyTitle || t("No files")}
                description={
                    emptyDescription || t("No files have been uploaded yet.")
                }
            >
                {/* Show emptyStateFilterExtra or filterExtra (e.g. "Show files from all conversations" checkbox) centered, grouped with message */}
                {(emptyStateFilterExtra || filterExtra) && (
                    <div className="mt-2 flex items-center justify-center">
                        {emptyStateFilterExtra || filterExtra}
                    </div>
                )}
                {onUploadClick && (
                    <button
                        onClick={onUploadClick}
                        className="mt-6 flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                    >
                        <Upload className="w-4 h-4" />
                        {t("Upload Files")}
                    </button>
                )}
            </EmptyState>
        );
    }

    // Filtered empty state
    if (sortedFiles.length === 0 && filterText) {
        return (
            <div
                className="flex flex-col gap-3 min-w-0 overflow-hidden"
                ref={containerRef}
            >
                {/* Header with filter */}
                <div className="flex flex-col gap-2">
                    {title && (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    {title}
                                </h3>
                                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                    (0 / {localFiles.length})
                                </span>
                                {titleExtra}
                            </div>
                        </div>
                    )}
                    {(enableFilter || filterExtra) && (
                        <div className="flex items-center gap-3">
                            {enableFilter && (
                                <FilterInput
                                    value={filterText}
                                    onChange={setFilterText}
                                    onClear={() => setFilterText("")}
                                    placeholder={t("Filter files...")}
                                    className="flex-1"
                                />
                            )}
                            {filterExtra}
                        </div>
                    )}
                </div>

                <div
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex items-center justify-center"
                    style={{ height: containerHeight }}
                >
                    <EmptyState
                        icon={<FileText className="w-12 h-12 text-gray-400" />}
                        title={noMatchTitle || t("No files match")}
                        description={
                            noMatchDescription ||
                            t(
                                "No files match your search. Try a different filter.",
                            )
                        }
                    />
                </div>
            </div>
        );
    }

    return (
        <>
            <div
                className="flex flex-col gap-3 min-w-0 overflow-hidden"
                ref={containerRef}
            >
                {/* Header with filter and upload button */}
                {headerContent ? (
                    headerContent
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            {title && (
                                <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                        {title}
                                    </h3>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                        ({sortedFiles.length}
                                        {sortedFiles.length !==
                                            localFiles.length &&
                                            ` / ${localFiles.length}`}
                                        )
                                    </span>
                                    {titleExtra}
                                </div>
                            )}
                            {!title && <div />}
                            {onUploadClick && (
                                <button
                                    onClick={onUploadClick}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    {t("Upload")}
                                </button>
                            )}
                        </div>
                        {(enableFilter || filterExtra) && (
                            <div className="flex items-center gap-3">
                                {enableFilter && (
                                    <FilterInput
                                        value={filterText}
                                        onChange={setFilterText}
                                        onClear={() => setFilterText("")}
                                        placeholder={t("Filter files...")}
                                        className="flex-1"
                                    />
                                )}
                                {filterExtra}
                            </div>
                        )}
                    </div>
                )}

                {/* File list table */}
                <div
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden overflow-y-auto overflow-x-hidden"
                    style={{ height: containerHeight }}
                >
                    <Table>
                        <TableHeader className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                            <TableRow className="border-b border-gray-200 dark:border-gray-700">
                                {(enableBulkActions || isControlledMode) && (
                                    <TableHead className="h-9 w-10 px-1 sm:px-2">
                                        <div
                                            className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${
                                                allSelected
                                                    ? "bg-sky-600 dark:bg-sky-500 border-sky-600 dark:border-sky-500"
                                                    : "border-gray-300 dark:border-gray-600 hover:border-sky-500 dark:hover:border-sky-400"
                                            }`}
                                            onClick={handleSelectAll}
                                        >
                                            <Check
                                                className={`w-3 h-3 text-white ${
                                                    allSelected
                                                        ? "opacity-100"
                                                        : "opacity-0"
                                                }`}
                                            />
                                        </div>
                                    </TableHead>
                                )}
                                <TableHead className="h-9 w-8 sm:w-10 px-1 sm:px-2"></TableHead>
                                {enableSort ? (
                                    <SortableHeader
                                        sortKey="filename"
                                        currentSort={sortKey}
                                        currentDirection={sortDirection}
                                        onSort={handleSort}
                                    >
                                        {t("Filename")}
                                    </SortableHeader>
                                ) : (
                                    <TableHead
                                        className={`h-9 px-2 sm:px-3 ${isRtl ? "text-right" : "text-left"}`}
                                    >
                                        {t("Filename")}
                                    </TableHead>
                                )}
                                {showDateColumn &&
                                    (enableSort ? (
                                        <SortableHeader
                                            sortKey="date"
                                            currentSort={sortKey}
                                            currentDirection={sortDirection}
                                            onSort={handleSort}
                                            className="hidden sm:table-cell"
                                        >
                                            {t("Date")}
                                        </SortableHeader>
                                    ) : (
                                        <TableHead
                                            className={`h-9 px-2 sm:px-3 hidden sm:table-cell ${isRtl ? "text-right" : "text-left"}`}
                                        >
                                            {t("Date")}
                                        </TableHead>
                                    ))}
                                {rowActions && (
                                    <TableHead className="h-9 w-10 px-1 sm:px-2"></TableHead>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedFiles.map((file, index) => {
                                const fileId = getFileId(file);
                                const isSelected = selectedIds.has(fileId);
                                const isDeleting = deletingFileIds.has(fileId);
                                const filename = getFilename(file);
                                const fileUrl = getFilePreviewUrl(file);
                                const fileMimeType = file?.mimeType;

                                return (
                                    <TableRow
                                        key={fileId}
                                        className={`cursor-pointer select-none ${
                                            isSelected
                                                ? "bg-sky-50 dark:bg-sky-900/20"
                                                : ""
                                        } ${isDeleting ? "opacity-50" : ""}`}
                                        onClick={
                                            enableBulkActions ||
                                            isControlledMode
                                                ? (e) =>
                                                      handleSelectFile(
                                                          file,
                                                          index,
                                                          e,
                                                      )
                                                : undefined
                                        }
                                    >
                                        {(enableBulkActions ||
                                            isControlledMode) && (
                                            <TableCell
                                                className={`px-1 sm:px-2 py-1.5 ${isRtl ? "text-right" : "text-left"}`}
                                            >
                                                <div
                                                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                                                        isSelected
                                                            ? "bg-sky-600 dark:bg-sky-500 border-sky-600 dark:border-sky-500"
                                                            : "border-gray-300 dark:border-gray-600"
                                                    }`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSelectFile(
                                                            file,
                                                            index,
                                                            e,
                                                        );
                                                    }}
                                                >
                                                    <Check
                                                        className={`w-3 h-3 text-white ${
                                                            isSelected
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        }`}
                                                    />
                                                </div>
                                            </TableCell>
                                        )}
                                        <TableCell
                                            className={`px-1 sm:px-2 py-1.5 relative group ${isRtl ? "text-right" : "text-left"}`}
                                            onMouseEnter={
                                                enableHoverPreview
                                                    ? () =>
                                                          handleMouseEnter(file)
                                                    : undefined
                                            }
                                            onMouseLeave={
                                                enableHoverPreview
                                                    ? handleMouseLeave
                                                    : undefined
                                            }
                                        >
                                            <div
                                                className="w-6 h-6 rounded overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 cursor-pointer"
                                                onClick={(e) =>
                                                    handleOpenFile(file, e)
                                                }
                                            >
                                                <MediaThumbnail
                                                    src={fileUrl}
                                                    filename={filename}
                                                    mimeType={fileMimeType}
                                                    className="w-full h-full"
                                                    iconSize="w-4 h-4"
                                                    autoPlayVideo={false}
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell
                                            className={`px-2 sm:px-3 py-1.5 min-w-0 max-w-[200px] sm:max-w-[300px] ${isRtl ? "text-right" : "text-left"}`}
                                        >
                                            <div className="min-w-0 overflow-hidden">
                                                {editingFileId === fileId ? (
                                                    <input
                                                        ref={filenameInputRef}
                                                        type="text"
                                                        value={editingFilename}
                                                        onChange={(e) =>
                                                            setEditingFilename(
                                                                e.target.value,
                                                            )
                                                        }
                                                        onKeyDown={(e) =>
                                                            handleFilenameKeyDown(
                                                                e,
                                                                file,
                                                            )
                                                        }
                                                        onBlur={() =>
                                                            handleSaveFilename(
                                                                file,
                                                            )
                                                        }
                                                        onClick={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                        aria-label={t(
                                                            "Edit filename",
                                                        )}
                                                        className="w-full text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-sky-500 dark:border-sky-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
                                                    />
                                                ) : (
                                                    <span
                                                        className={`text-sm text-gray-700 dark:text-gray-300 truncate block ${enableFilenameEdit ? "cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" : ""}`}
                                                        title={filename}
                                                        onClick={
                                                            enableFilenameEdit
                                                                ? (e) =>
                                                                      handleStartEdit(
                                                                          file,
                                                                          e,
                                                                      )
                                                                : undefined
                                                        }
                                                    >
                                                        {filename}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        {showDateColumn && (
                                            <TableCell
                                                className={`px-2 sm:px-3 py-1.5 hidden sm:table-cell ${isRtl ? "text-right" : "text-left"}`}
                                            >
                                                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                    {formatFileListDate(
                                                        getFileDate(file),
                                                    )}
                                                </span>
                                            </TableCell>
                                        )}
                                        {rowActions && (
                                            <TableCell
                                                className={`px-1 sm:px-2 py-1.5 ${isRtl ? "text-right" : "text-left"}`}
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                {rowActions(file)}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Hover Preview */}
            {enableHoverPreview && <HoverPreview file={hoveredFile} />}

            {/* Preview Dialog */}
            {previewFile && (
                <FilePreviewDialog
                    file={previewFile}
                    onClose={() => setPreviewFile(null)}
                    onDownload={handleDownload}
                    t={t}
                />
            )}

            {/* Bulk Actions Bar - only show in bulk mode */}
            {enableBulkActions &&
                (onDelete || onDownload) &&
                !isControlledMode && (
                    <BulkActionsBar
                        selectedCount={selectedIds.size}
                        allSelected={allSelected}
                        onSelectAll={handleSelectAll}
                        onClearSelection={clearSelection}
                        actions={{
                            ...(onDownload
                                ? {
                                      download: {
                                          onClick: async () => {
                                              try {
                                                  await onDownload(
                                                      selectedObjects,
                                                  );
                                                  clearSelection();
                                              } catch (error) {
                                                  console.error(
                                                      "Download error:",
                                                      error,
                                                  );
                                                  // Error handling is up to the parent component
                                              }
                                          },
                                          disabled: isDownloading,
                                          loadingLabel: t("Creating ZIP..."),
                                          label:
                                              selectedIds.size === 1
                                                  ? t("Download")
                                                  : t("Download ZIP"),
                                          ariaLabel: `${t("Download")} (${selectedIds.size})`,
                                      },
                                  }
                                : {}),
                            ...(onDelete
                                ? {
                                      delete: {
                                          onClick: () =>
                                              setShowBulkDeleteConfirm(true),
                                          disabled: false,
                                          label: t("Delete"),
                                          ariaLabel: `${t("Delete")} (${selectedIds.size})`,
                                      },
                                  }
                                : {}),
                            // Wrap custom actions to pass selectedObjects and clearSelection
                            ...(customActions
                                ? {
                                      ...customActions,
                                      custom: customActions.custom?.map(
                                          (action) => ({
                                              ...action,
                                              onClick: async () => {
                                                  await action.onClick?.(
                                                      selectedObjects,
                                                  );
                                                  clearSelection();
                                              },
                                          }),
                                      ),
                                  }
                                : {}),
                        }}
                    />
                )}

            {/* Bulk Delete Confirmation */}
            <AlertDialog
                open={showBulkDeleteConfirm}
                onOpenChange={setShowBulkDeleteConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader className={isRtl ? "text-right" : ""}>
                        <AlertDialogTitle>
                            {t("Delete Selected Files?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete {{count}} file(s)? This action cannot be undone.",
                                { count: selectedIds.size },
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter
                        className={
                            isRtl ? "flex-row-reverse sm:flex-row-reverse" : ""
                        }
                    >
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDelete}>
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
