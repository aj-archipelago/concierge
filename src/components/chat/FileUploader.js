import { useCallback, useEffect, useRef, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import axios from "../../../app/utils/axios-client";
import {
    X,
    Link as LinkIcon,
    Paperclip,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Play,
    RotateCw,
} from "lucide-react";
import {
    ACCEPTED_FILE_TYPES,
    isSupportedFileUrl,
    getFilename,
    getVideoDuration,
    getFileIcon,
    getExtension,
    hashMediaFile,
} from "../../utils/mediaUtils";
import {
    uploadFileToMediaHelper,
    checkFileByHash,
} from "../../utils/fileUploadUtils";
import {
    isYoutubeUrl,
    extractYoutubeVideoId,
    getYoutubeThumbnailUrl,
} from "../../utils/urlUtils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFilePreview, renderFilePreview } from "./useFilePreview";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { AuthContext } from "../../App";

// Global upload speed tracking
let lastBytesPerMs = null;

function FileThumbnail({ file, onRemove, onRetry }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";

    const displayName =
        file.displayFilename ||
        file.filename ||
        file.name ||
        file.source?.filename ||
        t("Unknown file");

    // Determine file source URL for preview (use existing preview if available)
    const previewSrc =
        file.preview ||
        (typeof file.source === "string" ? file.source : null) ||
        (file.source?.url ? file.source.url : null) ||
        (file.serverId ? file.serverId : null);

    // Handle YouTube URLs using shared utilities
    const isYouTube = isYoutubeUrl(previewSrc);
    const videoId =
        isYouTube && previewSrc ? extractYoutubeVideoId(previewSrc) : null;
    const youtubeThumbnail = videoId
        ? getYoutubeThumbnailUrl(videoId, "maxresdefault")
        : null;

    // Use the same file preview logic as MediaCard (uses explicit whitelist)
    const fileType = useFilePreview(previewSrc, displayName, file.type);

    // Use explicit previewability flag (CSV and other non-whitelisted types are excluded)
    const hasPreview = fileType.isPreviewable;
    const Icon = getFileIcon(displayName);

    const getStatusIcon = () => {
        if (file.status === "completed") {
            return (
                <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400" />
            );
        }
        if (file.status === "error") {
            return (
                <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
            );
        }
        if (file.status === "uploading" || file.status === "processing") {
            return (
                <Loader2 className="w-4 h-4 text-sky-500 dark:text-sky-400 animate-spin" />
            );
        }
        return null;
    };

    return (
        <div
            className={cn(
                "relative group flex-shrink-0 w-20 h-20 rounded-lg border-2 overflow-hidden transition-all bg-white dark:bg-gray-800",
                file.status === "error"
                    ? "border-red-300 dark:border-red-700"
                    : file.status === "completed"
                      ? "border-green-300 dark:border-green-700"
                      : "border-gray-300 dark:border-gray-600",
            )}
            title={
                file.status === "error" && file.error ? file.error : displayName
            }
        >
            {/* Preview or icon */}
            {isYouTube && youtubeThumbnail ? (
                <div className="w-full h-full relative">
                    <img
                        src={youtubeThumbnail}
                        alt="YouTube thumbnail"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            // Fallback to lower quality thumbnail if maxresdefault fails
                            if (videoId) {
                                e.target.src = getYoutubeThumbnailUrl(
                                    videoId,
                                    "hqdefault",
                                );
                            }
                        }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                        <Play
                            className="w-6 h-6 text-white opacity-90"
                            fill="white"
                        />
                    </div>
                </div>
            ) : hasPreview && previewSrc ? (
                <div className="w-full h-full relative">
                    {renderFilePreview({
                        src: previewSrc,
                        filename: displayName,
                        fileType,
                        className: "w-full h-full object-cover",
                        t,
                    })}
                    {fileType.isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                            <Play
                                className="w-6 h-6 text-white opacity-80"
                                fill="white"
                            />
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-gray-100 dark:bg-gray-700">
                    <Icon className="w-8 h-8 text-gray-500 dark:text-gray-400 mb-1" />
                    {(() => {
                        const extension = getExtension(displayName);
                        const fileExtension = extension
                            ? extension.replace(".", "").toUpperCase()
                            : "";
                        if (fileExtension) {
                            return (
                                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                    {fileExtension}
                                </span>
                            );
                        }
                        // Fallback to filename if no extension
                        return (
                            <p
                                className="text-[10px] text-gray-600 dark:text-gray-400 text-center truncate w-full"
                                dir="auto"
                            >
                                {displayName.length > 12
                                    ? displayName.substring(0, 10) + ".."
                                    : displayName}
                            </p>
                        );
                    })()}
                </div>
            )}

            {/* Status overlay */}
            {(file.status === "uploading" ||
                file.status === "processing" ||
                file.status === "error") && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    {getStatusIcon()}
                </div>
            )}

            {/* Filename overlay on hover */}
            {displayName && (
                <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                    <span
                        className="text-[10px] text-white truncate block text-start"
                        dir="auto"
                    >
                        {displayName}
                    </span>
                </div>
            )}

            {/* Progress bar */}
            {(file.status === "uploading" || file.status === "processing") && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 z-10">
                    <div
                        className="h-full bg-sky-500 dark:bg-sky-400 transition-all"
                        style={{ width: `${file.progress || 0}%` }}
                    />
                </div>
            )}

            {/* Remove button */}
            <button
                type="button"
                onClick={() => onRemove(file)}
                className={cn(
                    "absolute top-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10",
                    isRTL ? "left-1" : "right-1",
                )}
                title={t("Remove")}
                aria-label={t("Remove")}
            >
                <X className="w-3 h-3 text-white" />
            </button>

            {/* Retry button for errors */}
            {file.status === "error" && onRetry && (
                <button
                    type="button"
                    onClick={() => onRetry(file)}
                    className={cn(
                        "absolute w-6 h-6 rounded-full bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10",
                        isRTL ? "left-1" : "right-1",
                        "bottom-1",
                    )}
                    title={t("Retry")}
                    aria-label={t("Retry")}
                >
                    <RotateCw className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}

export default function FileUploader({
    addUrl,
    files,
    setFiles,
    setIsUploadingMedia,
    setUrlsData,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const { user } = useContext(AuthContext);
    const isRTL = direction === "rtl";
    const serverUrl = "/media-helper";
    // Use default user contextId for chat files
    const contextId = user?.contextId || null;
    const [inputUrl, setInputUrl] = useState("");
    const [showUrlInput, setShowUrlInput] = useState(false);
    const fileInputRef = useRef(null);
    const removedFilesRef = useRef(new Set());
    const uploadAbortControllersRef = useRef(new Map());
    const processingFilesRef = useRef(new Set());

    // Track files internally with status
    const [internalFiles, setInternalFiles] = useState([]);

    // Sync internal files with external files prop
    useEffect(() => {
        if (files && files.length > 0) {
            setInternalFiles((prev) => {
                // Helper to merge existing file state with new file data
                const mergeFileState = (existing, newFile) => {
                    const isProcessing =
                        existing.status === "uploading" ||
                        existing.status === "processing";
                    return {
                        ...existing,
                        ...newFile,
                        // Preserve upload state if file is being processed
                        status: isProcessing
                            ? existing.status
                            : newFile.status || existing.status,
                        progress: existing.progress ?? 0,
                        preview: existing.preview || newFile.preview,
                    };
                };

                // Helper to generate unique ID
                const generateFileId = (index) =>
                    `file-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`;

                // Helper to check if two File objects are the same
                const isSameFile = (fileA, fileB) => {
                    if (!(fileA instanceof File) || !(fileB instanceof File)) {
                        return false;
                    }
                    return (
                        fileA.name === fileB.name &&
                        fileA.size === fileB.size &&
                        fileA.type === fileB.type
                    );
                };

                // Create a map of existing files by their ID for quick lookup
                const existingMap = new Map();
                prev.forEach((f) => {
                    if (f.id) existingMap.set(f.id, f);
                    if (f.serverId) existingMap.set(f.serverId, f);
                });

                const newFiles = files.map((file, index) => {
                    const isFileObject = file.source instanceof File;

                    // First try to match by ID (most reliable)
                    if (file.id) {
                        const existing = existingMap.get(file.id);
                        if (existing) {
                            // For File objects, verify the source File is actually the same
                            if (
                                isFileObject &&
                                existing.source instanceof File &&
                                !isSameFile(file.source, existing.source)
                            ) {
                                // Different File object with same ID - create new entry
                                return {
                                    id: generateFileId(index),
                                    ...file,
                                    status: "pending",
                                    progress: 0,
                                };
                            }
                            return mergeFileState(existing, file);
                        }
                    }

                    // For File objects, never match by anything other than ID
                    // Each File selection creates a new unique instance
                    if (isFileObject) {
                        return {
                            id: file.id || generateFileId(index),
                            ...file,
                            status: "pending",
                            progress: 0,
                        };
                    }

                    // Try to match by serverId (for files that have been uploaded)
                    if (file.serverId) {
                        const existing = existingMap.get(file.serverId);
                        if (existing) {
                            return mergeFileState(existing, file);
                        }
                    }

                    // For non-File sources (URLs), try to match by source
                    if (typeof file.source === "string" || file.source?.url) {
                        const sourceKey =
                            typeof file.source === "string"
                                ? file.source
                                : file.source.url;
                        const existing = prev.find(
                            (f) =>
                                !(f.source instanceof File) &&
                                ((typeof f.source === "string" &&
                                    f.source === sourceKey) ||
                                    f.source?.url === sourceKey),
                        );
                        if (existing) {
                            return mergeFileState(existing, file);
                        }
                    }

                    // No match found, create new entry
                    return {
                        id: file.id || generateFileId(index),
                        ...file,
                        status: "pending",
                        progress: 0,
                    };
                });

                // Keep any files in prev that are still processing but not in files prop
                // (this shouldn't normally happen, but protects against edge cases)
                const processingFiles = prev.filter(
                    (f) =>
                        (f.status === "uploading" ||
                            f.status === "processing") &&
                        !newFiles.some((nf) => nf.id === f.id),
                );

                return [...newFiles, ...processingFiles];
            });
        } else if (files?.length === 0) {
            setInternalFiles([]);
        }
    }, [files]);

    // Process pending files
    useEffect(() => {
        const pendingFiles = internalFiles.filter(
            (f) =>
                f.status === "pending" &&
                !f.serverId &&
                !processingFilesRef.current.has(f.id),
        );
        pendingFiles.forEach((file) => {
            if (!isYoutubeUrl(file.source?.url)) {
                processingFilesRef.current.add(file.id);
                processFile(file);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [internalFiles.length]);

    const isFileRemoved = useCallback((identifier) => {
        if (!identifier) return false;
        return removedFilesRef.current.has(identifier);
    }, []);

    const updateFileStatus = useCallback((fileId, updates) => {
        setInternalFiles((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, ...updates } : f)),
        );
    }, []);

    const processUrlFile = useCallback(
        async (file) => {
            const fileId = file.id;
            const url =
                typeof file.source === "string"
                    ? file.source
                    : file.source?.url;

            if (!url) return;

            if (isYoutubeUrl(url)) {
                const youtubeResponse = {
                    url: url,
                    gcs: url,
                    type: "video/youtube",
                    filename: getFilename(url),
                    displayFilename: getFilename(url),
                    payload: JSON.stringify([
                        JSON.stringify({
                            type: "image_url",
                            url: url,
                            gcs: url,
                        }),
                    ]),
                };

                addUrl(youtubeResponse);
                processingFilesRef.current.delete(fileId);
                updateFileStatus(fileId, {
                    status: "completed",
                    progress: 100,
                    serverId: url,
                });
                setIsUploadingMedia(false);
                return;
            }

            updateFileStatus(fileId, {
                status: "processing",
                progress: 0,
            });
            setIsUploadingMedia(true);

            try {
                const response = await axios.get(
                    `${serverUrl}&fetch=${encodeURIComponent(url)}`,
                );
                if (response.data && response.data.url) {
                    const urlFilename = url.split("/").pop().split("?")[0];
                    if (isFileRemoved(url) || isFileRemoved(urlFilename)) {
                        processingFilesRef.current.delete(fileId);
                        updateFileStatus(fileId, {
                            status: "error",
                            error: t(
                                "File was removed before processing could complete.",
                            ),
                        });
                        setIsUploadingMedia(false);
                        return;
                    }

                    const responseWithFilename = {
                        ...response.data,
                        displayFilename:
                            response.data.displayFilename || urlFilename,
                    };
                    addUrl(responseWithFilename);
                    processingFilesRef.current.delete(fileId);
                    updateFileStatus(fileId, {
                        status: "completed",
                        progress: 100,
                        serverId: responseWithFilename.url,
                    });
                    setIsUploadingMedia(false);
                }
            } catch (err) {
                console.error("Error fetching URL:", err);
                processingFilesRef.current.delete(fileId);
                updateFileStatus(fileId, {
                    status: "error",
                    error: t("Could not load file from URL"),
                });
                setIsUploadingMedia(false);
            }
        },
        [
            t,
            serverUrl,
            isFileRemoved,
            updateFileStatus,
            addUrl,
            setIsUploadingMedia,
        ],
    );

    const processFile = useCallback(
        async (file) => {
            const fileId = file.id;
            const fileObj =
                file.source instanceof File ? file.source : file.file;

            if (!fileObj) {
                if (typeof file.source === "string" || file.source?.url) {
                    await processUrlFile(file);
                }
                return;
            }

            if (isFileRemoved(fileObj.name)) {
                return;
            }

            updateFileStatus(fileId, {
                status: "processing",
                progress: 0,
            });
            setIsUploadingMedia(true);

            try {
                // File validation
                if (fileObj.type === "application/pdf") {
                    const MAX_PDF_SIZE = 50 * 1024 * 1024;
                    if (fileObj.size > MAX_PDF_SIZE) {
                        throw new Error(t("PDF files must be less than 50MB"));
                    }
                }

                if (fileObj.type.startsWith("video/")) {
                    try {
                        const duration = await getVideoDuration(fileObj);
                        if (duration > 3600) {
                            throw new Error(
                                t("Video must be less than 60 minutes long"),
                            );
                        }
                    } catch (err) {
                        console.error("Error checking video duration:", err);
                        // Preserve the original error message if it's a validation error
                        if (err.message && err.message.includes("60 minutes")) {
                            throw err;
                        }
                        throw new Error(t("Could not verify video duration"));
                    }
                }

                // Generate preview for images
                let preview = null;
                if (fileObj.type.startsWith("image/")) {
                    preview = URL.createObjectURL(fileObj);
                }

                updateFileStatus(fileId, {
                    preview,
                    status: "uploading",
                    progress: 0,
                });

                // Check if file exists using shared utility
                const fileHash = await hashMediaFile(fileObj);
                const existingFile = await checkFileByHash(fileHash, {
                    contextId,
                    serverUrl,
                });

                if (existingFile) {
                    // File already exists
                    if (isSupportedFileUrl(fileObj?.name)) {
                        const hasAzureUrl =
                            existingFile.url &&
                            existingFile.url.includes("blob.core.windows.net");
                        const hasGcsUrl = existingFile.gcs;

                        if (!hasAzureUrl || !hasGcsUrl) {
                            throw new Error(
                                t(
                                    "Media file upload failed: Missing required storage URLs",
                                ),
                            );
                        }
                    }

                    const responseWithFilename = {
                        ...existingFile,
                        hash: existingFile.hash || fileHash,
                    };

                    if (
                        isFileRemoved(fileObj.name) ||
                        isFileRemoved(responseWithFilename.url) ||
                        isFileRemoved(responseWithFilename.gcs)
                    ) {
                        processingFilesRef.current.delete(fileId);
                        throw new Error(
                            t(
                                "File was removed before processing could complete.",
                            ),
                        );
                    }

                    processingFilesRef.current.delete(fileId);
                    updateFileStatus(fileId, {
                        status: "completed",
                        progress: 100,
                        serverId: responseWithFilename.url,
                    });
                    addUrl(responseWithFilename);
                    setIsUploadingMedia(false);
                    return;
                }

                // File doesn't exist, upload it with custom progress tracking
                const startTimestamp = Date.now();
                let totalBytes = 0;
                let cloudProgressInterval;

                try {
                    const responseData = await uploadFileToMediaHelper(
                        fileObj,
                        {
                            contextId,
                            checkHash: false, // Already checked above
                            serverUrl,
                            getXHR: (xhr) => {
                                uploadAbortControllersRef.current.set(fileId, {
                                    abort: () => xhr.abort(),
                                });
                            },
                            onProgress: (event) => {
                                // Custom progress tracking: 0-50% upload, 50-100% cloud processing simulation
                                if (event.lengthComputable) {
                                    totalBytes = event.total;
                                    const uploadProgress =
                                        (event.loaded / event.total) * 50;
                                    updateFileStatus(fileId, {
                                        progress: uploadProgress,
                                    });

                                    if (
                                        uploadProgress >= 49 &&
                                        !cloudProgressInterval
                                    ) {
                                        let cloudProgress = 50;
                                        let expectedTotalTime;
                                        if (lastBytesPerMs) {
                                            expectedTotalTime =
                                                totalBytes / lastBytesPerMs;
                                        } else {
                                            expectedTotalTime =
                                                (Date.now() - startTimestamp) *
                                                2;
                                        }

                                        const remainingSteps = 49;
                                        const cloudProcessingInterval =
                                            expectedTotalTime / remainingSteps;

                                        cloudProgressInterval = setInterval(
                                            () => {
                                                cloudProgress += 1;
                                                updateFileStatus(fileId, {
                                                    progress: cloudProgress,
                                                });
                                                if (cloudProgress >= 99) {
                                                    clearInterval(
                                                        cloudProgressInterval,
                                                    );
                                                    cloudProgressInterval =
                                                        null;
                                                }
                                            },
                                            cloudProcessingInterval,
                                        );
                                    }
                                }
                            },
                        },
                    );

                    if (cloudProgressInterval) {
                        clearInterval(cloudProgressInterval);
                    }

                    const totalTime = Date.now() - startTimestamp;
                    if (totalBytes > 0) {
                        lastBytesPerMs = totalBytes / totalTime;
                    }

                    if (isSupportedFileUrl(fileObj?.name)) {
                        const hasAzureUrl =
                            responseData.url &&
                            responseData.url.includes("blob.core.windows.net");
                        const hasGcsUrl = responseData.gcs;

                        if (!hasAzureUrl || !hasGcsUrl) {
                            processingFilesRef.current.delete(fileId);
                            updateFileStatus(fileId, {
                                status: "error",
                                error: t(
                                    "Media file upload failed: Missing required storage URLs",
                                ),
                            });
                            setIsUploadingMedia(false);
                            return;
                        }
                    }

                    const responseWithFilename = {
                        ...responseData,
                        originalFilename: fileObj.name,
                        hash: responseData.hash || fileHash,
                    };

                    if (
                        isFileRemoved(fileObj.name) ||
                        isFileRemoved(responseWithFilename.url) ||
                        isFileRemoved(responseWithFilename.gcs)
                    ) {
                        processingFilesRef.current.delete(fileId);
                        updateFileStatus(fileId, {
                            status: "error",
                            error: t(
                                "File was removed before processing could complete.",
                            ),
                        });
                        setIsUploadingMedia(false);
                        return;
                    }

                    processingFilesRef.current.delete(fileId);
                    updateFileStatus(fileId, {
                        status: "completed",
                        progress: 100,
                        serverId: responseWithFilename.url,
                    });
                    addUrl(responseWithFilename);
                    setIsUploadingMedia(false);
                } catch (error) {
                    if (cloudProgressInterval) {
                        clearInterval(cloudProgressInterval);
                    }
                    processingFilesRef.current.delete(fileId);
                    let errorMessage = t("Error while uploading");
                    if (error.message) {
                        errorMessage = error.message;
                    }
                    updateFileStatus(fileId, {
                        status: "error",
                        error: errorMessage,
                    });
                    setIsUploadingMedia(false);
                }
            } catch (error) {
                processingFilesRef.current.delete(fileId);
                updateFileStatus(fileId, {
                    status: "error",
                    error: error.message || t("Upload failed"),
                });
                setIsUploadingMedia(false);
            }
        },
        [
            t,
            serverUrl,
            isFileRemoved,
            updateFileStatus,
            addUrl,
            setIsUploadingMedia,
            processUrlFile,
            contextId,
        ],
    );

    const handleAddUrl = useCallback(() => {
        try {
            new URL(inputUrl);
        } catch (err) {
            alert(t("Please enter a valid URL"));
            return;
        }

        if (isYoutubeUrl(inputUrl)) {
            const youtubeResponse = {
                url: inputUrl,
                gcs: inputUrl,
                type: "video/youtube",
                filename: getFilename(inputUrl),
                displayFilename: getFilename(inputUrl),
                payload: JSON.stringify([
                    JSON.stringify({
                        type: "image_url",
                        url: inputUrl,
                        gcs: inputUrl,
                    }),
                ]),
            };

            addUrl(youtubeResponse);

            const newFile = {
                id: `youtube-${Date.now()}`,
                source: youtubeResponse,
                filename: getFilename(inputUrl),
                name: getFilename(inputUrl),
                type: "video/youtube",
                size: 0,
                status: "completed",
                progress: 100,
                serverId: inputUrl,
            };

            setFiles((prevFiles) => [...prevFiles, newFile]);
            setInputUrl("");
            setShowUrlInput(false);
            return;
        }

        setIsUploadingMedia(true);
        const newFile = {
            id: `url-${Date.now()}`,
            source: inputUrl,
            filename: getFilename(inputUrl),
            name: getFilename(inputUrl),
            status: "pending",
            progress: 0,
        };
        setFiles((prevFiles) => [...prevFiles, newFile]);
        setInputUrl("");
        setShowUrlInput(false);
    }, [inputUrl, t, addUrl, setIsUploadingMedia, setFiles]);

    const handleFileSelect = useCallback(
        (selectedFiles) => {
            const fileArray = Array.from(selectedFiles);
            const validFiles = fileArray.filter((file) =>
                ACCEPTED_FILE_TYPES.includes(file.type),
            );

            if (validFiles.length !== fileArray.length) {
                alert(t("Invalid file type"));
            }

            const newFiles = validFiles.map((file, index) => ({
                id: `file-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`,
                source: file,
                file: file,
                filename: file.name,
                name: file.name,
                type: file.type,
                size: file.size,
                status: "pending",
                progress: 0,
            }));

            setFiles((prevFiles) => [...prevFiles, ...newFiles]);
        },
        [t, setFiles],
    );

    const handleRemove = useCallback(
        (file) => {
            if (file.serverId) {
                removedFilesRef.current.add(file.serverId);
            }
            if (file.id) {
                removedFilesRef.current.add(file.id);
            }
            if (file.filename) {
                removedFilesRef.current.add(file.filename);
            }
            if (file.displayFilename) {
                removedFilesRef.current.add(file.displayFilename);
            }
            if (file.source?.url) {
                removedFilesRef.current.add(file.source.url);
            }
            if (file.source?.gcs) {
                removedFilesRef.current.add(file.source.gcs);
            }
            if (typeof file.source === "string") {
                removedFilesRef.current.add(file.source);
            }

            const abortController = uploadAbortControllersRef.current.get(
                file.id,
            );
            if (abortController) {
                abortController.abort();
                uploadAbortControllersRef.current.delete(file.id);
            }

            setFiles((prevFiles) =>
                prevFiles.filter((f) => {
                    // Match by ID (most reliable - each file should have unique ID)
                    if (file.id && f.id === file.id) {
                        return false; // Remove this file
                    }
                    // Match by serverId as fallback (for files that have been uploaded)
                    if (
                        file.serverId &&
                        f.serverId === file.serverId &&
                        !file.id &&
                        !f.id
                    ) {
                        return false; // Remove this file
                    }
                    // Keep all other files
                    return true;
                }),
            );

            if (file.serverId && setUrlsData) {
                setUrlsData((prevUrls) =>
                    prevUrls.filter(
                        (url) =>
                            url.url !== file.serverId &&
                            url.gcs !== file.serverId &&
                            url.filename !== file.filename &&
                            url.displayFilename !== file.displayFilename,
                    ),
                );
            }

            if (file.preview) {
                URL.revokeObjectURL(file.preview);
            }

            setFiles((prevFiles) => {
                if (prevFiles.length === 0) {
                    setIsUploadingMedia(false);
                    removedFilesRef.current.clear();
                }
                return prevFiles;
            });
        },
        [setFiles, setIsUploadingMedia, setUrlsData],
    );

    const handleRetry = useCallback(
        (file) => {
            processingFilesRef.current.delete(file.id);
            updateFileStatus(file.id, {
                status: "pending",
                progress: 0,
                error: null,
            });
            processingFilesRef.current.add(file.id);
            processFile(file);
        },
        [updateFileStatus, processFile],
    );

    return (
        <div
            className={cn(
                "space-y-1.5 px-3 pb-3 pt-2",
                "bg-white dark:bg-gray-800",
            )}
            dir={direction}
        >
            {/* File thumbnails */}
            {internalFiles.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                    {internalFiles.map((file) => (
                        <FileThumbnail
                            key={file.id || file.serverId}
                            file={file}
                            onRemove={handleRemove}
                            onRetry={handleRetry}
                        />
                    ))}
                </div>
            )}

            {/* Add files controls */}
            <div
                className={cn(
                    "flex items-center gap-2 min-h-[40px]",
                    "flex-col sm:flex-row",
                )}
            >
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors h-9",
                        "w-full sm:w-auto",
                        isRTL && "flex-row-reverse",
                    )}
                    aria-label={t("Attach files")}
                >
                    <Paperclip className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{t("Attach files")}</span>
                </button>

                <div className="flex items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
                    {!showUrlInput ? (
                        <button
                            type="button"
                            onClick={() => setShowUrlInput(true)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors h-9",
                                "w-full sm:w-auto",
                                isRTL && "flex-row-reverse",
                            )}
                            aria-label={t("Add File URL")}
                        >
                            <LinkIcon className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">
                                {t("Add File URL")}
                            </span>
                        </button>
                    ) : (
                        <>
                            <input
                                type="text"
                                value={inputUrl}
                                onChange={(e) => setInputUrl(e.target.value)}
                                placeholder={t("Enter file URL...")}
                                className={cn(
                                    "flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-500 h-9",
                                    "min-w-0",
                                )}
                                dir="ltr"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddUrl();
                                    }
                                    if (e.key === "Escape") {
                                        setShowUrlInput(false);
                                        setInputUrl("");
                                    }
                                }}
                                autoFocus
                                aria-label={t("Enter file URL...")}
                            />
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleAddUrl}
                                disabled={!inputUrl}
                                className="h-9 flex-shrink-0"
                                aria-label={t("Add")}
                            >
                                {t("Add")}
                            </Button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowUrlInput(false);
                                    setInputUrl("");
                                }}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded h-9 w-9 flex items-center justify-center flex-shrink-0"
                                aria-label={t("Close")}
                                title={t("Close")}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_FILE_TYPES.join(",")}
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files) {
                            handleFileSelect(e.target.files);
                        }
                        e.target.value = "";
                    }}
                    aria-label={t("Attach files")}
                />
            </div>
        </div>
    );
}
