"use client";
import { useCallback } from "react";
import { useApolloClient } from "@apollo/client";
import { useQueryClient } from "@tanstack/react-query";
import {
    createOptimisticFile,
    addFileOptimistically,
    getInCollection,
} from "./useFileCollection";
import { updateFileMetadata } from "./userFileCollectionUtils";

/**
 * Custom hook to handle file upload completion with optimistic updates and metadata setting
 *
 * @param {Object} options
 * @param {string} options.contextId - The context ID for the file collection
 * @param {string} options.contextKey - The context key for the file collection
 * @param {string|null} options.workspaceId - Optional workspace ID for cache invalidation
 * @param {Array} options.files - Current files array to search for existing files
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
    files,
    setFiles,
    reloadFiles,
    chatId = null,
    onUploadComplete = null,
}) {
    const apolloClient = useApolloClient();
    const queryClient = useQueryClient();

    const handleUploadComplete = useCallback(
        async (uploadResult) => {
            // Normalize response (workspace upload vs media helper)
            const fileData = uploadResult?.file || uploadResult;
            const hash = fileData?.converted?.hash || fileData?.hash;

            if (!hash) {
                reloadFiles();
                if (onUploadComplete) {
                    onUploadComplete(null);
                }
                return;
            }

            // Check if file already exists in the collection
            const existingFile = files.find((f) => f.hash === hash);
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

            // Create optimistic file
            // Include _id from workspace files API response (needed for prompt attachments)
            const optimisticFile = createOptimisticFile(
                {
                    _id: fileData._id,
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
                    permanent:
                        existingFile?.permanent || fileData.permanent || false,
                },
                inCollection,
            );

            // Optimistically add to files list
            addFileOptimistically(setFiles, optimisticFile);

            // Set metadata (inCollection) in Cortex
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

            // Reload to get server state
            reloadFiles();

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
            apolloClient,
            contextId,
            contextKey,
            workspaceId,
            queryClient,
            chatId,
            files,
            setFiles,
            reloadFiles,
            onUploadComplete,
        ],
    );

    return handleUploadComplete;
}
