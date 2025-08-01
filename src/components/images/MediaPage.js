"use client";

import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Download, Trash2, Check, Plus, Settings, Loader2 } from "lucide-react";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { AuthContext } from "../../App";
import { Modal } from "../../../@/components/ui/modal";

import ProgressUpdate from "../editor/ProgressUpdate";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "../../../@/components/ui/tooltip";
import ChatImage from "./ChatImage";
import axios from "../../../app/utils/axios-client";
import { hashMediaFile } from "../../utils/mediaUtils";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from "../../../@/components/ui/alert-dialog";
import { useRunTask } from "../../../app/queries/notifications";
import {
    useMediaItems,
    useCreateMediaItem,
    useDeleteMediaItem,
    useMigrateMediaItems,
} from "../../../app/queries/media-items";
import "./Media.scss";

// Function to get settings for a specific model
const getModelSettings = (settings, modelName) => {
    return settings.models?.[modelName] || getDefaultModelSettings(modelName);
};

// Function to get default settings for a model
const getDefaultModelSettings = (modelName) => {
    const defaults = {
        // Image models
        "replicate-flux-1-schnell": {
            type: "image",
            quality: "draft",
            aspectRatio: "1:1",
        },
        "replicate-flux-11-pro": {
            type: "image",
            quality: "high",
            aspectRatio: "1:1",
        },
        "replicate-flux-kontext-max": {
            type: "image",
            quality: "high",
            aspectRatio: "match_input_image",
        },
        "replicate-multi-image-kontext-max": {
            type: "image",
            quality: "high",
            aspectRatio: "1:1",
        },
        // Video models
        "veo-2.0-generate": {
            type: "video",
            aspectRatio: "16:9",
            duration: 5,
            generateAudio: false,
            resolution: "1080p",
            cameraFixed: false,
        },
        "veo-3.0-generate": {
            type: "video",
            aspectRatio: "16:9",
            duration: 8,
            generateAudio: true,
            resolution: "1080p",
            cameraFixed: false,
        },
        "replicate-seedance-1-pro": {
            type: "video",
            aspectRatio: "16:9",
            duration: 5,
            generateAudio: false,
            resolution: "1080p",
            cameraFixed: false,
        },
    };
    return defaults[modelName] || defaults["replicate-flux-11-pro"];
};

// Function to migrate old settings to new structure
const migrateSettings = (oldSettings) => {
    if (oldSettings.models) {
        return oldSettings; // Already migrated
    }

    const newSettings = {
        models: {
            // Image models
            "replicate-flux-1-schnell": {
                type: "image",
                quality: oldSettings.image?.defaultQuality || "draft",
                aspectRatio: oldSettings.image?.defaultAspectRatio || "1:1",
            },
            "replicate-flux-11-pro": {
                type: "image",
                quality: "high",
                aspectRatio: oldSettings.image?.defaultAspectRatio || "1:1",
            },
            "replicate-flux-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "match_input_image",
            },
            "replicate-multi-image-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
            },
            // Video models
            "veo-2.0-generate": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: oldSettings.video?.defaultDuration || 5,
                generateAudio: oldSettings.video?.defaultGenerateAudio || false,
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
            "veo-3.0-generate": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: 8,
                generateAudio:
                    oldSettings.video?.defaultGenerateAudio !== false, // Default to true for Veo 3.0
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
            "replicate-seedance-1-pro": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: oldSettings.video?.defaultDuration || 5,
                generateAudio: oldSettings.video?.defaultGenerateAudio || false,
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
        },
        // Keep legacy settings for backward compatibility
        image: oldSettings.image || {
            defaultQuality: "high",
            defaultModel: "replicate-flux-11-pro",
            defaultAspectRatio: "1:1",
        },
        video: oldSettings.video || {
            defaultModel: "replicate-seedance-1-pro",
            defaultAspectRatio: "16:9",
            defaultDuration: 5,
            defaultGenerateAudio: false,
            defaultResolution: "1080p",
            defaultCameraFixed: false,
        },
    };

    return newSettings;
};

function MediaPage() {
    const { direction } = useContext(LanguageContext);
    const { userState, debouncedUpdateUserState } = useContext(AuthContext);
    const [prompt, setPrompt] = useState("");
    const [generationPrompt, setGenerationPrompt] = useState("");
    const [quality, setQuality] = useState("draft");
    const [outputType, setOutputType] = useState("image"); // "image" or "video"
    const [selectedModel, setSelectedModel] = useState("replicate-flux-11-pro"); // Current selected model - Flux Pro as default
    const [showSettings, setShowSettings] = useState(false);
    const runTask = useRunTask();
    const [settings, setSettings] = useState({
        models: {
            // Image models
            "replicate-flux-1-schnell": {
                type: "image",
                quality: "draft",
                aspectRatio: "1:1",
            },
            "replicate-flux-11-pro": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
            },
            "replicate-flux-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "match_input_image",
            },
            "replicate-multi-image-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
            },
            // Video models
            "veo-2.0-generate": {
                type: "video",
                aspectRatio: "16:9",
                duration: 5,
                generateAudio: false,
                resolution: "1080p",
                cameraFixed: false,
            },
            "veo-3.0-generate": {
                type: "video",
                aspectRatio: "16:9",
                duration: 8,
                generateAudio: true,
                resolution: "1080p",
                cameraFixed: false,
            },
            "replicate-seedance-1-pro": {
                type: "video",
                aspectRatio: "16:9",
                duration: 5,
                generateAudio: false,
                resolution: "1080p",
                cameraFixed: false,
            },
        },
        // Legacy support - will be migrated
        image: {
            defaultQuality: "high",
            defaultModel: "replicate-flux-11-pro",
            defaultAspectRatio: "1:1",
        },
        video: {
            defaultModel: "replicate-seedance-1-pro",
            defaultAspectRatio: "16:9",
            defaultDuration: 5,
            defaultGenerateAudio: false,
            defaultResolution: "1080p",
            defaultCameraFixed: false,
        },
    });

    // New media items API with pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);

    const {
        data: mediaItemsData = { mediaItems: [], pagination: {} },
        isLoading: mediaItemsLoading,
    } = useMediaItems(currentPage, pageSize);

    // Use mediaItems from API instead of local state
    const images = useMemo(
        () => mediaItemsData.mediaItems || [],
        [mediaItemsData.mediaItems],
    );

    // Memoize sorted images by creation date (newest first) - only if we have data
    const sortedImages = useMemo(() => {
        if (images && images.length > 0) {
            return [...images].sort((a, b) => b.created - a.created);
        }
        return [];
    }, [images]);

    const pagination = mediaItemsData.pagination || {};

    const [showModal, setShowModal] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [selectedImages, setSelectedImages] = useState(new Set());
    const [lastSelectedImage, setLastSelectedImage] = useState(null);
    const [isModifyMode, setIsModifyMode] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
    const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] =
        useState(false);
    const [isMigrationInProgress, setIsMigrationInProgress] = useState(false);
    const promptRef = useRef(null);
    const createMediaItem = useCreateMediaItem();
    const deleteMediaItem = useDeleteMediaItem();
    const migrateMediaItems = useMigrateMediaItems();

    // No longer needed - images are managed by the API now

    // Load settings from user state (only when user state changes)
    useEffect(() => {
        if (userState?.media?.settings && !isMigrationInProgress) {
            const migratedSettings = migrateSettings(userState.media.settings);
            setSettings(migratedSettings);
        }
    }, [userState?.media?.settings, isMigrationInProgress]);

    // No longer need to load images from user state - they come from the API now

    // Migrate from localStorage on first load (run only once)
    useEffect(() => {
        // Check if migration has already been completed
        const migrationCompleted = localStorage.getItem(
            "media-migration-completed",
        );
        if (migrationCompleted === "true") {
            return;
        }

        const localSettings = localStorage.getItem("media-generation-settings");
        const localMediaItems = localStorage.getItem("generated-media");

        // Check if there's data to migrate
        const hasDataToMigrate = localSettings || localMediaItems;
        if (!hasDataToMigrate) {
            // Mark migration as completed even if no data to migrate
            localStorage.setItem("media-migration-completed", "true");
            return;
        }

        // Add a flag to prevent multiple migrations in development mode
        const migrationInProgress = localStorage.getItem(
            "media-migration-in-progress",
        );
        if (migrationInProgress === "true") {
            console.log("🔄 Migration already in progress, skipping...");
            return;
        }

        // Run migration inline to avoid dependency issues
        const runMigration = async () => {
            console.log("🔄 Starting migration process...");
            localStorage.setItem("media-migration-in-progress", "true");
            setIsMigrationInProgress(true);
            try {
                // Migrate settings first
                if (localSettings) {
                    try {
                        const parsedSettings = JSON.parse(localSettings);
                        const settings = migrateSettings(parsedSettings);
                        debouncedUpdateUserState({
                            media: { settings },
                        });
                    } catch (error) {
                        console.warn(
                            "Failed to parse localStorage settings:",
                            error,
                        );
                    }
                }

                // Migrate media items
                if (localMediaItems) {
                    try {
                        const parsedMediaItems = JSON.parse(localMediaItems);
                        console.log(
                            `📦 Found ${parsedMediaItems.length} media items to migrate:`,
                            parsedMediaItems.map((item) => ({
                                cortexRequestId: item.cortexRequestId,
                                type: item.type,
                                prompt: item.prompt,
                            })),
                        );

                        if (
                            Array.isArray(parsedMediaItems) &&
                            parsedMediaItems.length > 0
                        ) {
                            const result =
                                await migrateMediaItems.mutateAsync(
                                    parsedMediaItems,
                                );
                            console.log("✅ Migration result:", result);
                        }
                    } catch (error) {
                        console.warn(
                            "Failed to migrate media items from localStorage:",
                            error,
                        );
                    }
                }

                // Clear localStorage after successful migration
                localStorage.removeItem("media-generation-settings");
                localStorage.removeItem("generated-media");

                // Mark migration as completed
                localStorage.setItem("media-migration-completed", "true");
            } catch (error) {
                console.error("Migration failed:", error);
                // Don't mark as completed if there was an error
            } finally {
                setIsMigrationInProgress(false);
                localStorage.removeItem("media-migration-in-progress");
            }
        };

        runMigration();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // No longer needed - images come from API

    // Get available models based on current input conditions (for validation only)
    const getAvailableModels = useCallback(() => {
        // If no images, return all models (no restrictions)
        if (!sortedImages || sortedImages.length === 0) {
            return Object.keys(settings.models || {});
        }

        // Filter out videos from selected images - only count images as input
        const selectedImageObjects = sortedImages.filter(
            (img) =>
                selectedImages.has(img.cortexRequestId) && img.type === "image",
        );
        const hasInputImage = selectedImageObjects.length === 1;
        const hasTwoInputImages = selectedImageObjects.length === 2;

        const allModels = Object.keys(settings.models || {});
        const availableModels = allModels.filter((modelName) => {
            const modelSettings = settings.models[modelName];
            const modelType = modelSettings?.type || "image";

            // Apply input condition restrictions
            if (modelType === "image") {
                if (hasTwoInputImages) {
                    // Only multi-image models for 2 input images
                    return modelName === "replicate-multi-image-kontext-max";
                } else if (hasInputImage) {
                    // Only kontext-max for 1 input image
                    return modelName === "replicate-flux-kontext-max";
                } else {
                    // Only regular image models for text-only
                    return [
                        "replicate-flux-1-schnell",
                        "replicate-flux-11-pro",
                    ].includes(modelName);
                }
            } else {
                // Video models - only available for 0 or 1 input images
                if (hasTwoInputImages) {
                    return false; // No video models support 2 input images
                } else if (hasInputImage) {
                    // Only Veo 2.0, Veo 3.0 and Seedance support input images
                    return [
                        "veo-2.0-generate",
                        "veo-3.0-generate",
                        "replicate-seedance-1-pro",
                    ].includes(modelName);
                } else {
                    // All video models available for text-only
                    return true;
                }
            }
        });

        return availableModels;
    }, [selectedImages, sortedImages, settings]);

    // Apply intelligent model selection based on input conditions
    useEffect(() => {
        const availableModels = getAvailableModels();

        // Check if current model is still available for current input conditions
        const isCurrentModelAvailable = availableModels.includes(selectedModel);

        if (!isCurrentModelAvailable) {
            // Current model is no longer available, switch to appropriate model
            const newModel = availableModels[0];

            if (newModel) {
                setSelectedModel(newModel);
                // Update output type based on the new model
                const newModelSettings = getModelSettings(settings, newModel);
                if (newModelSettings.type === "image") {
                    setOutputType("image");
                    setQuality(newModelSettings.quality || "draft");
                } else {
                    setOutputType("video");
                }
            }
        }
    }, [
        selectedImages,
        sortedImages,
        settings,
        selectedModel,
        getAvailableModels,
    ]);

    const generateMedia = useCallback(
        async (prompt, inputImageUrl = null, modelOverride = null) => {
            // Determine which model to use
            const modelToUse = modelOverride || selectedModel;

            // Determine the model name based on input conditions
            let modelName = modelToUse;
            if (outputType === "image" && inputImageUrl) {
                modelName = modelOverride || "replicate-flux-kontext-max";
            }

            setLoading(true);
            try {
                const taskData = {
                    type: "media-generation",
                    prompt,
                    outputType,
                    model: modelName,
                    inputImageUrl: inputImageUrl || "",
                    inputImageUrl2: "", // For multi-image generation
                    settings,
                    source: "media_page",
                };

                const result = await runTask.mutateAsync(taskData);

                if (result.taskId) {
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
                setLoading(false);
                console.error(`Error generating ${outputType}:`, error);
            } finally {
                setLoading(false);
            }
        },
        [outputType, selectedModel, settings, runTask, createMediaItem],
    );

    useEffect(() => {
        // Only consider images for modify mode, not videos
        const selectedImageObjects = sortedImages.filter(
            (img) =>
                selectedImages.has(img.cortexRequestId) && img.type === "image",
        );
        setIsModifyMode(
            selectedImageObjects.length === 1 ||
                selectedImageObjects.length === 2,
        );
    }, [selectedImages, sortedImages]);

    const handleModifySelected = useCallback(async () => {
        if (!prompt.trim() || selectedImages.size === 0) return;

        const selectedImageObjects = sortedImages.filter(
            (img) =>
                selectedImages.has(img.cortexRequestId) &&
                img.url &&
                img.type === "image",
        );

        for (const image of selectedImageObjects) {
            setLoading(true);
            try {
                const combinedPrompt = image.prompt
                    ? `${image.prompt} - ${prompt}`
                    : prompt;

                // For Veo models, use GCS URL; for others, use Azure URL
                const isVeoModel = selectedModel.includes("veo");
                const inputImageUrl = isVeoModel
                    ? image.gcsUrl || image.azureUrl || image.url
                    : image.azureUrl || image.gcsUrl || image.url;

                const taskData = {
                    type: "media-generation",
                    prompt: combinedPrompt,
                    outputType,
                    model:
                        outputType === "image"
                            ? "replicate-flux-kontext-max"
                            : selectedModel,
                    inputImageUrl: inputImageUrl,
                    inputImageUrl2: "",
                    settings,
                    source: "media_page",
                };

                const result = await runTask.mutateAsync(taskData);

                if (result.taskId) {
                    // Create placeholder in the database
                    const mediaItemData = {
                        taskId: result.taskId,
                        cortexRequestId: result.taskId,
                        prompt: combinedPrompt,
                        type: outputType,
                        model: selectedModel,
                        status: "pending",
                        settings: settings,
                    };

                    // Only add inputImageUrl if it exists
                    if (image.url) {
                        mediaItemData.inputImageUrl = image.url;
                    }

                    await createMediaItem.mutateAsync(mediaItemData);
                }
            } catch (error) {
                setLoading(false);
                console.error(`Error modifying ${outputType}:`, error);
            } finally {
                setLoading(false);
            }
        }

        // Keep existing selection and focus prompt box
        setTimeout(() => {
            promptRef.current && promptRef.current.focus();
        }, 0);
    }, [
        prompt,
        selectedImages,
        sortedImages,
        outputType,
        selectedModel,
        settings,
        runTask,
        createMediaItem,
    ]);

    const handleCombineSelected = useCallback(async () => {
        if (!prompt.trim() || selectedImages.size !== 2) return;

        const selectedImageObjects = sortedImages.filter(
            (img) =>
                selectedImages.has(img.cortexRequestId) &&
                img.url &&
                img.type === "image",
        );

        if (selectedImageObjects.length !== 2) return;

        const [image1, image2] = selectedImageObjects;

        setLoading(true);
        try {
            const combinedPrompt =
                outputType === "image"
                    ? `${image1.prompt} + ${image2.prompt} - ${prompt}`
                    : `${image1.prompt} - ${prompt}`;

            // For Veo models, use GCS URL; for others, use Azure URL
            const isVeoModel = selectedModel.includes("veo");
            const inputImageUrl1 = isVeoModel
                ? image1.gcsUrl || image1.azureUrl || image1.url
                : image1.azureUrl || image1.gcsUrl || image1.url;
            const inputImageUrl2 = isVeoModel
                ? image2.gcsUrl || image2.azureUrl || image2.url
                : image2.azureUrl || image2.gcsUrl || image2.url;

            const taskData = {
                type: "media-generation",
                prompt: combinedPrompt,
                outputType,
                model:
                    outputType === "image"
                        ? "replicate-multi-image-kontext-max"
                        : selectedModel,
                inputImageUrl: inputImageUrl1,
                inputImageUrl2: outputType === "image" ? inputImageUrl2 : "",
                settings,
                source: "media_page",
            };

            const result = await runTask.mutateAsync(taskData);

            if (result.taskId) {
                // Create placeholder in the database
                const mediaItemData = {
                    taskId: result.taskId,
                    cortexRequestId: result.taskId,
                    prompt: combinedPrompt,
                    type: outputType,
                    model: selectedModel,
                    status: "pending",
                    settings: settings,
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
            setLoading(false);
            console.error(
                `Error combining ${outputType === "image" ? "images" : "videos"}:`,
                error,
            );
        } finally {
            setLoading(false);
        }
    }, [
        prompt,
        selectedImages,
        sortedImages,
        outputType,
        selectedModel,
        settings,
        runTask,
        createMediaItem,
    ]);

    const handleFileUpload = useCallback(
        async (file) => {
            if (!file) return;

            setIsUploading(true);
            const serverUrl = "/media-helper";

            try {
                // Start showing upload progress
                const fileHash = await hashMediaFile(file);

                // Check if file exists first
                try {
                    const url = new URL(serverUrl, window.location.origin);
                    url.searchParams.set("hash", fileHash);
                    url.searchParams.set("checkHash", "true");

                    const checkResponse = await axios.get(url.toString());
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
                        setIsUploading(false);
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

                const uploadUrl = new URL(serverUrl, window.location.origin);
                uploadUrl.searchParams.set("hash", fileHash);

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
                    setTimeout(() => {
                        promptRef.current && promptRef.current.focus();
                    }, 0);
                }
            } catch (error) {
                console.error("Error uploading file:", error);
            } finally {
                setIsUploading(false);
            }
        },
        [t, createMediaItem, settings],
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

    const handleBulkAction = useCallback(
        (action) => {
            if (action === "delete") {
                setShowDeleteSelectedConfirm(true);
            } else if (action === "download") {
                sortedImages.forEach((img) => {
                    if (
                        selectedImages.has(img.cortexRequestId) &&
                        (img.azureUrl || img.url)
                    ) {
                        window.open(img.azureUrl || img.url, "_blank");
                    }
                });
                setSelectedImages(new Set());
            }
        },
        [sortedImages, selectedImages],
    );

    const handleDeleteSelected = useCallback(async () => {
        // Delete selected media items from database
        for (const image of sortedImages) {
            if (selectedImages.has(image.cortexRequestId)) {
                await deleteMediaItem.mutateAsync(image.taskId);
            }
        }

        setSelectedImages(new Set());
        setShowDeleteSelectedConfirm(false);
    }, [sortedImages, selectedImages, deleteMediaItem]);

    const handleDeleteAll = useCallback(async () => {
        // Delete all media items for the current user
        for (const image of sortedImages) {
            await deleteMediaItem.mutateAsync(image.taskId);
        }

        setSelectedImages(new Set());
        setShowDeleteAllConfirm(false);
    }, [sortedImages, deleteMediaItem]);

    const mediaTiles = useMemo(() => {
        return sortedImages.map((image, index) => {
            // Since we now preserve cortexRequestId, we can use it directly
            const key = image?.cortexRequestId || `temp-${index}`;

            return (
                <ImageTile
                    key={`image-${key}`}
                    image={image}
                    quality={quality}
                    selectedImages={selectedImages}
                    setSelectedImages={setSelectedImages}
                    lastSelectedImage={lastSelectedImage}
                    setLastSelectedImage={setLastSelectedImage}
                    images={sortedImages}
                    setShowDeleteSelectedConfirm={setShowDeleteSelectedConfirm}
                    onClick={() => {
                        if (image?.url) {
                            setSelectedImage(image);
                            setShowModal(true);
                        }
                    }}
                    onRegenerate={async () => {
                        // Delete the old media item first (regenerate replaces it)
                        await deleteMediaItem.mutateAsync(image.taskId);

                        // Use the original model and prompt for regeneration
                        const originalModel = image.model || selectedModel;
                        const originalPrompt = image.prompt;

                        if (image.inputImageUrl) {
                            // Regenerate modification with same input image and original model
                            await generateMedia(
                                originalPrompt,
                                image.azureUrl ||
                                    image.inputImageUrl ||
                                    image.url,
                                originalModel,
                            );
                        } else {
                            // Regular regenerate with original model
                            await generateMedia(
                                originalPrompt,
                                null,
                                originalModel,
                            );
                        }
                    }}
                    onGenerationComplete={async (requestId, data) => {
                        // This function is no longer needed since background tasks handle completion
                        // The user state will be updated automatically by the background task
                        console.log(
                            "Media generation completed:",
                            requestId,
                            data,
                        );
                    }}
                    onDelete={async (image) => {
                        // Delete the media item from database
                        await deleteMediaItem.mutateAsync(image.taskId);

                        if (generationPrompt === image.prompt) {
                            setGenerationPrompt("");
                        }

                        // Clear selection if the deleted image was selected
                        if (selectedImages.has(image.cortexRequestId)) {
                            const newSelectedImages = new Set(selectedImages);
                            newSelectedImages.delete(image.cortexRequestId);
                            setSelectedImages(newSelectedImages);
                        }
                    }}
                />
            );
        });
    }, [
        sortedImages,
        generationPrompt,
        generateMedia,
        quality,
        selectedImages,
        lastSelectedImage,
        setLastSelectedImage,
        setShowDeleteSelectedConfirm,
        selectedModel,
        deleteMediaItem,
    ]);

    return (
        <div>
            <div className="flex flex-col gap-4">
                <div className="mb-4">
                    <form
                        className="flex flex-col gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!prompt.trim()) return;
                            setGenerationPrompt(prompt);
                            if (isModifyMode) {
                                if (selectedImages.size === 2) {
                                    handleCombineSelected();
                                } else if (selectedImages.size === 1) {
                                    handleModifySelected();
                                } else {
                                    generateMedia(prompt);
                                }
                            } else {
                                generateMedia(prompt);
                            }
                        }}
                    >
                        <textarea
                            className="lb-input flex-grow min-h-[2.5rem] max-h-32 resize-y"
                            placeholder={
                                selectedImages.size > 0
                                    ? t(
                                          "Describe what you want to do with the selected media",
                                      )
                                    : t("Describe what you want to generate")
                            }
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (!prompt.trim()) return;
                                    setGenerationPrompt(prompt);
                                    if (isModifyMode) {
                                        if (selectedImages.size === 2) {
                                            handleCombineSelected();
                                        } else if (selectedImages.size === 1) {
                                            handleModifySelected();
                                        } else {
                                            generateMedia(prompt);
                                        }
                                    } else {
                                        generateMedia(prompt);
                                    }
                                }
                            }}
                            ref={promptRef}
                            onFocus={(e) => e.target.select()}
                        />

                        <div className="flex gap-2 items-center media-toolbar-row">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <label className="lb-input flex items-center justify-center settings-btn-square text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer">
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleFileSelect}
                                                disabled={isUploading}
                                            />
                                            {isUploading ? (
                                                <Loader2 className="animate-spin" />
                                            ) : (
                                                <Plus />
                                            )}
                                        </label>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Upload Image")}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="lb-input flex items-center justify-center settings-btn-square text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                            onClick={() =>
                                                setShowSettings(true)
                                            }
                                        >
                                            <Settings />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Generation Settings")}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <select
                                className="lb-input flex-1 media-toolbar-dropdown"
                                value={selectedModel}
                                dir={direction}
                                onChange={(e) => {
                                    const newSelectedModel = e.target.value;
                                    const modelSettings = getModelSettings(
                                        settings,
                                        newSelectedModel,
                                    );

                                    setSelectedModel(newSelectedModel);

                                    if (modelSettings.type === "image") {
                                        setOutputType("image");
                                        setQuality(
                                            modelSettings.quality || "draft",
                                        );
                                    } else {
                                        setOutputType("video");
                                    }
                                }}
                            >
                                {getAvailableModels().map((modelName) => {
                                    const modelSettings =
                                        settings.models[modelName];
                                    const displayName =
                                        {
                                            "replicate-flux-1-schnell":
                                                "Flux Draft",
                                            "replicate-flux-11-pro": "Flux Pro",
                                            "replicate-flux-kontext-max":
                                                "Flux Kontext Max",
                                            "replicate-multi-image-kontext-max":
                                                "Multi-Image Kontext Max",
                                            "veo-2.0-generate": "Veo 2.0",
                                            "veo-3.0-generate": "Veo 3.0",
                                            "replicate-seedance-1-pro":
                                                "Seedance 1.0",
                                        }[modelName] || modelName;

                                    return (
                                        <option
                                            key={modelName}
                                            value={modelName}
                                        >
                                            {modelSettings?.type === "image"
                                                ? "Image"
                                                : "Video"}{" "}
                                            ({displayName})
                                        </option>
                                    );
                                })}
                            </select>

                            <button
                                className="lb-primary whitespace-nowrap flex items-center justify-center relative"
                                type="submit"
                                disabled={!prompt.trim() || loading}
                            >
                                <span
                                    className={
                                        loading ? "invisible" : "visible"
                                    }
                                >
                                    {t("Generate")}
                                </span>
                                {loading && (
                                    <Loader2 className="animate-spin h-4 w-4 absolute" />
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {sortedImages.length > 0 && (
                <div className="flex justify-end items-center gap-2 mb-4">
                    <div className="text-sm text-gray-500 mr-2">
                        {selectedImages.size > 0 && (
                            <span>
                                {selectedImages.size} {t("selected")}
                            </span>
                        )}
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                    disabled={selectedImages.size === 0}
                                    onClick={() => handleBulkAction("download")}
                                >
                                    <Download />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t("Download Selected")}
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                    disabled={selectedImages.size === 0}
                                    onClick={() => handleBulkAction("delete")}
                                >
                                    <Trash2 />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t("Delete Selected")}
                            </TooltipContent>
                        </Tooltip>

                        <div className="w-px h-4 bg-gray-300 mx-1" />

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                    onClick={() =>
                                        setShowDeleteAllConfirm(true)
                                    }
                                >
                                    <Trash2 />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>{t("Delete All")}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}

            {mediaItemsLoading || isMigrationInProgress ? (
                <div className="flex justify-center items-center py-8">
                    <Loader2 className="animate-spin h-8 w-8 text-gray-500" />
                    <span className="ml-2 text-gray-500">
                        {isMigrationInProgress
                            ? t("Migrating media from localStorage...")
                            : t("Loading media...")}
                    </span>
                </div>
            ) : (
                <>
                    <div className="media-grid">{mediaTiles}</div>

                    {/* Pagination Controls */}
                    {pagination.total > pageSize && (
                        <div className="flex justify-center items-center gap-4 mt-8 mb-4">
                            <button
                                onClick={() =>
                                    setCurrentPage(Math.max(1, currentPage - 1))
                                }
                                disabled={!pagination.hasPrev}
                                className="lb-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t("Previous")}
                            </button>

                            <span className="text-sm text-gray-600">
                                {t("Page")} {pagination.page} {t("of")}{" "}
                                {pagination.pages}
                                {pagination.total > 0 && (
                                    <span className="ml-2">
                                        ({pagination.total} {t("total")})
                                    </span>
                                )}
                            </span>

                            <button
                                onClick={() =>
                                    setCurrentPage(
                                        Math.min(
                                            pagination.pages,
                                            currentPage + 1,
                                        ),
                                    )
                                }
                                disabled={!pagination.hasNext}
                                className="lb-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t("Next")}
                            </button>
                        </div>
                    )}
                </>
            )}
            <ImageModal
                show={showModal}
                image={selectedImage}
                onHide={() => {
                    setShowModal(false);
                    setTimeout(() => {
                        setSelectedImage(null);
                    }, 300);
                }}
            />

            <AlertDialog
                open={showDeleteAllConfirm}
                onOpenChange={setShowDeleteAllConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete All Media?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete all media? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction autoFocus onClick={handleDeleteAll}>
                            {t("Delete All Media")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={showDeleteSelectedConfirm}
                onOpenChange={setShowDeleteSelectedConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete Selected Media?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete the selected media? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={handleDeleteSelected}
                        >
                            {t("Delete Selected Media")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <SettingsDialog
                show={showSettings}
                settings={settings}
                setSettings={setSettings}
                onHide={() => setShowSettings(false)}
                debouncedUpdateUserState={debouncedUpdateUserState}
                userState={userState}
            />
        </div>
    );
}

function SettingsDialog({
    show,
    settings,
    setSettings,
    onHide,
    debouncedUpdateUserState,
    userState,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [localSettings, setLocalSettings] = useState(settings);
    const [selectedModel, setSelectedModel] = useState(
        "replicate-flux-1-schnell",
    );

    // Initialize localSettings when dialog opens
    useEffect(() => {
        if (show) {
            setLocalSettings(settings);
        }
    }, [show, settings]); // Include settings dependency - necessary to avoid infinite re-renders

    const handleSave = () => {
        setSettings(localSettings);
        // Save settings to user state
        debouncedUpdateUserState({
            media: {
                ...userState?.media,
                settings: localSettings,
            },
        });
        onHide();
    };

    const handleCancel = () => {
        // Don't update localSettings on cancel - just close the dialog
        onHide();
    };

    const updateModelSetting = (modelName, key, value) => {
        setLocalSettings((prev) => ({
            ...prev,
            models: {
                ...prev.models,
                [modelName]: {
                    ...prev.models[modelName],
                    [key]: value,
                },
            },
        }));
    };

    const getModelDisplayName = (modelName) => {
        const names = {
            "replicate-flux-1-schnell": "Flux Draft",
            "replicate-flux-11-pro": "Flux Pro",
            "replicate-flux-kontext-max": "Flux Kontext Max",
            "replicate-multi-image-kontext-max": "Multi-Image Kontext Max",
            "veo-2.0-generate": "Veo 2.0",
            "veo-3.0-generate": "Veo 3.0",
            "replicate-seedance-1-pro": "Seedance 1.0",
        };
        return names[modelName] || modelName;
    };

    const getModelType = (modelName) => {
        return localSettings.models[modelName]?.type || "image";
    };

    const getAvailableAspectRatios = (modelName) => {
        const modelType = getModelType(modelName);
        if (modelType === "video") {
            if (modelName.startsWith("veo")) {
                return [
                    { value: "16:9", label: "16:9" },
                    { value: "9:16", label: "9:16" },
                ];
            } else {
                return [
                    { value: "16:9", label: "16:9" },
                    { value: "4:3", label: "4:3" },
                    { value: "9:16", label: "9:16" },
                    { value: "1:1", label: "1:1" },
                    { value: "3:4", label: "3:4" },
                    { value: "21:9", label: "21:9" },
                    { value: "9:21", label: "9:21" },
                ];
            }
        } else {
            // Base aspect ratios for all image models
            const baseRatios = [
                { value: "1:1", label: "1:1" },
                { value: "16:9", label: "16:9" },
                { value: "21:9", label: "21:9" },
                { value: "3:2", label: "3:2" },
                { value: "2:3", label: "2:3" },
                { value: "4:5", label: "4:5" },
                { value: "5:4", label: "5:4" },
                { value: "3:4", label: "3:4" },
                { value: "4:3", label: "4:3" },
                { value: "9:16", label: "9:16" },
                { value: "9:21", label: "9:21" },
            ];

            // Only Kontext models support "match_input_image"
            if (modelName.includes("kontext")) {
                baseRatios.push({
                    value: "match_input_image",
                    label: "Match Input Image",
                });
            }

            return baseRatios;
        }
    };

    const getAvailableDurations = (modelName) => {
        if (modelName === "veo-3.0-generate") {
            return [{ value: 8, label: "8s" }];
        } else if (modelName === "veo-2.0-generate") {
            return [
                { value: 5, label: "5s" },
                { value: 6, label: "6s" },
                { value: 7, label: "7s" },
                { value: 8, label: "8s" },
            ];
        } else if (modelName === "replicate-seedance-1-pro") {
            return [
                { value: 5, label: "5s" },
                { value: 10, label: "10s" },
            ];
        }
        return [];
    };

    const modelNames = Object.keys(localSettings.models || {});
    const currentModelSettings = localSettings.models?.[selectedModel] || {};

    return (
        <Modal
            show={show}
            onHide={handleCancel}
            title={t("Generation Settings")}
        >
            <div className="space-y-6">
                {/* Model Selection */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        {t("Select Model")}
                    </label>
                    <select
                        className="lb-input w-full"
                        value={selectedModel}
                        dir={direction}
                        onChange={(e) => setSelectedModel(e.target.value)}
                    >
                        {modelNames.map((modelName) => (
                            <option key={modelName} value={modelName}>
                                {getModelDisplayName(modelName)}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Model Settings */}
                <div>
                    <h3 className="text-lg font-semibold mb-3">
                        {getModelDisplayName(selectedModel)} {t("Settings")}
                    </h3>

                    <div className="space-y-3">
                        {/* Aspect Ratio */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                {t("Aspect Ratio")}
                            </label>
                            <select
                                className="lb-input w-full"
                                value={
                                    currentModelSettings.aspectRatio || "1:1"
                                }
                                dir={direction}
                                onChange={(e) =>
                                    updateModelSetting(
                                        selectedModel,
                                        "aspectRatio",
                                        e.target.value,
                                    )
                                }
                            >
                                {getAvailableAspectRatios(selectedModel).map(
                                    (ratio) => (
                                        <option
                                            key={ratio.value}
                                            value={ratio.value}
                                        >
                                            {ratio.label}
                                        </option>
                                    ),
                                )}
                            </select>
                        </div>

                        {/* Duration (for video models) */}
                        {getModelType(selectedModel) === "video" &&
                            getAvailableDurations(selectedModel).length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        {t("Duration (seconds)")}
                                    </label>
                                    <select
                                        className="lb-input w-full"
                                        value={
                                            currentModelSettings.duration || 5
                                        }
                                        dir={direction}
                                        onChange={(e) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "duration",
                                                parseInt(e.target.value),
                                            )
                                        }
                                    >
                                        {getAvailableDurations(
                                            selectedModel,
                                        ).map((duration) => (
                                            <option
                                                key={duration.value}
                                                value={duration.value}
                                            >
                                                {duration.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                        {/* Resolution (for non-Veo video models) */}
                        {getModelType(selectedModel) === "video" &&
                            !selectedModel.startsWith("veo") && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        {t("Resolution")}
                                    </label>
                                    <select
                                        className="lb-input w-full"
                                        value={
                                            currentModelSettings.resolution ||
                                            "1080p"
                                        }
                                        dir={direction}
                                        onChange={(e) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "resolution",
                                                e.target.value,
                                            )
                                        }
                                    >
                                        <option value="480p">480p</option>
                                        <option value="1080p">1080p</option>
                                    </select>
                                </div>
                            )}

                        {/* Generate Audio (for Veo 3.0) */}
                        {selectedModel === "veo-3.0-generate" && (
                            <div>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        className="lb-checkbox"
                                        checked={
                                            selectedModel === "veo-3.0-generate"
                                                ? currentModelSettings.generateAudio !==
                                                  false // Default to true for Veo 3.0
                                                : currentModelSettings.generateAudio ||
                                                  false
                                        }
                                        onChange={(e) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "generateAudio",
                                                e.target.checked,
                                            )
                                        }
                                    />
                                    <span className="text-sm font-medium">
                                        {t("Generate Audio")}
                                    </span>
                                </label>
                            </div>
                        )}

                        {/* Camera Fixed (for Seedance) */}
                        {selectedModel === "replicate-seedance-1-pro" && (
                            <div>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        className="lb-checkbox"
                                        checked={
                                            currentModelSettings.cameraFixed ||
                                            false
                                        }
                                        onChange={(e) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "cameraFixed",
                                                e.target.checked,
                                            )
                                        }
                                    />
                                    <span className="text-sm font-medium">
                                        {t("Camera Fixed")}
                                    </span>
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
                <button className="lb-secondary" onClick={handleCancel}>
                    {t("Cancel")}
                </button>
                <button className="lb-primary" onClick={handleSave}>
                    {t("Save Settings")}
                </button>
            </div>
        </Modal>
    );
}

function Progress({
    requestId,
    taskId,
    prompt,
    quality,
    onDataReceived,
    inputImageUrl,
    outputType,
    mode,
}) {
    const [data, setData] = useState(null);
    const { t } = useTranslation();

    // Use taskId if available, otherwise fall back to requestId
    const id = taskId || requestId;

    if (!id) {
        return null;
    }

    if (id && !data) {
        return (
            <ProgressUpdate
                initialText={t("Generating...")}
                requestId={id}
                mode={mode || (outputType === "video" ? "spinner" : "progress")}
                setFinalData={(finalData) => {
                    // Update local state to stop showing spinner
                    setData(finalData);

                    // If data is already an object with error, pass it through
                    if (finalData?.result?.error) {
                        onDataReceived({ result: finalData.result, prompt });
                        return;
                    }

                    try {
                        const parsedData = JSON.parse(finalData);
                        onDataReceived({ result: { ...parsedData }, prompt });
                    } catch (e) {
                        console.error("Error parsing data", e);
                        onDataReceived({
                            result: {
                                error: {
                                    code: "PARSE_ERROR",
                                    message: `Failed to generate ${outputType || "media"}`,
                                },
                            },
                            prompt,
                        });
                    }
                }}
                autoDuration={
                    outputType === "video"
                        ? null
                        : !inputImageUrl && quality === "draft"
                          ? 1000
                          : 10000
                }
            />
        );
    }
}

function ImageTile({
    image,
    onClick,
    onDelete,
    onRegenerate,
    onGenerationComplete,
    quality,
    selectedImages,
    setSelectedImages,
    lastSelectedImage,
    setLastSelectedImage,
    images,
    setShowDeleteSelectedConfirm,
}) {
    const [loadError, setLoadError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    // Always use Azure URL for display - GCS URL is only for internal model use
    const url = image?.azureUrl || image?.url;
    const { t } = useTranslation();
    const expired = image?.expires ? image.expires < Date.now() / 1000 : false;
    const { cortexRequestId, prompt, result, regenerating, uploading, error } =
        image || {};
    const { code, message } = error || result?.error || {};
    const isSelected = selectedImages.has(cortexRequestId);

    const handleSelection = (e) => {
        e.stopPropagation();
        const newSelectedImages = new Set(selectedImages);

        if (e.shiftKey && lastSelectedImage) {
            // Find indices of last selected and current image
            const lastIndex = images.findIndex(
                (img) => img.cortexRequestId === lastSelectedImage,
            );
            const currentIndex = images.findIndex(
                (img) => img.cortexRequestId === cortexRequestId,
            );

            // Select all images between last selected and current
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);

            for (let i = start; i <= end; i++) {
                newSelectedImages.add(images[i].cortexRequestId);
            }
        } else {
            // Normal click behavior
            if (isSelected) {
                newSelectedImages.delete(cortexRequestId);
            } else {
                newSelectedImages.add(cortexRequestId);
            }
        }

        setSelectedImages(newSelectedImages);
        setLastSelectedImage(cortexRequestId);
    };

    return (
        <div className="media-tile">
            {/* Selection checkbox - always visible */}
            <div
                className={`selection-checkbox ${isSelected ? "selected" : ""}`}
                onClick={handleSelection}
            >
                <Check
                    className={`text-sm ${isSelected ? "opacity-100" : "opacity-0"}`}
                />
            </div>

            <div className="media-wrapper relative" onClick={onClick}>
                {/* Action buttons overlay - top left */}
                <div className="absolute top-2 left-2 z-10 flex gap-1 opacity-0 hover:opacity-100 transition-opacity duration-200">
                    <button
                        className="lb-icon-button bg-white bg-opacity-80 hover:bg-opacity-100 text-gray-700 hover:text-gray-900 dark:bg-gray-800 dark:bg-opacity-80 dark:hover:bg-opacity-100 dark:text-gray-200 dark:hover:text-white shadow-sm"
                        title={t("Download")}
                        onClick={(e) => {
                            e.stopPropagation();
                            window.open(url, "_blank");
                        }}
                    >
                        <Download />
                    </button>
                    <button
                        className="lb-icon-button bg-white bg-opacity-80 hover:bg-opacity-100 text-gray-700 hover:text-gray-900 dark:bg-gray-800 dark:bg-opacity-80 dark:hover:bg-opacity-100 dark:text-gray-200 dark:hover:text-white shadow-sm"
                        title={t("Delete")}
                        onClick={(e) => {
                            e.stopPropagation();
                            // Select this image and trigger delete selected dialog
                            setSelectedImages(new Set([image.cortexRequestId]));
                            setShowDeleteSelectedConfirm(true);
                        }}
                    >
                        <Trash2 />
                    </button>
                </div>

                {regenerating ||
                (image?.status === "pending" && image?.taskId) ||
                (!url &&
                    !error &&
                    !result?.error &&
                    image?.status !== "completed" &&
                    image?.status !== "failed") ? (
                    <div className="h-full bg-gray-50 dark:bg-gray-700 p-4 text-sm flex items-center justify-center">
                        <ProgressComponent />
                    </div>
                ) : uploading ? (
                    <div className="h-full bg-gray-50 dark:bg-gray-700 p-4 text-sm flex items-center justify-center">
                        <UploadComponent />
                    </div>
                ) : !expired && url && !loadError ? (
                    image.type === "video" ? (
                        <div className="relative w-full h-full">
                            <video
                                src={url}
                                className="w-full h-full object-cover object-center"
                                preload="metadata"
                                onError={() => {
                                    if (retryCount < 2) {
                                        setRetryCount((prev) => prev + 1);
                                        // Reset loadError to allow retry
                                        setLoadError(false);
                                    } else {
                                        setLoadError(true);
                                    }
                                }}
                                onLoad={() => {
                                    setLoadError(false);
                                    setRetryCount(0);
                                }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 hover:bg-opacity-30 transition-all duration-200">
                                <div className="w-12 h-12 bg-white bg-opacity-50 rounded-full flex items-center justify-center shadow-lg">
                                    <svg
                                        className="w-6 h-6 text-gray-800 ml-1"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <ChatImage
                            src={url}
                            alt={prompt}
                            onError={() => setLoadError(true)}
                            onLoad={() => setLoadError(false)}
                            className="w-full h-full object-cover object-center"
                        />
                    )
                ) : (
                    <div className="h-full bg-gray-50 dark:bg-gray-700 p-4 text-sm flex items-center justify-center">
                        {cortexRequestId &&
                            !url &&
                            !code &&
                            !image?.taskId &&
                            image?.status !== "failed" &&
                            (result ? <NoImageError /> : <ProgressComponent />)}
                        {code === "ERR_BAD_REQUEST" && <BadRequestError />}
                        {code && code !== "ERR_BAD_REQUEST" && <OtherError />}
                        {expired && url && <ExpiredImageComponent />}
                        {loadError && <ExpiredImageComponent />}
                    </div>
                )}
            </div>

            <div className="media-prompt" title={prompt}>
                {prompt}
            </div>
        </div>
    );

    function ProgressComponent() {
        return (
            <div>
                <Progress
                    requestId={cortexRequestId}
                    taskId={image?.taskId}
                    prompt={prompt}
                    quality={quality}
                    onDataReceived={(data) =>
                        onGenerationComplete(cortexRequestId, data)
                    }
                    inputImageUrl={image?.inputImageUrl}
                    outputType={image?.type || "image"}
                    mode="spinner"
                />
            </div>
        );
    }

    function UploadComponent() {
        return (
            <div className="flex flex-col items-center gap-2 text-gray-500">
                <ProgressUpdate
                    initialText={t("Uploading to cloud...")}
                    mode="spinner"
                />
            </div>
        );
    }

    function BadRequestError() {
        return (
            <div className="text-center">
                <div>
                    {t(
                        `${image.type === "video" ? "Video" : "Image"} blocked by safety system.`,
                    )}
                </div>
            </div>
        );
    }

    function OtherError() {
        return (
            <div className="text-center flex flex-col items-center justify-center h-full">
                <div>{`${t(`${image.type === "video" ? "Video" : "Image"} Error: `)} ${message}`}</div>
                <div className="mt-4">
                    {image.type === "video" ? (
                        <button
                            className="lb-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                // For videos, just reload the page to retry
                                window.location.reload();
                            }}
                        >
                            {t("Reload")}
                        </button>
                    ) : !image.model ? null : (
                        <button
                            className="lb-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRegenerate();
                            }}
                        >
                            {t("Regenerate")}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    function ExpiredImageComponent() {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <div className="mb-4 text-center">
                    {t(
                        `${image.type === "video" ? "Video" : "Image"} expired or not available.`,
                    )}
                </div>
                <div>
                    {image.type === "video" ? (
                        <button
                            className="lb-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                // For videos, just reload the page to retry
                                window.location.reload();
                            }}
                        >
                            {t("Reload")}
                        </button>
                    ) : !image.model ? null : (
                        <button
                            className="lb-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRegenerate();
                            }}
                        >
                            {t("Regenerate")}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    function NoImageError() {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center">
                    {t(
                        `Generation completed but no ${image.type === "video" ? "video" : "image"} was produced.`,
                    )}
                </div>
                <div className="mt-4">
                    {image.type === "video" ? (
                        <button
                            className="lb-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                // For videos, just reload the page to retry
                                window.location.reload();
                            }}
                        >
                            {t("Reload")}
                        </button>
                    ) : !image.model ? null : (
                        <button
                            className="lb-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRegenerate();
                            }}
                        >
                            {t("Regenerate")}
                        </button>
                    )}
                </div>
            </div>
        );
    }
}

function ImageModal({ show, image, onHide }) {
    const { t } = useTranslation();

    return (
        <Modal
            show={show}
            onHide={onHide}
            title={t(`Generated ${image?.type || "image"}`)}
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                <div className="sm:basis-9/12">
                    {image?.type === "video" ? (
                        <video
                            className="rounded-md w-full"
                            src={image?.azureUrl || image?.url}
                            controls
                            preload="metadata"
                        />
                    ) : (
                        <ChatImage
                            className="rounded-md w-full"
                            src={image?.azureUrl || image?.url}
                            alt={image?.prompt}
                        />
                    )}
                </div>
                <div className="sm:basis-3/12 flex flex-col max-h-[400px]">
                    <div className="sm:text-sm">
                        <ImageInfo data={image} type={image?.type || "image"} />
                    </div>
                    <div className="flex-grow overflow-hidden">
                        <div className="font-semibold text-gray-500 sm:text-sm">
                            {t("Prompt")}
                        </div>
                        <div className="h-full">
                            <textarea
                                className="w-full p-2 rounded-md bg-gray-50 dark:bg-gray-700 sm:text-sm overflow-y-auto"
                                value={image?.prompt}
                                readOnly
                                style={{
                                    height: "100%",
                                    maxHeight: "calc(100% - 1.5rem)",
                                    minHeight: "3rem",
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="justify-end flex gap-2 mt-4">
                <button className="lb-primary" onClick={onHide}>
                    {t("Close")}
                </button>
            </div>
        </Modal>
    );
}

function ImageInfo({ data, type }) {
    const { t } = useTranslation();

    const getModelDisplayName = (modelName) => {
        const names = {
            "replicate-flux-1-schnell": "Flux Draft",
            "replicate-flux-11-pro": "Flux Pro",
            "replicate-flux-kontext-max": "Flux Kontext Max",
            "replicate-multi-image-kontext-max": "Multi-Image Kontext Max",
            "veo-2.0-generate": "Veo 2.0",
            "veo-3.0-generate": "Veo 3.0",
            "replicate-seedance-1-pro": "Seedance 1.0",
        };
        return names[modelName] || modelName;
    };

    return (
        <div>
            <div className="mb-2">
                <div>
                    <div className="font-semibold text-gray-500">
                        {t("Created")}
                    </div>
                </div>
                <div>
                    {data?.created
                        ? new Date(data?.created * 1000).toLocaleString()
                        : t("(not found)")}
                </div>
            </div>
            {data?.model && (
                <div className="mb-2">
                    <div>
                        <div className="font-semibold text-gray-500">
                            {t("Model")}
                        </div>
                    </div>
                    <div>{getModelDisplayName(data.model)}</div>
                </div>
            )}
            <div className="mb-2">
                <div>
                    <div className="font-semibold text-gray-500">
                        {t("Azure URL")}
                    </div>
                </div>
                <div style={{ lineBreak: "anywhere" }}>
                    {data?.azureUrl ? (
                        <a
                            href={data.azureUrl}
                            target="_blank"
                            className="text-sky-500"
                            rel="noreferrer"
                        >
                            {t("Azure Link")}
                        </a>
                    ) : (
                        <span className="text-gray-400">
                            {t("Not uploaded")}
                        </span>
                    )}
                </div>
            </div>
            {data?.gcsUrl && (
                <div className="mb-2">
                    <div>
                        <div className="font-semibold text-gray-500">
                            {t("GCS URL")}
                        </div>
                    </div>
                    <div style={{ lineBreak: "anywhere" }}>
                        <a
                            href={data.gcsUrl}
                            target="_blank"
                            className="text-sky-500"
                            rel="noreferrer"
                        >
                            {t("GCS Link")}
                        </a>
                    </div>
                </div>
            )}
            {!data?.azureUrl && (
                <div className="mb-2">
                    <div>
                        <div className="font-semibold text-gray-500">
                            {t("Original URL")}
                        </div>
                    </div>
                    <div style={{ lineBreak: "anywhere" }}>
                        {data?.url ? (
                            <a
                                href={data.url}
                                target="_blank"
                                className="text-sky-500"
                                rel="noreferrer"
                            >
                                {t("Original Link")}
                            </a>
                        ) : (
                            t("URL not found")
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MediaPage;
