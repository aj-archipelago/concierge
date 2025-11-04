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
            if (
                !prompt.trim() ||
                selectedImagesObjects.length < 2 ||
                selectedImagesObjects.length > 3
            )
                return;

            // Use the selectedImagesObjects array directly
            const selectedImageObjects = selectedImagesObjects.filter(
                (img) => img.url && img.type === "image",
            );

            if (
                selectedImageObjects.length < 2 ||
                selectedImageObjects.length > 3
            )
                return;

            const [image1, image2, image3] = selectedImageObjects;

            try {
                const combinedPrompt = prompt;

                // For Veo models, use GCS URL; for others, use Azure URL
                const isVeoModel = selectedModel.includes("veo");
                const inputImageUrl1 = isVeoModel
                    ? image1.gcsUrl || image1.azureUrl || image1.url
                    : image1.azureUrl || image1.gcsUrl || image1.url;
                const inputImageUrl2 = isVeoModel
                    ? image2.gcsUrl || image2.azureUrl || image2.url
                    : image2.azureUrl || image2.gcsUrl || image2.url;
                const inputImageUrl3 = image3
                    ? isVeoModel
                        ? image3.gcsUrl || image3.azureUrl || image3.url
                        : image3.azureUrl || image3.gcsUrl || image3.url
                    : "";

                // Collect tags from all input images
                const allInputTags = new Set();
                selectedImageObjects.forEach((image) => {
                    if (image.tags && Array.isArray(image.tags)) {
                        image.tags.forEach((tag) => allInputTags.add(tag));
                    }
                });

                const taskData = {
                    type: "media-generation",
                    prompt: combinedPrompt,
                    outputType,
                    model: selectedModel,
                    inputImageUrl: inputImageUrl1,
                    inputImageUrl2:
                        outputType === "image" ? inputImageUrl2 : "",
                    inputImageUrl3:
                        outputType === "image" ? inputImageUrl3 : "",
                    settings,
                    source: "media_page",
                    // Pass tags from all input images for inheritance
                    inputTags: Array.from(allInputTags),
                };

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

                    // Only add inputImageUrl if it exists
                    if (image1.url) {
                        mediaItemData.inputImageUrl = image1.url;
                    }

                    // Only add inputImageUrl2 if it exists
                    if (image2.url) {
                        mediaItemData.inputImageUrl2 = image2.url;
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
