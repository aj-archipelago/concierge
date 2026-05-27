import { useCallback } from "react";
import { useMediaModels } from "../../../../app/queries/modelMetadata";
import { sanitizeMediaSettings } from "../../../utils/mediaGenerationSettings";
import {
    getImageReferenceLimitConfig,
    selectImageReferencesWithinLimits,
    validateImageReferenceLimits,
} from "../mediaReferenceLimits";

const LOADING_STATE_DELAY_MS = 1000;
const IMAGE_ONLY_AUDIO_PROMPT = "Image-only music generation";
export const MAX_INPUT_IMAGE_REFERENCES = 14;
export const MAX_INPUT_VIDEO_REFERENCES = 1;
const VIDEO_EXTEND_REFERENCE_ROLE = "extend";

function getInputImageFieldName(base, index) {
    return index === 0 ? base : `${base}${index + 1}`;
}

function getInputVideoFieldName(base, index) {
    return index === 0 ? base : `${base}${index + 1}`;
}

export function hasUsableInputImageUrl(image) {
    return Boolean(image?.url || image?.azureUrl || image?.gcsUrl);
}

export function hasUsableInputVideoUrl(video) {
    return Boolean(video?.url || video?.azureUrl || video?.gcsUrl);
}

export function hasUsableInputAudioUrl(media) {
    return (
        media?.type === "audio" &&
        Boolean(media?.url || media?.azureUrl || media?.gcsUrl)
    );
}

export function getInputImageUrl(image, preferGcs = false) {
    if (!image) return "";
    if (preferGcs) {
        return image.gcsUrl || image.azureUrl || image.url || "";
    }
    return image.azureUrl || image.gcsUrl || image.url || "";
}

export function getStoredInputImageUrl(image) {
    return image?.url || image?.azureUrl || image?.gcsUrl || "";
}

export function getInputVideoUrl(video, preferGcs = false) {
    return getInputImageUrl(video, preferGcs);
}

export function getStoredInputVideoUrl(video) {
    return getStoredInputImageUrl(video);
}

export function getInputAudioUrl(media) {
    if (!media) return "";
    return media.azureUrl || media.url || media.gcsUrl || "";
}

export function getStoredInputAudioUrl(media) {
    return media?.url || media?.azureUrl || media?.gcsUrl || "";
}

export function applyInputImageReference(taskData, image, index, preferGcs) {
    const url = getInputImageUrl(image, preferGcs);
    if (!url) return;

    taskData[getInputImageFieldName("inputImageUrl", index)] = url;
    if (image?.blobPath) {
        taskData[getInputImageFieldName("inputImageBlobPath", index)] =
            image.blobPath;
    }
    if (image?.hash) {
        taskData[getInputImageFieldName("inputImageHash", index)] = image.hash;
    }
}

export function applyInputVideoReference(taskData, video, index, preferGcs) {
    const url = getInputVideoUrl(video, preferGcs);
    if (!url) return;

    taskData[getInputVideoFieldName("inputVideoUrl", index)] = url;
    if (video?.blobPath) {
        taskData[getInputVideoFieldName("inputVideoBlobPath", index)] =
            video.blobPath;
    }
    if (video?.hash) {
        taskData[getInputVideoFieldName("inputVideoHash", index)] = video.hash;
    }
}

export function applyInputAudioReference(taskData, media) {
    const url = getInputAudioUrl(media);
    if (!url) return;

    taskData.inputAudioUrl = url;
    if (media?.blobPath) {
        taskData.inputAudioBlobPath = media.blobPath;
    }
    if (media?.hash) {
        taskData.inputAudioHash = media.hash;
    }
}

export function applyInputImageRole(target, role, index) {
    if (!role) return;
    target[getInputImageFieldName("inputImageRole", index)] = role;
}

export function applyInputVideoRole(target, role, index) {
    if (!role) return;
    target[getInputVideoFieldName("inputVideoRole", index)] = role;
}

export function applyStoredInputImageReference(
    mediaItemData,
    image,
    index,
    role,
) {
    const url = getStoredInputImageUrl(image);
    if (!url) return;

    mediaItemData[getInputImageFieldName("inputImageUrl", index)] = url;
    applyInputImageRole(mediaItemData, role, index);
}

export function applyStoredInputVideoReference(
    mediaItemData,
    video,
    index,
    role,
) {
    const url = getStoredInputVideoUrl(video);
    if (!url) return;

    mediaItemData[getInputVideoFieldName("inputVideoUrl", index)] = url;
    applyInputVideoRole(mediaItemData, role, index);
}

export function applyStoredInputAudioReference(mediaItemData, media) {
    const url = getStoredInputAudioUrl(media);
    if (!url) return;

    mediaItemData.inputAudioUrl = url;
    if (media?.blobPath) {
        mediaItemData.inputAudioBlobPath = media.blobPath;
    }
    if (media?.hash) {
        mediaItemData.inputAudioHash = media.hash;
    }
}

function getDisplayPrompt(prompt, outputType, hasInputImage) {
    if (prompt?.trim()) return prompt;
    if (outputType === "audio" && hasInputImage) return IMAGE_ONLY_AUDIO_PROMPT;
    return prompt || "";
}

function getInputImageRole(image, rolesById) {
    const id =
        image?.cortexRequestId ||
        image?.taskId ||
        image?._id ||
        image?.url ||
        image?.azureUrl ||
        image?.gcsUrl;
    return rolesById?.[id] || image?.inputImageRole || "";
}

function isVideoExtendReference(media, rolesById) {
    return (
        media?.type === "video" &&
        getInputImageRole(media, rolesById) === VIDEO_EXTEND_REFERENCE_ROLE
    );
}

function isUsableGenerationReference(media, rolesById) {
    if (media?.type === "image") {
        return hasUsableInputImageUrl(media);
    }
    if (isVideoExtendReference(media, rolesById)) {
        return hasUsableInputVideoUrl(media);
    }
    return false;
}

function normalizeOutputFolder(value) {
    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
}

export const useMediaGeneration = ({
    selectedModel,
    outputType,
    settings,
    settingsRef,
    outputFolder = "",
    runTask,
    createMediaItem,
    promptRef,
    setLoading,
}) => {
    const { data: mediaModels } = useMediaModels();
    const generateMedia = useCallback(
        async (
            prompt,
            inputImageUrl = null,
            modelOverride = null,
            inputImageRole = "",
            generationSettings = null,
            inputAudio = null,
        ) => {
            // Determine which model to use
            const modelToUse = modelOverride || selectedModel;
            const modelName = modelToUse;
            const effectiveSettings = sanitizeMediaSettings(
                generationSettings || settingsRef?.current || settings,
            );
            const modelSettings = effectiveSettings?.models?.[modelName] || {};
            const normalizedOutputFolder = normalizeOutputFolder(outputFolder);

            try {
                const taskData = {
                    type: "media-generation",
                    prompt,
                    outputType,
                    model: modelName,
                    inputImageUrl: inputImageUrl || "",
                    inputImageRole: inputImageUrl ? inputImageRole : "",
                    inputImageUrl2: "",
                    inputImageUrl3: "",
                    settings: effectiveSettings,
                    source: "media_page",
                    ...(normalizedOutputFolder && {
                        outputFolder: normalizedOutputFolder,
                    }),
                };
                applyInputAudioReference(taskData, inputAudio);

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
                        settings: effectiveSettings,
                        ...(normalizedOutputFolder && {
                            outputFolder: normalizedOutputFolder,
                        }),
                        ...(modelSettings.duration && {
                            duration: modelSettings.duration,
                        }),
                    };

                    if (inputImageUrl) {
                        mediaItemData.inputImageUrl = inputImageUrl;
                        if (inputImageRole) {
                            mediaItemData.inputImageRole = inputImageRole;
                        }
                    }
                    applyStoredInputAudioReference(mediaItemData, inputAudio);

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
            outputFolder,
            selectedModel,
            settings,
            settingsRef,
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
            inputImageRolesById = {},
            outputFolder = "",
            inputAudio = null,
        }) => {
            // Use the selectedImagesObjects array directly
            const selectedReferenceObjects = selectedImagesObjects.filter(
                (item) =>
                    isUsableGenerationReference(item, inputImageRolesById),
            );
            if (
                selectedReferenceObjects.length === 0 ||
                (!prompt.trim() && outputType !== "audio")
            )
                return;
            const effectiveSettings = sanitizeMediaSettings(settings);
            const normalizedOutputFolder = normalizeOutputFolder(outputFolder);

            for (const image of selectedReferenceObjects) {
                try {
                    const combinedPrompt = prompt;
                    const referenceRole = getInputImageRole(
                        image,
                        inputImageRolesById,
                    );
                    const isVideoExtend = isVideoExtendReference(
                        image,
                        inputImageRolesById,
                    );

                    // Use metadata to determine URL format preference
                    const modelMeta = mediaModels?.find(
                        (m) => m.modelId === selectedModel,
                    );
                    const preferGcs = modelMeta?.preferredUrlFormat === "gcs";
                    // Collect tags from input image
                    const inputTags = image.tags || [];

                    const taskData = {
                        type: "media-generation",
                        prompt: combinedPrompt,
                        displayPrompt: getDisplayPrompt(
                            combinedPrompt,
                            outputType,
                            true,
                        ),
                        outputType,
                        model: selectedModel,
                        inputImageUrl: "",
                        inputImageUrl2: "",
                        inputImageUrl3: "",
                        settings: effectiveSettings,
                        source: "media_page",
                        ...(normalizedOutputFolder && {
                            outputFolder: normalizedOutputFolder,
                        }),
                        // Pass tags from input image for inheritance
                        inputTags: inputTags,
                    };
                    if (isVideoExtend) {
                        applyInputVideoReference(taskData, image, 0, preferGcs);
                        applyInputVideoRole(taskData, referenceRole, 0);
                    } else {
                        applyInputImageReference(taskData, image, 0, preferGcs);
                        applyInputImageRole(taskData, referenceRole, 0);
                    }
                    applyInputAudioReference(taskData, inputAudio);

                    const result = await runTask.mutateAsync(taskData);

                    if (result.taskId) {
                        // Task is queued, set loading to false (only for first image in batch)
                        if (image === selectedReferenceObjects[0]) {
                            setLoading?.(false);
                        }

                        // Create placeholder in the database
                        const mediaItemData = {
                            taskId: result.taskId,
                            cortexRequestId: result.taskId,
                            prompt: getDisplayPrompt(
                                combinedPrompt,
                                outputType,
                                true,
                            ),
                            type: outputType,
                            model: selectedModel,
                            status: "pending",
                            settings: effectiveSettings,
                            ...(normalizedOutputFolder && {
                                outputFolder: normalizedOutputFolder,
                            }),
                            // Include inherited tags
                            tags: inputTags,
                        };

                        if (isVideoExtend) {
                            applyStoredInputVideoReference(
                                mediaItemData,
                                image,
                                0,
                                referenceRole,
                            );
                        } else {
                            applyStoredInputImageReference(
                                mediaItemData,
                                image,
                                0,
                                referenceRole,
                            );
                        }
                        applyStoredInputAudioReference(
                            mediaItemData,
                            inputAudio,
                        );

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
        [mediaModels, setLoading],
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
            inputImageRolesById = {},
            outputFolder = "",
            inputAudio = null,
        }) => {
            // Use the selectedImagesObjects array directly
            const selectedReferenceObjects = selectedImagesObjects.filter(
                (item) =>
                    isUsableGenerationReference(item, inputImageRolesById),
            );
            const selectedImageObjects = selectedReferenceObjects.filter(
                (item) => item.type === "image",
            );
            const selectedVideoObjects = selectedReferenceObjects.filter(
                (item) => isVideoExtendReference(item, inputImageRolesById),
            );

            const effectiveSettings = sanitizeMediaSettings(settings);
            const modelMeta = mediaModels?.find(
                (m) => m.modelId === selectedModel,
            );
            const modelSettings = effectiveSettings?.models?.[selectedModel];
            const { totalMax: maxImages } = getImageReferenceLimitConfig(
                modelMeta,
                modelSettings,
            );
            const maxVideos =
                modelMeta?.mediaDefaults?.inputVideos?.[1] ??
                modelSettings?.inputVideos?.[1] ??
                0;
            const minReferences = selectedVideoObjects.length > 0 ? 1 : 2;
            const normalizedOutputFolder = normalizeOutputFolder(outputFolder);
            const getReferenceRole = (image) =>
                getInputImageRole(image, inputImageRolesById);

            if (
                (!prompt.trim() && outputType !== "audio") ||
                selectedReferenceObjects.length < minReferences ||
                selectedVideoObjects.length > maxVideos
            )
                return;

            const selectedImageObjectsForTask =
                selectImageReferencesWithinLimits(selectedImageObjects, {
                    modelMeta,
                    modelSettings,
                    getRole: getReferenceRole,
                }).slice(0, Math.min(maxImages, MAX_INPUT_IMAGE_REFERENCES));

            if (
                selectedImageObjects.length > 0 &&
                selectedImageObjectsForTask.length === 0
            ) {
                return;
            }

            const selectedReferencesForTask = [
                ...selectedImageObjectsForTask,
                ...selectedVideoObjects.slice(
                    0,
                    Math.min(maxVideos, MAX_INPUT_VIDEO_REFERENCES),
                ),
            ];
            const isWithinImageReferenceLimits = validateImageReferenceLimits(
                selectedImageObjectsForTask,
                {
                    modelMeta,
                    modelSettings,
                    getRole: getReferenceRole,
                },
            );
            if (!isWithinImageReferenceLimits) return;

            try {
                const combinedPrompt = prompt;

                // Use metadata to determine URL format preference
                const preferGcs = modelMeta?.preferredUrlFormat === "gcs";
                // Collect tags from all input images
                const allInputTags = new Set();
                selectedReferencesForTask.forEach((image) => {
                    if (image.tags && Array.isArray(image.tags)) {
                        image.tags.forEach((tag) => allInputTags.add(tag));
                    }
                });

                // Build task data with all input images
                const taskData = {
                    type: "media-generation",
                    prompt: combinedPrompt,
                    displayPrompt: getDisplayPrompt(
                        combinedPrompt,
                        outputType,
                        true,
                    ),
                    outputType,
                    model: selectedModel,
                    settings: effectiveSettings,
                    source: "media_page",
                    ...(normalizedOutputFolder && {
                        outputFolder: normalizedOutputFolder,
                    }),
                    // Pass tags from all input images for inheritance
                    inputTags: Array.from(allInputTags),
                };

                // Add generic image references up to the model limit while
                // preserving explicit start/end frame references.
                selectedImageObjectsForTask.forEach((image, index) => {
                    applyInputImageReference(taskData, image, index, preferGcs);
                    applyInputImageRole(
                        taskData,
                        getReferenceRole(image),
                        index,
                    );
                });
                selectedVideoObjects
                    .slice(0, Math.min(maxVideos, MAX_INPUT_VIDEO_REFERENCES))
                    .forEach((video, index) => {
                        applyInputVideoReference(
                            taskData,
                            video,
                            index,
                            preferGcs,
                        );
                        applyInputVideoRole(
                            taskData,
                            getReferenceRole(video),
                            index,
                        );
                    });
                applyInputAudioReference(taskData, inputAudio);

                const result = await runTask.mutateAsync(taskData);

                if (result.taskId) {
                    // Task is queued, set loading to false
                    setLoading?.(false);

                    // Create placeholder in the database
                    const mediaItemData = {
                        taskId: result.taskId,
                        cortexRequestId: result.taskId,
                        prompt: getDisplayPrompt(
                            combinedPrompt,
                            outputType,
                            true,
                        ),
                        type: outputType,
                        model: selectedModel,
                        status: "pending",
                        settings: effectiveSettings,
                        ...(normalizedOutputFolder && {
                            outputFolder: normalizedOutputFolder,
                        }),
                        // Include inherited tags
                        tags: Array.from(allInputTags),
                    };

                    selectedImageObjectsForTask.forEach((image, index) => {
                        applyStoredInputImageReference(
                            mediaItemData,
                            image,
                            index,
                            getReferenceRole(image),
                        );
                    });
                    selectedVideoObjects
                        .slice(
                            0,
                            Math.min(maxVideos, MAX_INPUT_VIDEO_REFERENCES),
                        )
                        .forEach((video, index) => {
                            applyStoredInputVideoReference(
                                mediaItemData,
                                video,
                                index,
                                getReferenceRole(video),
                            );
                        });
                    applyStoredInputAudioReference(mediaItemData, inputAudio);

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
        [mediaModels, setLoading],
    );

    return {
        generateMedia,
        handleModifySelected,
        handleCombineSelected,
    };
};
