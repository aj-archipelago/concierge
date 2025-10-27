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
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import {
    Download,
    Trash2,
    Plus,
    Settings,
    Loader2,
    X,
    Tag,
} from "lucide-react";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { AuthContext } from "../../App";
import { Modal } from "../../../@/components/ui/modal";

import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "../../../@/components/ui/tooltip";
import ChatImage from "./ChatImage";
import ImageTile from "./ImageTile";
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
    useInfiniteMediaItems,
    useCreateMediaItem,
    useDeleteMediaItem,
    useMigrateMediaItems,
    useUpdateMediaItemTags,
} from "../../../app/queries/media-items";

// Import extracted modules and hooks
import {
    getModelSettings,
    mergeNewModels,
    migrateSettings,
    DEFAULT_MODEL_SETTINGS,
} from "./config/models";
import { useMediaSelection } from "./hooks/useMediaSelection";
import { useBulkOperations } from "./hooks/useBulkOperations";
import { useModelSelection } from "./hooks/useModelSelection";
import { useMediaGeneration } from "./hooks/useMediaGeneration";
import { useFileUpload } from "./hooks/useFileUpload";
import "./Media.scss";

function MediaPage() {
    const { direction } = useContext(LanguageContext);
    const { userState, debouncedUpdateUserState } = useContext(AuthContext);
    const [prompt, setPrompt] = useState("");
    const [generationPrompt, setGenerationPrompt] = useState("");
    const [quality, setQuality] = useState("draft");
    const [outputType, setOutputType] = useState("image"); // "image" or "video"
    const [selectedModel, setSelectedModel] = useState("replicate-flux-11-pro"); // Current selected model - Flux Pro as default
    const [showSettings, setShowSettings] = useState(false);
    const [disableTooltip, setDisableTooltip] = useState(false);
    const [filterText, setFilterText] = useState("");
    const [debouncedFilterText, setDebouncedFilterText] = useState("");
    const filterInputRef = useRef(null);
    const wasInputFocusedRef = useRef(false);
    const runTask = useRunTask();

    // Disable tooltip when settings dialog is open or just closed
    useEffect(() => {
        if (showSettings) {
            setDisableTooltip(true);
        } else {
            // Keep disabled briefly after closing to prevent reappearance
            const timer = setTimeout(() => {
                setDisableTooltip(false);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [showSettings]);
    const [settings, setSettings] = useState({
        models: DEFAULT_MODEL_SETTINGS,
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

    // Infinite scroll for media items API
    const {
        data: mediaItemsData,
        isLoading: mediaItemsLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteMediaItems(debouncedFilterText);

    // Flatten all pages into a single array
    const images = useMemo(() => {
        if (!mediaItemsData?.pages) return [];
        return mediaItemsData.pages.flatMap((page) => page.mediaItems || []);
    }, [mediaItemsData?.pages]);

    // Memoize sorted images by creation date (newest first) - only if we have data
    const sortedImages = useMemo(() => {
        if (images && images.length > 0) {
            return [...images].sort((a, b) => b.created - a.created);
        }
        return [];
    }, [images]);

    // Infinite scroll detection and triggering
    const { ref, shouldShowLoading } = useInfiniteScroll({
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
    });

    const [showModal, setShowModal] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const { t } = useTranslation();
    const [loading] = useState(false);
    const [isModifyMode, setIsModifyMode] = useState(false);
    const [isUploading] = useState(false);
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
    const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] =
        useState(false);
    const [isMigrationInProgress, setIsMigrationInProgress] = useState(false);
    const [showDownloadError, setShowDownloadError] = useState(false);
    const [downloadError, setDownloadError] = useState("");
    const [showBulkTagDialog, setShowBulkTagDialog] = useState(false);
    const [bulkTagInput, setBulkTagInput] = useState("");
    const promptRef = useRef(null);
    const bulkTagInputRef = useRef(null);
    const createMediaItem = useCreateMediaItem();
    const deleteMediaItem = useDeleteMediaItem();
    const migrateMediaItems = useMigrateMediaItems();
    const updateTagsMutation = useUpdateMediaItemTags();

    // Use custom selection hook
    const {
        selectedImages,
        selectedImagesObjects,
        lastSelectedImage,
        setLastSelectedImage,
        clearSelection,
        setSelectedImages,
        setSelectedImagesObjects,
        getImageCount,
    } = useMediaSelection();

    // Reset selection when filter changes
    useEffect(() => {
        clearSelection();
    }, [debouncedFilterText, clearSelection]);

    // Debounce filter text to prevent API calls on every keystroke
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilterText(filterText);
        }, 300); // 300ms delay

        return () => clearTimeout(timer);
    }, [filterText]);

    // Restore focus to filter input after re-renders
    useEffect(() => {
        if (filterInputRef.current && wasInputFocusedRef.current) {
            filterInputRef.current.focus();
        }
    }, [debouncedFilterText]);

    // Load settings from user state (only when user state changes)
    useEffect(() => {
        if (userState?.media?.settings && !isMigrationInProgress) {
            const migratedSettings = migrateSettings(userState.media.settings);
            const settingsWithNewModels = mergeNewModels(migratedSettings);
            setSettings(settingsWithNewModels);
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
                        const settingsWithNewModels = mergeNewModels(settings);
                        debouncedUpdateUserState({
                            media: { settings: settingsWithNewModels },
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

        // If no migration needed, ensure new models are available
        if (!hasDataToMigrate) {
            console.log(
                "🔄 No migration needed, ensuring new models are available...",
            );
            // Get current settings and merge new models
            const currentSettings = userState?.media?.settings || {};
            const settingsWithNewModels = mergeNewModels(currentSettings);

            // Only update if we actually added new models
            const hasNewModels =
                Object.keys(settingsWithNewModels.models || {}).length >
                Object.keys(currentSettings.models || {}).length;

            if (hasNewModels) {
                debouncedUpdateUserState({
                    media: { settings: settingsWithNewModels },
                });
            }
        } else {
            runMigration();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Use custom model selection hook
    const { getAvailableModels } = useModelSelection({
        selectedImagesObjects,
        sortedImages,
        settings,
        selectedModel,
        setSelectedModel,
        setOutputType,
        setQuality,
        getModelSettings,
    });

    // Use custom media generation hook
    const {
        generateMedia,
        handleModifySelected: handleModifySelectedHook,
        handleCombineSelected: handleCombineSelectedHook,
    } = useMediaGeneration({
        selectedModel,
        outputType,
        settings,
        runTask,
        createMediaItem,
        promptRef,
    });

    useEffect(() => {
        // Only consider images for modify mode, not videos
        const imageCount = getImageCount();
        setIsModifyMode(imageCount === 1 || imageCount === 2);
    }, [selectedImagesObjects, getImageCount]);

    // Wrapper functions to pass required parameters to hooks
    const handleModifySelectedWrapper = useCallback(async () => {
        await handleModifySelectedHook({
            prompt,
            selectedImagesObjects,
            outputType,
            selectedModel,
            settings,
            runTask,
            createMediaItem,
            promptRef,
        });
    }, [
        prompt,
        selectedImagesObjects,
        outputType,
        selectedModel,
        settings,
        runTask,
        createMediaItem,
        promptRef,
        handleModifySelectedHook,
    ]);

    const handleCombineSelectedWrapper = useCallback(async () => {
        await handleCombineSelectedHook({
            prompt,
            selectedImagesObjects,
            outputType,
            selectedModel,
            settings,
            runTask,
            createMediaItem,
            promptRef,
        });
    }, [
        prompt,
        selectedImagesObjects,
        outputType,
        selectedModel,
        settings,
        runTask,
        createMediaItem,
        promptRef,
        handleCombineSelectedHook,
    ]);

    // Use wrapper functions that call the custom hooks
    const handleModifySelected = handleModifySelectedWrapper;
    const handleCombineSelected = handleCombineSelectedWrapper;

    // Use custom file upload hook
    const { handleFileSelect } = useFileUpload({
        createMediaItem,
        settings,
        t,
        promptRef,
        setSelectedImages,
        setSelectedImagesObjects,
    });

    // Use custom bulk operations hook
    const {
        handleBulkAction,
        handleDeleteSelected,
        handleDeleteAll,
        checkDownloadLimits,
    } = useBulkOperations({
        selectedImagesObjects,
        deleteMediaItem,
        setSelectedImages,
        setSelectedImagesObjects,
        setShowDeleteSelectedConfirm,
        t,
    });

    // Wrapper for handleDeleteAll to pass sortedImages
    const handleDeleteAllWrapper = useCallback(async () => {
        await handleDeleteAll(
            sortedImages,
            deleteMediaItem,
            setShowDeleteAllConfirm,
        );
    }, [
        sortedImages,
        deleteMediaItem,
        setShowDeleteAllConfirm,
        handleDeleteAll,
    ]);

    const handleClearSelection = clearSelection;

    // Handle download with error handling
    const handleDownload = useCallback(async () => {
        try {
            await handleBulkAction("download");
        } catch (error) {
            setDownloadError(error.message);
            setShowDownloadError(true);
        }
    }, [handleBulkAction]);

    // Handle bulk tagging
    const handleBulkTag = useCallback(async () => {
        if (!bulkTagInput.trim() || selectedImagesObjects.length === 0) return;

        const newTag = bulkTagInput.trim();

        try {
            // Update tags for all selected images
            const updatePromises = selectedImagesObjects.map(async (image) => {
                const currentTags = image.tags || [];
                const updatedTags = [...currentTags];

                // Add the new tag if it doesn't already exist
                if (!updatedTags.includes(newTag)) {
                    updatedTags.push(newTag);
                }

                return updateTagsMutation.mutateAsync({
                    taskId: image.taskId,
                    tags: updatedTags,
                });
            });

            await Promise.all(updatePromises);

            // Close dialog and clear input
            setShowBulkTagDialog(false);
            setBulkTagInput("");
        } catch (error) {
            console.error("Error updating tags:", error);
        }
    }, [bulkTagInput, selectedImagesObjects, updateTagsMutation]);

    // Check if download is disabled due to limits
    const downloadLimits = checkDownloadLimits();
    const isDownloadDisabled = !downloadLimits.allowed;

    const mediaTiles = useMemo(() => {
        return sortedImages.map((image, index) => {
            // Since we now preserve cortexRequestId, we can use it directly
            const key = image?.cortexRequestId || `temp-${index}`;
            // Check if URL is valid (not null, undefined, or "null" string)
            const hasValidUrl =
                (image?.azureUrl || image?.url) &&
                (image?.azureUrl || image?.url) !== "null" &&
                (image?.azureUrl || image?.url) !== "undefined";

            return (
                <ImageTile
                    key={`image-${key}`}
                    image={image}
                    quality={quality}
                    selectedImages={selectedImages}
                    setSelectedImages={setSelectedImages}
                    selectedImagesObjects={selectedImagesObjects}
                    setSelectedImagesObjects={setSelectedImagesObjects}
                    lastSelectedImage={lastSelectedImage}
                    setLastSelectedImage={setLastSelectedImage}
                    images={sortedImages}
                    setShowDeleteSelectedConfirm={setShowDeleteSelectedConfirm}
                    onClick={() => {
                        if (hasValidUrl) {
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

                            // Also remove from selectedImagesObjects
                            const newSelectedImagesObjects =
                                selectedImagesObjects.filter(
                                    (img) =>
                                        img.cortexRequestId !==
                                        image.cortexRequestId,
                                );
                            setSelectedImagesObjects(newSelectedImagesObjects);
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
        selectedImagesObjects,
        setSelectedImagesObjects,
        setSelectedImages,
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
                                if (
                                    selectedImages.size >= 2 &&
                                    selectedImages.size <= 3
                                ) {
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
                                        if (
                                            selectedImages.size >= 2 &&
                                            selectedImages.size <= 3
                                        ) {
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
                                <Tooltip
                                    open={disableTooltip ? false : undefined}
                                >
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
                                {(() => {
                                    const availableModels =
                                        getAvailableModels();
                                    const displayNames = {
                                        "replicate-flux-11-pro": t("Flux Pro"),
                                        "replicate-flux-kontext-max":
                                            t("Flux Kontext Max"),
                                        "replicate-multi-image-kontext-max": t(
                                            "Multi-Image Kontext Max",
                                        ),
                                        "gemini-25-flash-image-preview":
                                            t("Gemini Flash Image"),
                                        "replicate-qwen-image": t("Qwen Image"),
                                        "replicate-qwen-image-edit-plus": t(
                                            "Qwen Image Edit Plus",
                                        ),
                                        "replicate-seedream-4":
                                            t("Seedream 4.0"),
                                        "veo-2.0-generate": t("Veo 2.0"),
                                        "veo-3.0-generate": t("Veo 3.0"),
                                        "veo-3.1-generate": t("Veo 3.1"),
                                        "veo-3.1-fast-generate":
                                            t("Veo 3.1 Fast"),
                                        "replicate-seedance-1-pro":
                                            t("Seedance 1.0"),
                                    };

                                    const options = [];

                                    // Add image models group
                                    if (availableModels.image.length > 0) {
                                        availableModels.image.forEach(
                                            (modelName) => {
                                                const displayName =
                                                    displayNames[modelName] ||
                                                    modelName;
                                                options.push(
                                                    <option
                                                        key={modelName}
                                                        value={modelName}
                                                    >
                                                        🖼️ {displayName}
                                                    </option>,
                                                );
                                            },
                                        );
                                    }

                                    // Add video models group
                                    if (availableModels.video.length > 0) {
                                        availableModels.video.forEach(
                                            (modelName) => {
                                                const displayName =
                                                    displayNames[modelName] ||
                                                    modelName;
                                                options.push(
                                                    <option
                                                        key={modelName}
                                                        value={modelName}
                                                    >
                                                        🎬 {displayName}
                                                    </option>,
                                                );
                                            },
                                        );
                                    }

                                    return options;
                                })()}
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

            {/* Filter and Action Controls - Always visible */}
            <div className="flex justify-between items-center gap-4 mb-4">
                {/* Filter Search Control */}
                <div className="flex-1 max-w-md">
                    <div className="relative">
                        <input
                            type="text"
                            className="lb-input w-full pl-10"
                            placeholder={t(
                                "Filter by tags... (e.g., cat, cartoon)",
                            )}
                            value={filterText}
                            onChange={(e) => {
                                setFilterText(e.target.value);
                            }}
                            onFocus={() => {
                                wasInputFocusedRef.current = true;
                            }}
                            onBlur={() => {
                                wasInputFocusedRef.current = false;
                            }}
                            ref={filterInputRef}
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg
                                className="h-4 w-4 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                            </svg>
                        </div>
                        {filterText && (
                            <button
                                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                onClick={() => {
                                    setFilterText("");
                                    setDebouncedFilterText("");
                                }}
                            >
                                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
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
                                    className={`lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500 ${
                                        isDownloadDisabled
                                            ? "opacity-50 cursor-not-allowed"
                                            : ""
                                    }`}
                                    disabled={
                                        selectedImages.size === 0 ||
                                        isDownloadDisabled
                                    }
                                    onClick={handleDownload}
                                >
                                    <Download />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isDownloadDisabled
                                    ? downloadLimits.error
                                    : selectedImages.size === 1
                                      ? t("Download Selected")
                                      : t("Download ZIP of Selected Media")}
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

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                    disabled={selectedImages.size === 0}
                                    onClick={() => setShowBulkTagDialog(true)}
                                >
                                    <Tag />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t("Add Tag to Selected")}
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                    disabled={selectedImages.size === 0}
                                    onClick={handleClearSelection}
                                >
                                    <X />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t("Clear Selection")}
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
            </div>

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
                    {sortedImages.length > 0 ? (
                        <div className="media-grid">{mediaTiles}</div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="text-gray-400 mb-4">
                                <svg
                                    className="w-16 h-16 mx-auto"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1}
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                </svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                                {filterText
                                    ? t("No media found")
                                    : t("No media yet")}
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-4">
                                {filterText
                                    ? t(
                                          "Try adjusting your search or clear the filter",
                                      )
                                    : t("Generate some media to get started")}
                            </p>
                            {filterText && (
                                <button
                                    className="lb-primary"
                                    onClick={() => {
                                        setFilterText("");
                                        setDebouncedFilterText("");
                                    }}
                                >
                                    {t("Clear Filter")}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Infinite scroll trigger */}
                    {sortedImages.length > 0 && hasNextPage && (
                        <div ref={ref} className="flex justify-center py-8">
                            {shouldShowLoading ? (
                                <div className="flex items-center gap-2 text-gray-500">
                                    <Loader2 className="animate-spin h-5 w-5" />
                                    <span>{t("Loading more...")}</span>
                                </div>
                            ) : (
                                <div className="text-gray-400 text-sm">
                                    {t("Scroll for more")}
                                </div>
                            )}
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
                        <AlertDialogAction
                            autoFocus
                            onClick={handleDeleteAllWrapper}
                        >
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

            <AlertDialog
                open={showDownloadError}
                onOpenChange={setShowDownloadError}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Download limit exceeded")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {downloadError}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction
                            onClick={() => setShowDownloadError(false)}
                        >
                            {t("OK")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Tag Dialog */}
            <Modal
                show={showBulkTagDialog}
                onHide={() => {
                    setShowBulkTagDialog(false);
                    setBulkTagInput("");
                }}
                title={t("Add Tag to Selected Media")}
                initialFocus={bulkTagInputRef}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            {t("Tag")}
                        </label>
                        <input
                            type="text"
                            className="lb-input w-full"
                            placeholder={t("Enter tag name...")}
                            value={bulkTagInput}
                            onChange={(e) => setBulkTagInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleBulkTag();
                                }
                            }}
                            ref={bulkTagInputRef}
                        />
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {t(
                            "This tag will be added to {{count}} selected media items",
                            {
                                count: selectedImages.size,
                            },
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => {
                                setShowBulkTagDialog(false);
                                setBulkTagInput("");
                            }}
                        >
                            {t("Cancel")}
                        </button>
                        <button
                            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            onClick={handleBulkTag}
                            disabled={
                                !bulkTagInput.trim() ||
                                updateTagsMutation.isPending
                            }
                        >
                            {updateTagsMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t("Adding...")}
                                </>
                            ) : (
                                <>
                                    <Tag className="h-4 w-4" />
                                    {t("Add Tag")}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
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
    const [selectedModel, setSelectedModel] = useState("replicate-flux-11-pro");
    const initializedRef = useRef(false);

    // Initialize localSettings when dialog opens
    useEffect(() => {
        if (show) {
            // Always sync localSettings with the current settings when dialog opens
            // This ensures we always show the latest saved settings
            setLocalSettings(settings);
            initializedRef.current = true;
        } else if (!show) {
            initializedRef.current = false;
        }
    }, [show, settings]);

    const handleSave = () => {
        // Update local settings state immediately
        setSettings(localSettings);

        // Save settings to user state (debounced for server persistence)
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
            "replicate-flux-11-pro": t("Flux Pro"),
            "replicate-flux-kontext-max": t("Flux Kontext Max"),
            "replicate-multi-image-kontext-max": t("Multi-Image Kontext Max"),
            "gemini-25-flash-image-preview": t("Gemini Flash Image"),
            "replicate-qwen-image": t("Qwen Image"),
            "replicate-qwen-image-edit-plus": t("Qwen Image Edit Plus"),
            "replicate-seedream-4": t("Seedream 4.0"),
            "veo-2.0-generate": t("Veo 2.0"),
            "veo-3.0-generate": t("Veo 3.0"),
            "veo-3.1-generate": t("Veo 3.1"),
            "veo-3.1-fast-generate": t("Veo 3.1 Fast"),
            "replicate-seedance-1-pro": t("Seedance 1.0"),
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
            // Gemini doesn't support aspect ratio control
            if (modelName === "gemini-25-flash-image-preview") {
                return [];
            }

            // Qwen models have specific aspect ratio support
            if (modelName === "replicate-qwen-image") {
                return [
                    { value: "1:1", label: "1:1" },
                    { value: "16:9", label: "16:9" },
                    { value: "9:16", label: "9:16" },
                    { value: "4:3", label: "4:3" },
                    { value: "3:4", label: "3:4" },
                ];
            }

            if (modelName === "replicate-qwen-image-edit-plus") {
                return [
                    { value: "1:1", label: "1:1" },
                    { value: "16:9", label: "16:9" },
                    { value: "9:16", label: "9:16" },
                    { value: "4:3", label: "4:3" },
                    { value: "3:4", label: "3:4" },
                    {
                        value: "match_input_image",
                        label: t("Match Input Image"),
                    },
                ];
            }

            // Base aspect ratios for all other image models
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
        if (
            modelName === "veo-3.0-generate" ||
            modelName === "veo-3.1-generate" ||
            modelName === "veo-3.1-fast-generate"
        ) {
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

    // Group and sort models for SettingsDialog
    const allModelNames = Object.keys(localSettings.models || {});
    const imageModels = allModelNames
        .filter(
            (name) => (localSettings.models[name]?.type || "image") === "image",
        )
        .sort();
    const videoModels = allModelNames
        .filter(
            (name) => (localSettings.models[name]?.type || "image") === "video",
        )
        .sort();
    const modelNames = [...imageModels, ...videoModels];
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
                        {modelNames.map((modelName) => {
                            const modelType = getModelType(modelName);
                            const icon = modelType === "video" ? "🎬" : "🖼️";
                            return (
                                <option key={modelName} value={modelName}>
                                    {icon} {getModelDisplayName(modelName)}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {/* Model Settings */}
                <div>
                    <h3 className="text-lg font-semibold mb-3">
                        {getModelDisplayName(selectedModel)} {t("Settings")}
                    </h3>

                    <div className="space-y-3">
                        {/* Aspect Ratio - only show if model supports it */}
                        {getAvailableAspectRatios(selectedModel).length > 0 && (
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    {t("Aspect Ratio")}
                                </label>
                                <select
                                    className="lb-input w-full"
                                    value={
                                        currentModelSettings.aspectRatio ||
                                        "1:1"
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
                                    {getAvailableAspectRatios(
                                        selectedModel,
                                    ).map((ratio) => (
                                        <option
                                            key={ratio.value}
                                            value={ratio.value}
                                        >
                                            {ratio.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

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

                        {/* Generate Audio (for Veo 3.0+) */}
                        {(selectedModel === "veo-3.0-generate" ||
                            selectedModel === "veo-3.1-generate" ||
                            selectedModel === "veo-3.1-fast-generate") && (
                            <div>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        className="lb-checkbox"
                                        checked={
                                            selectedModel ===
                                                "veo-3.0-generate" ||
                                            selectedModel ===
                                                "veo-3.1-generate" ||
                                            selectedModel ===
                                                "veo-3.1-fast-generate"
                                                ? currentModelSettings.generateAudio !==
                                                  false // Default to true for Veo 3.0+
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

                        {/* Optimize Prompt (for Gemini) */}
                        {selectedModel === "gemini-25-flash-image-preview" && (
                            <div>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        className="lb-checkbox"
                                        checked={
                                            currentModelSettings.optimizePrompt !==
                                            false // Default to true
                                        }
                                        onChange={(e) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "optimizePrompt",
                                                e.target.checked,
                                            )
                                        }
                                    />
                                    <span className="text-sm font-medium">
                                        {t("Optimize Prompt")}
                                    </span>
                                </label>
                                <p className="text-xs text-gray-500 mt-1">
                                    {t(
                                        "Use AI to rewrite your prompt for better results",
                                    )}
                                </p>
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

function ImageModal({ show, image, onHide }) {
    const { t } = useTranslation();
    const [tags, setTags] = useState([]);
    const [newTag, setNewTag] = useState("");
    const updateTagsMutation = useUpdateMediaItemTags();
    const tagInputRef = useRef(null);

    // Initialize tags when image changes
    useEffect(() => {
        if (image?.tags) {
            setTags(image.tags);
        } else {
            setTags([]);
        }
    }, [image]);

    const addTag = async () => {
        if (!newTag.trim() || tags.includes(newTag.trim())) return;

        const updatedTags = [...tags, newTag.trim()];
        setTags(updatedTags);
        setNewTag("");

        // Update on server
        await updateTagsOnServer(updatedTags);

        // Restore focus after state update
        setTimeout(() => {
            if (tagInputRef.current) {
                tagInputRef.current.focus();
            }
        }, 0);
    };

    const removeTag = async (tagToRemove) => {
        const updatedTags = tags.filter((tag) => tag !== tagToRemove);
        setTags(updatedTags);

        // Update on server
        await updateTagsOnServer(updatedTags);
    };

    const updateTagsOnServer = async (updatedTags) => {
        if (!image?.taskId) return;

        try {
            await updateTagsMutation.mutateAsync({
                taskId: image.taskId,
                tags: updatedTags,
            });
        } catch (error) {
            console.error("Error updating tags:", error);
            // Revert tags on error
            setTags(image?.tags || []);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addTag();
        }
    };

    return (
        <Modal
            show={show}
            onHide={onHide}
            title={t(`Generated ${image?.type || "image"}`)}
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                <div className="sm:basis-7/12">
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
                <div className="sm:basis-5/12 flex flex-col max-h-[500px] overflow-y-auto overflow-x-hidden">
                    <div className="sm:text-sm flex-shrink-0">
                        <ImageInfo data={image} type={image?.type || "image"} />
                    </div>

                    {/* Tags Section */}
                    <div className="mb-4 flex-shrink-0">
                        <div className="font-semibold text-gray-500 sm:text-sm mb-2">
                            {t("Tags")}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                            {tags.map((tag, index) => (
                                <span
                                    key={index}
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                >
                                    #{tag}
                                    <button
                                        className="ml-1 hover:text-blue-600 dark:hover:text-blue-300"
                                        onClick={() => removeTag(tag)}
                                        disabled={updateTagsMutation.isPending}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                placeholder={t("Add tag...")}
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyPress={handleKeyPress}
                                disabled={updateTagsMutation.isPending}
                                ref={tagInputRef}
                            />
                            <button
                                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed w-14 flex items-center justify-center"
                                onClick={addTag}
                                disabled={
                                    !newTag.trim() ||
                                    updateTagsMutation.isPending
                                }
                            >
                                {updateTagsMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    t("Add")
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="flex-grow">
                        <div className="font-semibold text-gray-500 sm:text-sm mb-2">
                            {t("Prompt")}
                        </div>
                        <textarea
                            className="w-full p-2 rounded-md bg-gray-50 dark:bg-gray-700 sm:text-sm resize-none"
                            value={image?.prompt}
                            readOnly
                            rows={8}
                        />
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
            "replicate-flux-11-pro": t("Flux Pro"),
            "replicate-flux-kontext-max": t("Flux Kontext Max"),
            "replicate-multi-image-kontext-max": t("Multi-Image Kontext Max"),
            "gemini-25-flash-image-preview": t("Gemini Flash Image"),
            "replicate-qwen-image": t("Qwen Image"),
            "replicate-qwen-image-edit-plus": t("Qwen Image Edit Plus"),
            "replicate-seedream-4": t("Seedream 4.0"),
            "veo-2.0-generate": t("Veo 2.0"),
            "veo-3.0-generate": t("Veo 3.0"),
            "veo-3.1-generate": t("Veo 3.1"),
            "veo-3.1-fast-generate": t("Veo 3.1 Fast"),
            "replicate-seedance-1-pro": t("Seedance 1.0"),
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
            {data?.created && (
                <div className="mb-2">
                    <div>
                        <div className="font-semibold text-gray-500">
                            {t("Expires")}
                        </div>
                    </div>
                    <div>
                        {(() => {
                            const createdDate = new Date(data.created * 1000);
                            const expiresDate = new Date(
                                createdDate.getTime() +
                                    30 * 24 * 60 * 60 * 1000,
                            ); // Add 30 days
                            const now = new Date();
                            const daysUntilExpiry = Math.ceil(
                                (expiresDate.getTime() - now.getTime()) /
                                    (24 * 60 * 60 * 1000),
                            );
                            const isExpiringSoon = daysUntilExpiry <= 7;

                            return (
                                <span
                                    className={
                                        isExpiringSoon
                                            ? "text-red-500 font-semibold"
                                            : ""
                                    }
                                >
                                    {expiresDate.toLocaleString()}
                                    {isExpiringSoon && (
                                        <span className="ml-2 text-xs">
                                            ({daysUntilExpiry}{" "}
                                            {daysUntilExpiry === 1
                                                ? t("day")
                                                : t("days")}{" "}
                                            {t("remaining")})
                                        </span>
                                    )}
                                </span>
                            );
                        })()}
                    </div>
                </div>
            )}
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
