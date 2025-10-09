import { useCallback } from "react";

export const useBulkOperations = ({
    selectedImagesObjects,
    deleteMediaItem,
    setSelectedImages,
    setSelectedImagesObjects,
    setShowDeleteSelectedConfirm,
    t,
}) => {
    // Check if download is within limits
    const checkDownloadLimits = useCallback(() => {
        const MAX_FILES = 100;
        const MAX_TOTAL_SIZE_MB = 1000; // 1GB limit

        if (selectedImagesObjects.length > MAX_FILES) {
            return {
                allowed: false,
                error: t("Too many files selected"),
                details: t("Maximum 100 files allowed for ZIP download"),
            };
        }

        // Estimate total size (rough calculation)
        const estimatedSizeMB = selectedImagesObjects.length * 5; // Assume 5MB average per file
        if (estimatedSizeMB > MAX_TOTAL_SIZE_MB) {
            return {
                allowed: false,
                error: t("Total file size too large"),
                details: t(
                    "Selected files are {{size}}MB, maximum allowed is {{maxSize}}MB",
                    {
                        size: estimatedSizeMB,
                        maxSize: MAX_TOTAL_SIZE_MB,
                    },
                ),
            };
        }

        return { allowed: true };
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
                    if (img.azureUrl || img.url) {
                        const link = document.createElement("a");
                        link.href = img.azureUrl || img.url;
                        link.download = ""; // Let browser determine filename
                        link.style.display = "none";
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }
                } else {
                    // Multiple files - create ZIP
                    downloadAsZip(selectedImagesObjects);
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

    // Helper function to download multiple files as a ZIP
    const downloadAsZip = async (images) => {
        try {
            console.log("Creating ZIP with", images.length, "files");

            // Extract URLs from images
            const urls = images
                .filter((img) => img.azureUrl || img.url)
                .map((img) => img.azureUrl || img.url);

            if (urls.length === 0) {
                throw new Error("No valid URLs found");
            }

            console.log("Requesting server-side ZIP creation...");

            // Use server-side proxy to create ZIP file
            const response = await fetch("/api/media-proxy", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ urls }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    `Server ZIP creation failed: ${response.status} - ${errorData.error || "Unknown error"}`,
                );
            }

            // Check if response is a ZIP file
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/zip")) {
                throw new Error("Server did not return a ZIP file");
            }

            console.log(
                "ZIP file received from server, initiating download...",
            );

            // Create blob from response and trigger download
            const zipBlob = await response.blob();
            const link = document.createElement("a");
            link.href = URL.createObjectURL(zipBlob);

            // Get filename from Content-Disposition header or use default
            const contentDisposition = response.headers.get(
                "content-disposition",
            );
            let filename = `media_download_${Date.now()}.zip`;
            if (contentDisposition) {
                const filenameMatch =
                    contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up the object URL
            URL.revokeObjectURL(link.href);
            console.log("ZIP download initiated successfully");
        } catch (error) {
            console.error("Error creating ZIP file:", error);
            // Fallback to individual downloads if ZIP fails
            console.log("Falling back to individual downloads...");
            images.forEach((img) => {
                if (img.azureUrl || img.url) {
                    const link = document.createElement("a");
                    link.href = img.azureUrl || img.url;
                    link.download = "";
                    link.style.display = "none";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            });
        }
    };

    return {
        handleBulkAction,
        handleDeleteSelected,
        handleDeleteAll,
        checkDownloadLimits,
    };
};
