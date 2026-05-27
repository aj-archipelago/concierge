"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { ArrowUp, Folder, FolderPlus } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Spinner } from "@/components/ui/spinner";
import {
    getFileUrl,
    getFilename,
    getFileDate,
    createFileId,
    FilePreviewDialog,
} from "@/src/components/common/FileManager";
import { getDownloadUrl } from "@/src/utils/fileDownloadUtils";
import { useItemSelection } from "@/src/components/images/hooks/useItemSelection";
import BulkActionsBar from "@/src/components/common/BulkActionsBar";
import EmptyState from "@/src/components/common/EmptyState";

import { useUnifiedFileData, collectAllFiles } from "./useUnifiedFileData";
import { useFolderNavigation } from "./useFolderNavigation";
import SidebarFolderTree from "./SidebarFolderTree";
import FileContentArea from "./FileContentArea";
import FileGridView from "./FileGridView";
import FileToolbar from "./FileToolbar";
import FileStatusBar from "./FileStatusBar";

const SIDEBAR_MIN = 150;
const SIDEBAR_MAX = 350;
const SIDEBAR_DEFAULT = 220;
const VIEW_MODE_KEY = "unified-file-manager-view-mode";
const MOBILE_BREAKPOINT = 768;
const ALL_FILES_PATH = "__all_files__";
const PROCESSING_PREVIEW_STATUSES = new Set([
    "pending",
    "processing",
    "queued",
]);
const INVALID_FOLDER_SEGMENT_CHARS = new Set([
    "<",
    ">",
    ":",
    '"',
    "|",
    "?",
    "*",
]);

function isProcessingPreviewFile(file) {
    const status = String(file?._mediaItem?.status || file?.status || "")
        .trim()
        .toLowerCase();
    return PROCESSING_PREVIEW_STATUSES.has(status);
}

function hasInvalidFolderSegmentChars(segment) {
    return Array.from(segment).some(
        (character) =>
            INVALID_FOLDER_SEGMENT_CHARS.has(character) ||
            character.charCodeAt(0) < 32,
    );
}

function normalizeFolderPath(value) {
    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
}

function getFolderPathWithinBase(path, basePath) {
    const normalizedPath = normalizeFolderPath(path);
    const normalizedBase = normalizeFolderPath(basePath);
    if (!normalizedBase) return normalizedPath;
    if (normalizedPath === normalizedBase) return "";
    if (normalizedPath.startsWith(`${normalizedBase}/`)) {
        return normalizedPath.slice(normalizedBase.length + 1);
    }
    return null;
}

function getMoveOptionPath(path, basePath) {
    const relativePath = getFolderPathWithinBase(path, basePath);
    return relativePath ?? normalizeFolderPath(path);
}

function joinFolderPath(basePath, path) {
    const normalizedBase = normalizeFolderPath(basePath);
    const normalizedPath = normalizeFolderPath(path);
    if (!normalizedBase) return normalizedPath;
    return normalizedPath
        ? `${normalizedBase}/${normalizedPath}`
        : normalizedBase;
}

function getParentFolderPath(path) {
    const normalizedPath = normalizeFolderPath(path);
    if (!normalizedPath) return "";
    const parts = normalizedPath.split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
}

function getLeafFilename(file) {
    const source =
        file?.filename ||
        file?.displayFilename ||
        file?.displayName ||
        file?.blobPath ||
        file?.name ||
        "";
    return String(source).split("/").filter(Boolean).pop() || "";
}

function collectFolderPaths(node) {
    if (!node?.children) return [];

    const paths = [];
    const walk = (current) => {
        for (const child of Object.values(current.children || {})) {
            if (child?.path) {
                paths.push(child.path);
            }
            walk(child);
        }
    };

    walk(node);
    return paths.sort((a, b) => a.localeCompare(b));
}

function getChildFolderPaths(folderPaths, parentPath) {
    const normalizedParent = normalizeFolderPath(parentPath);
    const parentDepth = normalizedParent
        ? normalizedParent.split("/").filter(Boolean).length
        : 0;
    const prefix = normalizedParent ? `${normalizedParent}/` : "";

    return folderPaths
        .filter((path) => {
            const normalizedPath = normalizeFolderPath(path);
            if (!normalizedPath) return false;
            if (normalizedParent && !normalizedPath.startsWith(prefix)) {
                return false;
            }
            if (!normalizedParent && normalizedPath.includes("/")) {
                return false;
            }
            const depth = normalizedPath.split("/").filter(Boolean).length;
            return depth === parentDepth + 1;
        })
        .sort((a, b) => a.localeCompare(b));
}

function getFolderDisplayName(path, rootLabel) {
    const normalizedPath = normalizeFolderPath(path);
    if (!normalizedPath) return rootLabel || "Files";
    return normalizedPath.split("/").filter(Boolean).pop() || normalizedPath;
}

function getFolderDisplayPath(path, rootLabel) {
    const normalizedPath = normalizeFolderPath(path);
    const root = rootLabel || "Files";
    return normalizedPath ? `${root}/${normalizedPath}` : root;
}

function sortFilesByMostRecent(files) {
    return [...files].sort((a, b) => {
        const dateA = getFileDate(a);
        const dateB = getFileDate(b);
        if (dateA && dateB) {
            const comparison = dateB.getTime() - dateA.getTime();
            if (comparison !== 0) return comparison;
        } else if (dateA) {
            return -1;
        } else if (dateB) {
            return 1;
        }
        return getFilename(a).localeCompare(getFilename(b));
    });
}

async function reloadFilesAfterMoveError(reloadFiles) {
    try {
        await reloadFiles?.();
    } catch (error) {
        console.error("Failed to refresh files after move error:", error);
    }
}

function getSearchableFileText(file) {
    return [
        getFilename(file),
        file?.displayFilename,
        file?.displayName,
        file?.filename,
        file?.prompt,
        file?._mediaItem?.prompt,
        ...(Array.isArray(file?.tags) ? file.tags : []),
        ...(Array.isArray(file?._mediaItem?.tags) ? file._mediaItem.tags : []),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

/**
 * UnifiedFileManager - Mac Finder-style file manager with sidebar folder tree
 * and main content area showing files in list or grid view.
 *
 * @param {Object} props
 * @param {string} props.contextId - User context ID
 * @param {string|null} props.chatId - Optional chat ID for auto-navigation
 * @param {Array} props.legacyMessages - Chat messages to mine for legacy file references
 * @param {Object} props.chatTitleMap - Map of chatId -> title
 * @param {Function} props.onDelete - Delete files callback
 * @param {Function} props.onDownload - Download files callback
 * @param {Function} props.onMove - Move files callback (files, targetFolder)
 * @param {Function} props.onUpdateMetadata - Update file metadata callback (rename)
 * @param {Function} props.onUploadClick - Open upload dialog
 * @param {Function} props.onAttach - When provided, adds an "Attach" bulk action that calls
 *   onAttach(selectedObjects). Used by the chat composer's file collection picker.
 * @param {string} props.attachLabel - Label for the attach action (default "Attach")
 * @param {Function} props.getBulkActionVisibility - Optional callback that returns
 *   per-action visibility for the current selection, e.g. { attach: false }.
 * @param {string|undefined} props.defaultSelectedPath - Initial folder path; "" selects All Files
 * @param {string|undefined} props.rootFolderLabel - Optional label for the real root folder
 * @param {string|undefined} props.moveTargetBasePath - Optional base folder for relative move targets
 * @param {Function} props.onFolderChange - Called when the selected folder changes
 * @param {"list"|"grid"} props.defaultViewMode - Initial view mode when no saved preference exists
 * @param {boolean} props.isDownloading - Whether download is in progress
 * @param {string} props.containerHeight - CSS height for the container
 * @param {Function|null} props.filterFile - Optional predicate for hiding implementation files
 */
export default function UnifiedFileManager({
    contextId,
    chatId = null,
    legacyMessages = [],
    chatTitleMap = {},
    onDelete,
    onDownload,
    onMove,
    onUpdateMetadata,
    onUploadClick,
    onAttach,
    attachLabel,
    getBulkActionVisibility,
    extraBulkActions,
    onSelectionChange,
    renderPreviewDialog,
    renderFileOverlay,
    renderFileStatus,
    augmentedFiles = [],
    storageTarget = null,
    defaultSelectedPath,
    rootFolderLabel,
    moveTargetBasePath,
    onFolderChange,
    defaultViewMode = "list",
    isDownloading = false,
    containerHeight = "60vh",
    filterFile = null,
}) {
    const { t } = useTranslation();
    const direction =
        typeof document !== "undefined"
            ? document.documentElement.dir || "ltr"
            : "ltr";
    const [isMobile, setIsMobile] = useState(false);
    const [showMobileFolders, setShowMobileFolders] = useState(false);

    // View mode (persisted in localStorage)
    const [viewMode, setViewMode] = useState(() => {
        try {
            return localStorage.getItem(VIEW_MODE_KEY) || defaultViewMode;
        } catch {
            return defaultViewMode;
        }
    });

    const handleViewModeChange = useCallback((mode) => {
        setViewMode(mode);
        try {
            localStorage.setItem(VIEW_MODE_KEY, mode);
        } catch {
            // Ignore localStorage errors
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return undefined;

        const updateIsMobile = () => {
            setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        };

        updateIsMobile();
        window.addEventListener("resize", updateIsMobile);

        return () => {
            window.removeEventListener("resize", updateIsMobile);
        };
    }, []);

    useEffect(() => {
        if (!isMobile) {
            setShowMobileFolders(false);
        }
    }, [isMobile]);

    // Sidebar width (resizable)
    const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
    const isDragging = useRef(false);
    const dragStartX = useRef(0);
    const dragStartWidth = useRef(0);

    const handleDragStart = useCallback(
        (e) => {
            e.preventDefault();
            isDragging.current = true;
            dragStartX.current = e.clientX;
            dragStartWidth.current = sidebarWidth;

            const handleDragMove = (moveEvent) => {
                if (!isDragging.current) return;
                const diff =
                    direction === "rtl"
                        ? dragStartX.current - moveEvent.clientX
                        : moveEvent.clientX - dragStartX.current;
                const newWidth = Math.min(
                    SIDEBAR_MAX,
                    Math.max(SIDEBAR_MIN, dragStartWidth.current + diff),
                );
                setSidebarWidth(newWidth);
            };

            const handleDragEnd = () => {
                isDragging.current = false;
                document.removeEventListener("pointermove", handleDragMove);
                document.removeEventListener("pointerup", handleDragEnd);
            };

            document.addEventListener("pointermove", handleDragMove);
            document.addEventListener("pointerup", handleDragEnd);
        },
        [direction, sidebarWidth],
    );

    // Filter
    const [filterText, setFilterText] = useState("");
    const effectiveViewMode = isMobile ? "list" : viewMode;

    // Data hook
    const {
        tree,
        allFiles,
        loading,
        error,
        reloadFiles,
        totalFileCount,
        getFilesForPath,
        removeFileOptimistically,
        renameFileOptimistically,
        moveFilesOptimistically,
        getSnapshot,
        revertToSnapshot,
    } = useUnifiedFileData({
        contextId,
        chatId,
        legacyMessages,
        augmentedFiles,
        storageTarget,
        filterFile,
    });

    // Navigation hook
    const allFilesPath = rootFolderLabel ? ALL_FILES_PATH : "";
    const {
        selectedPath,
        expandedPaths,
        selectFolder,
        toggleExpanded,
        isExpanded,
        isSelected,
        breadcrumbs,
    } = useFolderNavigation({
        tree,
        chatId,
        defaultSelectedPath,
        rootPathLabel: rootFolderLabel,
        allFilesPath,
    });

    // Files for current view (deduplicated by blobPath > _id > hash > url)
    const currentFiles = useMemo(() => {
        const filesInFolder =
            selectedPath == null
                ? []
                : selectedPath === allFilesPath
                  ? collectAllFiles(tree)
                  : getFilesForPath(selectedPath);

        // Deduplicate — same content hash can appear in multiple scopes
        const seen = new Set();
        const deduped = filesInFolder.filter((file) => {
            const key = file?.blobPath || file?._id || file?.hash || file?.url;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const search = filterText.trim().toLowerCase();
        const visibleFiles = !search
            ? deduped
            : deduped.filter((f) => {
                  return getSearchableFileText(f).includes(search);
              });

        return sortFilesByMostRecent(visibleFiles);
    }, [allFilesPath, tree, selectedPath, getFilesForPath, filterText]);

    // File ID helper
    const getFileId = useCallback((file) => createFileId(file), []);

    // Selection
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

    // Clear selection when folder changes
    useEffect(() => {
        clearSelection();
    }, [selectedPath, clearSelection]);

    useEffect(() => {
        onSelectionChange?.(selectedObjects, selectedIds);
    }, [onSelectionChange, selectedObjects, selectedIds]);

    useEffect(() => {
        if (!onFolderChange || selectedPath == null) return;
        onFolderChange(selectedPath === allFilesPath ? "" : selectedPath, {
            selectedPath,
            allFilesPath,
        });
    }, [allFilesPath, onFolderChange, selectedPath]);

    // Select all
    const allSelected =
        selectedIds.size === currentFiles.length && currentFiles.length > 0;
    const bulkActionVisibility = useMemo(
        () =>
            getBulkActionVisibility?.({
                selectedObjects,
                selectedIds,
            }) || {},
        [getBulkActionVisibility, selectedObjects, selectedIds],
    );

    const handleSelectAll = useCallback(() => {
        if (allSelected) {
            clearSelection();
        } else {
            const newIds = new Set(currentFiles.map((f) => getFileId(f)));
            setSelectedIds(newIds);
            setSelectedObjects([...currentFiles]);
        }
    }, [
        allSelected,
        clearSelection,
        currentFiles,
        getFileId,
        setSelectedIds,
        setSelectedObjects,
    ]);

    // File selection handler with shift-click range
    const handleSelectFile = useCallback(
        (file, orderedFiles, index, e) => {
            const visibleFiles =
                Array.isArray(orderedFiles) && orderedFiles.length > 0
                    ? orderedFiles
                    : currentFiles;

            if (e?.shiftKey) {
                e.preventDefault();
            }
            const fileId = getFileId(file);

            if (e?.shiftKey && lastSelectedId !== null) {
                const lastIndex = visibleFiles.findIndex(
                    (f) => getFileId(f) === lastSelectedId,
                );
                if (lastIndex !== -1 && index !== -1) {
                    const start = Math.min(lastIndex, index);
                    const end = Math.max(lastIndex, index);
                    selectRange(visibleFiles, start, end);
                    setLastSelectedId(fileId);
                    return;
                }
            }
            toggleSelection(file);
            setLastSelectedId(fileId);
        },
        [
            lastSelectedId,
            toggleSelection,
            selectRange,
            getFileId,
            setLastSelectedId,
            currentFiles,
        ],
    );

    // Preview
    const [previewFile, setPreviewFile] = useState(null);
    const [previewOptions, setPreviewOptions] = useState({});
    const handlePreview = useCallback((file, options = {}) => {
        if (isProcessingPreviewFile(file)) {
            return;
        }
        setPreviewFile(file);
        setPreviewOptions(options || {});
    }, []);
    const handleClosePreview = useCallback(() => {
        setPreviewFile(null);
        setPreviewOptions({});
    }, []);

    // Delete confirmation
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [filesToDelete, setFilesToDelete] = useState([]);
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [moveDestinationPath, setMoveDestinationPath] = useState("");
    const [moveNewFolderName, setMoveNewFolderName] = useState("");
    const [moveError, setMoveError] = useState("");
    const [isMoving, setIsMoving] = useState(false);

    const handleDeleteRequest = useCallback((files) => {
        const arr = Array.isArray(files) ? files : [files];
        setFilesToDelete(arr);
        setShowDeleteConfirm(true);
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        setShowDeleteConfirm(false);
        if (!onDelete || filesToDelete.length === 0) return;

        // Optimistic removal
        const snapshot = getSnapshot();
        for (const file of filesToDelete) {
            removeFileOptimistically(file);
        }
        clearSelection();

        try {
            await onDelete(filesToDelete);
        } catch {
            revertToSnapshot(snapshot);
            toast.error(t("Failed to delete file(s)."));
        }
        setFilesToDelete([]);
    }, [
        onDelete,
        filesToDelete,
        getSnapshot,
        removeFileOptimistically,
        clearSelection,
        revertToSnapshot,
        t,
    ]);

    const handleBulkDelete = useCallback(() => {
        handleDeleteRequest(selectedObjects);
    }, [selectedObjects, handleDeleteRequest]);

    const folderPaths = useMemo(() => collectFolderPaths(tree), [tree]);
    const moveFolderOptions = useMemo(() => {
        const options = new Set();
        for (const path of folderPaths) {
            const optionPath = getMoveOptionPath(path, moveTargetBasePath);
            if (optionPath) options.add(optionPath);
        }
        return Array.from(options).sort((a, b) => a.localeCompare(b));
    }, [folderPaths, moveTargetBasePath]);
    const moveRootLabel = rootFolderLabel || t("Files");
    const moveChildFolderOptions = useMemo(
        () => getChildFolderPaths(moveFolderOptions, moveDestinationPath),
        [moveDestinationPath, moveFolderOptions],
    );
    const moveParentPath = useMemo(
        () => getParentFolderPath(moveDestinationPath),
        [moveDestinationPath],
    );
    const moveDestinationDisplayPath = useMemo(
        () => getFolderDisplayPath(moveDestinationPath, moveRootLabel),
        [moveDestinationPath, moveRootLabel],
    );
    const moveNewFolderNameTrimmed = normalizeFolderPath(moveNewFolderName);
    const finalMoveDestinationDisplayPath = useMemo(() => {
        const targetPath = moveNewFolderNameTrimmed
            ? joinFolderPath(moveDestinationPath, moveNewFolderNameTrimmed)
            : moveDestinationPath;
        return getFolderDisplayPath(targetPath, moveRootLabel);
    }, [moveDestinationPath, moveNewFolderNameTrimmed, moveRootLabel]);

    const handleMoveRequest = useCallback(() => {
        const initialPath =
            selectedPath && selectedPath !== allFilesPath
                ? getMoveOptionPath(selectedPath, moveTargetBasePath)
                : "";
        setMoveDestinationPath(initialPath);
        setMoveNewFolderName("");
        setMoveError("");
        setShowMoveDialog(true);
    }, [allFilesPath, moveTargetBasePath, selectedPath]);

    const handleConfirmMove = useCallback(async () => {
        if (!onMove || selectedObjects.length === 0) return;

        const newFolder = normalizeFolderPath(moveNewFolderName);
        const targetFolder = newFolder
            ? joinFolderPath(moveDestinationPath, newFolder)
            : normalizeFolderPath(moveDestinationPath);

        const segments = targetFolder.split("/").filter(Boolean);
        if (segments.some(hasInvalidFolderSegmentChars)) {
            setMoveError(t("Folder name contains invalid characters."));
            return;
        }

        setMoveError("");
        setIsMoving(true);
        const snapshot = getSnapshot();
        moveFilesOptimistically(selectedObjects, targetFolder);

        try {
            const moveResult = await onMove(selectedObjects, targetFolder);
            const movedCount =
                typeof moveResult?.movedCount === "number"
                    ? moveResult.movedCount
                    : selectedObjects.length;
            const skippedCount =
                typeof moveResult?.skippedCount === "number"
                    ? moveResult.skippedCount
                    : 0;
            clearSelection();
            setShowMoveDialog(false);
            setMoveNewFolderName("");
            await reloadFiles();
            toast.success(
                skippedCount > 0
                    ? t(
                          "Moved {{count}} file(s) to {{folder}}. Skipped {{skipped}} item(s).",
                          {
                              count: movedCount,
                              folder: getFolderDisplayPath(
                                  targetFolder,
                                  moveRootLabel,
                              ),
                              skipped: skippedCount,
                          },
                      )
                    : t("Moved {{count}} file(s) to {{folder}}.", {
                          count: movedCount,
                          folder: getFolderDisplayPath(
                              targetFolder,
                              moveRootLabel,
                          ),
                      }),
            );
        } catch (error) {
            revertToSnapshot(snapshot);
            await reloadFilesAfterMoveError(reloadFiles);
            setMoveError(error?.message || t("Failed to move files."));
        } finally {
            setIsMoving(false);
        }
    }, [
        onMove,
        selectedObjects,
        moveNewFolderName,
        moveDestinationPath,
        t,
        getSnapshot,
        moveFilesOptimistically,
        moveRootLabel,
        clearSelection,
        reloadFiles,
        revertToSnapshot,
    ]);

    const handleSelectFolder = useCallback(
        (path) => {
            selectFolder(path);
            if (isMobile) {
                setShowMobileFolders(false);
            }
        },
        [isMobile, selectFolder],
    );

    // Download (single file from grid context menu)
    const handleSingleDownload = useCallback((file) => {
        const url = file?.url;
        if (url) {
            const link = document.createElement("a");
            link.href = url;
            link.download = "";
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, []);

    // Preview download (inside preview dialog)
    const handlePreviewDownload = useCallback(async (file) => {
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
            window.open(proxyUrl, "_blank", "noopener,noreferrer");
        }
    }, []);

    // Rename
    const handleRenameRequest = useCallback(
        async (file, metadata) => {
            if (!onUpdateMetadata) return;
            const snapshot = getSnapshot();
            if (metadata?.displayFilename) {
                renameFileOptimistically(file, metadata.displayFilename);
            }
            try {
                await onUpdateMetadata(file, metadata);
            } catch {
                revertToSnapshot(snapshot);
                toast.error(t("Failed to save filename."));
            }
        },
        [
            onUpdateMetadata,
            getSnapshot,
            renameFileOptimistically,
            revertToSnapshot,
            t,
        ],
    );

    // Rename from grid context menu
    const handleGridRename = useCallback(
        (file) => {
            // Trigger rename by switching to list view and setting up editing
            // For simplicity, just prompt for a new name
            const currentName = getFilename(file);
            const newName = window.prompt(
                t("Enter new filename:"),
                currentName,
            );
            if (newName && newName.trim() && newName.trim() !== currentName) {
                handleRenameRequest(file, {
                    displayFilename: newName.trim(),
                });
            }
        },
        [handleRenameRequest, t],
    );

    // Loading state
    if (loading && allFiles.length === 0) {
        return (
            <div
                className="flex min-h-0 items-center justify-center overflow-hidden"
                style={{ height: containerHeight }}
            >
                <Spinner className="w-6 h-6" />
            </div>
        );
    }

    // Error state
    if (error && allFiles.length === 0) {
        return (
            <div
                className="flex min-h-0 flex-col items-center justify-center gap-2 overflow-hidden"
                style={{ height: containerHeight }}
            >
                <p className="text-sm text-red-500">
                    {t("Failed to load files")}
                </p>
                <p className="text-xs text-gray-400">{error}</p>
                <button
                    onClick={reloadFiles}
                    className="text-xs text-blue-500 hover:underline"
                >
                    {t("Retry")}
                </button>
            </div>
        );
    }

    // Empty state (no files at all)
    if (totalFileCount === 0 && !loading) {
        return (
            <div
                className="flex min-h-0 flex-col items-center justify-center overflow-hidden"
                style={{ height: containerHeight }}
            >
                <EmptyState
                    icon={<Folder className="w-12 h-12" />}
                    title={t("No files in storage")}
                    description={t("Upload files to get started.")}
                    action={onUploadClick}
                    actionLabel={onUploadClick ? t("Upload") : undefined}
                />
            </div>
        );
    }

    const deleteFilenames = filesToDelete.map((f) => getFilename(f)).join(", ");

    return (
        <div
            className={`relative flex min-h-0 flex-col overflow-hidden overscroll-contain bg-white dark:bg-gray-900 ${
                isMobile
                    ? "border-0 rounded-none"
                    : "border border-gray-200 dark:border-gray-700 rounded-lg"
            }`}
            dir={direction}
            style={{ height: containerHeight }}
        >
            {/* Toolbar */}
            <FileToolbar
                breadcrumbs={breadcrumbs}
                onNavigate={handleSelectFolder}
                filterText={filterText}
                onFilterChange={setFilterText}
                viewMode={effectiveViewMode}
                onViewModeChange={handleViewModeChange}
                onUploadClick={onUploadClick}
                onRefresh={reloadFiles}
                chatTitleMap={chatTitleMap}
                isMobile={isMobile}
                showMobileFolders={showMobileFolders}
                onToggleMobileFolders={() =>
                    setShowMobileFolders((current) => !current)
                }
            />

            {isMobile && showMobileFolders && (
                <div className="max-h-64 flex-shrink-0 overflow-y-auto border-b border-gray-200 bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-900">
                    <SidebarFolderTree
                        tree={tree}
                        chatTitleMap={chatTitleMap}
                        totalFileCount={totalFileCount}
                        isExpanded={isExpanded}
                        isSelected={isSelected}
                        onToggleExpand={toggleExpanded}
                        onSelect={handleSelectFolder}
                        expandedPaths={expandedPaths}
                        selectedPath={selectedPath}
                        rootFolderLabel={rootFolderLabel}
                        allFilesPath={allFilesPath}
                    />
                </div>
            )}

            {/* Main body: sidebar + content */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
                {!isMobile && (
                    <>
                        {/* Sidebar */}
                        <div
                            className="flex-shrink-0 overflow-y-auto overflow-x-hidden border-e border-gray-200 dark:border-gray-700"
                            style={{ width: `${sidebarWidth}px` }}
                        >
                            <SidebarFolderTree
                                tree={tree}
                                chatTitleMap={chatTitleMap}
                                totalFileCount={totalFileCount}
                                isExpanded={isExpanded}
                                isSelected={isSelected}
                                onToggleExpand={toggleExpanded}
                                onSelect={handleSelectFolder}
                                expandedPaths={expandedPaths}
                                selectedPath={selectedPath}
                                rootFolderLabel={rootFolderLabel}
                                allFilesPath={allFilesPath}
                            />
                        </div>

                        {/* Resize handle */}
                        <div
                            className="w-1 flex-shrink-0 cursor-col-resize hover:bg-sky-200 dark:hover:bg-sky-800 active:bg-sky-300 dark:active:bg-sky-700 transition-colors"
                            onPointerDown={handleDragStart}
                        />
                    </>
                )}

                {/* Content area */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0">
                    {currentFiles.length === 0 ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                            <EmptyState
                                icon={<Folder className="w-12 h-12" />}
                                title={
                                    filterText
                                        ? t("No files match")
                                        : t("No files in this folder")
                                }
                                description={
                                    filterText
                                        ? t(
                                              "No files match your filter. Try a different search.",
                                          )
                                        : t("This folder is empty.")
                                }
                            />
                        </div>
                    ) : effectiveViewMode === "grid" ? (
                        <FileGridView
                            files={currentFiles}
                            selectedIds={selectedIds}
                            getFileId={getFileId}
                            onSelectFile={handleSelectFile}
                            onPreview={handlePreview}
                            onDownload={handleSingleDownload}
                            onRename={handleGridRename}
                            onDelete={(file) => handleDeleteRequest(file)}
                            enableFilenameEdit={!!onUpdateMetadata}
                            renderFileOverlay={renderFileOverlay}
                            renderFileStatus={renderFileStatus}
                        />
                    ) : (
                        <FileContentArea
                            files={currentFiles}
                            selectedIds={selectedIds}
                            getFileId={getFileId}
                            onSelectFile={handleSelectFile}
                            onSelectAll={handleSelectAll}
                            allSelected={allSelected}
                            onPreview={handlePreview}
                            enableFilenameEdit={!!onUpdateMetadata}
                            onUpdateMetadata={handleRenameRequest}
                            onDelete={
                                onDelete
                                    ? (file) => handleDeleteRequest(file)
                                    : undefined
                            }
                            filterText={filterText}
                            isMobile={isMobile}
                            renderFileStatus={renderFileStatus}
                        />
                    )}
                </div>
            </div>

            {/* Status bar */}
            <FileStatusBar
                fileCount={currentFiles.length}
                totalFileCount={totalFileCount}
                selectedCount={selectedIds.size}
                files={currentFiles}
                selectedPath={selectedPath}
            />

            {/* Bulk actions bar */}
            {selectedIds.size > 0 && (
                <BulkActionsBar
                    selectedCount={selectedIds.size}
                    allSelected={allSelected}
                    onSelectAll={handleSelectAll}
                    onClearSelection={clearSelection}
                    positionMode="container"
                    actions={{
                        ...(onAttach && bulkActionVisibility.attach !== false
                            ? {
                                  attach: {
                                      onClick: () => {
                                          onAttach(selectedObjects);
                                      },
                                      disabled: false,
                                      label: attachLabel || t("Attach"),
                                      ariaLabel: `${attachLabel || t("Attach")} (${selectedIds.size})`,
                                  },
                              }
                            : {}),
                        ...(onDownload &&
                        bulkActionVisibility.download !== false
                            ? {
                                  download: {
                                      onClick: async () => {
                                          await onDownload(selectedObjects);
                                          clearSelection();
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
                        ...(onMove && bulkActionVisibility.move !== false
                            ? {
                                  move: {
                                      onClick: handleMoveRequest,
                                      disabled: isMoving,
                                      loadingLabel: t("Moving..."),
                                      label: t("Move"),
                                      ariaLabel: `${t("Move")} (${selectedIds.size})`,
                                  },
                              }
                            : {}),
                        ...(onDelete
                            ? {
                                  delete: {
                                      onClick: handleBulkDelete,
                                      disabled: false,
                                      label: t("Delete"),
                                      ariaLabel: `${t("Delete")} (${selectedIds.size})`,
                                  },
                              }
                            : {}),
                        ...(typeof extraBulkActions === "function"
                            ? extraBulkActions({
                                  selectedObjects,
                                  selectedIds,
                                  clearSelection,
                              })
                            : extraBulkActions || {}),
                    }}
                />
            )}

            {/* File preview dialog */}
            {previewFile && renderPreviewDialog ? (
                renderPreviewDialog({
                    file: previewFile,
                    onClose: handleClosePreview,
                    onDownload: handlePreviewDownload,
                    autoPlay: previewOptions.autoPlay === true,
                    t,
                })
            ) : previewFile ? (
                <FilePreviewDialog
                    file={previewFile}
                    onClose={handleClosePreview}
                    onDownload={handlePreviewDownload}
                    autoPlay={previewOptions.autoPlay === true}
                    t={t}
                />
            ) : null}

            {/* Move dialog */}
            <Dialog
                open={showMoveDialog}
                onOpenChange={(open) => {
                    if (isMoving) return;
                    setShowMoveDialog(open);
                    if (!open) {
                        setMoveError("");
                        setMoveDestinationPath("");
                        setMoveNewFolderName("");
                    }
                }}
            >
                <DialogContent
                    className="flex max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-lg flex-col gap-4 overflow-hidden p-4 sm:p-6"
                    dir={direction}
                >
                    <DialogHeader className="space-y-1 text-start">
                        <DialogTitle className="pe-8">
                            {t("Move files")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("Choose where the selected files should go.")}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedObjects.length > 0 && (
                        <div className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {t("Files to move")}
                            </div>
                            <div className="max-h-20 min-w-0 overflow-y-auto text-sm text-gray-800 dark:text-gray-100">
                                {selectedObjects.map((file) => (
                                    <div
                                        key={getFileId(file)}
                                        className="truncate"
                                        title={getLeafFilename(file)}
                                    >
                                        {getLeafFilename(file)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pe-1">
                        <div className="min-w-0 space-y-2">
                            <Label>{t("Destination folder")}</Label>
                            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                                <div className="flex min-w-0 items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
                                    <button
                                        type="button"
                                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                                        onClick={() => {
                                            setMoveDestinationPath(
                                                moveParentPath,
                                            );
                                            setMoveError("");
                                        }}
                                        disabled={
                                            isMoving || !moveDestinationPath
                                        }
                                        aria-label={t("Up one level")}
                                        title={t("Up one level")}
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {getFolderDisplayName(
                                                moveDestinationPath,
                                                moveRootLabel,
                                            )}
                                        </div>
                                        <div
                                            className="truncate text-xs text-gray-500 dark:text-gray-400"
                                            title={moveDestinationDisplayPath}
                                        >
                                            {moveDestinationDisplayPath}
                                        </div>
                                    </div>
                                </div>
                                <div className="max-h-48 min-h-24 min-w-0 overflow-y-auto overflow-x-hidden p-1.5">
                                    {moveChildFolderOptions.length > 0 ? (
                                        moveChildFolderOptions.map((path) => (
                                            <button
                                                key={path}
                                                type="button"
                                                className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-start text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                                                title={getFolderDisplayPath(
                                                    path,
                                                    moveRootLabel,
                                                )}
                                                onClick={() => {
                                                    setMoveDestinationPath(
                                                        path,
                                                    );
                                                    setMoveError("");
                                                }}
                                                disabled={isMoving}
                                            >
                                                <Folder className="h-4 w-4 flex-shrink-0 text-yellow-500" />
                                                <span className="truncate">
                                                    {getFolderDisplayName(path)}
                                                </span>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-3 py-5 text-center text-sm text-gray-500 dark:text-gray-400">
                                            {t(
                                                "No subfolders here. You can still move files to this folder.",
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="min-w-0 space-y-2">
                            <div>
                                <Label htmlFor="move-new-folder-input">
                                    {t("Create a new folder")}
                                </Label>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {t(
                                        "Optional. Leave blank to move directly into the destination folder.",
                                    )}
                                </p>
                            </div>
                            <div className="flex min-w-0 items-center gap-2 py-1">
                                <div className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                    <FolderPlus className="h-4 w-4" />
                                </div>
                                <Input
                                    id="move-new-folder-input"
                                    value={moveNewFolderName}
                                    onChange={(event) => {
                                        setMoveNewFolderName(
                                            event.target.value,
                                        );
                                        setMoveError("");
                                    }}
                                    placeholder={t("New folder name")}
                                    disabled={isMoving}
                                />
                            </div>
                        </div>
                        {moveError && (
                            <p className="text-sm text-red-600 dark:text-red-400">
                                {moveError}
                            </p>
                        )}
                    </div>
                    <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                        {t("Will move to {{folder}}", {
                            folder: finalMoveDestinationDisplayPath,
                        })}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <button
                            type="button"
                            className="lb-outline min-h-10 justify-center"
                            onClick={() => setShowMoveDialog(false)}
                            disabled={isMoving}
                        >
                            {t("Cancel")}
                        </button>
                        <button
                            type="button"
                            className="lb-primary inline-flex min-h-10 w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 sm:w-44"
                            onClick={handleConfirmMove}
                            disabled={isMoving}
                            aria-label={isMoving ? t("Moving...") : undefined}
                        >
                            {isMoving ? (
                                <Spinner size="sm" aria-hidden="true" />
                            ) : (
                                <span>
                                    {moveNewFolderNameTrimmed
                                        ? t("Move to new folder")
                                        : t("Move Here")}
                                </span>
                            )}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete confirmation dialog */}
            <AlertDialog
                open={showDeleteConfirm}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowDeleteConfirm(false);
                        setFilesToDelete([]);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {filesToDelete.length === 1
                                ? t("Delete File?")
                                : t("Delete {{count}} Files?", {
                                      count: filesToDelete.length,
                                  })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {filesToDelete.length === 1
                                ? t(
                                      'Are you sure you want to delete "{{filename}}"? This action cannot be undone.',
                                      { filename: deleteFilenames },
                                  )
                                : t(
                                      "Are you sure you want to delete {{count}} files? This action cannot be undone.",
                                      { count: filesToDelete.length },
                                  )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete}>
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
