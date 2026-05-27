"use client";

import {
    useEffect,
    useState,
    useMemo,
    useCallback,
    useContext,
    useRef,
} from "react";
import { useTranslation } from "react-i18next";
import {
    ChevronRight,
    ChevronDown,
    FileCode,
    FileText,
    Folder,
    FolderOpen,
    Globe,
    MessageSquare,
    RefreshCw,
    Upload,
    Download,
    MoreVertical,
    Pencil,
    Trash2,
    Eye,
    Loader2,
} from "lucide-react";
import {
    formatFileSize,
    getFileUrl,
    getFilename,
    FilePreviewDialog,
} from "@/src/components/common/FileManager";
import { getDownloadUrl } from "@/src/utils/fileDownloadUtils";
import { getFileIcon } from "@/src/utils/mediaUtils";
import { toast } from "react-toastify";
import { listUserFolder } from "@/src/utils/fileUploadUtils";
import { AuthContext } from "@/src/App";
import { Spinner } from "@/components/ui/spinner";
import {
    Tooltip,
    TooltipProvider,
    TooltipTrigger,
    TooltipContent,
} from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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

/**
 * Parse flat file list into a folder tree structure.
 * Files have `name` like "users/{userId}/global/{hash}_{filename}"
 * We strip the "users/{userId}/" prefix and group by remaining path segments.
 */
function buildFolderTree(files, userPrefix) {
    const tree = { name: "/", children: {}, files: [] };

    for (const file of files) {
        // Strip the user prefix (e.g., "users/{userId}/")
        let relativePath = file.name;
        if (relativePath.startsWith(userPrefix)) {
            relativePath = relativePath.slice(userPrefix.length);
        }
        if (relativePath.startsWith("/")) {
            relativePath = relativePath.slice(1);
        }

        const parts = relativePath.split("/");
        const fileName = parts.pop(); // Last segment is the file name

        // Walk/create folder nodes
        let current = tree;
        for (const part of parts) {
            if (!current.children[part]) {
                current.children[part] = {
                    name: part,
                    children: {},
                    files: [],
                };
            }
            current = current.children[part];
        }

        // Add file to the deepest folder
        const displayName = decodeURIComponent(file.filename || fileName);
        current.files.push({
            ...file,
            displayName,
            displayFilename:
                file.displayFilename || file.filename || displayName,
            mimeType: file.mimeType || file.contentType,
        });
    }

    return tree;
}

/**
 * Get a human-readable label for a folder segment.
 */
function getFolderLabel(segment, chatTitleMap, t) {
    if (segment === "global") return t("Global Files");
    if (segment === "chats") return t("Chat Files");
    if (segment === "workspaces") return t("Workspaces");
    if (segment === "applets") return t("Applets");
    if (segment === "articles") return t("Articles");

    // If this is a chat ID, try to resolve the title
    if (chatTitleMap && chatTitleMap[segment]) {
        return chatTitleMap[segment];
    }

    return segment;
}

/**
 * Get the icon for a folder segment.
 */
function getFolderIcon(segment, isOpen) {
    if (segment === "global")
        return <Globe className="w-4 h-4 text-blue-500" />;
    if (segment === "chats")
        return <MessageSquare className="w-4 h-4 text-green-500" />;
    if (segment === "applets")
        return <FileCode className="w-4 h-4 text-purple-500" />;
    if (segment === "articles")
        return <FileText className="w-4 h-4 text-sky-500" />;
    if (isOpen) return <FolderOpen className="w-4 h-4 text-yellow-500" />;
    return <Folder className="w-4 h-4 text-yellow-500" />;
}

/**
 * Get the file icon component from the file's mime type.
 */
// Stable identifier used to match a file against the currently-loading file.
// Mirrors the priority used by canvas openers (blobPath > hash > url > name).
function getFileKey(file) {
    if (!file) return null;
    return (
        file.blobPath ||
        file.converted?.blobPath ||
        file.hash ||
        file.converted?.hash ||
        file.url ||
        file.converted?.url ||
        file.name ||
        null
    );
}

function FileIcon({ file, isLoading }) {
    if (isLoading) {
        return (
            <Loader2 className="w-4 h-4 text-sky-500 dark:text-sky-400 flex-shrink-0 animate-spin" />
        );
    }
    const Icon = getFileIcon(file?.displayName || file?.filename || "");
    return <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />;
}

/**
 * Recursive folder node component.
 */
function FolderNode({
    segment,
    node,
    depth,
    chatTitleMap,
    defaultOpen,
    onPreview,
    onFileSelect,
    onDownload,
    onStartRename,
    onDeleteRequest,
    editingFile,
    editingFilename,
    onEditingFilenameChange,
    onSaveFilename,
    onCancelEdit,
    getDisplayName,
    loadingFileKey,
}) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const childFolders = Object.keys(node.children).sort();
    const hasChildren = childFolders.length > 0 || node.files.length > 0;
    const totalFiles = countFiles(node);

    return (
        <div>
            {/* Folder row */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-1.5 py-1.5 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded text-sm transition-colors min-w-0 overflow-hidden"
                style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
            >
                {hasChildren ? (
                    isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    )
                ) : (
                    <span className="w-3.5" />
                )}
                {getFolderIcon(segment, isOpen)}
                <span className="font-medium text-gray-700 dark:text-gray-300 truncate">
                    {getFolderLabel(segment, chatTitleMap, t)}
                </span>
                <span className="text-xs text-gray-400 ms-auto flex-shrink-0">
                    {totalFiles} {totalFiles === 1 ? t("file") : t("files")}
                </span>
            </button>

            {/* Children */}
            {isOpen && (
                <div>
                    {/* Sub-folders */}
                    {childFolders.map((childKey) => (
                        <FolderNode
                            key={childKey}
                            segment={childKey}
                            node={node.children[childKey]}
                            depth={depth + 1}
                            chatTitleMap={chatTitleMap}
                            defaultOpen={false}
                            onPreview={onPreview}
                            onFileSelect={onFileSelect}
                            onDownload={onDownload}
                            onStartRename={onStartRename}
                            onDeleteRequest={onDeleteRequest}
                            editingFile={editingFile}
                            editingFilename={editingFilename}
                            onEditingFilenameChange={onEditingFilenameChange}
                            onSaveFilename={onSaveFilename}
                            onCancelEdit={onCancelEdit}
                            getDisplayName={getDisplayName}
                            loadingFileKey={loadingFileKey}
                        />
                    ))}

                    {/* Files in this folder */}
                    {node.files.map((file, idx) => (
                        <FileRow
                            key={file.hash || file.name || idx}
                            file={file}
                            depth={depth + 1}
                            onPreview={onPreview}
                            onFileSelect={onFileSelect}
                            onDownload={onDownload}
                            onStartRename={onStartRename}
                            onDeleteRequest={onDeleteRequest}
                            isEditing={editingFile === file}
                            editingFilename={editingFilename}
                            onEditingFilenameChange={onEditingFilenameChange}
                            onSaveFilename={() => onSaveFilename?.(file)}
                            onCancelEdit={onCancelEdit}
                            getDisplayName={getDisplayName}
                            loadingFileKey={loadingFileKey}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * File row component with dropdown menu and inline rename support.
 * In select mode (onFileSelect provided), row click opens the file; dropdown is hidden.
 */
function FileRow({
    file,
    depth,
    onPreview,
    onFileSelect,
    onDownload,
    onStartRename,
    onDeleteRequest,
    isEditing,
    editingFilename,
    onEditingFilenameChange,
    onSaveFilename,
    onCancelEdit,
    getDisplayName,
    loadingFileKey,
}) {
    const fileKey = getFileKey(file);
    const isLoading = !!loadingFileKey && fileKey === loadingFileKey;
    const { t } = useTranslation();
    const inputRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const isSelectMode = !!onFileSelect;

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            onSaveFilename?.();
        } else if (e.key === "Escape") {
            e.preventDefault();
            onCancelEdit?.();
        }
    };

    const handleRowClick = (e) => {
        if (isSelectMode && !isEditing && onFileSelect) {
            e.stopPropagation();
            onFileSelect(file);
        }
    };

    return (
        <TooltipProvider delayDuration={700}>
            <Tooltip open={menuOpen ? false : undefined}>
                <TooltipTrigger asChild>
                    <div
                        role={isSelectMode ? "button" : undefined}
                        tabIndex={isSelectMode ? 0 : undefined}
                        onKeyDown={
                            isSelectMode && !isEditing
                                ? (e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          onFileSelect(file);
                                      }
                                  }
                                : undefined
                        }
                        onClick={handleRowClick}
                        onContextMenu={(e) => {
                            if (!isSelectMode) {
                                e.preventDefault();
                                setMenuOpen(true);
                            }
                        }}
                        className={`w-full flex items-center gap-1.5 py-1 px-2 rounded text-sm transition-colors group min-w-0 overflow-hidden ${
                            isSelectMode && !isEditing
                                ? "hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer"
                                : "hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        }`}
                        style={{
                            paddingInlineStart: `${(depth + 1) * 16 + 8}px`,
                        }}
                    >
                        <FileIcon file={file} isLoading={isLoading} />
                        {isEditing ? (
                            <input
                                ref={inputRef}
                                type="text"
                                value={editingFilename}
                                onChange={(e) =>
                                    onEditingFilenameChange?.(e.target.value)
                                }
                                onKeyDown={handleKeyDown}
                                onBlur={() => onSaveFilename?.()}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-sky-500 dark:border-sky-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
                            />
                        ) : (
                            <span className="truncate text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 min-w-0">
                                {getDisplayName?.(file) ||
                                    file.displayName ||
                                    file.filename}
                            </span>
                        )}
                        <span
                            className="text-xs text-gray-400 ms-auto flex-shrink-0 tabular-nums"
                            dir="ltr"
                        >
                            {file.size ? formatFileSize(file.size) : ""}
                        </span>
                        {/* Dropdown menu - hidden in select mode */}
                        {!isSelectMode && (
                            <DropdownMenu
                                open={menuOpen}
                                onOpenChange={setMenuOpen}
                            >
                                <DropdownMenuTrigger asChild>
                                    <button
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex-shrink-0"
                                        title={t("More actions")}
                                    >
                                        <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" sideOffset={4}>
                                    {onPreview && (
                                        <DropdownMenuItem
                                            onSelect={() => onPreview(file)}
                                        >
                                            <Eye className="w-4 h-4 me-2" />
                                            {t("Preview")}
                                        </DropdownMenuItem>
                                    )}
                                    {onDownload && (
                                        <DropdownMenuItem
                                            onSelect={() => onDownload(file)}
                                        >
                                            <Download className="w-4 h-4 me-2" />
                                            {t("Download")}
                                        </DropdownMenuItem>
                                    )}
                                    {onStartRename && (
                                        <DropdownMenuItem
                                            onSelect={() => onStartRename(file)}
                                        >
                                            <Pencil className="w-4 h-4 me-2" />
                                            {t("Rename")}
                                        </DropdownMenuItem>
                                    )}
                                    {onDeleteRequest && (
                                        <DropdownMenuItem
                                            onSelect={() =>
                                                onDeleteRequest(file)
                                            }
                                            className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                                        >
                                            <Trash2 className="w-4 h-4 me-2" />
                                            {t("Delete")}
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs break-all">{file.name}</p>
                    {file.contentType && (
                        <p className="text-xs text-gray-400">
                            {file.contentType}
                        </p>
                    )}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

/**
 * Count total files in a node (recursively).
 */
function countFiles(node) {
    let count = node.files.length;
    for (const child of Object.values(node.children)) {
        count += countFiles(child);
    }
    return count;
}

const FOLDER_BROWSER_REFRESH_INTERVAL_MS = 30_000;

/**
 * FolderBrowser - displays files in a folder tree structure with file management.
 *
 * @param {Object} props
 * @param {Object} props.chatTitleMap - Map of chatId -> chat title for display
 * @param {string} props.containerHeight - CSS height for the scrollable container
 * @param {"manage"|"select"} props.mode - "manage" (default) for full CRUD; "select" for pick-to-open (onFileSelect)
 * @param {Function} props.onFileSelect - In select mode, called when user clicks a file to open it
 * @param {Function} props.onDelete - Callback to delete a file
 * @param {Function} props.onRename - Callback to rename a file (file, newName)
 * @param {Function} props.onUploadClick - Callback to open upload dialog
 * @param {Function} props.onDownload - Callback to download a file
 * @param {number} props.refreshKey - When changed, triggers a file list refresh
 * @param {string} props.className - Optional className for the root container (e.g. "flex-1 min-h-0" for flex-fill)
 * @param {Function} [props.fileFilter] - Optional predicate (file) => boolean. Files for which it returns false are hidden.
 * @param {Function} [props.getDisplayName] - Optional resolver (file) => string|null. Non-null return overrides the displayed name (e.g. applet title in place of raw filename).
 */
export default function FolderBrowser({
    chatTitleMap = {},
    containerHeight = "60vh",
    mode = "manage",
    onFileSelect,
    className,
    onDelete,
    onRename,
    onUploadClick,
    onDownload,
    refreshKey,
    fileFilter,
    getDisplayName,
    loadingFileKey,
}) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const userId = user?.contextId;
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [folderPath, setFolderPath] = useState("");
    const loadingRef = useRef(false);

    // Preview state (opened via dropdown menu)
    const [previewFile, setPreviewFile] = useState(null);

    // Inline rename state
    const [editingFile, setEditingFile] = useState(null);
    const [editingFilename, setEditingFilename] = useState("");

    // Delete confirmation state
    const [deleteFile, setDeleteFile] = useState(null);

    const loadFiles = useCallback(async () => {
        if (loadingRef.current) return;
        if (!userId) return;
        loadingRef.current = true;
        setLoading(true);
        setError(null);
        try {
            const result = await listUserFolder(userId);
            setFiles(result.files || []);
            setFolderPath(result.folderPath || "");
        } catch (err) {
            setError(err.message);
            setFiles([]);
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    }, [userId]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    // Reload when refreshKey changes
    useEffect(() => {
        if (refreshKey !== undefined && refreshKey !== 0) {
            loadFiles();
        }
    }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!userId) return undefined;
        const intervalId = window.setInterval(
            loadFiles,
            FOLDER_BROWSER_REFRESH_INTERVAL_MS,
        );
        return () => window.clearInterval(intervalId);
    }, [loadFiles, userId]);

    const userPrefix = folderPath
        ? folderPath.endsWith("/")
            ? folderPath
            : `${folderPath}/`
        : `users/${userId}/`;

    const visibleFiles = useMemo(
        () => (fileFilter ? files.filter(fileFilter) : files),
        [files, fileFilter],
    );

    const tree = useMemo(
        () => buildFolderTree(visibleFiles, userPrefix),
        [visibleFiles, userPrefix],
    );

    const totalFiles = visibleFiles.length;
    const topFolders = Object.keys(tree.children).sort();
    const isSelectMode = mode === "select";

    // Handle download
    const handleDownload = useCallback(
        (file, e) => {
            e?.stopPropagation?.();
            if (onDownload) {
                onDownload(file);
            } else {
                const url = getFileUrl(file);
                if (url) {
                    const link = document.createElement("a");
                    link.href = getDownloadUrl(url);
                    link.download = getFilename(file) || "";
                    link.style.display = "none";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            }
        },
        [onDownload],
    );

    // Handle rename start
    const handleStartRename = useCallback((file) => {
        const currentName = getFilename(file);
        setEditingFile(file);
        setEditingFilename(currentName);
    }, []);

    // Handle rename save (optimistic)
    const handleSaveFilename = useCallback(
        async (file) => {
            const trimmed = editingFilename.trim();
            if (!trimmed || !onRename) {
                setEditingFile(null);
                setEditingFilename("");
                return;
            }
            setEditingFile(null);
            setEditingFilename("");

            // Snapshot for revert
            let snapshot;
            setFiles((prev) => {
                snapshot = prev;
                return prev.map((f) => {
                    if (f.name === file.name) {
                        return { ...f, filename: trimmed };
                    }
                    return f;
                });
            });

            try {
                await onRename(file, trimmed);
            } catch {
                setFiles(snapshot);
                toast.error(t("Failed to save filename."));
            }
        },
        [editingFilename, onRename, t],
    );

    // Handle rename cancel
    const handleCancelEdit = useCallback(() => {
        setEditingFile(null);
        setEditingFilename("");
    }, []);

    // Handle delete confirmation (optimistic)
    const handleConfirmDelete = useCallback(async () => {
        if (!deleteFile || !onDelete) {
            setDeleteFile(null);
            return;
        }
        const fileToDelete = deleteFile;
        setDeleteFile(null);

        // Snapshot for revert
        let snapshot;
        setFiles((prev) => {
            snapshot = prev;
            return prev.filter((f) => f.name !== fileToDelete.name);
        });

        try {
            await onDelete(fileToDelete);
        } catch {
            setFiles(snapshot);
            toast.error(t("Failed to delete file."));
        }
    }, [deleteFile, onDelete, t]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner className="w-6 h-6" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8 text-sm text-red-500 dark:text-red-400">
                <p>{t("Failed to load folder structure")}</p>
                <p className="text-xs mt-1">{error}</p>
                <button
                    onClick={loadFiles}
                    className="mt-2 text-blue-500 dark:text-blue-400 hover:underline text-xs"
                >
                    {t("Retry")}
                </button>
            </div>
        );
    }

    if (totalFiles === 0) {
        const filteredOut = files.length > 0;
        return (
            <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                <Folder className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <p>
                    {filteredOut
                        ? t("No matching files") || "No matching files"
                        : t("No files in storage")}
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                    {onUploadClick && (
                        <button
                            onClick={onUploadClick}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            {t("Upload")}
                        </button>
                    )}
                    <button
                        onClick={loadFiles}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
                        title={t("Refresh")}
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {t("Refresh")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div
                className={`flex flex-col overflow-hidden min-w-0 w-full ${className || ""}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 min-w-0">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                        {t("Folder Browser")} ({totalFiles}{" "}
                        {totalFiles === 1 ? t("file") : t("files")})
                    </span>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                        {onUploadClick && (
                            <button
                                onClick={onUploadClick}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                                title={t("Upload")}
                            >
                                <Upload className="w-4 h-4 text-gray-400" />
                            </button>
                        )}
                        <button
                            onClick={loadFiles}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                            title={t("Refresh")}
                        >
                            <RefreshCw className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Tree */}
                <div
                    className={`overflow-y-auto overflow-x-hidden py-1 ${className?.includes("flex-1") ? "flex-1 min-h-0" : ""}`}
                    style={
                        className?.includes("flex-1")
                            ? undefined
                            : { maxHeight: containerHeight }
                    }
                >
                    {topFolders.map((folderKey) => (
                        <FolderNode
                            key={folderKey}
                            segment={folderKey}
                            node={tree.children[folderKey]}
                            depth={0}
                            chatTitleMap={chatTitleMap}
                            defaultOpen={true}
                            onPreview={
                                isSelectMode
                                    ? undefined
                                    : (f) => setPreviewFile(f)
                            }
                            onFileSelect={
                                isSelectMode ? onFileSelect : undefined
                            }
                            onDownload={handleDownload}
                            onStartRename={
                                onRename ? handleStartRename : undefined
                            }
                            onDeleteRequest={
                                onDelete
                                    ? (file) => setDeleteFile(file)
                                    : undefined
                            }
                            editingFile={editingFile}
                            editingFilename={editingFilename}
                            onEditingFilenameChange={setEditingFilename}
                            onSaveFilename={handleSaveFilename}
                            onCancelEdit={handleCancelEdit}
                            getDisplayName={getDisplayName}
                            loadingFileKey={loadingFileKey}
                        />
                    ))}

                    {/* Files at root level (shouldn't normally happen) */}
                    {tree.files.map((file, idx) => (
                        <FileRow
                            key={file.hash || file.name || idx}
                            file={file}
                            depth={0}
                            onPreview={
                                isSelectMode
                                    ? undefined
                                    : (f) => setPreviewFile(f)
                            }
                            onFileSelect={
                                isSelectMode ? onFileSelect : undefined
                            }
                            onDownload={handleDownload}
                            onStartRename={
                                onRename ? handleStartRename : undefined
                            }
                            onDeleteRequest={
                                onDelete ? (f) => setDeleteFile(f) : undefined
                            }
                            isEditing={editingFile === file}
                            editingFilename={editingFilename}
                            onEditingFilenameChange={setEditingFilename}
                            onSaveFilename={() => handleSaveFilename(file)}
                            onCancelEdit={handleCancelEdit}
                            loadingFileKey={loadingFileKey}
                        />
                    ))}
                </div>
            </div>

            {/* Preview Dialog (opened via dropdown menu) */}
            {previewFile && (
                <FilePreviewDialog
                    file={previewFile}
                    onClose={() => setPreviewFile(null)}
                    onDownload={handleDownload}
                    t={t}
                />
            )}

            {/* Delete Confirmation */}
            <AlertDialog
                open={!!deleteFile}
                onOpenChange={(open) => {
                    if (!open) setDeleteFile(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Delete File?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                'Are you sure you want to delete "{{filename}}"? This action cannot be undone.',
                                {
                                    filename: deleteFile
                                        ? getFilename(deleteFile)
                                        : "",
                                },
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
        </>
    );
}
