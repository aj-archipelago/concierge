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
import { hashMediaFile, getVideoDuration } from "../../utils/mediaUtils";
import { LanguageContext } from "../../contexts/LanguageProvider";

const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch (error) {
        return false;
    }
};

const MAX_VIDEO_DURATION = 3600; // 60 minutes in seconds

const checkDuration = async (duration) => {
    if (duration > MAX_VIDEO_DURATION) {
        throw new Error("Video length exceeds 60 minutes");
    }
    return true;
};

const checkVideoUrl = async (url) => {
    let video = null;
    try {
        // First check if it's a valid video URL
        const response = await fetch(url, { method: "HEAD" });
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.startsWith("video/")) {
            return false;
        }

        // Check video duration
        video = document.createElement("video");
        video.preload = "metadata";

        const durationPromise = new Promise((resolve, reject) => {
            video.onloadedmetadata = () => resolve(video.duration);
            video.onerror = reject;
        });

        video.src = url;

        const duration = await durationPromise;
        await checkDuration(duration);
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

function VideoInput({ url, setUrl, setVideoInformation }) {
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
                    setVideoInformation({
                        videoUrl: data.url,
                        transcriptionUrl: null,
                    });
                    setFileUploading(false);
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
                    setVideoInformation({
                        videoUrl: fileUrl,
                        transcriptionUrl: null,
                    });
                    setFileUploading(false);
                } else {
                    console.error(xhr.statusText);
                    setFileUploadError({
                        message: `${t("File upload failed, response:")} ${xhr.statusText}`,
                    });
                    setFileUploading(false);
                }
            };

            // Handle any upload errors
            xhr.onerror = (error) => {
                console.error(error);
                setFileUploadError({ message: t("File upload failed") });
                setFileUploading(false);
            };

            // Send the file
            xhr.send(formData);
        } catch (error) {
            console.error(error);
            setFileUploadError({ message: t("File upload failed") });
            setFileUploading(false);
        }
    };

    const handleUrlValidation = async () => {
        if (!isValidUrl(url)) {
            setShowVideoSelector(true);
            return;
        }

        const result = await checkVideoUrl(url);
        if (result === true) {
            setVideoInformation({ videoUrl: url, transcriptionUrl: null });
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
            {showVideoSelector ? (
                <>
                    {videoSelectorError && (
                        <p className="text-red-500 text-sm">
                            {videoSelectorError.message}
                        </p>
                    )}
                    <VideoSelector
                        url={url}
                        onSelect={async (v) => {
                            try {
                                const result = await checkVideoUrl(v.videoUrl);
                                if (result === true) {
                                    setVideoInformation(v);
                                    setShowVideoSelector(false);
                                    setVideoSelectorError(null);
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

                    <div className="flex items-center my-4 max-w-xl">
                        <div className="w-64 border-t border-gray-300"></div>
                        <span className="px-4 text-sm text-gray-500">
                            {t("OR")}
                        </span>
                        <div className="flex-1 border-t border-gray-300"></div>
                    </div>

                    <div className="flex flex-col  gap-4">
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
                            <div className="text-center">
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
                                            {t("Uploading...")} {uploadProgress}
                                            %
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
                                    {t("Supported formats")}: MP4, WebM, OGG,
                                    MP3, WAV
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
                </>
            )}
        </div>
    );
}

export default VideoInput;
