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
import { useRunTask, useTask } from "../../../app/queries/notifications";
import axios from "../../../app/utils/axios-client";

// Polling configuration constants
const MAX_POLLING_ATTEMPTS = 60; // Poll for up to 60 seconds
const MAX_NULL_URL_ATTEMPTS = 5; // Give up after 5 consecutive null URL findings

// Error types for better error handling
const ERROR_TYPES = {
    MEDIA_URL_UNAVAILABLE: "media_url_unavailable",
    TASK_FAILED: "task_failed",
    GENERATION_START_FAILED: "generation_start_failed",
};

export default function ModifyImageDialog({
    show,
    onHide,
    onImageModified,
    imageUrl,
    source = "canvas_image_modify",
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

    // Default model for image modification
    const defaultModel = "replicate-qwen-image-edit-plus";

    // Watch for task completion and fetch media item URL
    useEffect(() => {
        if (!taskId || !taskData) return;

        if (taskData?.status === "completed" && !hasCheckedCompletion) {
            setHasCheckedCompletion(true);
            setError(null);
            setErrorType(null);
            setPollingElapsed(0);

            // First, check if URL is directly in taskData.data
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
                const hash = taskData.data?.hash;
                console.log("Found hash in taskData.data:", hash);
                onImageModified(imageUrlFromTaskData, hash);
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

            // Check if task completed but URLs are explicitly null
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
            let nullUrlAttempts = 0;

            const checkMediaItem = async () => {
                try {
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
                            onImageModified(imageUrl, mediaItem.hash);
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

                            if (nullUrlAttempts >= MAX_NULL_URL_ATTEMPTS) {
                                console.error(
                                    "Media item found but URLs remain null after multiple attempts. Backend issue detected.",
                                );
                                return "null_urls";
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error fetching media item:", error);
                }

                return false;
            };

            const startPolling = async () => {
                elapsedInterval = setInterval(() => {
                    setPollingElapsed((prev) => prev + 1);
                }, 1000);

                const initialResult = await checkMediaItem();
                if (initialResult === true) {
                    return;
                } else if (initialResult === "null_urls") {
                    if (elapsedInterval) clearInterval(elapsedInterval);
                    setError(
                        t(
                            "Image modification completed but the image URL could not be retrieved. The image may still be available on the Media page.",
                        ),
                    );
                    setErrorType(ERROR_TYPES.MEDIA_URL_UNAVAILABLE);
                    setTaskId(null);
                    setHasCheckedCompletion(false);
                    setPollingElapsed(0);
                    return;
                }

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
                            setError(
                                t(
                                    "Image modification completed but the image URL could not be retrieved. The image may still be available on the Media page.",
                                ),
                            );
                            setErrorType(ERROR_TYPES.MEDIA_URL_UNAVAILABLE);
                            setTaskId(null);
                            setHasCheckedCompletion(false);
                            setPollingElapsed(0);
                        } else if (attempts >= MAX_POLLING_ATTEMPTS) {
                            console.error(
                                "Media item URL not found after polling",
                                { taskId, taskData },
                            );
                            setError(
                                t(
                                    "Image modification completed but the image URL could not be retrieved. The image may still be available on the Media page.",
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

            const timeoutId = setTimeout(startPolling, 500);

            return () => {
                clearTimeout(timeoutId);
                if (pollingInterval) clearInterval(pollingInterval);
                if (elapsedInterval) clearInterval(elapsedInterval);
            };
        } else if (taskData?.status === "failed") {
            console.error("Image modification failed:", taskData.error);
            const errorMessage =
                taskData.error?.message || taskData.error || t("Unknown error");
            setError(
                t("Image modification failed: {{error}}", {
                    error: errorMessage,
                }),
            );
            setErrorType(ERROR_TYPES.TASK_FAILED);
            setTaskId(null);
            setHasCheckedCompletion(false);
        }
    }, [taskData, taskId, onImageModified, hasCheckedCompletion, onHide, t]);

    const handleModify = async () => {
        if (!prompt.trim() || runTask.isPending || !imageUrl) return;

        setError(null);
        setErrorType(null);

        try {
            const taskData = {
                type: "media-generation",
                prompt: prompt.trim(),
                outputType: "image",
                model: defaultModel,
                inputImageUrl: imageUrl,
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
            console.error("Error modifying image:", error);
            const errorMessage =
                error?.response?.data?.message ||
                error?.message ||
                t("Unknown error");
            setError(
                t("Failed to start image modification: {{error}}", {
                    error: errorMessage,
                }),
            );
            setErrorType(ERROR_TYPES.GENERATION_START_FAILED);
        }
    };

    const handleClose = () => {
        setPrompt("");
        setTaskId(null);
        setHasCheckedCompletion(false);
        setError(null);
        setErrorType(null);
        setPollingElapsed(0);
        onHide();
    };

    const isModifying = taskId !== null || runTask.isPending;

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
                            {t("Modify Image with AI")}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t("Describe how you want to modify the image")}
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={t(
                                    "e.g., Add a sunset sky, change the background to a beach, make it more colorful",
                                )}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md resize-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 dark:focus:ring-sky-500 dark:focus:border-sky-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                                rows={4}
                                disabled={isModifying}
                                onKeyDown={(e) => {
                                    if (
                                        e.key === "Enter" &&
                                        e.ctrlKey &&
                                        !isModifying
                                    ) {
                                        e.preventDefault();
                                        handleModify();
                                    }
                                }}
                            />
                        </div>

                        {isModifying && (
                            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                                        <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                                        <span>
                                            {(() => {
                                                if (hasCheckedCompletion) {
                                                    return t(
                                                        "Retrieving modified image...",
                                                    );
                                                }

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
                                                              "Modifying image...",
                                                          );
                                                }

                                                if (status === "completed") {
                                                    return t(
                                                        "Retrieving modified image...",
                                                    );
                                                }

                                                return t("Modifying...");
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
                                {isModifying ? t("Close") : t("Cancel")}
                            </button>
                            <button
                                onClick={handleModify}
                                disabled={
                                    !prompt.trim() || isModifying || !imageUrl
                                }
                                className="px-4 py-2 text-sm font-medium text-white bg-sky-500 rounded-md hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            >
                                {isModifying ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {t("Modifying...")}
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        {t("Modify")}
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
