"use client";
import { useQuery, useApolloClient } from "@apollo/client";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import {
    Check,
    ExternalLink,
    ArrowUpDown,
    ChevronUp,
    ChevronDown,
} from "lucide-react";
import { QUERIES } from "@/src/graphql";
import { getFileIcon } from "@/src/utils/mediaUtils";
import {
    saveMemoryFiles as saveMemoryFilesUtil,
    getFileUrl,
    getFilename as getFilenameUtil,
} from "./memoryFilesUtils";
import { purgeFiles } from "./chatFileUtils";
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
import { FileText } from "lucide-react";

// Sortable column header component
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

export default function MemoryFiles({
    contextId,
    contextKey,
    chatId = null,
    messages = [],
    updateChatHook = null,
}) {
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const isRtl = i18next.language === "ar";
    const [memoryFiles, setMemoryFiles] = useState([]);
    const [filterText, setFilterText] = useState("");
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
    const [sortKey, setSortKey] = useState("date");
    const [sortDirection, setSortDirection] = useState("desc");
    const containerRef = useRef(null);

    const {
        data: memoryData,
        loading: memoryLoading,
        refetch: refetchMemory,
    } = useQuery(QUERIES.SYS_READ_MEMORY, {
        variables: { contextId, contextKey, section: "memoryFiles" },
        skip: !contextId,
        fetchPolicy: "network-only",
    });

    // Get file ID helper - creates a stable ID for each file
    const getFileId = useCallback(
        (file) => {
            if (typeof file === "object" && file.id) return `id-${file.id}`;
            if (typeof file === "object" && file.url) return `url-${file.url}`;
            if (typeof file === "object" && file.gcs) return `gcs-${file.gcs}`;
            if (typeof file === "object" && file.hash)
                return `hash-${file.hash}`;
            // Fallback: use filename + index from original array
            const filename = getFilenameUtil(file);
            const originalIndex = memoryFiles.findIndex((f) => {
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
        [memoryFiles],
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
    } = useItemSelection((file) => getFileId(file));

    useEffect(() => {
        if (memoryData?.sys_read_memory?.result) {
            try {
                const parsed = JSON.parse(memoryData.sys_read_memory.result);
                // Handle new format: { version, files }
                if (
                    parsed &&
                    typeof parsed === "object" &&
                    !Array.isArray(parsed) &&
                    parsed.files
                ) {
                    setMemoryFiles(
                        Array.isArray(parsed.files) ? parsed.files : [],
                    );
                }
                // Handle old format: just an array (backward compatibility)
                else if (Array.isArray(parsed)) {
                    setMemoryFiles(parsed);
                } else {
                    setMemoryFiles([]);
                }
            } catch (e) {
                console.error("[MemoryFiles] Error parsing memory:", e);
                setMemoryFiles([]);
            }
        } else {
            setMemoryFiles([]);
        }
    }, [memoryData]);

    // Filter files - search filename, tags, and notes
    const filteredFiles = useMemo(() => {
        if (!filterText.trim()) return memoryFiles;
        const searchLower = filterText.toLowerCase();
        return memoryFiles.filter((file) => {
            const filename = getFilenameUtil(file).toLowerCase();
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
    }, [memoryFiles, filterText]);

    // Helper to get date for sorting/display
    const getFileDate = useCallback((file) => {
        if (typeof file !== "object") return null;
        // Prefer modifiedDate, then lastAccessed, then addedDate
        const dateStr =
            file.modifiedDate || file.lastAccessed || file.addedDate;
        if (!dateStr) return null;
        const date = new Date(dateStr);
        // new Date() doesn't throw for invalid strings, it returns Invalid Date
        // Check if the date is valid
        if (isNaN(date.getTime())) return null;
        return date;
    }, []);

    // Sort files
    const sortedFiles = useMemo(() => {
        const files = [...filteredFiles];

        files.sort((a, b) => {
            if (sortKey === "filename") {
                const nameA = getFilenameUtil(a).toLowerCase();
                const nameB = getFilenameUtil(b).toLowerCase();
                const comparison = nameA.localeCompare(nameB);
                return sortDirection === "asc" ? comparison : -comparison;
            } else {
                // Sort by date
                const dateA = getFileDate(a);
                const dateB = getFileDate(b);

                // Files without dates go to the end
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;

                const comparison = dateB.getTime() - dateA.getTime();
                return sortDirection === "asc" ? -comparison : comparison;
            }
        });

        return files;
    }, [filteredFiles, sortKey, sortDirection, getFileDate]);

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

    const saveMemoryFiles = async (files) => {
        try {
            await saveMemoryFilesUtil(
                apolloClient,
                contextId,
                contextKey,
                files,
            );
            refetchMemory();
        } catch (error) {
            console.error("Failed to save memory files:", error);
        }
    };

    const handleRemoveFiles = async (filesToRemove) => {
        // Filter to only valid file objects and normalize them
        // Files from memoryFiles may not have a 'type' property, so we need to add it
        const validFiles = filesToRemove
            .filter((file) => typeof file === "object")
            .map((file) => {
                // Normalize file object: add type property if missing
                // If it has image_url property, it's an image_url type, otherwise it's a file
                if (!file.type) {
                    return {
                        ...file,
                        type: file.image_url ? "image_url" : "file",
                    };
                }
                return file;
            })
            .filter(
                (file) => file.type === "image_url" || file.type === "file",
            );

        if (validFiles.length === 0) {
            clearSelection();
            return;
        }

        // Remove from memory files in bulk first (to avoid race conditions)
        const fileIds = new Set(filesToRemove.map((file) => getFileId(file)));
        const newFiles = memoryFiles.filter(
            (file) => !fileIds.has(getFileId(file)),
        );
        await saveMemoryFiles(newFiles);

        // Use bulk purgeFiles function to handle all files in a single chat update
        // This avoids race conditions when multiple files are in the same message
        try {
            await purgeFiles({
                fileObjs: validFiles,
                apolloClient,
                contextId,
                contextKey,
                chatId,
                messages,
                updateChatHook,
                t,
                getFilename: getFilenameUtil,
                skipCloudDelete: false,
                skipMemoryFiles: true, // Already handled in bulk above
            });
        } catch (error) {
            console.error("Failed to purge files:", error);
        }

        clearSelection();
    };

    const handleBulkDelete = () => {
        setShowBulkDeleteConfirm(false);
        handleRemoveFiles(selectedObjects);
    };

    const handleSelectFile = useCallback(
        (file, index, e) => {
            const fileId = getFileId(file);
            if (e.shiftKey && lastSelectedId !== null) {
                const lastIndex = sortedFiles.findIndex(
                    (f) => getFileId(f) === lastSelectedId,
                );
                const currentIndex = index;
                if (lastIndex !== -1 && currentIndex !== -1) {
                    const start = Math.min(lastIndex, currentIndex);
                    const end = Math.max(lastIndex, currentIndex);
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
        const url = getFileUrl(file);
        if (url) {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    }, []);

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

    // Show loading state
    if (memoryLoading) {
        return (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                {t("Loading chat files...")}
            </div>
        );
    }

    // Show empty state if no files
    if (memoryFiles.length === 0) {
        return (
            <EmptyState
                icon={<FileText className="w-12 h-12 text-gray-400" />}
                title={t("No files indexed")}
                description={t(
                    "No files have been indexed in this conversation yet.",
                )}
            />
        );
    }

    // Show filtered empty state - use same structure to prevent layout jumps
    if (sortedFiles.length === 0) {
        return (
            <>
                <div className="flex flex-col gap-3" ref={containerRef}>
                    {/* Header with filter */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    {t("Files indexed in this conversation")}
                                </h3>
                                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                    ({sortedFiles.length}
                                    {sortedFiles.length !==
                                        memoryFiles.length &&
                                        ` / ${memoryFiles.length}`}
                                    )
                                </span>
                            </div>
                        </div>
                        <FilterInput
                            value={filterText}
                            onChange={setFilterText}
                            onClear={() => setFilterText("")}
                            placeholder={t("Filter files...")}
                        />
                    </div>

                    {/* Empty state in same height container */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden h-[60vh] flex items-center justify-center">
                        <EmptyState
                            icon={
                                <FileText className="w-12 h-12 text-gray-400" />
                            }
                            title={t("No files match")}
                            description={t(
                                "No files match your search. Try a different filter.",
                            )}
                        />
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-3" ref={containerRef}>
                {/* Header with filter */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                            <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {t("Files indexed in this conversation")}
                            </h3>
                            <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                ({sortedFiles.length}
                                {sortedFiles.length !== memoryFiles.length &&
                                    ` / ${memoryFiles.length}`}
                                )
                            </span>
                        </div>
                    </div>
                    <FilterInput
                        value={filterText}
                        onChange={setFilterText}
                        onClear={() => setFilterText("")}
                        placeholder={t("Filter files...")}
                    />
                </div>

                {/* File list table */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden h-[60vh] overflow-y-auto overflow-x-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                            <TableRow className="border-b border-gray-200 dark:border-gray-700">
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
                                <TableHead className="h-9 w-8 sm:w-10 px-1 sm:px-2"></TableHead>
                                <SortableHeader
                                    sortKey="filename"
                                    currentSort={sortKey}
                                    currentDirection={sortDirection}
                                    onSort={handleSort}
                                >
                                    {t("Filename")}
                                </SortableHeader>
                                <SortableHeader
                                    sortKey="date"
                                    currentSort={sortKey}
                                    currentDirection={sortDirection}
                                    onSort={handleSort}
                                    className="hidden sm:table-cell"
                                >
                                    {t("Date")}
                                </SortableHeader>
                                <TableHead className="h-9 w-10 sm:w-12 px-1 sm:px-2"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedFiles.map((file, index) => {
                                const fileId = getFileId(file);
                                const isSelected = selectedIds.has(fileId);
                                const filename = getFilenameUtil(file);
                                const fileUrl = getFileUrl(file);
                                const Icon = getFileIcon(filename);

                                return (
                                    <TableRow
                                        key={fileId}
                                        className={`cursor-pointer ${
                                            isSelected
                                                ? "bg-sky-50 dark:bg-sky-900/20"
                                                : ""
                                        }`}
                                        onClick={(e) =>
                                            handleSelectFile(file, index, e)
                                        }
                                    >
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
                                        <TableCell
                                            className={`px-1 sm:px-2 py-1.5 ${isRtl ? "text-right" : "text-left"}`}
                                        >
                                            <Icon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                        </TableCell>
                                        <TableCell
                                            className={`px-2 sm:px-3 py-1.5 min-w-0 max-w-[200px] sm:max-w-none ${isRtl ? "text-right" : "text-left"}`}
                                        >
                                            {file?.notes ? (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span
                                                                className="text-sm text-gray-700 dark:text-gray-300 truncate block cursor-help"
                                                                title={filename}
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
                                                    className="text-sm text-gray-700 dark:text-gray-300 truncate block"
                                                    title={filename}
                                                >
                                                    {filename}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell
                                            className={`px-2 sm:px-3 py-1.5 hidden sm:table-cell ${isRtl ? "text-right" : "text-left"}`}
                                        >
                                            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                {(() => {
                                                    const fileDate =
                                                        getFileDate(file);
                                                    if (!fileDate) return "—";
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
                                        <TableCell
                                            className={`px-1 sm:px-2 py-1.5 ${isRtl ? "text-right" : "text-left"}`}
                                        >
                                            {fileUrl && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenFile(file, e);
                                                    }}
                                                    className="text-gray-500 hover:text-sky-600 dark:text-gray-400 dark:hover:text-sky-400 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    title={t("Open file")}
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Bulk actions bar */}
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
                }}
            />

            {/* Bulk delete confirmation */}
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
