import { useCallback, useContext } from "react";
import axios from "../../../../app/utils/axios-client";
import { hashMediaFile } from "../../../utils/mediaUtils";
import { AuthContext } from "../../../App";

export const useFileUpload = ({
    createMediaItem,
    settings,
    t,
    promptRef,
    setSelectedImages,
    setSelectedImagesObjects,
}) => {
    const { user } = useContext(AuthContext);
    // Use :media suffix to separate media page images from chat files
    const contextId = user?.contextId ? `${user.contextId}:media` : null;
    const handleFileUpload = useCallback(
        async (file) => {
            if (!file) return;

            const serverUrl = "/media-helper";

            try {
                // Start showing upload progress
                const fileHash = await hashMediaFile(file);

                // Check if file exists first
                try {
                    const checkUrl = new URL(serverUrl, window.location.origin);
                    checkUrl.searchParams.set("hash", fileHash);
                    checkUrl.searchParams.set("checkHash", "true");
                    if (contextId) {
                        checkUrl.searchParams.set("contextId", contextId);
                    }

                    const checkResponse = await axios.get(checkUrl.toString());
                    if (
                        checkResponse.status === 200 &&
                        checkResponse.data?.url
                    ) {
                        // Create media item in database
                        const mediaItemData = {
                            taskId: `upload-${Date.now()}`,
                            cortexRequestId: `upload-${Date.now()}`,
                            prompt: t("Uploaded image"),
                            type: "image",
                            model: "upload",
                            status: "completed",
                            settings: settings,
                        };

                        // Only add URLs if they exist
                        if (checkResponse.data.url) {
                            mediaItemData.url = checkResponse.data.url;
                            mediaItemData.azureUrl = checkResponse.data.url;
                        }
                        if (checkResponse.data.gcs) {
                            mediaItemData.gcsUrl = checkResponse.data.gcs;
                        }

                        await createMediaItem.mutateAsync(mediaItemData);

                        setTimeout(() => {
                            promptRef.current && promptRef.current.focus();
                        }, 0);
                        return;
                    }
                } catch (err) {
                    if (err.response?.status !== 404) {
                        console.error("Error checking file hash:", err);
                    }
                }

                // If we get here, we need to upload the file
                const formData = new FormData();
                formData.append("hash", fileHash);
                formData.append("file", file, file.name);
                if (contextId) {
                    formData.append("contextId", contextId);
                }

                const uploadUrl = new URL(serverUrl, window.location.origin);
                uploadUrl.searchParams.set("hash", fileHash);
                if (contextId) {
                    uploadUrl.searchParams.set("contextId", contextId);
                }

                const response = await axios.post(
                    uploadUrl.toString(),
                    formData,
                    {
                        headers: {
                            "Content-Type": "multipart/form-data",
                        },
                        onUploadProgress: (progressEvent) => {
                            // Progress tracking removed - using generic upload message
                        },
                    },
                );

                if (response.data?.url) {
                    // Create media item in database
                    const mediaItemData = {
                        taskId: `upload-${Date.now()}`,
                        cortexRequestId: `upload-${Date.now()}`,
                        prompt: t("Uploaded image"),
                        type: "image",
                        model: "upload",
                        status: "completed",
                        settings: settings,
                    };

                    // Only add URLs if they exist
                    if (response.data.url) {
                        mediaItemData.url = response.data.url;
                        mediaItemData.azureUrl = response.data.url;
                    }
                    if (response.data.gcs) {
                        mediaItemData.gcsUrl = response.data.gcs;
                    }

                    const mediaItem =
                        await createMediaItem.mutateAsync(mediaItemData);

                    setSelectedImages(new Set([mediaItem.cortexRequestId]));
                    setSelectedImagesObjects([mediaItem]);
                    setTimeout(() => {
                        promptRef.current && promptRef.current.focus();
                    }, 0);
                }
            } catch (error) {
                console.error("Error uploading file:", error);
            }
        },
        [
            t,
            createMediaItem,
            settings,
            promptRef,
            setSelectedImages,
            setSelectedImagesObjects,
            contextId,
        ],
    );

    const handleFileSelect = useCallback(
        (event) => {
            const file = event.target.files[0];
            if (file) {
                handleFileUpload(file);
            }
        },
        [handleFileUpload],
    );

    return {
        handleFileUpload,
        handleFileSelect,
    };
};
