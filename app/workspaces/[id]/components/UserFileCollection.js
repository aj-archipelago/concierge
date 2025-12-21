"use client";
import { useQuery, useApolloClient } from "@apollo/client";
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
} from "lucide-react";
import { QUERIES } from "@/src/graphql";
import { getFileIcon } from "@/src/utils/mediaUtils";
import {
    updateFileMetadata,
    getFileUrl,
    getFilename as getFilenameUtil,
} from "./userFileCollectionUtils";
import { purgeFiles } from "./chatFileUtils";
import HoverPreview from "./HoverPreview";
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
import { FileText } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

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

// File Preview Dialog Component
function FilePreviewDialog({ file, onClose, onDownload, t }) {
    const isRtl = i18next.language === "ar";
    const url = file ? getFileUrl(file) : null;
    const filename = file ? getFilenameUtil(file) : null;
    const mimeType = file?.mimeType;

    // Check if URL is YouTube
    const isYouTube = url ? isYoutubeUrl(url) : false;
    const youtubeEmbedUrl = isYouTube && url ? getYoutubeEmbedUrl(url) : null;

    // Use shared file preview logic
    const fileType = useFilePreview(url, filename, mimeType);

    // Render preview using shared logic
    const preview = url ? (
        isYouTube && youtubeEmbedUrl ? (
            // YouTube iframe
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
                    {url && !isYouTube && (
                        <button
                            onClick={(e) => onDownload(file, e)}
                            className={`absolute top-4 ${isRtl ? "left-4" : "right-4"} bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-2 rounded-lg shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10`}
                            title={t("Download")}
                            aria-label={t("Download")}
                        >
                            <Download className="w-5 h-5" />
                        </button>
                    )}
                    {url && isYouTube && (
                        <button
                            onClick={(e) => onDownload(file, e)}
                            className={`absolute top-4 ${isRtl ? "left-4" : "right-4"} bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-2 rounded-lg shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10`}
                            title={t("Open in YouTube")}
                            aria-label={t("Open in YouTube")}
                        >
                            <Download className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function UserFileCollection({
    contextId,
    contextKey,
    chatId = null,
    messages = [],
    updateChatHook = null,
}) {
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const isRtl = i18next.language === "ar";
    const [userFileCollection, setUserFileCollection] = useState([]);
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
    const containerRef = useRef(null);
    const hoverTimeoutRef = useRef(null);

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

    // Cleanup timeout on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }
        };
    }, []);
    // Only one file can be edited at a time, so this ref is intentionally shared
    // and only attached to the currently editing input.
    const filenameInputRef = useRef(null);

    const {
        data: collectionData,
        loading: collectionLoading,
        refetch: refetchCollection,
    } = useQuery(QUERIES.SYS_READ_FILE_COLLECTION, {
        variables: { contextId, contextKey, useCache: false },
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
            const originalIndex = userFileCollection.findIndex((f) => {
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
        [userFileCollection],
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
        if (collectionData?.sys_read_file_collection?.result) {
            try {
                const parsed = JSON.parse(
                    collectionData.sys_read_file_collection.result,
                );
                if (Array.isArray(parsed)) {
                    setUserFileCollection(parsed);
                } else {
                    setUserFileCollection([]);
                }
            } catch (e) {
                console.error("[UserFileCollection] Error parsing:", e);
                setUserFileCollection([]);
            }
        } else {
            setUserFileCollection([]);
        }
    }, [collectionData]);

    // Filter files - search filename, tags, and notes
    const filteredFiles = useMemo(() => {
        if (!filterText.trim()) return userFileCollection;
        const searchLower = filterText.toLowerCase();
        return userFileCollection.filter((file) => {
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
    }, [userFileCollection, filterText]);

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
            } else if (sortKey === "permanent") {
                const permanentA = a?.permanent === true ? 1 : 0;
                const permanentB = b?.permanent === true ? 1 : 0;
                const comparison = permanentB - permanentA; // Permanent files first
                return sortDirection === "asc" ? -comparison : comparison;
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

    const handleTogglePermanent = useCallback(
        async (file) => {
            const fileId = getFileId(file);
            const newPermanentValue = !file?.permanent;

            // Get file hash for API call
            const fileHash = file?.hash;
            if (!fileHash) {
                console.error("File hash not found. Cannot update retention.");
                return;
            }

            // Set loading state (synchronous operation with spinner)
            setTogglingPermanentFileId(fileId);

            try {
                // Call setRetention API (synchronous - wait for completion)
                const response = await fetch("/api/files/set-retention", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        hash: fileHash,
                        retention: newPermanentValue
                            ? "permanent"
                            : "temporary",
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(
                        errorData.error ||
                            `Failed to update retention: ${response.statusText}`,
                    );
                }

                // Optimistically update local state
                setUserFileCollection((prevCollection) =>
                    prevCollection.map((f) =>
                        getFileId(f) === fileId
                            ? { ...f, permanent: newPermanentValue }
                            : f,
                    ),
                );

                // Small delay to ensure CFH has finished updating Redis
                await new Promise((resolve) => setTimeout(resolve, 200));
                // CFH automatically updates Redis, so we just need to refetch
                // Explicitly bypass cache to ensure we get fresh data
                await refetchCollection({ useCache: false });
            } catch (error) {
                console.error("Failed to toggle permanent status:", error);
                // On error, refetch to restore correct state
                await refetchCollection({ useCache: false });
            } finally {
                // Clear loading state
                setTogglingPermanentFileId(null);
            }
        },
        [getFileId, refetchCollection],
    );

    const handleRemoveFiles = async (filesToRemove) => {
        // Filter to only valid file objects and normalize them
        // Files from userFileCollection may not have a 'type' property, so we need to add it
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

        // Get file IDs to remove for optimistic update
        const fileIdsToRemove = new Set(
            validFiles.map((file) => getFileId(file)),
        );

        // Optimistically remove files from local state immediately
        setUserFileCollection((prevCollection) =>
            prevCollection.filter(
                (file) => !fileIdsToRemove.has(getFileId(file)),
            ),
        );
        clearSelection();

        // Delete files asynchronously in the background
        // CFH automatically updates Redis on delete
        purgeFiles({
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
            skipUserFileCollection: true, // CFH automatically updates Redis
        })
            .then(async () => {
                // Small delay to ensure CFH has finished updating Redis
                await new Promise((resolve) => setTimeout(resolve, 200));
                // Refetch to sync with server state (CFH has already updated Redis)
                // Explicitly bypass cache to ensure we get fresh data
                await refetchCollection({ useCache: false });
            })
            .catch((error) => {
                console.error("Failed to purge files:", error);
                // On error, refetch to restore correct state
                refetchCollection({ useCache: false });
            });
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
        setPreviewFile(file);
    }, []);

    const handleDownload = useCallback((file, e) => {
        e?.stopPropagation?.();
        const url = getFileUrl(file);
        if (url) {
            // Open in new tab instead of downloading
            window.open(url, "_blank", "noopener,noreferrer");
        }
    }, []);

    // Focus input when entering edit mode
    useEffect(() => {
        if (editingFileId && filenameInputRef.current) {
            filenameInputRef.current.focus();
            filenameInputRef.current.select();
        }
    }, [editingFileId]);

    // Cancel editing if the file being edited no longer exists after refresh
    useEffect(() => {
        if (editingFileId) {
            const fileStillExists = userFileCollection.some(
                (file) => getFileId(file) === editingFileId,
            );
            if (!fileStillExists) {
                setEditingFileId(null);
                setEditingFilename("");
            }
        }
    }, [userFileCollection, editingFileId, getFileId]);

    const handleStartEdit = useCallback(
        (file, e) => {
            e.stopPropagation();
            const fileId = getFileId(file);
            const currentFilename = getFilenameUtil(file);
            setEditingFileId(fileId);
            setEditingFilename(currentFilename);
        },
        [getFileId],
    );

    const handleSaveFilename = useCallback(
        async (file) => {
            // Validate filename
            const trimmedFilename = editingFilename.trim();
            if (!trimmedFilename) {
                // Don't save empty filenames, cancel instead
                setEditingFileId(null);
                setEditingFilename("");
                return;
            }

            // Validate filename for invalid characters
            // Prevent path separators, null bytes, and control characters
            // eslint-disable-next-line no-control-regex
            const invalidChars = /[<>:"|?*\x00-\x1f]/;
            if (invalidChars.test(trimmedFilename)) {
                toast.error(
                    t(
                        "Filename contains invalid characters. Please use a different name.",
                    ),
                );
                return;
            }

            // Limit filename length (reasonable limit)
            if (trimmedFilename.length > 255) {
                toast.error(
                    t("Filename is too long. Please use a shorter name."),
                );
                return;
            }

            const fileId = getFileId(file);

            // Get file hash for API call
            const fileHash = file?.hash;
            if (!fileHash) {
                toast.error(t("File hash not found. Cannot update filename."));
                return;
            }

            // Optimistically update local state immediately
            setUserFileCollection((prevCollection) =>
                prevCollection.map((f) =>
                    getFileId(f) === fileId
                        ? { ...f, displayFilename: trimmedFilename }
                        : f,
                ),
            );

            setEditingFileId(null);
            setEditingFilename("");

            // Save filename asynchronously in the background
            updateFileMetadata(apolloClient, contextId, contextKey, fileHash, {
                displayFilename: trimmedFilename,
            })
                .then(async () => {
                    // Small delay to ensure Cortex has finished updating Redis
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    // Explicitly bypass cache to ensure we get fresh data
                    await refetchCollection({ useCache: false });
                })
                .catch((error) => {
                    console.error("Failed to save filename:", error);
                    toast.error(
                        t("Failed to save filename. Please try again."),
                    );
                    // On error, refetch to restore correct state
                    refetchCollection({ useCache: false });
                });
        },
        [
            editingFilename,
            apolloClient,
            contextId,
            contextKey,
            refetchCollection,
            t,
            getFileId,
        ],
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
    if (collectionLoading) {
        return (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                {t("Loading files...")}
            </div>
        );
    }

    // Show empty state if no files
    if (userFileCollection.length === 0) {
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
                                        userFileCollection.length &&
                                        ` / ${userFileCollection.length}`}
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
                                {sortedFiles.length !==
                                    userFileCollection.length &&
                                    ` / ${userFileCollection.length}`}
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
                                <SortableHeader
                                    sortKey="permanent"
                                    currentSort={sortKey}
                                    currentDirection={sortDirection}
                                    onSort={handleSort}
                                    className="h-9 w-10 sm:w-12 px-1 sm:px-2"
                                >
                                    {t("Keep")}
                                </SortableHeader>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedFiles.map((file, index) => {
                                const fileId = getFileId(file);
                                const isSelected = selectedIds.has(fileId);
                                const filename = getFilenameUtil(file);
                                const fileUrl = getFileUrl(file);
                                const fileMimeType = file?.mimeType;
                                const Icon = getFileIcon(filename);

                                // Use mimeType for type detection (not displayFilename)
                                // e.g., displayFilename might be "foo.docx" but mimeType is "text/markdown"
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
                                            className={`px-1 sm:px-2 py-1.5 relative group ${isRtl ? "text-right" : "text-left"}`}
                                            onMouseEnter={() =>
                                                handleMouseEnter(file)
                                            }
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            {isImage && fileUrl ? (
                                                <img
                                                    src={fileUrl}
                                                    alt={filename}
                                                    className="w-6 h-6 rounded object-cover bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenFile(file, e);
                                                    }}
                                                />
                                            ) : isYouTube &&
                                              youtubeThumbnail ? (
                                                <div
                                                    className="relative w-6 h-6 rounded overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenFile(file, e);
                                                    }}
                                                >
                                                    <img
                                                        src={youtubeThumbnail}
                                                        alt={filename}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            // Fallback to lower quality thumbnail
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
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenFile(file, e);
                                                    }}
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
                                                                    className="text-sm text-gray-700 dark:text-gray-300 truncate block cursor-help hover:text-sky-600 dark:hover:text-sky-400"
                                                                    title={
                                                                        filename
                                                                    }
                                                                    onClick={(
                                                                        e,
                                                                    ) =>
                                                                        handleStartEdit(
                                                                            file,
                                                                            e,
                                                                        )
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
                                                        className="text-sm text-gray-700 dark:text-gray-300 truncate block cursor-pointer hover:text-sky-600 dark:hover:text-sky-400"
                                                        title={filename}
                                                        onClick={(e) =>
                                                            handleStartEdit(
                                                                file,
                                                                e,
                                                            )
                                                        }
                                                    >
                                                        {filename}
                                                    </span>
                                                )}
                                            </div>
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
                                                        file?.permanent === true
                                                    }
                                                    onMouseDown={(e) => {
                                                        // Prevent row selection when clicking the checkbox
                                                        e.stopPropagation();
                                                    }}
                                                    onClick={(e) => {
                                                        // Prevent row selection when clicking the checkbox
                                                        e.stopPropagation();
                                                    }}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        handleTogglePermanent(
                                                            file,
                                                        );
                                                    }}
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-sky-600 focus:ring-sky-500 dark:focus:ring-sky-400 cursor-pointer"
                                                    title={t(
                                                        file?.permanent
                                                            ? "Permanent file"
                                                            : "Temporary file",
                                                    )}
                                                />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Hover Preview Component */}
            <HoverPreview file={hoveredFile} />

            {/* Large Preview Dialog */}
            {previewFile && (
                <FilePreviewDialog
                    file={previewFile}
                    onClose={() => setPreviewFile(null)}
                    onDownload={handleDownload}
                    t={t}
                />
            )}

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
