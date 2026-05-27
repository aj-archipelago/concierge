"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { useRunTask } from "../../../app/queries/notifications";
import { useTask } from "../../../app/queries/notifications";
import axios from "../../../app/utils/axios-client";

// Polling configuration constants
const MAX_POLLING_ATTEMPTS = 60; // Poll for up to 60 seconds (60 attempts * 1 second)
const MAX_NULL_URL_ATTEMPTS = 5; // Give up after 5 consecutive null URL findings

// Error types for better error handling and UI decisions
const ERROR_TYPES = {
    MEDIA_URL_UNAVAILABLE: "media_url_unavailable",
    TASK_FAILED: "task_failed",
    GENERATION_START_FAILED: "generation_start_failed",
};

export default function GenerateImageDialog({
    show,
    onHide,
    onImageGenerated,
    contextId,
    source = "write_page_featured_image",
}) {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState("");
    const [taskId, setTaskId] = useState(null);
    const [hasCheckedCompletion, setHasCheckedCompletion] = useState(false);
    const [error, setError] = useState(null);
    const [errorType, setErrorType] = useState(null);
    const [pollingElapsed, setPollingElapsed] = useState(0);
    const runTask = useRunTask();
    const { data: taskData } = useTask(taskId);

    // Default model for image generation
    const defaultModel = "gemini-31-flash-image-preview";

    // Watch for task completion and fetch media item URL
    useEffect(() => {
        if (!taskId || !taskData) return;

        if (taskData?.status === "completed" && !hasCheckedCompletion) {
            setHasCheckedCompletion(true);
            setError(null); // Clear any previous errors
            setErrorType(null);
            setPollingElapsed(0); // Reset polling timer

            // First, check if URL is directly in taskData.data (most common case)
            const imageUrlFromTaskData =
                taskData.data?.azureUrl ||
                taskData.data?.url ||
                taskData.data?.gcsUrl;

            console.log("Task completed, checking for URL:", {
                taskData,
                data: taskData.data,
                imageUrlFromTaskData,
            });

            if (imageUrlFromTaskData) {
                console.log(
                    "Found URL in taskData.data:",
                    imageUrlFromTaskData,
                );
                // Also pass hash if available in task data
                const hash = taskData.data?.hash;
                console.log("Found hash in taskData.data:", hash);
                onImageGenerated(imageUrlFromTaskData, hash);
                setTimeout(() => {
                    setPrompt("");
                    setTaskId(null);
                    setHasCheckedCompletion(false);
                    setError(null);
                    setErrorType(null);
                    onHide();
                }, 200);
                return;
            }

            // Check if task completed but URLs are explicitly null (backend issue)
            if (
                taskData.data &&
                taskData.data.url === null &&
                taskData.data.azureUrl === null &&
                taskData.data.gcsUrl === null
            ) {
                console.warn(
                    "Task completed but all URLs are null. Will poll media items API.",
                    taskData,
                );
            }

            // If not in taskData.data, poll media items
            let elapsedInterval = null;
            let pollingInterval = null;
            let attempts = 0;
            let nullUrlAttempts = 0; // Track how many times we found media item with null URLs

            const checkMediaItem = async () => {
                try {
                    // Query media items to find the one with matching taskId
                    const { data } = await axios.get(
                        `/api/media-items?page=1&limit=100`,
                    );
                    const mediaItem = data?.mediaItems?.find(
                        (item) => item.taskId === taskId,
                    );

                    console.log("Checking media item:", {
                        mediaItem,
                        taskId,
                        mediaItemsCount: data?.mediaItems?.length,
                        attempt: attempts + 1,
                    });

                    if (mediaItem) {
                        // Prefer azureUrl, fallback to url or gcsUrl
                        const imageUrl =
                            mediaItem.azureUrl ||
                            mediaItem.url ||
                            mediaItem.gcsUrl;
                        if (imageUrl) {
                            console.log(
                                "Found image URL in media item:",
                                imageUrl,
                            );
                            console.log(
                                "Found hash in media item:",
                                mediaItem.hash,
                            );
                            if (elapsedInterval) clearInterval(elapsedInterval);
                            if (pollingInterval) clearInterval(pollingInterval);
                            onImageGenerated(imageUrl, mediaItem.hash);
                            setTimeout(() => {
                                setPrompt("");
                                setTaskId(null);
                                setHasCheckedCompletion(false);
                                setError(null);
                                setErrorType(null);
                                setPollingElapsed(0);
                                onHide();
                            }, 200);
                            return true;
                        } else {
                            // Found media item but URLs are null
                            nullUrlAttempts++;
                            console.warn(
                                `Found media item but no URL available (attempt ${nullUrlAttempts}/${MAX_NULL_URL_ATTEMPTS}):`,
                                {
                                    mediaItem,
                                    azureUrl: mediaItem.azureUrl,
                                    url: mediaItem.url,
                                    gcsUrl: mediaItem.gcsUrl,
                                },
                            );

                            // If we've found the media item multiple times with null URLs,
                            // this is a backend issue - fail fast
                            if (nullUrlAttempts >= MAX_NULL_URL_ATTEMPTS) {
                                console.error(
                                    "Media item found but URLs remain null after multiple attempts. Backend issue detected.",
                                );
                                return "null_urls"; // Special return value to indicate this error
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error fetching media item:", error);
                }

                return false;
            };

            const startPolling = async () => {
                // Start elapsed time counter
                elapsedInterval = setInterval(() => {
                    setPollingElapsed((prev) => prev + 1);
                }, 1000);

                // Check immediately
                const initialResult = await checkMediaItem();
                if (initialResult === true) {
                    return;
                } else if (initialResult === "null_urls") {
                    if (elapsedInterval) clearInterval(elapsedInterval);
                    setError(
                        t(
                            "Image generation completed but the image URL could not be retrieved. The image may still be available on the Media page.",
                        ),
                    );
                    setErrorType(ERROR_TYPES.MEDIA_URL_UNAVAILABLE);
                    setTaskId(null);
                    setHasCheckedCompletion(false);
                    setPollingElapsed(0);
                    return;
                }

                // Poll every second if not found
                pollingInterval = setInterval(async () => {
                    attempts++;
                    console.log(
                        `Polling attempt ${attempts}/${MAX_POLLING_ATTEMPTS} for task ${taskId}`,
                    );
                    const result = await checkMediaItem();

                    if (
                        result === true ||
                        result === "null_urls" ||
                        attempts >= MAX_POLLING_ATTEMPTS
                    ) {
                        if (pollingInterval) clearInterval(pollingInterval);
                        if (elapsedInterval) clearInterval(elapsedInterval);

                        if (result === "null_urls") {
                            // Backend issue: media item exists but URLs are null
                            setError(
                                t(
                                    "Image generation completed but the image URL could not be retrieved. The image may still be available on the Media page.",
                                ),
                            );
                            setErrorType(ERROR_TYPES.MEDIA_URL_UNAVAILABLE);
                            setTaskId(null);
                            setHasCheckedCompletion(false);
                            setPollingElapsed(0);
                        } else if (attempts >= MAX_POLLING_ATTEMPTS) {
                            // Timeout: couldn't find media item
                            console.error(
                                "Media item URL not found after polling",
                                { taskId, taskData },
                            );
                            setError(
                                t(
                                    "Image generation completed but the image URL could not be retrieved. The image may still be available on the Media page.",
                                ),
                            );
                            setErrorType(ERROR_TYPES.MEDIA_URL_UNAVAILABLE);
                            setTaskId(null);
                            setHasCheckedCompletion(false);
                            setPollingElapsed(0);
                        }
                    }
                }, 1000);
            };

            // Start polling after a short delay
            const timeoutId = setTimeout(startPolling, 500);

            // Cleanup function that properly clears all intervals
            return () => {
                clearTimeout(timeoutId);
                if (pollingInterval) clearInterval(pollingInterval);
                if (elapsedInterval) clearInterval(elapsedInterval);
            };
        } else if (taskData?.status === "failed") {
            console.error("Image generation failed:", taskData.error);
            const errorMessage =
                taskData.error?.message || taskData.error || t("Unknown error");
            setError(
                t("Image generation failed: {{error}}", {
                    error: errorMessage,
                }),
            );
            setErrorType(ERROR_TYPES.TASK_FAILED);
            setTaskId(null);
            setHasCheckedCompletion(false);
        }
    }, [taskData, taskId, onImageGenerated, hasCheckedCompletion, onHide, t]);

    const handleGenerate = async () => {
        if (!prompt.trim() || runTask.isPending) return;

        setError(null); // Clear any previous errors
        setErrorType(null);

        try {
            const taskData = {
                type: "media-generation",
                prompt: prompt.trim(),
                outputType: "image",
                model: defaultModel,
                inputImageUrl: "",
                inputImageUrl2: "",
                inputImageUrl3: "",
                settings: {
                    quality: "draft",
                },
                source: source,
            };

            const result = await runTask.mutateAsync(taskData);
            if (result.taskId) {
                setTaskId(result.taskId);
            }
        } catch (error) {
            console.error("Error generating image:", error);
            const errorMessage =
                error?.response?.data?.message ||
                error?.message ||
                t("Unknown error");
            setError(
                t("Failed to start image generation: {{error}}", {
                    error: errorMessage,
                }),
            );
            setErrorType(ERROR_TYPES.GENERATION_START_FAILED);
        }
    };

    const handleClose = () => {
        // Note: Background task will continue running on the server
        // but we stop polling for results
        setPrompt("");
        setTaskId(null);
        setHasCheckedCompletion(false);
        setError(null);
        setErrorType(null);
        setPollingElapsed(0);
        onHide();
    };

    const isGenerating = taskId !== null || runTask.isPending;

    // Determine dialog title based on source
    const isFeaturedImage = source === "write_page_featured_image";
    const dialogTitle = isFeaturedImage
        ? t("Generate Featured Image")
        : t("Generate Image");

    return (
        <>
            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
            `}</style>
            <Dialog
                open={show}
                onOpenChange={(open) => {
                    if (!open) {
                        handleClose();
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5" />
                            {dialogTitle}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t("Describe the image you want to generate")}
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={t(
                                    "e.g., A beautiful landscape with mountains and a lake at sunset",
                                )}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md resize-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 dark:focus:ring-sky-500 dark:focus:border-sky-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                                rows={4}
                                disabled={isGenerating}
                                onKeyDown={(e) => {
                                    if (
                                        e.key === "Enter" &&
                                        e.ctrlKey &&
                                        !isGenerating
                                    ) {
                                        e.preventDefault();
                                        handleGenerate();
                                    }
                                }}
                            />
                        </div>

                        {isGenerating && (
                            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                {/* Status message */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                                        <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                                        <span>
                                            {(() => {
                                                // If we've checked completion, we're in polling phase
                                                if (hasCheckedCompletion) {
                                                    return t(
                                                        "Retrieving image...",
                                                    );
                                                }

                                                // Check task status
                                                const status = taskData?.status;

                                                if (status === "pending") {
                                                    return t(
                                                        "Queued for processing...",
                                                    );
                                                }

                                                if (status === "running") {
                                                    return taskData?.progress >=
                                                        0.99
                                                        ? t(
                                                              "Finalizing and uploading image...",
                                                          )
                                                        : t(
                                                              "Generating image...",
                                                          );
                                                }

                                                if (status === "completed") {
                                                    return t(
                                                        "Retrieving image...",
                                                    );
                                                }

                                                // Fallback: show generating for any other state
                                                return t("Generating...");
                                            })()}
                                        </span>
                                    </div>
                                    {taskData?.status === "completed" &&
                                        pollingElapsed > 0 && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                                {pollingElapsed}s
                                            </span>
                                        )}
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="space-y-2">
                                <div className="flex items-start gap-2 p-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <span>{error}</span>
                                </div>
                                {errorType ===
                                    ERROR_TYPES.MEDIA_URL_UNAVAILABLE && (
                                    <a
                                        href="/images"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-sky-700 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 underline"
                                    >
                                        {t("Open Media page")} →
                                    </a>
                                )}
                            </div>
                        )}

                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                                {isGenerating ? t("Close") : t("Cancel")}
                            </button>
                            <button
                                onClick={handleGenerate}
                                disabled={!prompt.trim() || isGenerating}
                                className="px-4 py-2 text-sm font-medium text-white bg-sky-500 rounded-md hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {t("Generating...")}
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        {t("Generate")}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
