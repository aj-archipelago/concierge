"use client";
import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useApolloClient } from "@apollo/client";
import { getFilename as getFilenameUtil } from "@/src/components/common/FileManager";
import { purgeFiles } from "./chatFileUtils";
import { useFileUploadHandler } from "./useFileUploadHandler";
import UnifiedFileManager from "@/src/components/common/UnifiedFileManager";
import FileUploadDialog from "../../components/FileUploadDialog";
import {
    downloadFilesAsZip,
    checkDownloadLimits,
} from "@/src/utils/fileDownloadUtils";
import {
    createChatStorageTarget,
    createUserGlobalStorageTarget,
} from "@/src/utils/storageTargets";
import { toast } from "react-toastify";
import { useGetActiveChats } from "../../../queries/chats";

function normalizeFolderPath(value) {
    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
}

function getMoveFilename(file) {
    const source =
        file?.filename ||
        file?.displayFilename ||
        file?.displayName ||
        file?.blobPath ||
        file?.name ||
        "";
    return String(source).split("/").filter(Boolean).pop() || "";
}

function getMovedFileBlobPath({ targetFolder, filename }) {
    const normalizedTarget = normalizeFolderPath(targetFolder);
    return normalizedTarget ? `${normalizedTarget}/${filename}` : filename;
}

/**
 * UserFileCollection - displays and manages files in a user's file collection
 * using the unified Finder-style file manager.
 *
 * Context ID handling:
 * - Chat context: pass user.contextId
 * - Workspace context: pass workspaceId
 */
export default function UserFileCollection({
    contextId,
    contextKey,
    chatId = null,
    messages = [],
    updateChatHook = null,
    containerHeight = "60vh",
}) {
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const storageTarget = useMemo(() => {
        if (!contextId) return null;
        return chatId
            ? createChatStorageTarget(contextId, chatId)
            : createUserGlobalStorageTarget(contextId);
    }, [contextId, chatId]);

    // Build chatId → title map for the folder sidebar
    const { data: activeChats } = useGetActiveChats();
    const chatTitleMap = useMemo(() => {
        const map = {};
        if (activeChats) {
            for (const chat of activeChats) {
                if (chat._id && chat.title) {
                    map[chat._id] = chat.title;
                }
            }
        }
        return map;
    }, [activeChats]);

    // Upload handler — uses a no-op setFiles since UnifiedFileManager
    // manages its own file state via useUnifiedFileData
    const handleUploadComplete = useFileUploadHandler({
        contextId,
        contextKey,
        setFiles: () => {},
        reloadFiles: () => {},
        chatId,
    });

    // Handle file deletion - simple delete from Redis + cloud
    const handleDelete = useCallback(
        async (filesToRemove) => {
            const arr = Array.isArray(filesToRemove)
                ? filesToRemove
                : [filesToRemove];
            const validFiles = arr
                .filter((f) => typeof f === "object")
                .map((f) => ({
                    ...f,
                    type: f.type || (f.image_url ? "image_url" : "file"),
                }))
                .filter((f) => f.type === "image_url" || f.type === "file");

            if (validFiles.length === 0) return;

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
        },
        [
            apolloClient,
            contextId,
            contextKey,
            chatId,
            messages,
            updateChatHook,
            t,
        ],
    );

    // Handle bulk download
    const handleDownload = useCallback(
        async (selectedFiles) => {
            if (!selectedFiles || selectedFiles.length === 0) return;

            const limitCheck = checkDownloadLimits(selectedFiles, {
                maxFiles: 100,
                maxTotalSizeMB: 1000,
            });

            if (!limitCheck.allowed) {
                const errorMsg = limitCheck.errorKey
                    ? t(limitCheck.errorKey)
                    : limitCheck.error;
                const detailsMsg = limitCheck.detailsKey
                    ? t(limitCheck.detailsKey, limitCheck.detailsParams || {})
                    : limitCheck.details;
                toast.error(`${errorMsg}: ${detailsMsg}`);
                return;
            }

            if (selectedFiles.length === 1) {
                const file = selectedFiles[0];
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
            } else {
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
                    console.error("Download error:", error);
                }
            }
        },
        [t],
    );

    // Handle rename via /api/files/rename endpoint
    const handleUpdateMetadata = useCallback(
        async (file, metadata) => {
            const blobPath = file?.blobPath || file?.name;
            if (!file?.hash && !blobPath)
                throw new Error(t("File identifier not found"));
            if (metadata.displayFilename) {
                const response = await fetch("/api/files/rename", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        hash: file.hash || undefined,
                        blobPath: blobPath || undefined,
                        newFilename: metadata.displayFilename,
                        contextId,
                        chatId: chatId || undefined,
                        fileScope: chatId ? "chat" : "global",
                    }),
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || response.statusText);
                }
            }
        },
        [contextId, chatId, t],
    );

    const handleMove = useCallback(
        async (files, targetFolder) => {
            const normalizedTarget = normalizeFolderPath(targetFolder);

            for (const file of files) {
                const blobPath = file?.blobPath || file?.name;
                const hash = file?.hash;
                const filename = getMoveFilename(file);

                if (!filename || !blobPath) {
                    throw new Error(t("File identifier not found"));
                }

                const targetBlobPath = getMovedFileBlobPath({
                    targetFolder: normalizedTarget,
                    filename,
                });
                const response = await fetch("/api/files/rename", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        hash: hash || undefined,
                        blobPath: blobPath || undefined,
                        newFilename: normalizedTarget
                            ? `${normalizedTarget}/${filename}`
                            : filename,
                        targetBlobPath,
                        contextId,
                    }),
                });

                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || response.statusText);
                }
            }
        },
        [contextId, t],
    );

    // Wrap upload complete to also reload the unified file manager
    const handleUploadCompleteAndRefresh = useCallback(
        (...args) => {
            handleUploadComplete(...args);
        },
        [handleUploadComplete],
    );

    return (
        <>
            <UnifiedFileManager
                contextId={contextId}
                chatId={chatId}
                legacyMessages={messages}
                chatTitleMap={chatTitleMap}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onMove={handleMove}
                onUpdateMetadata={handleUpdateMetadata}
                onUploadClick={() => setShowUploadDialog(true)}
                isDownloading={isDownloading}
                containerHeight={containerHeight}
            />

            <FileUploadDialog
                isOpen={showUploadDialog}
                onClose={() => setShowUploadDialog(false)}
                onFileUpload={handleUploadCompleteAndRefresh}
                contextId={contextId}
                chatId={chatId}
                storageTarget={storageTarget}
                title={t("Upload Files")}
                description={t(
                    "Upload files to add them to this conversation.",
                )}
            />
        </>
    );
}
