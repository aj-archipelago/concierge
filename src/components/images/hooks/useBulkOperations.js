import { useCallback, useState } from "react";
import {
    downloadFilesAsZip,
    checkDownloadLimits as checkDownloadLimitsUtil,
} from "@/src/utils/fileDownloadUtils";

export const useBulkOperations = ({
    selectedImagesObjects,
    deleteMediaItem,
    setSelectedImages,
    setSelectedImagesObjects,
    setShowDeleteSelectedConfirm,
    t,
}) => {
    const [isDownloading, setIsDownloading] = useState(false);
    // Check if download is within limits
    const checkDownloadLimits = useCallback(() => {
        const limitCheck = checkDownloadLimitsUtil(selectedImagesObjects, {
            maxFiles: 100,
            maxTotalSizeMB: 1000,
        });

        // Translate error messages if needed
        if (!limitCheck.allowed) {
            return {
                ...limitCheck,
                error: limitCheck.errorKey
                    ? t(limitCheck.errorKey)
                    : t(limitCheck.error || "Download limit exceeded"),
                details: limitCheck.detailsKey
                    ? t(limitCheck.detailsKey, limitCheck.detailsParams || {})
                    : limitCheck.details
                      ? t(limitCheck.details)
                      : limitCheck.details,
            };
        }

        return limitCheck;
    }, [selectedImagesObjects, t]);

    const handleBulkAction = useCallback(
        async (action) => {
            if (selectedImagesObjects.length === 0) return;

            if (action === "delete") {
                setShowDeleteSelectedConfirm(true);
            } else if (action === "download") {
                // Check limits first
                const limitCheck = checkDownloadLimits();
                if (!limitCheck.allowed) {
                    // Show error dialog - we'll need to pass this up to the parent component
                    throw new Error(
                        `${limitCheck.error}: ${limitCheck.details}`,
                    );
                }

                // Handle single file download vs multiple files
                if (selectedImagesObjects.length === 1) {
                    // Single file - download directly
                    const img = selectedImagesObjects[0];
                    const url = img.azureUrl || img.url;
                    if (url) {
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = ""; // Let browser determine filename
                        link.style.display = "none";
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }
                } else {
                    // Multiple files - create ZIP using shared utility
                    await downloadFilesAsZip(selectedImagesObjects, {
                        filenamePrefix: "media_file_download",
                        onProgress: (isLoading) => {
                            setIsDownloading(isLoading);
                        },
                    });
                }

                setSelectedImages(new Set());
                setSelectedImagesObjects([]);
            }
        },
        [
            selectedImagesObjects,
            setSelectedImages,
            setSelectedImagesObjects,
            setShowDeleteSelectedConfirm,
            checkDownloadLimits,
        ],
    );

    const handleDeleteSelected = useCallback(async () => {
        if (selectedImagesObjects.length === 0) return;

        try {
            // Delete each selected item using the existing deleteMediaItem hook
            for (const image of selectedImagesObjects) {
                await deleteMediaItem.mutateAsync(image.taskId);
            }

            setSelectedImages(new Set());
            setSelectedImagesObjects([]);
            setShowDeleteSelectedConfirm(false);
        } catch (error) {
            console.error("Error deleting selected items:", error);
        }
    }, [
        selectedImagesObjects,
        deleteMediaItem,
        setSelectedImages,
        setSelectedImagesObjects,
        setShowDeleteSelectedConfirm,
    ]);

    const handleDeleteAll = useCallback(
        async (sortedImages, deleteMediaItem, setShowDeleteAllConfirm) => {
            // Delete all media items for the current user
            for (const image of sortedImages) {
                await deleteMediaItem.mutateAsync(image.taskId);
            }

            setSelectedImages(new Set());
            setSelectedImagesObjects([]);
            setShowDeleteAllConfirm(false);
        },
        [setSelectedImages, setSelectedImagesObjects],
    );

    return {
        handleBulkAction,
        handleDeleteSelected,
        handleDeleteAll,
        checkDownloadLimits,
        isDownloading,
    };
};
