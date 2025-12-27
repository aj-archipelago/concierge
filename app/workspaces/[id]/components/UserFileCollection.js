"use client";
import { useQuery, useApolloClient } from "@apollo/client";
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { QUERIES } from "@/src/graphql";
import {
    updateFileMetadata,
    getFilename as getFilenameUtil,
} from "./userFileCollectionUtils";
import { purgeFiles } from "./chatFileUtils";
import FileManager from "@/src/components/common/FileManager";
import FileUploadDialog from "@/app/workspaces/components/FileUploadDialog";

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
    const [files, setFiles] = useState([]);
    const [showUploadDialog, setShowUploadDialog] = useState(false);

    // Load file collection
    const {
        data: collectionData,
        loading,
        refetch,
    } = useQuery(QUERIES.SYS_READ_FILE_COLLECTION, {
        variables: { contextId, contextKey, useCache: false },
        skip: !contextId,
        fetchPolicy: "network-only",
    });

    // Parse collection data when it changes
    useEffect(() => {
        if (!collectionData?.sys_read_file_collection?.result) {
            setFiles([]);
            return;
        }
        try {
            const parsed = JSON.parse(
                collectionData.sys_read_file_collection.result,
            );
            setFiles(Array.isArray(parsed) ? parsed : []);
        } catch {
            setFiles([]);
        }
    }, [collectionData]);

    // Reload the file list
    const reloadFiles = useCallback(
        () => refetch({ useCache: false }),
        [refetch],
    );

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

            // [2] Optimistic update - add file to list immediately
            const now = new Date().toISOString();
            const optimisticFile = {
                hash,
                url: fileData.converted?.url || fileData.url,
                gcs: fileData.converted?.gcs || fileData.gcsUrl || fileData.gcs,
                displayFilename:
                    fileData.displayFilename ||
                    fileData.originalName ||
                    fileData.filename,
                mimeType: fileData.mimeType,
                size: fileData.size,
                permanent: false,
                inCollection: ["*"],
                addedDate: now,
                lastAccessed: now,
            };

            setFiles((prev) => {
                if (prev.some((f) => f.hash === hash)) return prev;
                return [optimisticFile, ...prev];
            });

            // [3] Set metadata (inCollection) → [4] reload
            try {
                await updateFileMetadata(
                    apolloClient,
                    contextId,
                    contextKey,
                    hash,
                    {
                        inCollection: ["*"],
                    },
                );
            } catch (error) {
                console.error("Failed to set file metadata:", error);
            }
            reloadFiles();
        },
        [apolloClient, contextId, contextKey, reloadFiles],
    );

    // Handle file deletion
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

    return (
        <>
            <FileManager
                files={files}
                isLoading={loading}
                onRefetch={reloadFiles}
                onDelete={handleDelete}
                onUploadClick={() => setShowUploadDialog(true)}
                onUpdateMetadata={handleUpdateMetadata}
                onTogglePermanent={handleTogglePermanent}
                title={t("Files indexed in this conversation")}
                emptyTitle={t("No files indexed")}
                emptyDescription={t(
                    "No files have been indexed in this conversation yet.",
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
