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

export default function UserFileCollection({
    contextId,
    contextKey,
    chatId = null,
    messages = [],
    updateChatHook = null,
}) {
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const [userFileCollection, setUserFileCollection] = useState([]);
    const [showUploadDialog, setShowUploadDialog] = useState(false);

    const {
        data: collectionData,
        loading: collectionLoading,
        refetch: refetchCollection,
    } = useQuery(QUERIES.SYS_READ_FILE_COLLECTION, {
        variables: { contextId, contextKey, useCache: false },
        skip: !contextId,
        fetchPolicy: "network-only",
    });

    useEffect(() => {
        if (collectionData?.sys_read_file_collection?.result) {
            try {
                const parsed = JSON.parse(
                    collectionData.sys_read_file_collection.result,
                );
                if (Array.isArray(parsed)) {
                    setUserFileCollection(parsed);
                } else {
                    setUserFileCollection([]);
                }
            } catch (e) {
                console.error("[UserFileCollection] Error parsing:", e);
                setUserFileCollection([]);
            }
        } else {
            setUserFileCollection([]);
        }
    }, [collectionData]);

    // Delete handler using purgeFiles
    const handleDelete = useCallback(
        async (filesToRemove) => {
            // Normalize file objects for purgeFiles
            const validFiles = filesToRemove
                .filter((file) => typeof file === "object")
                .map((file) => {
                    if (!file.type) {
                        return {
                            ...file,
                            type: file.image_url ? "image_url" : "file",
                        };
                    }
                    return file;
                })
                .filter(
                    (file) => file.type === "image_url" || file.type === "file",
                );

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
                skipUserFileCollection: true, // CFH automatically updates Redis
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

    // Refetch handler
    const handleRefetch = useCallback(async () => {
        await refetchCollection({ useCache: false });
    }, [refetchCollection]);

    // Update metadata handler
    const handleUpdateMetadata = useCallback(
        async (file, metadata) => {
            const fileHash = file?.hash;
            if (!fileHash) {
                throw new Error("File hash not found");
            }
            await updateFileMetadata(
                apolloClient,
                contextId,
                contextKey,
                fileHash,
                metadata,
            );
        },
        [apolloClient, contextId, contextKey],
    );

    // Toggle permanent handler
    const handleTogglePermanent = useCallback(async (file) => {
        const newPermanentValue = !file?.permanent;
        const fileHash = file?.hash;

        if (!fileHash) {
            throw new Error("File hash not found");
        }

        const response = await fetch("/api/files/set-retention", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                hash: fileHash,
                retention: newPermanentValue ? "permanent" : "temporary",
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                errorData.error ||
                    `Failed to update retention: ${response.statusText}`,
            );
        }
    }, []);

    // Handle upload complete - refetch files
    const handleUploadComplete = useCallback(() => {
        refetchCollection({ useCache: false });
    }, [refetchCollection]);

    return (
        <>
            <FileManager
                files={userFileCollection}
                isLoading={collectionLoading}
                onRefetch={handleRefetch}
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

            {/* Reuse existing FileUploadDialog */}
            <FileUploadDialog
                isOpen={showUploadDialog}
                onClose={() => setShowUploadDialog(false)}
                onFileUpload={handleUploadComplete}
                title="Upload Files"
                description="Upload files to add them to this conversation."
            />
        </>
    );
}
