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
import { getFileIcon } from "@/src/utils/mediaUtils";
import {
    useFilePreview,
    renderFilePreview,
} from "@/src/components/chat/useFilePreview";
import {
    isYoutubeUrl,
    getYoutubeEmbedUrl,
    extractYoutubeVideoId,
    getYoutubeThumbnailUrl,
} from "@/src/utils/urlUtils";
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
import {
    Tooltip,
    TooltipProvider,
    TooltipTrigger,
    TooltipContent,
} from "@/components/ui/tooltip";
import { useItemSelection } from "@/src/components/images/hooks/useItemSelection";
import BulkActionsBar from "@/src/components/common/BulkActionsBar";
import FilterInput from "@/src/components/common/FilterInput";
import EmptyState from "@/src/components/common/EmptyState";
import { Spinner } from "@/components/ui/spinner";

// ============================================================================
// Utility functions for file handling
// ============================================================================

/**
 * Get file URL from a file object
 */
export function getFileUrl(file) {
    if (typeof file === "string") return file;
    return file?.url || file?.gcs || null;
}

/**
 * Get filename from a file object
 */
export function getFilename(file) {
    if (typeof file === "string") return file;
    return (
        file?.displayFilename ||
        file?.originalName ||
        file?.filename ||
        file?.name ||
        file?.path ||
        "Unnamed file"
    );
}

/**
 * Get file date for sorting/display
 */
export function getFileDate(file) {
    if (typeof file !== "object") return null;
    const dateStr =
        file?.modifiedDate ||
        file?.lastAccessed ||
        file?.addedDate ||
        file?.uploadedAt;
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
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

/**
 * Create a stable ID for a file
 */
export function createFileId(file) {
    if (typeof file === "object" && file._id) return `id-${file._id}`;
    if (typeof file === "object" && file.id) return `id-${file.id}`;
    if (typeof file === "object" && file.url) return `url-${file.url}`;
    if (typeof file === "object" && file.gcs) return `gcs-${file.gcs}`;
    if (typeof file === "object" && file.hash) return `hash-${file.hash}`;
    const filename = getFilename(file);
    return `file-${filename}-${Date.now()}`;
}

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
 */
function HoverPreview({ file }) {
    const { t } = useTranslation();
    const isRtl = i18next.language === "ar";
    const url = file ? getFileUrl(file) : null;
    const filename = file ? getFilename(file) : null;
    const mimeType = file?.mimeType;

    const isYouTube = url ? isYoutubeUrl(url) : false;
    const youtubeVideoId = isYouTube && url ? extractYoutubeVideoId(url) : null;
    const youtubeThumbnail = youtubeVideoId
        ? getYoutubeThumbnailUrl(youtubeVideoId, "maxresdefault")
        : null;

    const fileType = useFilePreview(url, filename, mimeType);

    if (!file || !url) return null;

    let preview = null;
    if (isYouTube && youtubeThumbnail) {
        preview = (
            <div className="relative w-full h-full">
                <img
                    src={youtubeThumbnail}
                    alt={filename || t("YouTube video")}
                    className="w-full h-full object-cover rounded"
                    onError={(e) => {
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
        preview = renderFilePreview({
            src: url,
            filename,
            fileType,
            className:
                fileType.isPdf || fileType.isDoc
                    ? "w-full h-full rounded border-none"
                    : "max-w-full max-h-full object-contain rounded",
            autoPlay: fileType.isVideo,
            t,
            compact: true,
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

/**
 * File Preview Dialog Component
 */
function FilePreviewDialog({ file, onClose, onDownload, t }) {
    const isRtl = i18next.language === "ar";
    const url = file ? getFileUrl(file) : null;
    const filename = file ? getFilename(file) : null;
    const mimeType = file?.mimeType;

    const isYouTube = url ? isYoutubeUrl(url) : false;
    const youtubeEmbedUrl = isYouTube && url ? getYoutubeEmbedUrl(url) : null;

    const fileType = useFilePreview(url, filename, mimeType);

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
                t,
            })
        )
    ) : null;

    const hasPreview = preview !== null;

    return (
        <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className={`max-w-[95vw] max-h-[95vh] p-4 sm:p-6 flex items-center justify-center ${isRtl ? "text-right" : ""}`}
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
                    {hasPreview ? (
                        preview
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
                    {url && (
                        <button
                            onClick={(e) => onDownload(file, e)}
                            className={`absolute bottom-4 ${isRtl ? "left-4" : "right-4"} bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-2 rounded-lg shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10`}
                            title={
                                isYouTube ? t("Open in YouTube") : t("Download")
                            }
                            aria-label={
                                isYouTube ? t("Open in YouTube") : t("Download")
                            }
                        >
                            <Download className="w-5 h-5" />
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
 * @param {Function} props.onUploadClick - Optional callback when upload button is clicked (parent handles actual upload UI)
 * @param {Function} props.onUpdateMetadata - Optional async function to update file metadata
 * @param {Function} props.onTogglePermanent - Optional async function to toggle file retention
 * @param {string} props.title - Title for the file list
 * @param {string} props.emptyTitle - Title for empty state
 * @param {string} props.emptyDescription - Description for empty state
 * @param {string} props.noMatchTitle - Title when filter has no results
 * @param {string} props.noMatchDescription - Description when filter has no results
 * @param {boolean} props.showPermanentColumn - Whether to show the permanent/keep column
 * @param {boolean} props.showDateColumn - Whether to show the date column
 * @param {boolean} props.enableFilenameEdit - Whether filenames are editable
 * @param {boolean} props.enableHoverPreview - Whether to show hover previews
 * @param {boolean} props.enableBulkActions - Whether to enable multi-select and bulk actions
 * @param {boolean} props.enableFilter - Whether to show the filter input
 * @param {boolean} props.enableSort - Whether columns are sortable
 * @param {boolean} props.optimisticDelete - Whether to use optimistic delete
 * @param {string} props.containerHeight - CSS height for the scrollable container
 * @param {Object} props.customActions - Custom actions for the bulk actions bar
 */
export default function FileManager({
    files = [],
    isLoading = false,
    onRefetch,
    onDelete,
    onUploadClick,
    onUpdateMetadata,
    onTogglePermanent,
    title,
    emptyTitle,
    emptyDescription,
    noMatchTitle,
    noMatchDescription,
    showPermanentColumn = false,
    showDateColumn = true,
    enableFilenameEdit = false,
    enableHoverPreview = true,
    enableBulkActions = true,
    enableFilter = true,
    enableSort = true,
    optimisticDelete = true,
    containerHeight = "60vh",
    customActions = null,
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
    const [togglingPermanentFileId, setTogglingPermanentFileId] =
        useState(null);
    const [deletingFileIds, setDeletingFileIds] = useState(new Set());
    const containerRef = useRef(null);
    const hoverTimeoutRef = useRef(null);
    const filenameInputRef = useRef(null);

    // Update local files when prop changes
    useEffect(() => {
        setLocalFiles(files);
    }, [files]);

    // Get file ID helper
    const getFileId = useCallback(
        (file) => {
            if (typeof file === "object" && file._id) return `id-${file._id}`;
            if (typeof file === "object" && file.id) return `id-${file.id}`;
            if (typeof file === "object" && file.url) return `url-${file.url}`;
            if (typeof file === "object" && file.gcs) return `gcs-${file.gcs}`;
            if (typeof file === "object" && file.hash)
                return `hash-${file.hash}`;
            const filename = getFilename(file);
            const originalIndex = localFiles.findIndex((f) => {
                if (typeof f === "object" && typeof file === "object") {
                    return (
                        (f.url && file.url && f.url === file.url) ||
                        (f.gcs && file.gcs && f.gcs === file.gcs) ||
                        (f.hash && file.hash && f.hash === file.hash)
                    );
                }
                return f === file;
            });
            return `file-${filename}-${originalIndex}`;
        },
        [localFiles],
    );

    // Selection hook
    const {
        selectedIds,
        selectedObjects,
        clearSelection,
        toggleSelection,
        selectRange,
        setSelectedIds,
        setSelectedObjects,
        lastSelectedId,
        setLastSelectedId,
    } = useItemSelection(getFileId);

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
            const tags = Array.isArray(file?.tags)
                ? file.tags.join(" ").toLowerCase()
                : "";
            const notes = (file?.notes || "").toLowerCase();
            return (
                filename.includes(searchLower) ||
                tags.includes(searchLower) ||
                notes.includes(searchLower)
            );
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
            } else if (sortKey === "permanent") {
                const permanentA = a?.permanent === true ? 1 : 0;
                const permanentB = b?.permanent === true ? 1 : 0;
                const comparison = permanentB - permanentA;
                return sortDirection === "asc" ? -comparison : comparison;
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

    // Toggle permanent handler
    const handleTogglePermanent = useCallback(
        async (file) => {
            if (!onTogglePermanent) return;

            const fileId = getFileId(file);
            setTogglingPermanentFileId(fileId);

            try {
                await onTogglePermanent(file);
                // Optimistically update local state
                setLocalFiles((prev) =>
                    prev.map((f) =>
                        getFileId(f) === fileId
                            ? { ...f, permanent: !file?.permanent }
                            : f,
                    ),
                );
                // Refetch to sync
                if (onRefetch) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    await onRefetch();
                }
            } catch (error) {
                console.error("Failed to toggle permanent status:", error);
                if (onRefetch) await onRefetch();
            } finally {
                setTogglingPermanentFileId(null);
            }
        },
        [getFileId, onTogglePermanent, onRefetch],
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
            const fileId = getFileId(file);
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
        ],
    );

    const handleOpenFile = useCallback((file, e) => {
        e.stopPropagation();
        setPreviewFile(file);
    }, []);

    const handleDownload = useCallback((file, e) => {
        e?.stopPropagation?.();
        const url = getFileUrl(file);
        if (url) {
            window.open(url, "_blank", "noopener,noreferrer");
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

            // eslint-disable-next-line no-control-regex
            const invalidChars = /[<>:"|?*\x00-\x1f]/;
            if (invalidChars.test(trimmedFilename)) {
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
        if (allSelected) {
            clearSelection();
        } else {
            const newSelectedIds = new Set(
                sortedFiles.map((file) => getFileId(file)),
            );
            setSelectedIds(newSelectedIds);
            setSelectedObjects([...sortedFiles]);
        }
    }, [
        allSelected,
        sortedFiles,
        clearSelection,
        getFileId,
        setSelectedIds,
        setSelectedObjects,
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
                {onUploadClick && (
                    <button
                        onClick={onUploadClick}
                        className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
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
            <div className="flex flex-col gap-3" ref={containerRef}>
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
                            </div>
                        </div>
                    )}
                    {enableFilter && (
                        <FilterInput
                            value={filterText}
                            onChange={setFilterText}
                            onClear={() => setFilterText("")}
                            placeholder={t("Filter files...")}
                        />
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
            <div className="flex flex-col gap-3" ref={containerRef}>
                {/* Header with filter and upload button */}
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
                                    {sortedFiles.length !== localFiles.length &&
                                        ` / ${localFiles.length}`}
                                    )
                                </span>
                            </div>
                        )}
                        {!title && <div />}
                        {onUploadClick && (
                            <button
                                onClick={onUploadClick}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            >
                                <Upload className="w-3.5 h-3.5" />
                                {t("Upload")}
                            </button>
                        )}
                    </div>
                    {enableFilter && (
                        <FilterInput
                            value={filterText}
                            onChange={setFilterText}
                            onClear={() => setFilterText("")}
                            placeholder={t("Filter files...")}
                        />
                    )}
                </div>

                {/* File list table */}
                <div
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden overflow-y-auto overflow-x-auto"
                    style={{ height: containerHeight }}
                >
                    <Table>
                        <TableHeader className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                            <TableRow className="border-b border-gray-200 dark:border-gray-700">
                                {enableBulkActions && (
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
                                {showPermanentColumn && (
                                    <SortableHeader
                                        sortKey="permanent"
                                        currentSort={sortKey}
                                        currentDirection={sortDirection}
                                        onSort={handleSort}
                                        className="h-9 w-10 sm:w-12 px-1 sm:px-2"
                                    >
                                        {t("Keep")}
                                    </SortableHeader>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedFiles.map((file, index) => {
                                const fileId = getFileId(file);
                                const isSelected = selectedIds.has(fileId);
                                const isDeleting = deletingFileIds.has(fileId);
                                const filename = getFilename(file);
                                const fileUrl = getFileUrl(file);
                                const fileMimeType = file?.mimeType;
                                const Icon = getFileIcon(filename);

                                const isImage =
                                    fileMimeType?.startsWith("image/") || false;
                                const isYouTube = fileUrl
                                    ? isYoutubeUrl(fileUrl)
                                    : false;
                                const youtubeVideoId =
                                    isYouTube && fileUrl
                                        ? extractYoutubeVideoId(fileUrl)
                                        : null;
                                const youtubeThumbnail = youtubeVideoId
                                    ? getYoutubeThumbnailUrl(
                                          youtubeVideoId,
                                          "maxresdefault",
                                      )
                                    : null;

                                return (
                                    <TableRow
                                        key={fileId}
                                        className={`cursor-pointer ${
                                            isSelected
                                                ? "bg-sky-50 dark:bg-sky-900/20"
                                                : ""
                                        } ${isDeleting ? "opacity-50" : ""}`}
                                        onClick={
                                            enableBulkActions
                                                ? (e) =>
                                                      handleSelectFile(
                                                          file,
                                                          index,
                                                          e,
                                                      )
                                                : undefined
                                        }
                                    >
                                        {enableBulkActions && (
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
                                            {isImage && fileUrl ? (
                                                <img
                                                    src={fileUrl}
                                                    alt={filename}
                                                    className="w-6 h-6 rounded object-cover bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer"
                                                    onClick={(e) =>
                                                        handleOpenFile(file, e)
                                                    }
                                                />
                                            ) : isYouTube &&
                                              youtubeThumbnail ? (
                                                <div
                                                    className="relative w-6 h-6 rounded overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer"
                                                    onClick={(e) =>
                                                        handleOpenFile(file, e)
                                                    }
                                                >
                                                    <img
                                                        src={youtubeThumbnail}
                                                        alt={filename}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            if (
                                                                youtubeVideoId
                                                            ) {
                                                                e.target.src =
                                                                    getYoutubeThumbnailUrl(
                                                                        youtubeVideoId,
                                                                        "hqdefault",
                                                                    );
                                                            }
                                                        }}
                                                    />
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                                                        <svg
                                                            className="w-3 h-3 text-white opacity-90"
                                                            fill="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path d="M8 5v14l11-7z" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div
                                                    className="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                    onClick={(e) =>
                                                        handleOpenFile(file, e)
                                                    }
                                                >
                                                    <Icon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                                </div>
                                            )}
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
                                                ) : file?.notes ? (
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger
                                                                asChild
                                                            >
                                                                <span
                                                                    className={`text-sm text-gray-700 dark:text-gray-300 truncate block ${enableFilenameEdit ? "cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" : ""}`}
                                                                    title={
                                                                        filename
                                                                    }
                                                                    onClick={
                                                                        enableFilenameEdit
                                                                            ? (
                                                                                  e,
                                                                              ) =>
                                                                                  handleStartEdit(
                                                                                      file,
                                                                                      e,
                                                                                  )
                                                                            : undefined
                                                                    }
                                                                >
                                                                    {filename}
                                                                </span>
                                                            </TooltipTrigger>
                                                            <TooltipContent className="max-w-xs">
                                                                <div className="font-medium mb-1">
                                                                    {filename}
                                                                </div>
                                                                <div className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                                                                    {file.notes}
                                                                </div>
                                                                {Array.isArray(
                                                                    file?.tags,
                                                                ) &&
                                                                    file.tags
                                                                        .length >
                                                                        0 && (
                                                                        <div className="mt-2 flex flex-wrap gap-1">
                                                                            {file.tags.map(
                                                                                (
                                                                                    tag,
                                                                                    tagIdx,
                                                                                ) => (
                                                                                    <span
                                                                                        key={
                                                                                            tagIdx
                                                                                        }
                                                                                        className="text-xs px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded"
                                                                                    >
                                                                                        {
                                                                                            tag
                                                                                        }
                                                                                    </span>
                                                                                ),
                                                                            )}
                                                                        </div>
                                                                    )}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
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
                                                    {(() => {
                                                        const fileDate =
                                                            getFileDate(file);
                                                        if (!fileDate)
                                                            return "—";
                                                        return fileDate.toLocaleDateString(
                                                            undefined,
                                                            {
                                                                year: "numeric",
                                                                month: "short",
                                                                day: "numeric",
                                                            },
                                                        );
                                                    })()}
                                                </span>
                                            </TableCell>
                                        )}
                                        {showPermanentColumn && (
                                            <TableCell
                                                className={`px-1 sm:px-2 py-1.5 ${isRtl ? "text-right" : "text-left"}`}
                                            >
                                                {togglingPermanentFileId ===
                                                fileId ? (
                                                    <div className="flex items-center justify-center w-4 h-4">
                                                        <Spinner
                                                            size="sm"
                                                            className="text-sky-600 dark:text-sky-400"
                                                        />
                                                    </div>
                                                ) : (
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            file?.permanent ===
                                                            true
                                                        }
                                                        onMouseDown={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                        onClick={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            handleTogglePermanent(
                                                                file,
                                                            );
                                                        }}
                                                        disabled={
                                                            !onTogglePermanent
                                                        }
                                                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-sky-600 focus:ring-sky-500 dark:focus:ring-sky-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                                        title={t(
                                                            file?.permanent
                                                                ? "Permanent file"
                                                                : "Temporary file",
                                                        )}
                                                    />
                                                )}
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

            {/* Bulk Actions Bar */}
            {enableBulkActions && onDelete && (
                <BulkActionsBar
                    selectedCount={selectedIds.size}
                    allSelected={allSelected}
                    onSelectAll={handleSelectAll}
                    onClearSelection={clearSelection}
                    actions={{
                        delete: {
                            onClick: () => setShowBulkDeleteConfirm(true),
                            disabled: false,
                            label: t("Delete"),
                            ariaLabel: `${t("Delete")} (${selectedIds.size})`,
                        },
                        ...(customActions || {}),
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
