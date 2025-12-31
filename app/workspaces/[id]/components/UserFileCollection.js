"use client";
import { useApolloClient } from "@apollo/client";
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { updateFileMetadata } from "./userFileCollectionUtils";
import { getFilename as getFilenameUtil } from "@/src/components/common/FileManager";
import { purgeFiles } from "./chatFileUtils";
import {
    useFileCollection,
    getInCollection,
    createOptimisticFile,
    addFileOptimistically,
} from "./useFileCollection";
import FileManager from "@/src/components/common/FileManager";
import FileUploadDialog from "@/app/workspaces/components/FileUploadDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import {
    downloadFilesAsZip,
    checkDownloadLimits,
} from "@/src/utils/fileDownloadUtils";
import { toast } from "react-toastify";

/**
 * UserFileCollection - displays and manages files in a user's file collection
 *
 * Context ID handling:
 * - Chat context: pass user.contextId
 * - Workspace context: pass workspaceId
 * - User files in workspace/applet: pass compound contextId (workspaceId:userContextId)
 */
export default function UserFileCollection({
    contextId,
    contextKey,
    chatId = null,
    messages = [],
    updateChatHook = null,
}) {
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const [showAll, setShowAll] = useState(false);
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Load file collection using shared hook
    const {
        files: allFiles,
        setFiles: setAllFiles,
        loading,
        reloadFiles,
    } = useFileCollection({ contextId, contextKey });

    // Apply chatId filtering when not in "show all" mode
    const [files, setFiles] = useState([]);

    useEffect(() => {
        if (chatId && !showAll) {
            // Default view: only show files with global "*" or current chatId
            const filteredFiles = allFiles.filter((file) => {
                const collections = getInCollection(file);
                return (
                    collections.includes("*") || collections.includes(chatId)
                );
            });
            setFiles(filteredFiles);
        } else {
            // Show All view or no chatId: show all files with inCollection
            setFiles(allFiles);
        }
    }, [allFiles, chatId, showAll]);

    // Handle file upload complete
    // Flow: [1] CFH upload done → [2] optimistic update → [3] set metadata → [4] reload
    const handleUploadComplete = useCallback(
        async (uploadResult) => {
            // Normalize response (workspace upload vs media helper)
            const fileData = uploadResult?.file || uploadResult;
            const hash = fileData?.converted?.hash || fileData?.hash;

            if (!hash) {
                reloadFiles();
                return;
            }

            // Check if file already exists in the collection
            const existingFile = allFiles.find((f) => f.hash === hash);
            let inCollection;

            if (existingFile && existingFile.inCollection) {
                const existingCollections = getInCollection(existingFile);
                const isGlobal = existingCollections.includes("*");

                if (isGlobal) {
                    // File is global, keep it global (don't change)
                    inCollection = ["*"];
                } else if (chatId) {
                    // File exists with chat-scoped collections, add current chatId if not already present
                    if (existingCollections.includes(chatId)) {
                        // Already in this chat's collection, keep as is
                        inCollection = existingCollections;
                    } else {
                        // Add current chatId to existing collections
                        inCollection = [...existingCollections, chatId];
                    }
                } else {
                    // No chatId but file exists, keep existing collections
                    inCollection = existingCollections;
                }
            } else {
                // New file: use chatId if available, otherwise use "*" for global
                inCollection = chatId ? [chatId] : ["*"];
            }

            // [2] Optimistic update - add file to list immediately
            const optimisticFile = createOptimisticFile(
                {
                    hash,
                    url: fileData.converted?.url || fileData.url,
                    gcs:
                        fileData.converted?.gcs ||
                        fileData.gcsUrl ||
                        fileData.gcs,
                    displayFilename:
                        fileData.displayFilename ||
                        fileData.originalName ||
                        fileData.filename,
                    mimeType: fileData.mimeType,
                    size: fileData.size,
                    permanent: existingFile?.permanent || false,
                },
                inCollection,
            );

            addFileOptimistically(setAllFiles, optimisticFile);

            // [3] Set metadata (inCollection) → [4] reload
            try {
                await updateFileMetadata(
                    apolloClient,
                    contextId,
                    contextKey,
                    hash,
                    {
                        inCollection,
                    },
                );
            } catch (error) {
                console.error("Failed to set file metadata:", error);
            }
            reloadFiles();
        },
        [
            apolloClient,
            contextId,
            contextKey,
            chatId,
            allFiles,
            reloadFiles,
            setAllFiles,
        ],
    );

    // Handle file deletion
    // Follows inCollection deletion rules (unless showAll is active):
    // - Global (['*']): Fully deleted from Redis + cloud
    // - Chat-scoped (multiple refs): Remove chatId, keep file
    // - Chat-scoped (last ref): Fully deleted from Redis + cloud
    // When showAll is active: Always fully delete regardless of inCollection
    const handleDelete = useCallback(
        async (filesToRemove) => {
            const validFiles = filesToRemove
                .filter((f) => typeof f === "object")
                .map((f) => ({
                    ...f,
                    type: f.type || (f.image_url ? "image_url" : "file"),
                }))
                .filter((f) => f.type === "image_url" || f.type === "file");

            if (validFiles.length === 0) return;

            // When showAll is active, fully delete all files (global override)
            if (showAll) {
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
                    skipUserFileCollection: true,
                });
                reloadFiles();
                return;
            }

            // Process each file according to its inCollection status
            const filesToFullyDelete = [];
            const filesToUpdateMetadata = [];

            for (const file of validFiles) {
                const fileCollections = file.inCollection || [];
                const isGlobal = fileCollections.includes("*");
                const hasChatId = chatId && fileCollections.includes(chatId);

                if (isGlobal) {
                    // Global files: fully delete from Redis + cloud
                    filesToFullyDelete.push(file);
                } else if (hasChatId && chatId) {
                    // Chat-scoped file: check if this is the last reference
                    const chatIds = fileCollections.filter((c) => c !== "*");
                    if (chatIds.length > 1) {
                        // Multiple refs: remove chatId, keep file (no cloud delete)
                        const updatedCollections = chatIds.filter(
                            (c) => c !== chatId,
                        );
                        filesToUpdateMetadata.push({
                            file,
                            newInCollection: updatedCollections,
                        });
                    } else {
                        // Last ref: fully delete from Redis + cloud
                        filesToFullyDelete.push(file);
                    }
                } else {
                    // File not in this chat's collection, but user wants to delete it
                    // Treat as full delete (edge case)
                    filesToFullyDelete.push(file);
                }
            }

            // Update metadata for files that should have chatId removed (multiple refs case)
            // Also update chat messages to remove file references, but don't delete from cloud
            for (const { file, newInCollection } of filesToUpdateMetadata) {
                try {
                    // Update metadata to remove chatId from inCollection
                    await updateFileMetadata(
                        apolloClient,
                        contextId,
                        contextKey,
                        file.hash,
                        {
                            inCollection: newInCollection,
                        },
                    );

                    // Update chat messages to remove file references (but keep file in cloud)
                    // This ensures the file disappears from this chat but remains available to other chats
                    await purgeFiles({
                        fileObjs: [file],
                        apolloClient,
                        contextId,
                        contextKey,
                        chatId,
                        messages,
                        updateChatHook,
                        t,
                        getFilename: getFilenameUtil,
                        skipCloudDelete: true, // Keep file in cloud since other chats may reference it
                        skipUserFileCollection: true,
                    });
                } catch (error) {
                    console.error(
                        `Failed to update file metadata for ${file.hash}:`,
                        error,
                    );
                }
            }

            // Fully delete files that should be removed completely
            if (filesToFullyDelete.length > 0) {
                await purgeFiles({
                    fileObjs: filesToFullyDelete,
                    apolloClient,
                    contextId,
                    contextKey,
                    chatId,
                    messages,
                    updateChatHook,
                    t,
                    getFilename: getFilenameUtil,
                    skipCloudDelete: false,
                    skipUserFileCollection: true,
                });
            }

            // Reload files to reflect changes
            reloadFiles();
        },
        [
            apolloClient,
            contextId,
            contextKey,
            chatId,
            messages,
            updateChatHook,
            t,
            reloadFiles,
            showAll,
        ],
    );

    // Handle metadata update
    const handleUpdateMetadata = useCallback(
        async (file, metadata) => {
            if (!file?.hash) throw new Error("File hash not found");
            await updateFileMetadata(
                apolloClient,
                contextId,
                contextKey,
                file.hash,
                metadata,
            );
        },
        [apolloClient, contextId, contextKey],
    );

    // Handle permanent toggle
    const handleTogglePermanent = useCallback(async (file) => {
        if (!file?.hash) throw new Error("File hash not found");

        const response = await fetch("/api/files/set-retention", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                hash: file.hash,
                retention: file.permanent ? "temporary" : "permanent",
            }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || response.statusText);
        }
    }, []);

    // Handle bulk download
    const handleDownload = useCallback(
        async (selectedFiles) => {
            if (!selectedFiles || selectedFiles.length === 0) return;

            // Check download limits
            const limitCheck = checkDownloadLimits(selectedFiles, {
                maxFiles: 100,
                maxTotalSizeMB: 1000,
            });

            if (!limitCheck.allowed) {
                // Translate error messages
                const errorMsg = limitCheck.errorKey
                    ? t(limitCheck.errorKey)
                    : limitCheck.error;
                const detailsMsg = limitCheck.detailsKey
                    ? t(limitCheck.detailsKey, limitCheck.detailsParams || {})
                    : limitCheck.details;
                toast.error(`${errorMsg}: ${detailsMsg}`);
                return;
            }

            // Handle single file download vs multiple files
            if (selectedFiles.length === 1) {
                // Single file - download directly
                const file = selectedFiles[0];
                const url = file?.url || file?.gcs;
                if (url) {
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "";
                    link.style.display = "none";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } else {
                // Multiple files - create ZIP
                try {
                    await downloadFilesAsZip(selectedFiles, {
                        filenamePrefix: "chat_file_download",
                        onProgress: (isLoading) => {
                            setIsDownloading(isLoading);
                        },
                        onError: (error) => {
                            toast.error(
                                t("Failed to download files: {{error}}", {
                                    error: error.message,
                                }),
                            );
                        },
                    });
                } catch (error) {
                    // Error already handled in onError callback
                    console.error("Download error:", error);
                }
            }
        },
        [t],
    );

    // Handle adding files to the current chat
    const handleAddToChat = useCallback(
        async (selectedFiles) => {
            if (!chatId || !selectedFiles?.length) return;

            // Update each file's inCollection to include chatId
            await Promise.allSettled(
                selectedFiles.map(async (file) => {
                    if (!file?.hash) return;

                    // Get current inCollection
                    const currentCollection = Array.isArray(file.inCollection)
                        ? file.inCollection
                        : file.inCollection
                          ? [file.inCollection]
                          : [];

                    // Skip if already in this chat or is global
                    if (
                        currentCollection.includes(chatId) ||
                        currentCollection.includes("*")
                    ) {
                        return;
                    }

                    // Add chatId to inCollection
                    const newCollection = [...currentCollection, chatId];

                    await updateFileMetadata(
                        apolloClient,
                        contextId,
                        contextKey,
                        file.hash,
                        { inCollection: newCollection },
                    );
                }),
            );

            // Reload files to reflect changes
            reloadFiles();
        },
        [chatId, apolloClient, contextId, contextKey, reloadFiles],
    );

    // Determine title based on context and showAll state
    const fileManagerTitle = chatId
        ? showAll
            ? t("All your files")
            : t("Files in this conversation")
        : t("Files available to this conversation");

    return (
        <>
            <FileManager
                files={files}
                isLoading={loading}
                onRefetch={reloadFiles}
                onDelete={handleDelete}
                onDownload={handleDownload}
                isDownloading={isDownloading}
                onUploadClick={() => setShowUploadDialog(true)}
                onUpdateMetadata={handleUpdateMetadata}
                onTogglePermanent={handleTogglePermanent}
                title={fileManagerTitle}
                filterExtra={
                    chatId && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <Checkbox
                                id="show-all-files"
                                checked={showAll}
                                onCheckedChange={(checked) =>
                                    setShowAll(checked === true)
                                }
                            />
                            <Label
                                htmlFor="show-all-files"
                                className="text-sm font-normal cursor-pointer whitespace-nowrap"
                            >
                                {t("Show all")}
                            </Label>
                        </div>
                    )
                }
                emptyStateFilterExtra={
                    chatId && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <Checkbox
                                id="show-all-files-empty"
                                checked={showAll}
                                onCheckedChange={(checked) =>
                                    setShowAll(checked === true)
                                }
                            />
                            <Label
                                htmlFor="show-all-files-empty"
                                className="text-sm font-normal cursor-pointer whitespace-nowrap"
                            >
                                {t("Show files from all conversations")}
                            </Label>
                        </div>
                    )
                }
                emptyTitle={t("No files available")}
                emptyDescription={t(
                    "No files are available to this conversation yet.",
                )}
                noMatchTitle={t("No files match")}
                noMatchDescription={t(
                    "No files match your search. Try a different filter.",
                )}
                showPermanentColumn={true}
                showDateColumn={true}
                enableFilenameEdit={true}
                enableHoverPreview={true}
                enableBulkActions={true}
                enableFilter={true}
                enableSort={true}
                optimisticDelete={true}
                containerHeight="60vh"
                customActions={
                    chatId && showAll
                        ? {
                              custom: [
                                  {
                                      icon: Plus,
                                      label: t("Add to Chat"),
                                      ariaLabel: t("Add to Chat"),
                                      onClick: handleAddToChat,
                                      className: "lb-primary",
                                  },
                              ],
                          }
                        : null
                }
            />

            <FileUploadDialog
                isOpen={showUploadDialog}
                onClose={() => setShowUploadDialog(false)}
                onFileUpload={handleUploadComplete}
                contextId={contextId}
                title="Upload Files"
                description="Upload files to add them to this conversation."
            />
        </>
    );
}
