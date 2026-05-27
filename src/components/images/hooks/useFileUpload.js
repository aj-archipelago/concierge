import { useCallback, useContext, useState } from "react";
import { uploadFileToMediaHelper } from "../../../utils/fileUploadUtils";
import { createMediaStorageTarget } from "../../../utils/storageTargets";
import {
    AUDIO_EXTENSIONS,
    getExtension,
    VIDEO_EXTENSIONS,
} from "../../../utils/mediaUtils";
import { AuthContext } from "../../../App";

function createUploadId() {
    return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getUploadMediaType(file) {
    const mimeType = String(file?.type || "").toLowerCase();
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("image/")) return "image";

    const extension = getExtension(file?.name || "");
    if (AUDIO_EXTENSIONS.includes(extension)) return "audio";
    if (VIDEO_EXTENSIONS.includes(extension)) return "video";
    return "image";
}

function getUploadPrompt(type, t) {
    if (type === "audio") return t("Uploaded audio");
    if (type === "video") return t("Uploaded video");
    return t("Uploaded image");
}

export const useFileUpload = ({
    createMediaItem,
    settings,
    t,
    promptRef,
    setSelectedImages,
    setSelectedImagesObjects,
}) => {
    const { user } = useContext(AuthContext);
    const [isUploading, setIsUploading] = useState(false);
    // Use default user contextId (not :chat, so they don't appear in chat file collections)
    const contextId = user?.contextId;
    const uploadFile = useCallback(
        async (file) => {
            if (!file) return;

            const serverUrl = "/media-helper";

            try {
                // Upload file using shared utility
                const data = await uploadFileToMediaHelper(file, {
                    storageTarget: createMediaStorageTarget(contextId),
                    checkHash: false,
                    serverUrl,
                });

                if (data?.url) {
                    const uploadId = createUploadId();
                    const mediaType = getUploadMediaType(file);
                    // Create media item in database
                    const mediaItemData = {
                        taskId: uploadId,
                        cortexRequestId: uploadId,
                        prompt: getUploadPrompt(mediaType, t),
                        type: mediaType,
                        model: "upload",
                        status: "completed",
                        settings: settings,
                    };

                    // Only add URLs if they exist
                    if (data.url) {
                        mediaItemData.url = data.url;
                        mediaItemData.azureUrl = data.url;
                    }
                    if (data.gcs) {
                        mediaItemData.gcsUrl = data.gcs;
                    }
                    if (data.hash) {
                        mediaItemData.hash = data.hash;
                    }
                    if (data.blobPath) {
                        mediaItemData.blobPath = data.blobPath;
                    }

                    return createMediaItem.mutateAsync(mediaItemData);
                }
            } catch (error) {
                console.error("Error uploading file:", error);
            }
        },
        [t, createMediaItem, settings, contextId],
    );

    const handleFilesUpload = useCallback(
        async (files) => {
            const selectedFiles = Array.from(files || []).filter(Boolean);
            if (selectedFiles.length === 0) return;

            setIsUploading(true);
            try {
                const uploadedItems = [];
                for (const file of selectedFiles) {
                    const mediaItem = await uploadFile(file);
                    if (mediaItem?.cortexRequestId) {
                        uploadedItems.push(mediaItem);
                    }
                }

                if (uploadedItems.length > 0) {
                    setSelectedImages(
                        new Set(
                            uploadedItems.map((item) => item.cortexRequestId),
                        ),
                    );
                    setSelectedImagesObjects(uploadedItems);
                    setTimeout(() => {
                        promptRef.current && promptRef.current.focus();
                    }, 0);
                }
            } finally {
                setIsUploading(false);
            }
        },
        [promptRef, setSelectedImages, setSelectedImagesObjects, uploadFile],
    );

    const handleFileUpload = useCallback(
        async (file) => {
            await handleFilesUpload(file ? [file] : []);
        },
        [handleFilesUpload],
    );

    const handleFileSelect = useCallback(
        (event) => {
            const uploadPromise = handleFilesUpload(event.target.files);
            event.target.value = "";
            return uploadPromise;
        },
        [handleFilesUpload],
    );

    return {
        handleFileUpload,
        handleFilesUpload,
        handleFileSelect,
        isUploading,
    };
};
