import { useCallback, useEffect, useRef, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import axios from "../../../app/utils/axios-client";
import mime from "mime-types";
import {
    X,
    Link as LinkIcon,
    Paperclip,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Play,
} from "lucide-react";
import {
    hashMediaFile,
    ACCEPTED_FILE_TYPES,
    isSupportedFileUrl,
    getFilename,
    getVideoDuration,
    getFileIcon,
} from "../../utils/mediaUtils";
import { isYoutubeUrl } from "../../utils/urlUtils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFilePreview, renderFilePreview } from "./useFilePreview";
import { LanguageContext } from "../../contexts/LanguageProvider";

// Global upload speed tracking
let lastBytesPerMs = null;

function FileThumbnail({ file, onRemove, onRetry }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    
    const displayName =
        file.filename ||
        file.originalFilename ||
        file.name ||
        file.source?.filename ||
        t("Unknown file");

    // Determine file source URL for preview (use existing preview if available)
    const previewSrc = file.preview || 
        (typeof file.source === "string" ? file.source : null) ||
        (file.source?.url ? file.source.url : null) ||
        (file.serverId ? file.serverId : null);
    
    // Handle YouTube URLs
    const isYouTube = isYoutubeUrl(previewSrc);
    let youtubeThumbnail = null;
    if (isYouTube && previewSrc) {
        const videoIdMatch = previewSrc.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^?&]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        if (videoId) {
            youtubeThumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
    }

    // Use the same file preview logic as MediaCard
    const fileType = useFilePreview(
        previewSrc,
        displayName,
        file.type
    );

    const hasPreview = fileType.isImage || fileType.isVideo || fileType.isPdf || fileType.isDoc;
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
        >
            {/* Preview or icon */}
            {isYouTube && youtubeThumbnail ? (
                <div className="w-full h-full relative">
                    <img
                        src={youtubeThumbnail}
                        alt="YouTube thumbnail"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            if (youtubeThumbnail.includes("maxresdefault")) {
                                const videoId = youtubeThumbnail.match(/vi\/([^/]+)/)?.[1];
                                if (videoId) {
                                    e.target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                                }
                            }
                        }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                        <Play className="w-6 h-6 text-white opacity-90" fill="white" />
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
                            <Play className="w-6 h-6 text-white opacity-80" fill="white" />
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-gray-100 dark:bg-gray-700">
                    <Icon className="w-8 h-8 text-gray-500 dark:text-gray-400 mb-1" />
                    <p 
                        className="text-[10px] text-gray-600 dark:text-gray-400 text-center truncate w-full"
                        dir="auto"
                    >
                        {displayName.length > 12
                            ? displayName.substring(0, 10) + ".."
                            : displayName}
                    </p>
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

            {/* Progress bar */}
            {(file.status === "uploading" || file.status === "processing") && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
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
                    isRTL ? "left-1" : "right-1"
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
                    className="absolute bottom-1 left-1 right-1 px-2 py-1 text-xs bg-sky-500 hover:bg-sky-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title={t("Retry")}
                    aria-label={t("Retry")}
                >
                    {t("Retry")}
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
    const { t, i18n } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    const serverUrl = "/media-helper";
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
                const newFiles = files.map((file) => {
                    const existing = prev.find(
                        (f) =>
                            f.id === file.id ||
                            f.serverId === file.serverId ||
                            (f.source === file.source &&
                                !(file.source instanceof File)),
                    );
                    return existing || {
                        id: file.id || `file-${Date.now()}-${Math.random()}`,
                        ...file,
                        status: "pending",
                        progress: 0,
                    };
                });
                return newFiles;
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
            prev.map((f) =>
                f.id === fileId || f.serverId === fileId
                    ? { ...f, ...updates }
                    : f,
            ),
        );
    }, []);

    const processFile = useCallback(
        async (file) => {
            const fileId = file.id;
            const fileObj = file.source instanceof File ? file.source : file.file;

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

                const fileHash = await hashMediaFile(fileObj);

                // Check if file exists
                try {
                    const response = await axios.get(
                        `${serverUrl}?hash=${fileHash}&checkHash=true`,
                    );
                    if (response.status === 200 && response.data?.url) {
                        if (isSupportedFileUrl(fileObj?.name)) {
                            const hasAzureUrl =
                                response.data.url &&
                                response.data.url.includes(
                                    "blob.core.windows.net",
                                );
                            const hasGcsUrl = response.data.gcs;

                            if (!hasAzureUrl || !hasGcsUrl) {
                                throw new Error(
                                    t("Media file upload failed: Missing required storage URLs"),
                                );
                            }
                        }

                        const responseWithFilename = {
                            ...response.data,
                            originalFilename: fileObj.name,
                            hash: response.data.hash || fileHash,
                        };

                        if (
                            isFileRemoved(fileObj.name) ||
                            isFileRemoved(responseWithFilename.originalFilename) ||
                            isFileRemoved(responseWithFilename.url) ||
                            isFileRemoved(responseWithFilename.gcs)
                        ) {
                            processingFilesRef.current.delete(fileId);
                            throw new Error(
                                t("File was removed before processing could complete."),
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
                } catch (err) {
                    if (err.response?.status !== 404) {
                        console.error("Error checking file hash:", err);
                    }
                }

                // Upload the file
                const startTimestamp = Date.now();
                let totalBytes = 0;
                const formData = new FormData();
                formData.append("hash", fileHash);
                formData.append("files", fileObj, fileObj.name);

                const xhr = new XMLHttpRequest();
                uploadAbortControllersRef.current.set(fileId, {
                    abort: () => xhr.abort(),
                });

                let cloudProgressInterval;

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        totalBytes = e.total;
                        const uploadProgress = (e.loaded / e.total) * 50;
                        updateFileStatus(fileId, {
                            progress: uploadProgress,
                        });

                        if (uploadProgress >= 49 && !cloudProgressInterval) {
                            let cloudProgress = 50;
                            let expectedTotalTime;
                            if (lastBytesPerMs) {
                                expectedTotalTime = totalBytes / lastBytesPerMs;
                            } else {
                                expectedTotalTime =
                                    (Date.now() - startTimestamp) * 2;
                            }

                            const remainingSteps = 49;
                            const cloudProcessingInterval =
                                expectedTotalTime / remainingSteps;

                            cloudProgressInterval = setInterval(() => {
                                cloudProgress += 1;
                                updateFileStatus(fileId, {
                                    progress: cloudProgress,
                                });
                                if (cloudProgress >= 99) {
                                    clearInterval(cloudProgressInterval);
                                    cloudProgressInterval = null;
                                }
                            }, cloudProcessingInterval);
                        }
                    }
                };

                xhr.onload = () => {
                    if (cloudProgressInterval) {
                        clearInterval(cloudProgressInterval);
                    }

                    const totalTime = Date.now() - startTimestamp;
                    if (totalBytes > 0) {
                        lastBytesPerMs = totalBytes / totalTime;
                    }

                    if (xhr.status >= 200 && xhr.status < 300) {
                        let responseData;
                        try {
                            responseData = JSON.parse(xhr.responseText);
                        } catch (err) {
                            console.error("Error parsing response:", err);
                            processingFilesRef.current.delete(fileId);
                            updateFileStatus(fileId, {
                                status: "error",
                                error: t("Error parsing server response"),
                            });
                            setIsUploadingMedia(false);
                            return;
                        }

                        if (isSupportedFileUrl(fileObj?.name)) {
                            const hasAzureUrl =
                                responseData.url &&
                                responseData.url.includes(
                                    "blob.core.windows.net",
                                );
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
                            hash:
                                responseData.hash ||
                                responseData.file?.hash ||
                                fileHash,
                        };

                        if (
                            isFileRemoved(fileObj.name) ||
                            isFileRemoved(
                                responseWithFilename.originalFilename,
                            ) ||
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
                    } else {
                        const errorMessage =
                            typeof responseData === "string"
                                ? responseData
                                : responseData?.error ||
                                  responseData?.message ||
                                  t("Error while uploading");
                        processingFilesRef.current.delete(fileId);
                        updateFileStatus(fileId, {
                            status: "error",
                            error: errorMessage,
                        });
                        setIsUploadingMedia(false);
                    }
                };

                xhr.onerror = () => {
                    processingFilesRef.current.delete(fileId);
                    updateFileStatus(fileId, {
                        status: "error",
                        error: t("Error while uploading"),
                    });
                    setIsUploadingMedia(false);
                };

                xhr.open("POST", `${serverUrl}?hash=${fileHash}`);
                xhr.send(formData);
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
        ],
    );

    const processUrlFile = useCallback(
        async (file) => {
            const fileId = file.id;
            const url =
                typeof file.source === "string" ? file.source : file.source?.url;

            if (!url) return;

            if (isYoutubeUrl(url)) {
                const youtubeResponse = {
                    url: url,
                    gcs: url,
                    type: "video/youtube",
                    filename: getFilename(url),
                    originalFilename: getFilename(url),
                    payload: JSON.stringify([
                        JSON.stringify({
                            type: "image_url",
                            url: url,
                            gcs: url,
                            originalFilename: getFilename(url),
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
                        originalFilename: urlFilename,
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
                originalFilename: getFilename(inputUrl),
                payload: JSON.stringify([
                    JSON.stringify({
                        type: "image_url",
                        url: inputUrl,
                        gcs: inputUrl,
                        originalFilename: getFilename(inputUrl),
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

            const newFiles = validFiles.map((file) => ({
                id: `file-${Date.now()}-${Math.random()}`,
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
            if (file.originalFilename) {
                removedFilesRef.current.add(file.originalFilename);
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
                prevFiles.filter(
                    (f) =>
                        f.id !== file.id &&
                        f.serverId !== file.serverId &&
                        (f.source !== file.source ||
                            (file.source instanceof File &&
                                f.source instanceof File &&
                                f.source.name !== file.source.name)),
                ),
            );

            if (file.serverId && setUrlsData) {
                setUrlsData((prevUrls) =>
                    prevUrls.filter(
                        (url) =>
                            url.url !== file.serverId &&
                            url.gcs !== file.serverId &&
                            url.filename !== file.filename &&
                            url.originalFilename !== file.originalFilename,
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
        <div className="space-y-1.5 pb-1" dir={direction}>
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
            <div className={cn(
                "flex items-center gap-2 min-h-[40px]",
                "flex-col sm:flex-row"
            )}>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors h-9",
                        "w-full sm:w-auto",
                        isRTL && "flex-row-reverse"
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
                                isRTL && "flex-row-reverse"
                            )}
                            aria-label={t("Add URL")}
                        >
                            <LinkIcon className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{t("Add URL")}</span>
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
                                    "min-w-0"
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
