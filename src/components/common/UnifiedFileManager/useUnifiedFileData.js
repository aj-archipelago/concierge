"use client";

import { useCallback, useMemo, useContext, useState } from "react";
import {
    useQuery,
    useQueryClient,
    keepPreviousData,
} from "@tanstack/react-query";
import { listUserFolder } from "@/src/utils/fileUploadUtils";
import { AuthContext } from "@/src/App";

function safeDecode(value) {
    if (!value || typeof value !== "string") return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function extractBlobPathFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const segments = urlObj.pathname.split("/").filter(Boolean);
        const isAzurite =
            urlObj.hostname === "127.0.0.1" || urlObj.hostname === "localhost";
        const skip = isAzurite ? 2 : 1;
        if (segments.length <= skip) return null;
        return segments.slice(skip).map(safeDecode).join("/");
    } catch {
        return null;
    }
}

function extractHashFromBlobPath(blobPath) {
    const filename = blobPath?.split("/").pop();
    if (!filename) return null;
    const decoded = safeDecode(filename);
    const idx = decoded.indexOf("_");
    if (idx <= 0) return null;
    const prefix = decoded.substring(0, idx);
    return /^[0-9a-f]+$/i.test(prefix) ? prefix : null;
}

function getStableUrlKey(url) {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
        return url;
    }
}

function getAttachmentUrl(fileObj) {
    return (
        fileObj?.converted?.url ||
        fileObj?.url ||
        fileObj?.image_url?.url ||
        fileObj?.file ||
        null
    );
}

function getAttachmentFilename(fileObj, blobPath, url) {
    const explicitName =
        fileObj?.displayFilename ||
        fileObj?.originalFilename ||
        fileObj?.originalName ||
        fileObj?.filename ||
        null;

    if (explicitName) return safeDecode(explicitName);
    if (blobPath) return safeDecode(blobPath.split("/").pop());

    try {
        const urlObj = new URL(url);
        const lastSegment = urlObj.pathname.split("/").filter(Boolean).pop();
        if (lastSegment) return safeDecode(lastSegment);
    } catch {
        // ignore
    }

    return "file";
}

function readMessagePayloadItems(message) {
    const payload = message?.payload || message?.content || [];
    if (Array.isArray(payload)) return payload;
    return payload ? [payload] : [];
}

function parsePayloadItem(item) {
    if (!item) return null;
    if (typeof item === "object") return item;
    if (typeof item !== "string") return null;
    try {
        return JSON.parse(item);
    } catch {
        return null;
    }
}

export function extractLegacyFilesFromMessages(messages = [], chatId = null) {
    if (!Array.isArray(messages)) return [];

    const files = [];
    for (const message of messages) {
        readMessagePayloadItems(message).forEach(
            (payloadItem, payloadIndex) => {
                const fileObj = parsePayloadItem(payloadItem);
                if (
                    !fileObj ||
                    fileObj.hideFromClient ||
                    (fileObj.type !== "image_url" && fileObj.type !== "file")
                ) {
                    return;
                }

                const url = getAttachmentUrl(fileObj);
                const blobPath =
                    fileObj.converted?.blobPath ||
                    fileObj.blobPath ||
                    extractBlobPathFromUrl(url);
                const filename = getAttachmentFilename(fileObj, blobPath, url);
                const hash =
                    fileObj.converted?.hash ||
                    fileObj.hash ||
                    extractHashFromBlobPath(blobPath);

                if (!url && !blobPath && !hash) {
                    return;
                }

                files.push({
                    ...fileObj,
                    type: fileObj.type,
                    url,
                    image_url: fileObj.image_url,
                    hash,
                    blobPath,
                    name:
                        blobPath ||
                        (chatId
                            ? `chats/${chatId}/${filename}`
                            : `legacy/${filename}`),
                    filename,
                    displayFilename: fileObj.displayFilename || filename,
                    originalName: fileObj.originalName || filename,
                    mimeType:
                        fileObj.converted?.mimeType ||
                        fileObj.mimeType ||
                        fileObj.contentType,
                    lastAccessed:
                        message?.updatedAt ||
                        message?.createdAt ||
                        message?.timestamp ||
                        null,
                    _legacyMessageFile: true,
                    _messageId: message?.id || message?._id || null,
                    _payloadIndex: payloadIndex,
                });
            },
        );
    }

    return files;
}

function getFileIdentityKeys(file) {
    return [
        file?.blobPath || file?.name || null,
        file?.hash || null,
        getStableUrlKey(file?.url || file?.image_url?.url || file?.file),
    ].filter(Boolean);
}

function mergeFileSources(
    listedFiles,
    legacyFiles,
    augmentedFiles,
    hiddenKeys,
) {
    const merged = [];
    const seen = new Set();
    const mergedByKey = new Map();

    const remember = (file) => {
        const keys = getFileIdentityKeys(file);
        keys.forEach((key) => mergedByKey.set(key, file));
    };

    const append = (file) => {
        const keys = getFileIdentityKeys(file);
        if (keys.some((key) => hiddenKeys?.has(key) || seen.has(key))) {
            return;
        }
        keys.forEach((key) => seen.add(key));
        merged.push(file);
        remember(file);
    };

    listedFiles.forEach(append);
    legacyFiles.forEach(append);

    augmentedFiles.forEach((file) => {
        const keys = getFileIdentityKeys(file);
        if (keys.some((key) => hiddenKeys?.has(key))) {
            return;
        }
        const existing = keys.map((key) => mergedByKey.get(key)).find(Boolean);
        if (existing) {
            Object.assign(existing, {
                ...file,
                name: existing.name || file.name,
                blobPath: existing.blobPath || file.blobPath,
                url: existing.url || file.url,
                filename: file.filename || existing.filename,
                displayFilename:
                    file.displayFilename || existing.displayFilename,
                mimeType: file.mimeType || existing.mimeType,
                type: file.type || existing.type,
                size: existing.size || file.size,
                lastModified: existing.lastModified || file.lastModified,
                lastAccessed: existing.lastAccessed || file.lastAccessed,
            });
            remember(existing);
            return;
        }
        append(file);
    });

    return merged;
}

/**
 * Build a folder tree from a flat file list.
 * Files have `name` like "users/{userId}/global/{hash}_{filename}"
 * We strip the user prefix and group by remaining path segments.
 *
 * Returns a tree where each node has { name, children: {}, files: [], path }
 */
function ensureFolderPath(tree, path) {
    if (!path) return tree;

    const parts = path.split("/").filter(Boolean);
    let current = tree;
    let currentPath = "";

    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.children[part]) {
            current.children[part] = {
                name: part,
                children: {},
                files: [],
                path: currentPath,
            };
        }
        current = current.children[part];
    }

    return current;
}

export function buildFolderTree(files, userPrefix, currentChatId = null) {
    const tree = { name: "/", children: {}, files: [], path: "" };

    for (const file of files) {
        let relativePath = file.name;
        if (relativePath.startsWith(userPrefix)) {
            relativePath = relativePath.slice(userPrefix.length);
        }
        if (relativePath.startsWith("/")) {
            relativePath = relativePath.slice(1);
        }

        const parts = relativePath.split("/");
        const fileName = parts.pop();

        let current = tree;
        let currentPath = "";
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!current.children[part]) {
                current.children[part] = {
                    name: part,
                    children: {},
                    files: [],
                    path: currentPath,
                };
            }
            current = current.children[part];
        }

        current.files.push({
            ...file,
            displayName: safeDecode(file.filename || fileName),
        });
    }

    if (currentChatId) {
        ensureFolderPath(tree, `chats/${currentChatId}`);
    }

    return tree;
}

/**
 * Count total files in a tree node recursively.
 */
export function countFiles(node) {
    let count = node.files.length;
    for (const child of Object.values(node.children)) {
        count += countFiles(child);
    }
    return count;
}

/**
 * Collect all files from a node recursively.
 */
export function collectAllFiles(node) {
    let result = [...node.files];
    for (const child of Object.values(node.children)) {
        result = result.concat(collectAllFiles(child));
    }
    return result;
}

/**
 * Find a node in the tree by its path string (e.g. "chats/abc123").
 */
function findNodeByPath(tree, path) {
    if (!path) return tree;
    const parts = path.split("/");
    let current = tree;
    for (const part of parts) {
        if (!current.children[part]) return null;
        current = current.children[part];
    }
    return current;
}

const EMPTY_FOLDER = { folderPath: "", files: [] };
const FILE_BROWSER_REFETCH_INTERVAL_MS = 30_000;

function joinFolderAndFilename(folderPath, filename) {
    const folder = String(folderPath || "").replace(/^\/+|\/+$/g, "");
    return folder ? `${folder}/${filename}` : filename;
}

function getFilenameFromPath(path) {
    return safeDecode(
        String(path || "")
            .split("/")
            .filter(Boolean)
            .pop(),
    );
}

export function userFolderKey(userId) {
    return ["userFolder", userId];
}

function storageTargetKey(storageTarget) {
    if (!storageTarget) return "all";
    return JSON.stringify(storageTarget);
}

/**
 * Hook: loads all files from cloud storage, builds a folder tree, and provides
 * path-based file retrieval.
 *
 * Backed by React Query with `staleTime: Infinity` so the file list is fetched
 * once per user and reused across mounts — opening the file browser feels
 * instant after the first load. Mutations write straight to the query cache
 * so the UI stays in sync without refetching the full list.
 *
 * @param {Object} options
 * @param {string} options.contextId - User context ID for listing
 * @param {string|null} options.chatId - Current chat ID for synthetic empty chat folders
 * @param {Function|null} options.filterFile - Optional predicate for hiding implementation files
 * @returns {Object} { tree, allFiles, loading, error, reloadFiles, userPrefix, folderPath }
 */
export function useUnifiedFileData({
    contextId,
    chatId = null,
    legacyMessages = [],
    augmentedFiles = [],
    storageTarget = null,
    filterFile = null,
}) {
    const { user } = useContext(AuthContext);
    const userId = user?.contextId || contextId;
    const queryClient = useQueryClient();
    const queryKey = useMemo(
        () => [...userFolderKey(userId), storageTargetKey(storageTarget)],
        [userId, storageTarget],
    );
    const [hiddenLegacyKeys, setHiddenLegacyKeys] = useState(() => new Set());

    const { data, isLoading, error, refetch } = useQuery({
        queryKey,
        enabled: Boolean(userId),
        staleTime: FILE_BROWSER_REFETCH_INTERVAL_MS,
        gcTime: Infinity,
        refetchInterval: FILE_BROWSER_REFETCH_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        placeholderData: keepPreviousData,
        queryFn: async () => {
            const result = await listUserFolder(userId, { storageTarget });
            return {
                folderPath: result.folderPath || "",
                files: (result.files || []).map((f) => ({
                    ...f,
                    blobPath: f.blobPath || f.name || null,
                })),
            };
        },
    });

    const { folderPath, files } = data || EMPTY_FOLDER;

    const userPrefix = useMemo(() => {
        if (folderPath) {
            return folderPath.endsWith("/") ? folderPath : `${folderPath}/`;
        }
        return `users/${userId}/`;
    }, [folderPath, userId]);

    const legacyFiles = useMemo(
        () => extractLegacyFilesFromMessages(legacyMessages, chatId),
        [legacyMessages, chatId],
    );

    const visibleFiles = useMemo(() => {
        const mergedFiles = mergeFileSources(
            files,
            legacyFiles,
            augmentedFiles,
            hiddenLegacyKeys,
        );

        return typeof filterFile === "function"
            ? mergedFiles.filter(filterFile)
            : mergedFiles;
    }, [files, legacyFiles, augmentedFiles, hiddenLegacyKeys, filterFile]);

    const tree = useMemo(
        () => buildFolderTree(visibleFiles, userPrefix, chatId),
        [visibleFiles, userPrefix, chatId],
    );

    const getFilesForPath = useCallback(
        (path) => {
            if (!path && path !== "") return visibleFiles;
            const node = findNodeByPath(tree, path);
            if (!node) return [];
            return node.files;
        },
        [tree, visibleFiles],
    );

    const getFilesRecursive = useCallback(
        (path) => {
            if (!path && path !== "") return visibleFiles;
            if (path === "") return collectAllFiles(tree);
            const node = findNodeByPath(tree, path);
            if (!node) return [];
            return collectAllFiles(node);
        },
        [tree, visibleFiles],
    );

    const updateFiles = useCallback(
        (mapper) => {
            queryClient.setQueryData(queryKey, (old) => {
                const current = old || EMPTY_FOLDER;
                return { ...current, files: mapper(current.files) };
            });
        },
        [queryClient, queryKey],
    );

    const removeFileOptimistically = useCallback(
        (file) => {
            const keys = getFileIdentityKeys(file);
            if (keys.length > 0) {
                setHiddenLegacyKeys((prev) => {
                    const next = new Set(prev);
                    keys.forEach((key) => next.add(key));
                    return next;
                });
            }
            updateFiles((prev) => prev.filter((f) => f.name !== file.name));
        },
        [updateFiles],
    );

    const renameFileOptimistically = useCallback(
        (file, newName) =>
            updateFiles((prev) =>
                prev.map((f) =>
                    f.name === file.name ? { ...f, filename: newName } : f,
                ),
            ),
        [updateFiles],
    );

    const moveFilesOptimistically = useCallback(
        (filesToMove, targetFolder) => {
            const filesArray = Array.isArray(filesToMove)
                ? filesToMove
                : [filesToMove];
            const targetByName = new Map();

            for (const file of filesArray) {
                const currentName = file?.name || file?.blobPath;
                if (!currentName) continue;
                const filename = getFilenameFromPath(
                    file?.filename || file?.displayFilename || currentName,
                );
                if (!filename) continue;
                const relativeTarget = joinFolderAndFilename(
                    targetFolder,
                    filename,
                );
                const nextName = userPrefix
                    ? `${userPrefix}${relativeTarget}`
                    : relativeTarget;
                targetByName.set(currentName, {
                    nextName,
                    filename,
                });
            }

            if (targetByName.size === 0) return;

            updateFiles((prev) =>
                prev.map((file) => {
                    const target = targetByName.get(file.name);
                    if (!target) return file;
                    return {
                        ...file,
                        name: target.nextName,
                        blobPath: target.nextName,
                        filename: target.filename,
                        displayFilename:
                            file.displayFilename || target.filename,
                    };
                }),
            );
        },
        [updateFiles, userPrefix],
    );

    const getSnapshot = useCallback(
        () => ({
            data: queryClient.getQueryData(queryKey),
            hiddenLegacyKeys: new Set(hiddenLegacyKeys),
        }),
        [queryClient, queryKey, hiddenLegacyKeys],
    );

    const revertToSnapshot = useCallback(
        (snapshot) => {
            queryClient.setQueryData(queryKey, snapshot?.data);
            setHiddenLegacyKeys(snapshot?.hiddenLegacyKeys || new Set());
        },
        [queryClient, queryKey],
    );

    return {
        tree,
        allFiles: visibleFiles,
        loading: isLoading,
        error: error?.message || null,
        reloadFiles: refetch,
        userPrefix,
        folderPath,
        getFilesForPath,
        getFilesRecursive,
        removeFileOptimistically,
        renameFileOptimistically,
        moveFilesOptimistically,
        getSnapshot,
        revertToSnapshot,
        totalFileCount: visibleFiles.length,
    };
}
