"use client";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { deleteFileFromCloud } from "./chatFileUtils";
import { deleteAppletUserFileFromWorkspace } from "./fileCollectionDeleteUtils";
import { useFileCollection } from "./useFileCollection";
import { useFileUploadHandler } from "./useFileUploadHandler";
import { useHashToIdLookup } from "../../hooks/useHashToIdLookup";
import { useWorkspaceFiles } from "../../../queries/workspaces";
import FileManager, {
    createFileId,
    getFilename,
} from "@/src/components/common/FileManager";
import FileUploadDialog from "../../components/FileUploadDialog";
import { CheckSquare, Square, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * UserFileCollectionPicker - A picker-style interface for selecting files from a user's Cortex file collection
 *
 * This uses FileManager in controlled selection mode to provide a picker interface.
 * Selected files = attached, unselected = not attached.
 *
 * @param {Object} props
 * @param {string} props.contextId - The context ID for file operations
 * @param {string} props.contextKey - The context key for the file collection
 * @param {string} props.workspaceId - The workspace ID (used for upload endpoint)
 * @param {string} props.folderWorkspaceId - Workspace ID for user-scoped applet folder routing
 * @param {string} props.fileScope - Folder scope to list in CFH ('all' | 'global' | 'chat' | 'applet')
 * @param {Array<Object>} props.fallbackStorageTargets - Additional storage targets to merge into the picker list
 * @param {string} props.source - Data source mode ('user-folder' | 'workspace-api')
 * @param {Array} props.selectedFiles - Currently selected/attached files
 * @param {Function} props.onFilesSelected - Callback when selection changes
 */
export default function UserFileCollectionPicker({
    contextId,
    contextKey,
    workspaceId = null,
    folderWorkspaceId = null,
    fileScope = "all",
    storageTarget = null,
    fallbackStorageTargets = [],
    source = "user-folder",
    selectedFiles = [],
    onFilesSelected,
}) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [deletingFiles, setDeletingFiles] = useState(new Set());
    const [deleteConfirmation, setDeleteConfirmation] = useState(null);

    const useWorkspaceApi = source === "workspace-api" && !!workspaceId;

    // User-folder listing mode (CFH listFolder)
    const {
        files: folderFiles,
        setFiles: setFolderFiles,
        loading: folderLoading,
        reloadFiles: reloadFolderFiles,
    } = useFileCollection({
        contextId: useWorkspaceApi ? null : contextId,
        storageTarget: useWorkspaceApi ? null : storageTarget,
        fallbackStorageTargets: useWorkspaceApi ? [] : fallbackStorageTargets,
        fileScope,
        workspaceId: useWorkspaceApi ? null : folderWorkspaceId,
    });

    // Workspace-artifact mode (Mongo/API-backed workspace files)
    const {
        data: workspaceFilesData,
        isLoading: workspaceFilesLoading,
        refetch: refetchWorkspaceFiles,
    } = useWorkspaceFiles(useWorkspaceApi ? workspaceId : null);

    const mapWorkspaceFiles = useCallback((rawFiles) => {
        if (!Array.isArray(rawFiles)) return [];
        return rawFiles.map((f) => ({
            _id: f._id,
            url: f.converted?.url || f.url,
            hash: f.converted?.hash || f.hash,
            blobPath: f.converted?.blobPath || f.blobPath || null,
            filename: f.filename,
            displayFilename: f.displayFilename || f.originalName || f.filename,
            originalName: f.originalName || f.filename,
            size: f.size,
            mimeType: f.mimeType,
            lastAccessed: f.updatedAt || f.createdAt || f.lastAccessed,
        }));
    }, []);

    const [workspaceApiFiles, setWorkspaceApiFiles] = useState([]);

    useEffect(() => {
        if (!useWorkspaceApi) return;
        setWorkspaceApiFiles(
            mapWorkspaceFiles(workspaceFilesData?.files || []),
        );
    }, [useWorkspaceApi, workspaceFilesData, mapWorkspaceFiles]);

    const files = useWorkspaceApi ? workspaceApiFiles : folderFiles;
    const setFiles = useWorkspaceApi ? setWorkspaceApiFiles : setFolderFiles;
    const loading = useWorkspaceApi ? workspaceFilesLoading : folderLoading;

    const reloadFiles = useCallback(async () => {
        if (useWorkspaceApi) {
            await refetchWorkspaceFiles();
            return;
        }
        await reloadFolderFiles();
    }, [useWorkspaceApi, refetchWorkspaceFiles, reloadFolderFiles]);

    // Build hash -> MongoDB _id lookup for workspace files
    const hashToId = useHashToIdLookup(workspaceId);

    // Use FileManager's createFileId for consistent ID generation
    const getFileId = useCallback((file) => createFileId(file), []);

    // Convert selectedFiles array to Set of IDs for controlled selection
    // Note: selectedFiles might be file objects or just IDs, so we need to handle both
    const selectedIds = useMemo(() => {
        const ids = new Set();
        selectedFiles.forEach((file) => {
            // If it's already an ID string, use it directly
            if (typeof file === "string") {
                ids.add(file);
            } else {
                // Otherwise, get the ID from the file object
                const id = getFileId(file);
                if (id) ids.add(id);
            }
        });

        return ids;
    }, [selectedFiles, getFileId]);

    // Handle selection change from FileManager
    const handleSelectionChange = useCallback(
        (newSelectedIds) => {
            // Convert Set of IDs back to array of file objects
            const newSelectedFiles = files.filter((file) => {
                const id = getFileId(file);
                return id && newSelectedIds.has(id);
            });
            onFilesSelected(newSelectedFiles);
        },
        [files, getFileId, onFilesSelected],
    );

    // Select all files
    const handleSelectAll = useCallback(() => {
        const allIds = new Set(
            files.map((file) => getFileId(file)).filter(Boolean),
        );
        handleSelectionChange(allIds);
    }, [files, getFileId, handleSelectionChange]);

    // Deselect all files
    const handleDeselectAll = useCallback(() => {
        handleSelectionChange(new Set());
    }, [handleSelectionChange]);

    // Handle delete click - show confirmation
    const handleDeleteClick = useCallback((file) => {
        setDeleteConfirmation({ file });
    }, []);

    // Confirm delete
    const confirmDelete = useCallback(async () => {
        if (!deleteConfirmation) return;

        const { file } = deleteConfirmation;
        const effectiveStorageTarget = file?._storageTarget || storageTarget;
        const isAppletUserFile = effectiveStorageTarget?.kind === "applet-user";
        const appletFilename =
            file?.filename || file?.originalName || file?.displayFilename;
        const fileHash = file?.hash;
        // Try to get MongoDB _id from file object or hash lookup
        const mongoFileId = file?._id || (fileHash && hashToId.get(fileHash));

        if (
            !fileHash &&
            !mongoFileId &&
            !(isAppletUserFile && folderWorkspaceId && appletFilename)
        ) {
            return;
        }

        const fileId = getFileId(file); // For tracking deletion state

        try {
            setDeletingFiles((prev) => new Set(prev).add(fileId));

            // If we have workspaceId and MongoDB _id, use workspace files API
            // This deletes from both MongoDB and cloud storage
            if (workspaceId && mongoFileId) {
                const response = await fetch(
                    `/api/workspaces/${workspaceId}/files/${mongoFileId}?force=true`,
                    { method: "DELETE" },
                );
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error(
                        "Failed to delete workspace file:",
                        errorData,
                    );
                    throw new Error(
                        errorData.error || "Failed to delete workspace file",
                    );
                }
            } else if (
                isAppletUserFile &&
                folderWorkspaceId &&
                appletFilename
            ) {
                await deleteAppletUserFileFromWorkspace({
                    workspaceId: folderWorkspaceId,
                    filename: appletFilename,
                });
            } else if (fileHash) {
                // We have a fileHash but either:
                // - No workspaceId (not a workspace file)
                // - Or workspaceId but couldn't find MongoDB _id (lookup not ready or file not in MongoDB)
                if (workspaceId && !mongoFileId) {
                    // Log a warning when we expected to find MongoDB _id but couldn't
                    console.warn(
                        `Could not find MongoDB _id for file with hash ${fileHash}. ` +
                            `File may not be fully removed from workspace. ` +
                            `Try refreshing and deleting again from Manage Workspace Files.`,
                    );
                }
                // Fall back to cloud-only delete
                await deleteFileFromCloud({
                    hash: fileHash,
                    blobPath: file?.blobPath,
                    contextId,
                    storageTarget: effectiveStorageTarget,
                });
            } else {
                // We have mongoFileId but no fileHash and no workspaceId
                // Can't delete without either workspace API or hash
                throw new Error(
                    t("Cannot delete file: missing required information."),
                );
            }

            // Remove from selection if selected
            const newSelectedFiles = selectedFiles.filter(
                (f) => getFileId(f) !== fileId,
            );
            onFilesSelected(newSelectedFiles);

            // Reload files
            reloadFiles();

            // Invalidate workspace files query so "Manage Workspace Files" updates
            if (workspaceId) {
                queryClient.invalidateQueries({
                    queryKey: ["workspaceFiles", workspaceId],
                });
            }
        } catch (err) {
            console.error("Error deleting file:", err);
            // Show user-facing error
            toast.error(
                t(
                    "Failed to delete file. Please try again or use Manage Workspace Files.",
                ),
            );
        } finally {
            setDeletingFiles((prev) => {
                const newSet = new Set(prev);
                newSet.delete(fileId);
                return newSet;
            });
            setDeleteConfirmation(null);
        }
    }, [
        deleteConfirmation,
        contextId,
        storageTarget,
        workspaceId,
        folderWorkspaceId,
        hashToId,
        queryClient,
        selectedFiles,
        onFilesSelected,
        reloadFiles,
        getFileId,
        t,
    ]);

    // Cancel delete
    const cancelDelete = useCallback(() => {
        setDeleteConfirmation(null);
    }, []);

    // Handle upload complete using shared hook
    const handleUploadComplete = useFileUploadHandler({
        contextId,
        contextKey,
        workspaceId,
        setFiles,
        reloadFiles,
        chatId: null, // Workspace files are global, not chat-scoped
        onUploadComplete: (newFile) => {
            if (newFile) {
                // Add to selection
                onFilesSelected([...selectedFiles, newFile]);
            }
            // Close upload dialog
            setShowUploadDialog(false);
        },
    });

    // Custom header content with action buttons
    const headerContent = (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedFiles.length} {t("files selected")}
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setShowUploadDialog(true)}
                        className="lb-outline-secondary flex items-center gap-1 px-2 py-1 text-sm"
                        title={t("Upload")}
                    >
                        <Upload className="w-3 h-3" />
                        <span className="hidden sm:inline">{t("Upload")}</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleSelectAll}
                        className="lb-outline-secondary flex items-center gap-1 px-2 py-1 text-sm"
                        disabled={files.length === 0}
                        title={t("Select All")}
                    >
                        <CheckSquare className="w-3 h-3" />
                        <span className="hidden sm:inline">
                            {t("Select All")}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={handleDeselectAll}
                        className="lb-outline-secondary flex items-center gap-1 px-2 py-1 text-sm"
                        disabled={selectedFiles.length === 0}
                        title={t("Deselect All")}
                    >
                        <Square className="w-3 h-3" />
                        <span className="hidden sm:inline">
                            {t("Deselect All")}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );

    // Row actions: delete button
    const rowActions = useCallback(
        (file) => {
            const fileId = getFileId(file);
            const isDeleting = fileId && deletingFiles.has(fileId);

            return (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(file);
                    }}
                    disabled={isDeleting}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t("Delete file")}
                >
                    {isDeleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Trash2 className="w-4 h-4" />
                    )}
                </button>
            );
        },
        [deletingFiles, handleDeleteClick, getFileId, t],
    );

    return (
        <>
            <FileManager
                files={files}
                isLoading={loading}
                onRefetch={reloadFiles}
                onUploadClick={() => setShowUploadDialog(true)}
                selectionMode="controlled"
                selectedIds={selectedIds}
                onSelectionChange={handleSelectionChange}
                rowActions={rowActions}
                headerContent={headerContent}
                showDateColumn={false}
                enableFilenameEdit={false}
                enableHoverPreview={true}
                enableBulkActions={false}
                enableFilter={false}
                enableSort={false}
                containerHeight="60vh"
                emptyTitle={t("No files found")}
                emptyDescription={t(
                    "No files found. Upload files to get started.",
                )}
            />

            {/* Upload Dialog */}
            <FileUploadDialog
                isOpen={showUploadDialog}
                onClose={() => setShowUploadDialog(false)}
                onFileUpload={handleUploadComplete}
                uploadEndpoint={
                    workspaceId ? `/api/workspaces/${workspaceId}/files` : null
                }
                workspaceId={workspaceId || folderWorkspaceId}
                contextId={contextId}
                storageTarget={storageTarget}
                title={t("Upload Files")}
                description={t("Upload files to add them to your collection.")}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={!!deleteConfirmation}
                onOpenChange={cancelDelete}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Delete File")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete '{{fileName}}'? This action cannot be undone.",
                                {
                                    fileName: deleteConfirmation?.file
                                        ? getFilename(deleteConfirmation.file)
                                        : "",
                                },
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={cancelDelete}>
                            {t("Cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
