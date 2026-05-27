"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { listUserFolder } from "@/src/utils/fileUploadUtils";
import { buildMediaHelperListParams } from "@/src/utils/storageTargets";

function getStorageTargetKey(storageTarget) {
    if (!storageTarget) {
        return "default";
    }

    return JSON.stringify({
        kind: storageTarget.kind || null,
        userContextId: storageTarget.userContextId || null,
        workspaceId: storageTarget.workspaceId || null,
        appletId: storageTarget.appletId || null,
        chatId: storageTarget.chatId || null,
    });
}

function dedupeFiles(files) {
    const seen = new Set();

    return files.filter((file) => {
        const key = file.hash || file.blobPath || file.url || null;
        if (!key) {
            return true;
        }
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/**
 * Custom hook to load and manage a user's files via cloud storage listing.
 *
 * Replaces the old GraphQL-based useFileCollection. Files are listed directly
 * from cloud storage (via media-helper listFolder), with the response cached
 * server-side for 5 seconds.
 *
 * Optimizations:
 * - Debounces param changes (300ms) so rapid toggles batch into one request
 * - Deduplicates in-flight requests with the same params
 * - reloadFiles is a stable ref-based callback (never changes identity)
 *
 * @param {Object} options
 * @param {string} options.contextId - The user's contextId (used as userId for listing)
 * @param {Array<Object>} options.fallbackStorageTargets - Additional storage targets to merge into the list
 * @param {string} options.fileScope - 'all' | 'chat' | 'global' (default: 'all')
 * @param {string|null} options.chatId - Chat ID (required when fileScope='chat')
 * @param {string|null} options.workspaceId - Workspace ID (required for fileScope='applet'/'workspace-artifact')
 * @returns {Object} - { files, setFiles, loading, reloadFiles }
 */
export function useFileCollection({
    contextId,
    storageTarget = null,
    fallbackStorageTargets = [],
    fileScope = "all",
    chatId = null,
    workspaceId = null,
}) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const mountedRef = useRef(true);

    // Keep current params in a ref so the stable reloadFiles can read them
    const paramsRef = useRef({
        contextId,
        storageTarget,
        fallbackStorageTargets,
        fileScope,
        chatId,
        workspaceId,
    });
    paramsRef.current = {
        contextId,
        storageTarget,
        fallbackStorageTargets,
        fileScope,
        chatId,
        workspaceId,
    };

    // Track in-flight request to deduplicate
    const inFlightRef = useRef(null); // string key of in-flight request params
    const storageTargetKey = getStorageTargetKey(storageTarget);
    const fallbackStorageTargetKeys = JSON.stringify(
        (fallbackStorageTargets || []).map(getStorageTargetKey),
    );

    // Map cloud listing fields to the format consumers expect
    const mapFiles = useCallback((rawFiles, sourceStorageTarget = null) => {
        if (!Array.isArray(rawFiles)) return [];
        return rawFiles.map((f) => ({
            url: f.url,
            hash: f.hash,
            blobPath: f.blobPath || f.name || null,
            filename: f.filename,
            displayFilename: f.displayFilename || f.filename,
            originalName: f.filename,
            size: f.size,
            mimeType: f.contentType || f.mimeType,
            lastAccessed: f.lastModified || f.lastAccessed,
            _storageTarget: sourceStorageTarget,
            ...(f._id && { _id: f._id }),
        }));
    }, []);

    // Core fetch function — reads from paramsRef, deduplicates in-flight requests
    const doFetch = useCallback(
        async ({ force = false } = {}) => {
            const {
                contextId: currentContextId,
                storageTarget: currentStorageTarget,
                fallbackStorageTargets: currentFallbackStorageTargets,
                fileScope: currentFileScope,
                chatId: currentChatId,
                workspaceId: currentWorkspaceId,
            } = paramsRef.current;
            const listStorageTargets = [
                currentStorageTarget,
                ...(Array.isArray(currentFallbackStorageTargets)
                    ? currentFallbackStorageTargets
                    : []),
            ].filter(
                (target, index, targets) =>
                    targets.findIndex(
                        (candidate) =>
                            getStorageTargetKey(candidate) ===
                            getStorageTargetKey(target),
                    ) === index,
            );
            const primaryListTarget =
                listStorageTargets.length > 0 ? listStorageTargets[0] : null;
            const listParams = buildMediaHelperListParams({
                storageTarget: primaryListTarget,
                userContextId: currentContextId,
                contextId: currentContextId,
                fileScope: currentFileScope,
                chatId: currentChatId,
                workspaceId: currentWorkspaceId,
            });
            if (!listParams.userId) return;

            const requestKey = JSON.stringify({
                ...listParams,
                storageTargets: listStorageTargets.map(getStorageTargetKey),
            });

            // Skip if the same request is already in flight (unless forced)
            if (!force && inFlightRef.current === requestKey) {
                return;
            }

            inFlightRef.current = requestKey;
            setLoading(true);
            try {
                const results = await Promise.all(
                    (listStorageTargets.length > 0
                        ? listStorageTargets
                        : [null]
                    ).map(async (target) => {
                        const result = await listUserFolder(currentContextId, {
                            storageTarget: target,
                            fileScope: currentFileScope,
                            chatId: currentChatId,
                            workspaceId: currentWorkspaceId,
                        });

                        return mapFiles(result.files, target);
                    }),
                );

                if (mountedRef.current) {
                    setFiles(dedupeFiles(results.flat()));
                }
            } catch (error) {
                console.error(
                    "[useFileCollection] Error listing files:",
                    error,
                );
                if (mountedRef.current) {
                    setFiles([]);
                }
            } finally {
                // Only clear in-flight if this request's key still matches
                // (a newer request may have already started)
                if (inFlightRef.current === requestKey) {
                    inFlightRef.current = null;
                }
                if (mountedRef.current) {
                    setLoading(false);
                }
            }
        },
        [mapFiles],
    );

    // Debounced fetch on mount and when params change
    useEffect(() => {
        mountedRef.current = true;
        const timer = setTimeout(() => {
            doFetch();
        }, 300);
        return () => {
            clearTimeout(timer);
            mountedRef.current = false;
        };
    }, [
        contextId,
        storageTargetKey,
        fallbackStorageTargetKeys,
        fileScope,
        chatId,
        workspaceId,
        doFetch,
    ]);

    // Stable reload function — identity never changes, always reads latest params
    // Uses force=true to bypass in-flight deduplication (explicit user action)
    const reloadFiles = useCallback(async () => {
        await doFetch({ force: true });
    }, [doFetch]);

    return {
        files,
        allFiles: files,
        setFiles,
        setAllFiles: setFiles,
        loading,
        reloadFiles,
    };
}

/**
 * Create an optimistic file object from upload data
 *
 * @param {Object} fileData - The file data from upload
 * @returns {Object} - Optimistic file object
 */
export function createOptimisticFile(fileData) {
    const now = new Date().toISOString();
    const file = {
        url: fileData.url,
        hash: fileData.hash,
        blobPath: fileData.blobPath || null,
        displayFilename:
            fileData.displayFilename ||
            fileData.filename ||
            fileData.originalName,
        filename: fileData.filename,
        originalName: fileData.originalName,
        size: fileData.size,
        mimeType: fileData.mimeType,
        lastAccessed: now,
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
        const existingIndex = prev.findIndex(
            (f) =>
                (newFile.blobPath && f.blobPath === newFile.blobPath) ||
                (newFile.hash && f.hash === newFile.hash),
        );
        if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = newFile;
            return updated;
        }
        return [newFile, ...prev];
    });
}
