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
    Sparkles,
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
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "../../../@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
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
import { useMediaSelection } from "./hooks/useItemSelection";
import { useBulkOperations } from "./hooks/useBulkOperations";
import { useModelSelection } from "./hooks/useModelSelection";
import { useMediaGeneration } from "./hooks/useMediaGeneration";
import { useFileUpload } from "./hooks/useFileUpload";
import BulkActionsBar from "../common/BulkActionsBar";
import FilterInput from "../common/FilterInput";
import EmptyState from "../common/EmptyState";
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
    const [loading, setLoading] = useState(false);
    const [isModifyMode, setIsModifyMode] = useState(false);
    const [isUploading] = useState(false);
    const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] =
        useState(false);
    const [isMigrationInProgress, setIsMigrationInProgress] = useState(false);
    const [showDownloadError, setShowDownloadError] = useState(false);
    const [downloadError, setDownloadError] = useState("");
    const [showBulkTagDialog, setShowBulkTagDialog] = useState(false);
    const [bulkTagInput, setBulkTagInput] = useState("");
    const [isLoadingAll, setIsLoadingAll] = useState(false);
    const [shouldSelectAll, setShouldSelectAll] = useState(false);
    const promptRef = useRef(null);
    const bulkTagInputRef = useRef(null);
    const createMediaItem = useCreateMediaItem();
    const deleteMediaItem = useDeleteMediaItem();
    const migrateMediaItems = useMigrateMediaItems();
    const updateTagsMutation = useUpdateMediaItemTags();
    const [bottomActionsLeft, setBottomActionsLeft] = useState(null);
    const mediaContainerRef = useRef(null);
    const modelSelectorRef = useRef(null);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isImageBadgeHovered, setIsImageBadgeHovered] = useState(false);

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

    // Calculate position for floating bulk actions bar
    const updateBottomActionsPosition = useCallback(() => {
        if (typeof window === "undefined") {
            return;
        }
        const container = mediaContainerRef.current;
        if (container) {
            const rect = container.getBoundingClientRect();
            if (rect?.width) {
                setBottomActionsLeft(rect.left + rect.width / 2);
                return;
            }
        }
        setBottomActionsLeft(window.innerWidth / 2);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        updateBottomActionsPosition();
        window.addEventListener("resize", updateBottomActionsPosition);
        return () =>
            window.removeEventListener("resize", updateBottomActionsPosition);
    }, [updateBottomActionsPosition]);

    useEffect(() => {
        updateBottomActionsPosition();
    }, [updateBottomActionsPosition, selectedImages.size]);

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

    // Get current model settings for display
    const currentModelSettings = useMemo(() => {
        return getModelSettings(settings, selectedModel);
    }, [settings, selectedModel, getModelSettings]);

    // Count selected images for context badge
    const selectedImageCount = useMemo(() => {
        return selectedImagesObjects.filter((img) => img.type === "image")
            .length;
    }, [selectedImagesObjects]);

    // Detect dark mode for dropdown arrow
    useEffect(() => {
        const updateDarkMode = () => {
            const dark = document.documentElement.classList.contains("dark");
            setIsDarkMode(dark);
        };
        updateDarkMode();
        const observer = new MutationObserver(updateDarkMode);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

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
        setLoading,
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
    const { handleBulkAction, handleDeleteSelected, checkDownloadLimits } =
        useBulkOperations({
            selectedImagesObjects,
            deleteMediaItem,
            setSelectedImages,
            setSelectedImagesObjects,
            setShowDeleteSelectedConfirm,
            t,
        });

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

    // Load all pages before selecting all
    const handleSelectAll = useCallback(async () => {
        // If already all selected, just deselect
        if (selectedImages.size === sortedImages.length && !hasNextPage) {
            handleClearSelection();
            return;
        }

        // If there are more pages to load, load them first
        if (hasNextPage) {
            setIsLoadingAll(true);
            setShouldSelectAll(true);
            try {
                // Keep fetching pages - fetchNextPage returns updated query info
                let result = await fetchNextPage();
                while (result.hasNextPage && !result.isFetchingNextPage) {
                    result = await fetchNextPage();
                }
            } catch (error) {
                console.error("Error loading all pages:", error);
                setShouldSelectAll(false);
            } finally {
                setIsLoadingAll(false);
            }
        } else {
            // No more pages, just select what we have
            setSelectedImages(
                new Set(sortedImages.map((img) => img.cortexRequestId)),
            );
            setSelectedImagesObjects(sortedImages);
        }
    }, [
        selectedImages.size,
        sortedImages,
        hasNextPage,
        fetchNextPage,
        handleClearSelection,
        setSelectedImages,
        setSelectedImagesObjects,
    ]);

    // Effect to select all items once loading is complete
    useEffect(() => {
        if (shouldSelectAll && !isLoadingAll && !hasNextPage) {
            setSelectedImages(
                new Set(sortedImages.map((img) => img.cortexRequestId)),
            );
            setSelectedImagesObjects(sortedImages);
            setShouldSelectAll(false);
        }
    }, [
        shouldSelectAll,
        isLoadingAll,
        hasNextPage,
        sortedImages,
        setSelectedImages,
        setSelectedImagesObjects,
    ]);

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
                            setLoading(true);
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
                        {/* Container with border for prompt box and thin bar */}
                        <div className="border border-gray-300 dark:border-gray-600 rounded-xl p-3">
                            {/* Flex container for textarea and button */}
                            <div className="flex items-start gap-2">
                                <div className="flex-1">
                                    <AutosizeTextarea
                                        className="bg-transparent border-none outline-none min-h-[2.5rem] resize-y w-full focus:outline-none focus:ring-0 focus:border-0 p-0 ps-1 pt-1 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
                                        maxHeight={200}
                                        minHeight={40}
                                        placeholder={
                                            selectedImages.size > 0
                                                ? t(
                                                      "Describe what you want to do with the selected media",
                                                  )
                                                : t(
                                                      "Describe what you want to generate",
                                                  )
                                        }
                                        value={prompt}
                                        onChange={(e) =>
                                            setPrompt(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" &&
                                                !e.shiftKey
                                            ) {
                                                e.preventDefault();
                                                if (!prompt.trim()) return;
                                                setGenerationPrompt(prompt);
                                                if (isModifyMode) {
                                                    if (
                                                        selectedImages.size >=
                                                            2 &&
                                                        selectedImages.size <= 3
                                                    ) {
                                                        handleCombineSelected();
                                                    } else if (
                                                        selectedImages.size ===
                                                        1
                                                    ) {
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
                                </div>
                                {/* Selected images thumbnails - hidden on mobile */}
                                {selectedImageCount > 0 && (
                                    <div className="hidden md:flex items-start gap-1.5 flex-shrink-0">
                                        {selectedImagesObjects
                                            .filter(
                                                (img) => img.type === "image",
                                            )
                                            .slice(0, 3) // Show max 3 thumbnails
                                            .map((image) => {
                                                const imageUrl =
                                                    image?.azureUrl ||
                                                    image?.url;
                                                if (
                                                    !imageUrl ||
                                                    imageUrl === "null" ||
                                                    imageUrl === "undefined"
                                                )
                                                    return null;

                                                return (
                                                    <div
                                                        key={
                                                            image.cortexRequestId
                                                        }
                                                        className="relative w-10 h-10 rounded overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0"
                                                    >
                                                        <ChatImage
                                                            src={imageUrl}
                                                            alt={
                                                                image.prompt ||
                                                                ""
                                                            }
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                );
                                            })}
                                        {selectedImageCount > 3 && (
                                            <div className="flex items-center justify-center w-10 h-10 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
                                                +{selectedImageCount - 3}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* Generate button */}
                                <div className="flex items-start flex-shrink-0">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="submit"
                                                    className="border-none outline-none hover:bg-sky-700 dark:bg-sky-700 dark:hover:bg-sky-200 p-1.5 cursor-pointer hover:opacity-80 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 
                                                    bg-sky-600 text-white rounded-lg px-3 py-2 
                                                    text-sm justify-center"
                                                    disabled={
                                                        !prompt.trim() ||
                                                        loading
                                                    }
                                                >
                                                    {loading ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="h-4 w-4" />
                                                    )}
                                                    <span className="hidden md:block">
                                                        {t("Generate")}
                                                    </span>
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {t("Generate")}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </div>

                            {/* Thin bar with model selector and settings */}
                            <div className="flex md:items-center flex-col md:flex-row  gap-2">
                                {/* Model selector */}
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

                                    const getDisplayName = (modelName) => {
                                        return (
                                            displayNames[modelName] || modelName
                                        );
                                    };

                                    const getCurrentDisplayName = () => {
                                        const currentDisplayName =
                                            getDisplayName(selectedModel);
                                        const modelSettings = getModelSettings(
                                            settings,
                                            selectedModel,
                                        );
                                        const icon =
                                            modelSettings.type === "video"
                                                ? "🎬"
                                                : "🖼️";
                                        return `${icon} ${currentDisplayName}`;
                                    };

                                    return (
                                        <Select
                                            value={selectedModel}
                                            onValueChange={(
                                                newSelectedModel,
                                            ) => {
                                                const modelSettings =
                                                    getModelSettings(
                                                        settings,
                                                        newSelectedModel,
                                                    );

                                                setSelectedModel(
                                                    newSelectedModel,
                                                );

                                                if (
                                                    modelSettings.type ===
                                                    "image"
                                                ) {
                                                    setOutputType("image");
                                                    setQuality(
                                                        modelSettings.quality ||
                                                            "draft",
                                                    );
                                                } else {
                                                    setOutputType("video");
                                                }
                                            }}
                                        >
                                            <SelectTrigger
                                                ref={modelSelectorRef}
                                                className="bg-transparent border-none outline-none text-sm text-gray-700 dark:text-gray-300 ps-1 pe-2 py-1 h-auto max-w-[200px] shadow-none focus:ring-0 focus:ring-offset-0 hover:opacity-80"
                                                dir={direction}
                                            >
                                                <SelectValue>
                                                    {getCurrentDisplayName()}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent dir={direction}>
                                                {/* Image models group */}
                                                {availableModels.image.length >
                                                    0 && (
                                                    <SelectGroup>
                                                        <SelectLabel>
                                                            {t("Image Models")}
                                                        </SelectLabel>
                                                        {availableModels.image.map(
                                                            (modelName) => {
                                                                const displayName =
                                                                    getDisplayName(
                                                                        modelName,
                                                                    );
                                                                return (
                                                                    <SelectItem
                                                                        key={
                                                                            modelName
                                                                        }
                                                                        value={
                                                                            modelName
                                                                        }
                                                                    >
                                                                        🖼️{" "}
                                                                        {
                                                                            displayName
                                                                        }
                                                                    </SelectItem>
                                                                );
                                                            },
                                                        )}
                                                    </SelectGroup>
                                                )}
                                                {/* Video models group */}
                                                {availableModels.video.length >
                                                    0 && (
                                                    <SelectGroup>
                                                        <SelectLabel>
                                                            {t("Video Models")}
                                                        </SelectLabel>
                                                        {availableModels.video.map(
                                                            (modelName) => {
                                                                const displayName =
                                                                    getDisplayName(
                                                                        modelName,
                                                                    );
                                                                return (
                                                                    <SelectItem
                                                                        key={
                                                                            modelName
                                                                        }
                                                                        value={
                                                                            modelName
                                                                        }
                                                                    >
                                                                        🎬{" "}
                                                                        {
                                                                            displayName
                                                                        }
                                                                    </SelectItem>
                                                                );
                                                            },
                                                        )}
                                                    </SelectGroup>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    );
                                })()}

                                <div className="flex items-center gap-2">
                                    {/* Settings button */}
                                    <TooltipProvider>
                                        <Tooltip
                                            open={
                                                disableTooltip
                                                    ? false
                                                    : undefined
                                            }
                                        >
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="bg-transparent border-none outline-none text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 cursor-pointer hover:opacity-80 focus:outline-none"
                                                    onClick={() =>
                                                        setShowSettings(true)
                                                    }
                                                >
                                                    <Settings className="h-4 w-4" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {t("Generation Settings")}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    {/* Model settings display and image context badge */}
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                        {/* Model settings */}
                                        {currentModelSettings.aspectRatio && (
                                            <span className="px-1.5 py-0.5">
                                                {currentModelSettings.aspectRatio ===
                                                "match_input_image"
                                                    ? t("Match Input")
                                                    : currentModelSettings.aspectRatio}
                                            </span>
                                        )}
                                        {currentModelSettings.type ===
                                            "image" &&
                                            currentModelSettings.quality && (
                                                <span className="px-1.5 py-0.5 capitalize">
                                                    {
                                                        currentModelSettings.quality
                                                    }
                                                </span>
                                            )}
                                        {currentModelSettings.type ===
                                            "video" && (
                                            <>
                                                {currentModelSettings.duration && (
                                                    <span className="px-1.5 py-0.5">
                                                        {
                                                            currentModelSettings.duration
                                                        }
                                                        s
                                                    </span>
                                                )}
                                                {currentModelSettings.resolution && (
                                                    <span className="px-1.5 py-0.5">
                                                        {
                                                            currentModelSettings.resolution
                                                        }
                                                    </span>
                                                )}
                                                {currentModelSettings.generateAudio !==
                                                    undefined && (
                                                    <span className="px-1.5 py-0.5">
                                                        {currentModelSettings.generateAudio
                                                            ? t("Audio")
                                                            : t("No Audio")}
                                                    </span>
                                                )}
                                                {currentModelSettings.cameraFixed && (
                                                    <span className="px-1.5 py-0.5">
                                                        {t("Fixed Camera")}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                        {currentModelSettings.optimizePrompt && (
                                            <span className="px-1.5 py-0.5">
                                                {t("Optimized")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex ml-auto text-xs">
                                    {/* Image context badge */}
                                    {selectedImageCount > 0 && (
                                        <Popover
                                            open={isImageBadgeHovered}
                                            onOpenChange={
                                                setIsImageBadgeHovered
                                            }
                                        >
                                            <PopoverTrigger asChild>
                                                <span
                                                    className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 rounded-md cursor-pointer"
                                                    onMouseEnter={() =>
                                                        setIsImageBadgeHovered(
                                                            true,
                                                        )
                                                    }
                                                    onMouseLeave={() =>
                                                        setIsImageBadgeHovered(
                                                            false,
                                                        )
                                                    }
                                                >
                                                    {selectedImageCount}{" "}
                                                    {selectedImageCount === 1
                                                        ? t("image")
                                                        : t("images")}
                                                </span>
                                            </PopoverTrigger>
                                            <PopoverContent
                                                className="w-auto p-3"
                                                onMouseEnter={() =>
                                                    setIsImageBadgeHovered(true)
                                                }
                                                onMouseLeave={() =>
                                                    setIsImageBadgeHovered(
                                                        false,
                                                    )
                                                }
                                            >
                                                <div className="text-xs font-medium mb-2 text-gray-700 dark:text-gray-300">
                                                    {t("Selected Images")}
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xs">
                                                    {selectedImagesObjects
                                                        .filter(
                                                            (img) =>
                                                                img.type ===
                                                                "image",
                                                        )
                                                        .map((image) => {
                                                            const imageUrl =
                                                                image?.azureUrl ||
                                                                image?.url;
                                                            if (
                                                                !imageUrl ||
                                                                imageUrl ===
                                                                    "null" ||
                                                                imageUrl ===
                                                                    "undefined"
                                                            )
                                                                return null;

                                                            return (
                                                                <div
                                                                    key={
                                                                        image.cortexRequestId
                                                                    }
                                                                    className="relative aspect-square rounded overflow-hidden border border-gray-200 dark:border-gray-700"
                                                                >
                                                                    <ChatImage
                                                                        src={
                                                                            imageUrl
                                                                        }
                                                                        alt={
                                                                            image.prompt ||
                                                                            ""
                                                                        }
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    )}
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            {/* Filter and Action Controls - Always visible */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
                {/* Filter Search Control */}
                <FilterInput
                    value={filterText}
                    onChange={setFilterText}
                    onClear={() => {
                        setFilterText("");
                        setDebouncedFilterText("");
                    }}
                    placeholder={t(
                        'Search tags... (e.g., cat dog or "black cat")',
                    )}
                    className="w-full sm:flex-1 sm:max-w-md"
                />

                {/* Action Buttons */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
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
                                <label className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500 cursor-pointer flex items-center justify-center">
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileSelect}
                                        disabled={isUploading}
                                    />
                                    {isUploading ? (
                                        <Loader2 className="animate-spin h-5 w-5" />
                                    ) : (
                                        <Plus className="h-5 w-5" />
                                    )}
                                </label>
                            </TooltipTrigger>
                            <TooltipContent>{t("Upload Image")}</TooltipContent>
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
                        <div className="media-grid" ref={mediaContainerRef}>
                            {mediaTiles}
                        </div>
                    ) : (
                        <EmptyState
                            icon={
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
                            }
                            title={
                                filterText
                                    ? t("No media found")
                                    : t("No media yet")
                            }
                            description={
                                filterText
                                    ? t(
                                          "Try adjusting your search or clear the filter",
                                      )
                                    : t("Generate some media to get started")
                            }
                            action={
                                filterText
                                    ? () => {
                                          setFilterText("");
                                          setDebouncedFilterText("");
                                      }
                                    : null
                            }
                            actionLabel={filterText ? t("Clear Filter") : null}
                        />
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
                currentSelectedModel={selectedModel}
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
                            className="px-4 py-2 text-sm bg-sky-500 text-white rounded hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

            {/* Floating Bulk Actions Bar */}
            <BulkActionsBar
                selectedCount={selectedImages.size}
                allSelected={
                    selectedImages.size === sortedImages.length && !hasNextPage
                }
                onSelectAll={handleSelectAll}
                onClearSelection={handleClearSelection}
                bottomActionsLeft={bottomActionsLeft}
                isLoadingAll={isLoadingAll}
                actions={{
                    download: {
                        onClick: handleDownload,
                        disabled: isDownloadDisabled,
                        label:
                            selectedImages.size === 1
                                ? t("Download")
                                : t("Download ZIP"),
                        ariaLabel: `${t("Download")} (${selectedImages.size})`,
                    },
                    tag: {
                        onClick: () => setShowBulkTagDialog(true),
                        disabled: false,
                        label: t("Add Tag"),
                        ariaLabel: `${t("Add Tag")} (${selectedImages.size})`,
                    },
                    delete: {
                        onClick: () => handleBulkAction("delete"),
                        disabled: false,
                        label: t("Delete"),
                        ariaLabel: `${t("Delete")} (${selectedImages.size})`,
                    },
                }}
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
    currentSelectedModel,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [localSettings, setLocalSettings] = useState(settings);
    const [selectedModel, setSelectedModel] = useState(
        currentSelectedModel || "replicate-flux-11-pro",
    );
    const initializedRef = useRef(false);

    // Initialize localSettings and selectedModel when dialog opens
    useEffect(() => {
        if (show) {
            // Always sync localSettings with the current settings when dialog opens
            // This ensures we always show the latest saved settings
            setLocalSettings(settings);
            // Set the selected model to the current one from the main component
            if (currentSelectedModel) {
                setSelectedModel(currentSelectedModel);
            }
            initializedRef.current = true;
        } else if (!show) {
            initializedRef.current = false;
        }
    }, [show, settings, currentSelectedModel]);

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
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200"
                                >
                                    #{tag}
                                    <button
                                        className="ml-1 hover:text-sky-600 dark:hover:text-sky-300"
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
                                className="px-3 py-1 text-sm bg-sky-500 text-white rounded hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed w-14 flex items-center justify-center"
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
                            className="w-full p-2 rounded-md bg-gray-50 dark:bg-gray-700 sm:text-sm resize-none focus:outline-none focus:ring-0 focus:border-0"
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
