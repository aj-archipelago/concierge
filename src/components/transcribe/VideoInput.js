"use client";

import {
    ArrowLeftIcon,
    ArrowRightIcon,
    Loader2Icon,
    UploadIcon,
} from "lucide-react";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import VideoSelector from "./VideoSelector";
import { ServerContext } from "../../App";
import config from "../../../config";
import {
    hashMediaFile,
    getVideoDuration,
    getVideoDurationFromUrl,
} from "../../utils/mediaUtils";
import { LanguageContext } from "../../contexts/LanguageProvider";

export const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch (error) {
        return false;
    }
};

const MAX_VIDEO_DURATION = 3600; // 60 minutes in seconds

export const checkDuration = async (duration) => {
    if (duration > MAX_VIDEO_DURATION) {
        throw new Error("Video length exceeds 60 minutes");
    }
    return true;
};

export const isCloudStorageUrl = (url) => {
    const cloudStoragePatterns = [
        ".blob.core.windows.net/", // Azure
        "storage.googleapis.com/", // Google Cloud Storage
        "storage.cloud.google.com/",
        "s3.amazonaws.com/", // AWS S3
        "s3-[a-z0-9-]+.amazonaws.com/", // AWS S3 with region
        "cloudfront.net/", // AWS CloudFront
        "digitaloceanspaces.com/", // DigitalOcean Spaces
    ];

    return cloudStoragePatterns.some((pattern) =>
        url.match(new RegExp(pattern, "i")),
    );
};

export const checkVideoUrl = async (url) => {
    let video = null;
    try {
        const isCloudUrl = isCloudStorageUrl(url);

        if (!isCloudUrl) {
            try {
                const response = await fetch(url, { method: "HEAD" });
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.startsWith("video/")) {
                    return false;
                }
            } catch (error) {
                console.warn(
                    "HEAD request failed, continuing with video element check:",
                    error,
                );
                // Continue even if HEAD request fails - some servers might block HEAD
            }
        }

        // Check video duration
        video = document.createElement("video");
        video.preload = "metadata";
        video.crossOrigin = "anonymous";

        const durationPromise = new Promise((resolve, reject) => {
            video.onloadedmetadata = () => {
                resolve(video.duration);
            };
            video.onerror = (e) => {
                if (isCloudUrl) {
                    resolve(0);
                } else {
                    console.error("❌ Video loading error:", e);
                    reject(e);
                }
            };
        });

        video.src = url;

        const duration = await durationPromise;
        if (duration > 0) {
            // Only check duration if we got a valid duration
            await checkDuration(duration);
        }
        return true;
    } catch (error) {
        console.error("Error checking video URL:", error);
        return error.message || false;
    } finally {
        // Clean up
        if (video) {
            video.remove();
        }
    }
};

function VideoInput({
    url,
    setUrl,
    gcs,
    setGcs,
    setVideoInformation,
    onUploadStart,
    onUploadComplete,
}) {
    const { t } = useTranslation();
    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState(null);
    const [videoSelectorError, setVideoSelectorError] = useState(null);
    const [showVideoSelector, setShowVideoSelector] = useState(false);
    const { serverUrl } = useContext(ServerContext);
    const [uploadProgress, setUploadProgress] = useState(0);
    const { direction } = useContext(LanguageContext);

    // Function to handle file upload and post it to the API
    const handleFileUpload = async (event) => {
        setFileUploading(true);
        setFileUploadError(null);
        setUploadProgress(0);
        setUrl("");
        setGcs("");
        onUploadStart?.(); // Notify parent that upload is starting

        const file = event.target.files[0];

        // Check file duration
        try {
            const duration = await getVideoDuration(file);
            await checkDuration(duration);
        } catch (error) {
            console.error("Error checking video duration:", error);
            setFileUploading(false);
            setFileUploadError({
                message: t(
                    "Video length exceeds 60 minutes. Please upload a shorter video.",
                ),
            });
            return;
        }

        const fileHash = await hashMediaFile(file);

        // Check if file with same hash exists
        try {
            const checkResponse = await fetch(
                `${config.endpoints.mediaHelper(serverUrl)}?hash=${fileHash}&checkHash=true`,
            );
            if (checkResponse.ok) {
                const data = await checkResponse.json().catch(() => null);
                if (data && data.url) {
                    setUrl(data.url);
                    setGcs(data.gcs);
                    setVideoInformation({
                        videoUrl: data.url,
                        transcriptionUrl: null,
                    });
                    setFileUploading(false);
                    onUploadComplete?.(); // Notify parent that upload is complete
                    return;
                }
            }
        } catch (error) {
            console.error("Error checking file hash:", error);
            // Continue with upload even if hash check fails
        }

        // Add file type validation
        const supportedVideoTypes = ["video/mp4", "video/webm", "video/ogg"];
        const supportedAudioTypes = ["audio/mpeg", "audio/wav", "audio/ogg"];

        const isSupported = [
            ...supportedVideoTypes,
            ...supportedAudioTypes,
        ].includes(file?.type);

        if (!isSupported) {
            setFileUploading(false);
            setFileUploadError({
                message: t(
                    "Unsupported file type. Please upload a video or audio file.",
                ),
            });
            return;
        }

        // Continue with upload if no match found
        const formData = new FormData();
        formData.append("file", file);
        formData.append("hash", fileHash);

        try {
            const xhr = new XMLHttpRequest();
            xhr.open(
                "POST",
                `${config.endpoints.mediaHelper(serverUrl)}?hash=${fileHash}`,
                true,
            );

            // Monitor the upload progress
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentage = Math.round(
                        (event.loaded * 100) / event.total,
                    );
                    setUploadProgress(percentage);
                }
            };

            // Handle the upload response
            xhr.onload = () => {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    const fileUrl = data.url || ``;
                    setUrl(fileUrl);
                    const gcsUrl = data.gcs || ``;
                    setGcs(gcsUrl);
                    setVideoInformation({
                        videoUrl: fileUrl,
                        transcriptionUrl: null,
                    });
                    setFileUploading(false);
                    onUploadComplete?.(); // Notify parent that upload is complete
                } else {
                    console.error(xhr.statusText);
                    setFileUploadError({
                        message: `${t("File upload failed, response:")} ${xhr.statusText}`,
                    });
                    setFileUploading(false);
                    onUploadComplete?.(); // Notify parent that upload failed
                }
            };

            // Handle any upload errors
            xhr.onerror = (error) => {
                console.error(error);
                setFileUploadError({ message: t("File upload failed") });
                setFileUploading(false);
                onUploadComplete?.(); // Notify parent that upload failed
            };

            // Send the file
            xhr.send(formData);
        } catch (error) {
            console.error(error);
            setFileUploadError({ message: t("File upload failed") });
            setFileUploading(false);
            onUploadComplete?.(); // Notify parent that upload failed
        }
    };

    const uploadVideoFromUrl = async (videoUrl, videoDuration = 0) => {
        try {
            // Estimate total time as videoDuration seconds, minimum 5 seconds
            const estimatedTime = Math.max(5000, videoDuration * 1000);
            const updateInterval = 100; // Update every 100ms
            const steps = estimatedTime / updateInterval;

            // Start progress updates
            const progressInterval = setInterval(() => {
                setUploadProgress((prev) => {
                    const increment = 100 / steps;
                    return Math.min(95, prev + increment); // Cap at 95% until complete
                });
            }, updateInterval);

            const response = await fetch(
                `${config.endpoints.mediaHelper(serverUrl)}?fetch=${videoUrl}`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );

            clearInterval(progressInterval);
            setUploadProgress(100);

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                url: data.url || "",
                gcs: data.gcs || "",
            };
        } catch (error) {
            console.error("Error uploading video from URL:", error);
            throw error;
        }
    };

    const handleUrlValidation = async () => {
        if (!isValidUrl(url)) {
            setShowVideoSelector(true);
            return;
        }

        const result = await checkVideoUrl(url);
        if (result === true) {
            setFileUploading(true);
            onUploadStart?.(); // Notify parent that upload is starting

            try {
                const videoDuration = await getVideoDurationFromUrl(url);
                const uploadResult = await uploadVideoFromUrl(
                    url,
                    videoDuration,
                );
                setUrl(uploadResult.url);
                setGcs(uploadResult.gcs);
                setVideoInformation({
                    videoUrl: uploadResult.url,
                    transcriptionUrl: null,
                });
            } catch (error) {
                console.error("Error uploading video from URL:", error);
                setVideoSelectorError({
                    message: t("Error uploading video"),
                });
            } finally {
                setFileUploading(false);
                onUploadComplete?.();
            }
        } else if (result === "Video length exceeds 60 minutes") {
            setVideoSelectorError({
                message: t(
                    "Video length exceeds 60 minutes. Please use a shorter video.",
                ),
            });
        } else {
            setShowVideoSelector(true);
        }
    };

    return (
        <div className="flex flex-col gap-2 mb-5">
            {fileUploading ? (
                <div className="flex flex-col items-center justify-center gap-4 py-8">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2Icon className="w-4 h-4 animate-spin" />
                        <span>
                            {t("Processing video...")}{" "}
                            {Math.round(uploadProgress)}%
                        </span>
                    </div>
                </div>
            ) : showVideoSelector ? (
                <>
                    {videoSelectorError && (
                        <p className="text-red-500 text-sm">
                            {videoSelectorError.message}
                        </p>
                    )}
                    <VideoSelector
                        url={url}
                        onClose={() => setShowVideoSelector(false)}
                        onSelect={async (v) => {
                            try {
                                const result = await checkVideoUrl(v.videoUrl);
                                if (result === true) {
                                    setFileUploading(true);
                                    onUploadStart?.(); // Notify parent that upload is starting

                                    try {
                                        const videoDuration =
                                            await getVideoDurationFromUrl(
                                                v.videoUrl,
                                            );
                                        const uploadResult =
                                            await uploadVideoFromUrl(
                                                v.videoUrl,
                                                videoDuration,
                                            );
                                        setUrl(uploadResult.url);
                                        setGcs(uploadResult.gcs);
                                        setVideoInformation({
                                            videoUrl: uploadResult.url,
                                            transcriptionUrl:
                                                v.transcriptionUrl,
                                        });
                                        setShowVideoSelector(false);
                                        setVideoSelectorError(null);
                                    } catch (error) {
                                        console.error(
                                            "Error uploading video from URL:",
                                            error,
                                        );
                                        setVideoSelectorError({
                                            message: t("Error uploading video"),
                                        });
                                    } finally {
                                        setFileUploading(false);
                                        onUploadComplete?.();
                                    }
                                } else if (
                                    result === "Video length exceeds 60 minutes"
                                ) {
                                    setVideoSelectorError({
                                        message: t(
                                            "Video length exceeds 60 minutes. Please use a shorter video.",
                                        ),
                                    });
                                } else {
                                    setVideoSelectorError({
                                        message: t(
                                            "Invalid video URL or format",
                                        ),
                                    });
                                }
                            } catch (error) {
                                console.error("Error validating video:", error);
                                setVideoSelectorError({
                                    message: t("Error validating video"),
                                });
                                onUploadComplete?.();
                            }
                        }}
                    />
                </>
            ) : (
                <>
                    <div className="w-full">
                        <input
                            placeholder={t(
                                "Audio or video URL e.g. https://mywebsite.com/video.mp4",
                            )}
                            value={url}
                            className={`lb-input w-full`}
                            type="text"
                            size="sm"
                            onChange={(e) => {
                                setUrl(e.target.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleUrlValidation();
                                }
                            }}
                        />
                    </div>

                    <div className="url-loading-row flex gap-2 items-center grow ">
                        <button
                            disabled={!url}
                            className="lb-primary flex gap-1 ps-4 pe-3 items-center"
                            onClick={handleUrlValidation}
                        >
                            {t("Next")}{" "}
                            {direction === "rtl" ? (
                                <ArrowLeftIcon className="w-4 h-4" />
                            ) : (
                                <ArrowRightIcon className="w-4 h-4" />
                            )}
                        </button>
                    </div>

                    <span className="text-xs text-neutral-500">
                        {t(
                            "NOTE: If you use a URL from a streaming service like YouTube, we will search the internal database for the video and use that instead.",
                        )}
                    </span>

                    <div className="flex justify-center w-full">
                        <div className="flex items-center my-4">
                            <div className="w-64 border-t border-gray-300"></div>
                            <span className="px-4 text-sm text-gray-500">
                                {t("OR")}
                            </span>
                            <div className="flex-1 border-t border-gray-300 w-64"></div>
                        </div>
                    </div>

                    <div className="flex justify-center w-full">
                        <div className="flex flex-col gap-4">
                            <div
                                className="border-2 border-dashed border-gray-300 rounded-lg p-8 w-full max-w-xl hover:border-primary-500 transition-colors"
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.add(
                                        "border-primary-500",
                                    );
                                }}
                                onDragLeave={(e) => {
                                    e.currentTarget.classList.remove(
                                        "border-primary-500",
                                    );
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.remove(
                                        "border-primary-500",
                                    );
                                    const file = e.dataTransfer.files[0];
                                    const event = { target: { files: [file] } };
                                    handleFileUpload(event);
                                }}
                            >
                                <div className="text-center w-96">
                                    <label className="lb-outline-secondary text-sm flex gap-2 items-center cursor-pointer justify-center w-64 mx-auto mb-3">
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="video/*,audio/*"
                                            onChange={handleFileUpload}
                                            disabled={fileUploading}
                                        />
                                        {fileUploading ? (
                                            <>
                                                <Loader2Icon className="w-4 h-4 animate-spin" />
                                                {t("Uploading...")}{" "}
                                                {Math.round(uploadProgress)}%
                                            </>
                                        ) : (
                                            <>
                                                <UploadIcon className="w-4 h-4" />
                                                {t("Choose a file")}
                                            </>
                                        )}
                                    </label>
                                    <p className="text-sm text-gray-500 mb-2">
                                        {t("or drag and drop here")}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        {t("Supported formats")}: MP4, WebM,
                                        OGG, MP3, WAV
                                        <br />
                                        {t("Maximum file size")}: 500MB
                                    </p>
                                </div>
                            </div>
                            {fileUploadError && (
                                <p className="text-red-500 text-sm">
                                    {fileUploadError.message}
                                </p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default VideoInput;
