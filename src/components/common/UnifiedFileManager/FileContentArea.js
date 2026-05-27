"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import {
    ArrowUpDown,
    ChevronUp,
    ChevronDown,
    Check,
    Trash2,
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    getFilename,
    getFileDate,
    getFilePreviewUrl,
    getFileThumbnailUrl,
    formatFileSize,
    formatFileListDate,
} from "@/src/components/common/FileManager";
import MediaThumbnail from "@/src/components/common/MediaThumbnail";
import { INVALID_FILENAME_CHARS } from "@/src/utils/fileDownloadUtils";

/**
 * Sortable column header.
 */
function SortableHeader({
    children,
    sortKey,
    currentSort,
    currentDirection,
    onSort,
    className = "",
}) {
    const isActive = currentSort === sortKey;
    const Icon = isActive
        ? currentDirection === "asc"
            ? ChevronUp
            : ChevronDown
        : ArrowUpDown;

    return (
        <TableHead className={`h-9 px-2 text-start sm:px-3 ${className}`}>
            <button
                onClick={() => onSort(sortKey)}
                className="flex items-center gap-1.5 text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
                {children}
                <Icon
                    className={`h-3.5 w-3.5 ${isActive ? "text-sky-600 dark:text-sky-400" : ""}`}
                />
            </button>
        </TableHead>
    );
}

function getExtension(filename) {
    const match = String(filename || "").match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : "";
}

function getFileTypeValue(file, filename = getFilename(file)) {
    const explicitType = file?.type;
    if (
        explicitType &&
        explicitType !== "file" &&
        explicitType !== "image_url"
    ) {
        return String(explicitType).toLowerCase();
    }

    const mimeType = String(
        file?.mimeType || file?.contentType || "",
    ).toLowerCase();
    if (mimeType.includes("/")) {
        return mimeType.split("/")[0] || mimeType;
    }

    return getExtension(filename) || "file";
}

function getFileTypeLabel(file, t) {
    const filename = getFilename(file);
    const value = getFileTypeValue(file, filename);

    if (value === "image") return t("Image");
    if (value === "video") return t("Video");
    if (value === "audio") return t("Audio");
    if (value === "application") {
        const extension = getExtension(filename);
        return extension ? extension.toUpperCase() : t("Document");
    }
    if (value === "text") return t("Text");
    if (value === "file") return t("File");

    return value.toUpperCase();
}

/**
 * FileContentArea - table/list view of files in the selected folder.
 *
 * @param {Object} props
 * @param {Array} props.files - Files to display
 * @param {Set} props.selectedIds - Currently selected file IDs
 * @param {Function} props.getFileId - Get stable ID for a file
 * @param {Function} props.onSelectFile - (file, orderedFiles, index, event) selection handler
 * @param {Function} props.onSelectAll - Toggle select all
 * @param {boolean} props.allSelected - Whether all files are selected
 * @param {Function} props.onPreview - Open file preview
 * @param {Function} props.onRename - Start inline rename
 * @param {boolean} props.enableFilenameEdit - Enable inline filename editing
 * @param {Function} props.onUpdateMetadata - Save renamed filename
 * @param {Function} props.onDelete - Delete a file
 * @param {string} props.filterText - Current filter text for highlighting
 * @param {boolean} props.isMobile - Whether to use mobile-specific list behavior
 */
export default function FileContentArea({
    files = [],
    selectedIds = new Set(),
    getFileId,
    onSelectFile,
    onSelectAll,
    allSelected = false,
    onPreview,
    enableFilenameEdit = true,
    onUpdateMetadata,
    onDelete,
    filterText = "",
    isMobile = false,
    renderFileStatus,
}) {
    const { t } = useTranslation();

    // Sorting
    const [sortKey, setSortKey] = useState("date");
    const [sortDirection, setSortDirection] = useState("desc");

    // Inline editing
    const [editingFileId, setEditingFileId] = useState(null);
    const [editingFilename, setEditingFilename] = useState("");
    const filenameInputRef = useRef(null);
    const savingRef = useRef(false);

    // Sort handler
    const handleSort = useCallback(
        (key) => {
            if (sortKey === key) {
                setSortDirection(sortDirection === "asc" ? "desc" : "asc");
            } else {
                setSortKey(key);
                setSortDirection(key === "date" ? "desc" : "asc");
            }
        },
        [sortKey, sortDirection],
    );

    // Sort files
    const sortedFiles = useMemo(() => {
        const filesCopy = [...files];
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
            } else if (sortKey === "type") {
                const typeA = getFileTypeValue(a);
                const typeB = getFileTypeValue(b);
                const comparison =
                    typeA.localeCompare(typeB) ||
                    getFilename(a)
                        .toLowerCase()
                        .localeCompare(getFilename(b).toLowerCase());
                return sortDirection === "asc" ? comparison : -comparison;
            } else {
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
    }, [files, sortKey, sortDirection]);

    // Inline editing handlers
    useEffect(() => {
        if (editingFileId && filenameInputRef.current) {
            filenameInputRef.current.focus();
            filenameInputRef.current.select();
        }
    }, [editingFileId]);

    const handleStartEdit = useCallback(
        (file, e) => {
            if (!enableFilenameEdit) return;
            e?.stopPropagation();
            setEditingFileId(getFileId(file));
            setEditingFilename(getFilename(file));
        },
        [getFileId, enableFilenameEdit],
    );

    const handleSaveFilename = useCallback(
        async (file) => {
            // Guard against double-call: pressing Enter clears editingFileId,
            // which unmounts the input and fires onBlur, calling this again.
            if (savingRef.current) return;
            if (!onUpdateMetadata) return;
            const trimmed = editingFilename.trim();
            if (!trimmed) {
                setEditingFileId(null);
                setEditingFilename("");
                return;
            }
            if (INVALID_FILENAME_CHARS.test(trimmed)) {
                toast.error(t("Filename contains invalid characters."));
                return;
            }
            if (trimmed.length > 255) {
                toast.error(t("Filename is too long."));
                return;
            }
            savingRef.current = true;
            setEditingFileId(null);
            setEditingFilename("");
            try {
                await onUpdateMetadata(file, { displayFilename: trimmed });
            } catch {
                toast.error(t("Failed to save filename."));
            } finally {
                savingRef.current = false;
            }
        },
        [editingFilename, onUpdateMetadata, t],
    );

    const handleCancelEdit = useCallback(() => {
        setEditingFileId(null);
        setEditingFilename("");
    }, []);

    const handleFilenameKeyDown = useCallback(
        (e, file) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleSaveFilename(file);
            } else if (e.key === "Escape") {
                e.preventDefault();
                handleCancelEdit();
            }
        },
        [handleSaveFilename, handleCancelEdit],
    );

    if (files.length === 0) {
        return null; // Parent handles empty state
    }

    const showActionsColumn = !isMobile && !!onDelete;

    return (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain min-w-0">
            <Table>
                <TableHeader>
                    <TableRow className="border-b border-gray-100 dark:border-gray-800">
                        {/* Checkbox column */}
                        <TableHead className="h-9 w-10 px-0.5 sm:px-3">
                            <button
                                onClick={onSelectAll}
                                className="flex h-10 w-10 items-center justify-center rounded border border-transparent transition-colors hover:border-sky-500 dark:hover:border-sky-400 sm:h-4 sm:w-4 sm:border-gray-300 sm:dark:border-gray-600"
                                aria-label={t("Select all")}
                            >
                                {allSelected && (
                                    <Check className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                                )}
                            </button>
                        </TableHead>
                        {/* Icon column */}
                        <TableHead className="h-9 w-8 px-1" />
                        {/* Filename */}
                        <SortableHeader
                            sortKey="filename"
                            currentSort={sortKey}
                            currentDirection={sortDirection}
                            onSort={handleSort}
                        >
                            {t("Name")}
                        </SortableHeader>
                        {/* Type */}
                        <SortableHeader
                            sortKey="type"
                            currentSort={sortKey}
                            currentDirection={sortDirection}
                            onSort={handleSort}
                            className="hidden md:table-cell w-24"
                        >
                            {t("Type")}
                        </SortableHeader>
                        {/* Size */}
                        <SortableHeader
                            sortKey="size"
                            currentSort={sortKey}
                            currentDirection={sortDirection}
                            onSort={handleSort}
                            className="hidden sm:table-cell w-24"
                        >
                            {t("Size")}
                        </SortableHeader>
                        {/* Date */}
                        <SortableHeader
                            sortKey="date"
                            currentSort={sortKey}
                            currentDirection={sortDirection}
                            onSort={handleSort}
                            className="w-20 md:w-32"
                        >
                            {t("Date")}
                        </SortableHeader>
                        {showActionsColumn && (
                            <TableHead className="h-9 w-10 px-2 sm:px-3" />
                        )}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedFiles.map((file, index) => {
                        const fileId = getFileId(file);
                        const isSelected = selectedIds.has(fileId);
                        const filename = getFilename(file);
                        const previewUrl = getFilePreviewUrl(file);
                        const thumbnailUrl = getFileThumbnailUrl(file);
                        const fileDate = getFileDate(file);
                        const fileTypeLabel = getFileTypeLabel(file, t);
                        const isEditing = editingFileId === fileId;

                        return (
                            <TableRow
                                key={fileId}
                                className={`group border-b border-gray-50 dark:border-gray-800/50 cursor-pointer transition-colors ${
                                    isSelected
                                        ? "bg-sky-50 dark:bg-sky-900/20"
                                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                }`}
                                onClick={(e) =>
                                    onSelectFile(file, sortedFiles, index, e)
                                }
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    onPreview?.(file);
                                }}
                            >
                                {/* Checkbox */}
                                <TableCell className="w-10 px-0.5 py-1 sm:px-3">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectFile(
                                                file,
                                                sortedFiles,
                                                index,
                                                e,
                                            );
                                        }}
                                        className={`flex h-10 w-10 items-center justify-center rounded border transition-colors sm:h-4 sm:w-4 ${
                                            isSelected
                                                ? "bg-sky-600 border-sky-600 dark:bg-sky-500 dark:border-sky-500"
                                                : "border-transparent hover:border-sky-500 dark:hover:border-sky-400 sm:border-gray-300 sm:dark:border-gray-600"
                                        }`}
                                        aria-label={t("Select file")}
                                    >
                                        {isSelected && (
                                            <Check className="w-3 h-3 text-white" />
                                        )}
                                    </button>
                                </TableCell>
                                {/* Icon */}
                                <TableCell className="w-10 px-0 py-1 sm:w-8 sm:px-1">
                                    <button
                                        type="button"
                                        className="flex h-10 w-10 items-center justify-center rounded focus:outline-none focus:ring-2 focus:ring-sky-500 sm:block sm:h-auto sm:w-auto"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPreview?.(file);
                                        }}
                                        aria-label={t("Preview")}
                                    >
                                        <MediaThumbnail
                                            src={previewUrl}
                                            filename={filename}
                                            mimeType={
                                                file?.mimeType ||
                                                file?.contentType
                                            }
                                            mediaType={
                                                file?._mediaItem?.type ||
                                                file?.type
                                            }
                                            mediaStatus={
                                                file?._mediaItem?.status ||
                                                file?.status
                                            }
                                            mediaError={
                                                file?._mediaItem?.error ||
                                                file?.error
                                            }
                                            thumbnailSrc={thumbnailUrl}
                                            className="h-8 w-8 rounded sm:h-6 sm:w-6"
                                            iconSize="w-4 h-4"
                                            compact
                                            autoPlayVideo={false}
                                            showVideoControls={false}
                                            showPlayOverlay={false}
                                        />
                                    </button>
                                </TableCell>
                                {/* Filename */}
                                <TableCell className="px-1.5 py-1.5 sm:px-3">
                                    {isEditing ? (
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
                                                handleFilenameKeyDown(e, file)
                                            }
                                            onBlur={() =>
                                                handleSaveFilename(file)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-full text-sm bg-white dark:bg-gray-800 border border-sky-500 dark:border-sky-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                        />
                                    ) : (
                                        <div
                                            className={
                                                isMobile
                                                    ? "grid min-w-0 gap-0.5"
                                                    : "flex min-w-0 items-center gap-2"
                                            }
                                        >
                                            <button
                                                className={`block max-w-full truncate text-start text-sm sm:max-w-[300px] ${
                                                    enableFilenameEdit
                                                        ? "hover:text-sky-600 dark:hover:text-sky-400 cursor-text"
                                                        : ""
                                                }`}
                                                onClick={(e) => {
                                                    if (enableFilenameEdit) {
                                                        handleStartEdit(
                                                            file,
                                                            e,
                                                        );
                                                    }
                                                }}
                                                title={filename}
                                            >
                                                {filename}
                                            </button>
                                            {renderFileStatus?.(file)}
                                        </div>
                                    )}
                                </TableCell>
                                {/* Type */}
                                <TableCell className="hidden md:table-cell px-2 sm:px-3 py-1.5 w-24 text-xs text-gray-500 dark:text-gray-400">
                                    {fileTypeLabel}
                                </TableCell>
                                {/* Size */}
                                <TableCell className="hidden sm:table-cell px-2 sm:px-3 py-1.5 w-24 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                    {file.size
                                        ? formatFileSize(file.size)
                                        : "—"}
                                </TableCell>
                                {/* Date */}
                                <TableCell className="w-20 px-1.5 py-1.5 text-xs tabular-nums text-gray-500 dark:text-gray-400 sm:px-3 md:w-32">
                                    {formatFileListDate(fileDate)}
                                </TableCell>
                                {showActionsColumn && (
                                    <TableCell className="w-10 px-0.5 py-1 sm:px-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDelete(file);
                                                }}
                                                className="flex h-6 w-6 items-center justify-center rounded text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-red-400"
                                                title={t("Delete file")}
                                                aria-label={t("Delete file")}
                                                type="button"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </TableCell>
                                )}
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
