"use client";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    createOptimisticFile,
    addFileOptimistically,
} from "./useFileCollection";

const userFolderKey = (contextId) => ["userFolder", contextId];

/**
 * Custom hook to handle file upload completion with optimistic updates and metadata setting
 *
 * @param {Object} options
 * @param {string} options.contextId - The context ID for the file collection
 * @param {string} options.contextKey - The context key for the file collection
 * @param {string|null} options.workspaceId - Optional workspace ID for cache invalidation
 * @param {Function} options.setFiles - State setter for files array
 * @param {Function} options.reloadFiles - Function to reload files from server
 * @param {string|null} options.chatId - Optional chat ID for chat-scoped collections
 * @param {Function} options.onUploadComplete - Optional callback after upload (e.g., for picker-specific actions)
 * @returns {Function} handleUploadComplete callback
 */
export function useFileUploadHandler({
    contextId,
    contextKey,
    workspaceId = null,
    setFiles,
    reloadFiles,
    chatId = null,
    onUploadComplete = null,
}) {
    const queryClient = useQueryClient();

    const refreshFileBrowsers = useCallback(async () => {
        if (typeof reloadFiles === "function") {
            await Promise.resolve(reloadFiles());
        }
        if (contextId) {
            await queryClient.invalidateQueries({
                queryKey: userFolderKey(contextId),
            });
        }
    }, [contextId, queryClient, reloadFiles]);

    const handleUploadComplete = useCallback(
        async (uploadResult) => {
            // Normalize response (workspace upload vs media helper)
            const fileData = uploadResult?.file || uploadResult;
            const hash = fileData?.converted?.hash || fileData?.hash;

            if (!hash) {
                await refreshFileBrowsers();
                if (onUploadComplete) {
                    onUploadComplete(null);
                }
                return;
            }

            // Create optimistic file
            // Include _id from workspace files API response (needed for prompt attachments)
            const optimisticFile = createOptimisticFile({
                _id: fileData._id,
                hash,
                url: fileData.converted?.url || fileData.url,
                displayFilename:
                    fileData.displayFilename ||
                    fileData.originalName ||
                    fileData.filename,
                mimeType: fileData.mimeType,
                size: fileData.size,
            });

            // Optimistically add to files list
            addFileOptimistically(setFiles, optimisticFile);

            // Reload to get server state
            await refreshFileBrowsers();

            // Invalidate workspace files query so "Manage Workspace Files" updates
            if (workspaceId) {
                queryClient.invalidateQueries({
                    queryKey: ["workspaceFiles", workspaceId],
                });
            }

            // Call optional callback for component-specific actions
            if (onUploadComplete) {
                onUploadComplete(optimisticFile);
            }
        },
        [
            workspaceId,
            queryClient,
            setFiles,
            refreshFileBrowsers,
            onUploadComplete,
        ],
    );

    return handleUploadComplete;
}
