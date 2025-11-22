import { useCallback } from "react";

const LOADING_STATE_DELAY_MS = 1000;

export const useMediaGeneration = ({
    selectedModel,
    outputType,
    settings,
    runTask,
    createMediaItem,
    promptRef,
    setLoading,
}) => {
    const generateMedia = useCallback(
        async (prompt, inputImageUrl = null, modelOverride = null) => {
            // Determine which model to use
            const modelToUse = modelOverride || selectedModel;
            const modelName = modelToUse;

            try {
                const taskData = {
                    type: "media-generation",
                    prompt,
                    outputType,
                    model: modelName,
                    inputImageUrl: inputImageUrl || "",
                    inputImageUrl2: "",
                    inputImageUrl3: "",
                    settings,
                    source: "media_page",
                };

                const result = await runTask.mutateAsync(taskData);

                if (result.taskId) {
                    // Task is queued, set loading to false
                    setTimeout(() => {
                        setLoading?.(false);
                    }, LOADING_STATE_DELAY_MS);

                    // Create placeholder in the database
                    const mediaItemData = {
                        taskId: result.taskId,
                        cortexRequestId: result.taskId,
                        prompt: prompt,
                        type: outputType,
                        model: modelName,
                        status: "pending",
                        settings: settings,
                    };

                    // Only add inputImageUrl if it exists
                    if (inputImageUrl) {
                        mediaItemData.inputImageUrl = inputImageUrl;
                    }

                    await createMediaItem.mutateAsync(mediaItemData);

                    setTimeout(() => {
                        promptRef.current && promptRef.current.focus();
                    }, 0);
                }
            } catch (error) {
                console.error(`Error generating ${outputType}:`, error);
                setTimeout(() => {
                    setLoading?.(false);
                }, LOADING_STATE_DELAY_MS);
            }
        },
        [
            outputType,
            selectedModel,
            settings,
            runTask,
            createMediaItem,
            promptRef,
            setLoading,
        ],
    );

    const handleModifySelected = useCallback(
        async ({
            prompt,
            selectedImagesObjects,
            outputType,
            selectedModel,
            settings,
            runTask,
            createMediaItem,
            promptRef,
        }) => {
            if (!prompt.trim() || selectedImagesObjects.length === 0) return;

            // Use the selectedImagesObjects array directly
            const selectedImageObjects = selectedImagesObjects.filter(
                (img) => img.url && img.type === "image",
            );

            for (const image of selectedImageObjects) {
                try {
                    const combinedPrompt = prompt;

                    // For Veo and Gemini models, use GCS URL; for others, use Azure URL
                    const isVeoModel = selectedModel.includes("veo");
                    const isGeminiModel = selectedModel.includes("gemini");
                    const inputImageUrl =
                        isVeoModel || isGeminiModel
                            ? image.gcsUrl || image.azureUrl || image.url
                            : image.azureUrl || image.gcsUrl || image.url;

                    // Collect tags from input image
                    const inputTags = image.tags || [];

                    const taskData = {
                        type: "media-generation",
                        prompt: combinedPrompt,
                        outputType,
                        model: selectedModel,
                        inputImageUrl: inputImageUrl,
                        inputImageUrl2: "",
                        inputImageUrl3: "",
                        settings,
                        source: "media_page",
                        // Pass tags from input image for inheritance
                        inputTags: inputTags,
                    };

                    const result = await runTask.mutateAsync(taskData);

                    if (result.taskId) {
                        // Task is queued, set loading to false (only for first image in batch)
                        if (image === selectedImageObjects[0]) {
                            setLoading?.(false);
                        }

                        // Create placeholder in the database
                        const mediaItemData = {
                            taskId: result.taskId,
                            cortexRequestId: result.taskId,
                            prompt: combinedPrompt,
                            type: outputType,
                            model: selectedModel,
                            status: "pending",
                            settings: settings,
                            // Include inherited tags
                            tags: inputTags,
                        };

                        // Only add inputImageUrl if it exists
                        if (image.url) {
                            mediaItemData.inputImageUrl = image.url;
                        }

                        await createMediaItem.mutateAsync(mediaItemData);
                    }
                } catch (error) {
                    console.error(`Error modifying ${outputType}:`, error);
                    setLoading?.(false);
                }
            }

            // Keep existing selection and focus prompt box
            setTimeout(() => {
                promptRef.current && promptRef.current.focus();
            }, 0);
        },
        [setLoading],
    );

    const handleCombineSelected = useCallback(
        async ({
            prompt,
            selectedImagesObjects,
            outputType,
            selectedModel,
            settings,
            runTask,
            createMediaItem,
            promptRef,
        }) => {
            // Use the selectedImagesObjects array directly
            const selectedImageObjects = selectedImagesObjects.filter(
                (img) => img.url && img.type === "image",
            );

            // Check if this is gemini-3-pro-image-preview which supports up to 14 images
            const isGemini3Pro = selectedModel === "gemini-3-pro-image-preview";
            const maxImages = isGemini3Pro ? 14 : 3;
            const minImages = 2;

            if (
                !prompt.trim() ||
                selectedImageObjects.length < minImages ||
                selectedImageObjects.length > maxImages
            )
                return;

            try {
                const combinedPrompt = prompt;

                // For Veo and Gemini models, use GCS URL; for others, use Azure URL
                const isVeoModel = selectedModel.includes("veo");
                const isGeminiModel = selectedModel.includes("gemini");
                const useGcsUrl = isVeoModel || isGeminiModel;

                // Helper function to get the appropriate URL
                const getImageUrl = (image) => {
                    if (useGcsUrl) {
                        return image.gcsUrl || image.azureUrl || image.url;
                    }
                    return image.azureUrl || image.gcsUrl || image.url;
                };

                // Collect tags from all input images
                const allInputTags = new Set();
                selectedImageObjects.forEach((image) => {
                    if (image.tags && Array.isArray(image.tags)) {
                        image.tags.forEach((tag) => allInputTags.add(tag));
                    }
                });

                // Build task data with all input images
                const taskData = {
                    type: "media-generation",
                    prompt: combinedPrompt,
                    outputType,
                    model: selectedModel,
                    settings,
                    source: "media_page",
                    // Pass tags from all input images for inheritance
                    inputTags: Array.from(allInputTags),
                };

                // Add input images (up to 14 for gemini-3-pro-image-preview)
                if (selectedImageObjects[0]) {
                    taskData.inputImageUrl = getImageUrl(
                        selectedImageObjects[0],
                    );
                }
                if (selectedImageObjects[1]) {
                    taskData.inputImageUrl2 = getImageUrl(
                        selectedImageObjects[1],
                    );
                }
                if (selectedImageObjects[2]) {
                    taskData.inputImageUrl3 = getImageUrl(
                        selectedImageObjects[2],
                    );
                }
                // Only add additional images if this is gemini-3-pro-image-preview
                if (isGemini3Pro) {
                    if (selectedImageObjects[3]) {
                        taskData.inputImageUrl4 = getImageUrl(
                            selectedImageObjects[3],
                        );
                    }
                    if (selectedImageObjects[4]) {
                        taskData.inputImageUrl5 = getImageUrl(
                            selectedImageObjects[4],
                        );
                    }
                    if (selectedImageObjects[5]) {
                        taskData.inputImageUrl6 = getImageUrl(
                            selectedImageObjects[5],
                        );
                    }
                    if (selectedImageObjects[6]) {
                        taskData.inputImageUrl7 = getImageUrl(
                            selectedImageObjects[6],
                        );
                    }
                    if (selectedImageObjects[7]) {
                        taskData.inputImageUrl8 = getImageUrl(
                            selectedImageObjects[7],
                        );
                    }
                    if (selectedImageObjects[8]) {
                        taskData.inputImageUrl9 = getImageUrl(
                            selectedImageObjects[8],
                        );
                    }
                    if (selectedImageObjects[9]) {
                        taskData.inputImageUrl10 = getImageUrl(
                            selectedImageObjects[9],
                        );
                    }
                    if (selectedImageObjects[10]) {
                        taskData.inputImageUrl11 = getImageUrl(
                            selectedImageObjects[10],
                        );
                    }
                    if (selectedImageObjects[11]) {
                        taskData.inputImageUrl12 = getImageUrl(
                            selectedImageObjects[11],
                        );
                    }
                    if (selectedImageObjects[12]) {
                        taskData.inputImageUrl13 = getImageUrl(
                            selectedImageObjects[12],
                        );
                    }
                    if (selectedImageObjects[13]) {
                        taskData.inputImageUrl14 = getImageUrl(
                            selectedImageObjects[13],
                        );
                    }
                }

                const result = await runTask.mutateAsync(taskData);

                if (result.taskId) {
                    // Task is queued, set loading to false
                    setLoading?.(false);

                    // Create placeholder in the database
                    const mediaItemData = {
                        taskId: result.taskId,
                        cortexRequestId: result.taskId,
                        prompt: combinedPrompt,
                        type: outputType,
                        model: selectedModel,
                        status: "pending",
                        settings: settings,
                        // Include inherited tags
                        tags: Array.from(allInputTags),
                    };

                    // Add input image URLs to media item data
                    if (selectedImageObjects[0]?.url) {
                        mediaItemData.inputImageUrl =
                            selectedImageObjects[0].url;
                    }
                    if (selectedImageObjects[1]?.url) {
                        mediaItemData.inputImageUrl2 =
                            selectedImageObjects[1].url;
                    }
                    if (selectedImageObjects[2]?.url) {
                        mediaItemData.inputImageUrl3 =
                            selectedImageObjects[2].url;
                    }

                    await createMediaItem.mutateAsync(mediaItemData);

                    setTimeout(() => {
                        promptRef.current && promptRef.current.focus();
                    }, 0);
                }
            } catch (error) {
                console.error(
                    `Error combining ${outputType === "image" ? "images" : "videos"}:`,
                    error,
                );
                setLoading?.(false);
            }
        },
        [setLoading],
    );

    return {
        generateMedia,
        handleModifySelected,
        handleCombineSelected,
    };
};
