"use client";
import { useQuery } from "@apollo/client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { QUERIES } from "@/src/graphql";

/**
 * Get inCollection as an array from a file object
 *
 * @param {Object} file - The file object
 * @returns {Array} - The inCollection as an array
 */
export function getInCollection(file) {
    if (!file?.inCollection) return [];
    return Array.isArray(file.inCollection)
        ? file.inCollection
        : [file.inCollection];
}

/**
 * Custom hook to load and manage a file collection from Cortex
 *
 * @param {Object} options
 * @param {string} options.contextId - The context ID for the file collection
 * @param {string} options.contextKey - The context key for the file collection
 * @param {boolean} options.requireInCollection - If true, only show files with inCollection data (default: true)
 * @returns {Object} - { files, allFiles, setFiles, loading, reloadFiles }
 */
export function useFileCollection({
    contextId,
    contextKey,
    requireInCollection = true,
}) {
    const [files, setFiles] = useState([]);
    const [allFiles, setAllFiles] = useState([]);

    // Build agentContext for query
    const agentContext = useMemo(
        () =>
            contextId
                ? [
                      {
                          contextId,
                          contextKey: contextKey || null,
                          default: true,
                      },
                  ]
                : undefined,
        [contextId, contextKey],
    );

    const {
        data: collectionData,
        loading,
        refetch,
    } = useQuery(QUERIES.SYS_READ_FILE_COLLECTION, {
        variables: { agentContext, useCache: false },
        skip: !contextId,
        fetchPolicy: "network-only",
    });

    // Parse collection data when it changes
    useEffect(() => {
        if (!collectionData?.sys_read_file_collection?.result) {
            setFiles([]);
            setAllFiles([]);
            return;
        }
        try {
            const parsed = JSON.parse(
                collectionData.sys_read_file_collection.result,
            );
            const parsedFiles = Array.isArray(parsed) ? parsed : [];

            // Optionally filter to only files with valid inCollection data
            const validFiles = requireInCollection
                ? parsedFiles.filter((file) => getInCollection(file).length > 0)
                : parsedFiles;

            setAllFiles(validFiles);
            setFiles(validFiles);
        } catch {
            setFiles([]);
            setAllFiles([]);
        }
    }, [collectionData, requireInCollection]);

    // Reload the file list
    const reloadFiles = useCallback(
        () => refetch({ agentContext, useCache: false }),
        [refetch, agentContext],
    );

    return {
        files,
        allFiles,
        setFiles,
        setAllFiles,
        loading,
        reloadFiles,
    };
}

/**
 * Create an optimistic file object from upload data
 *
 * @param {Object} fileData - The file data from upload
 * @param {Array} inCollection - The inCollection array for the file
 * @returns {Object} - Optimistic file object
 */
export function createOptimisticFile(fileData, inCollection = ["*"]) {
    const now = new Date().toISOString();
    const file = {
        url: fileData.url || fileData.gcs,
        gcs: fileData.gcs,
        hash: fileData.hash,
        displayFilename:
            fileData.displayFilename ||
            fileData.filename ||
            fileData.originalName,
        filename: fileData.filename,
        originalName: fileData.originalName,
        size: fileData.size,
        mimeType: fileData.mimeType,
        inCollection,
        addedDate: now,
        lastAccessed: now,
        permanent: fileData.permanent || false,
    };
    // Preserve _id from workspace files API response (needed for prompt attachments)
    if (fileData._id) {
        file._id = fileData._id;
    }
    return file;
}

/**
 * Add or update a file in the files array optimistically
 *
 * @param {Function} setFiles - State setter for files
 * @param {Object} newFile - The file to add or update
 */
export function addFileOptimistically(setFiles, newFile) {
    setFiles((prev) => {
        const existingIndex = prev.findIndex((f) => f.hash === newFile.hash);
        if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = newFile;
            return updated;
        }
        return [newFile, ...prev];
    });
}
