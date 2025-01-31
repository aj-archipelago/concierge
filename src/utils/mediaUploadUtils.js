import config from "../../config";
import { getVideoDurationFromUrl } from "./mediaUtils";

export const uploadVideoFromUrl = async (
    videoUrl,
    serverUrl,
    setUploadProgress,
) => {
    let videoDuration;
    try {
        videoDuration = await getVideoDurationFromUrl(videoUrl);
    } catch (error) {
        console.warn("Failed to get video duration:", error);
    }

    try {
        let progressInterval;
        if (videoDuration) {
            const estimatedTime = Math.max(5000, videoDuration * 1000);
            const updateInterval = 100;
            const steps = estimatedTime / updateInterval;

            progressInterval = setInterval(() => {
                setUploadProgress((prev) => {
                    const increment = 100 / steps;
                    return Math.min(95, prev + increment);
                });
            }, updateInterval);
        }

        const response = await fetch(
            `${config.endpoints.mediaHelper(serverUrl)}?fetch=${encodeURIComponent(videoUrl)}`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );

        if (progressInterval) {
            clearInterval(progressInterval);
            setUploadProgress(100);
        }

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `Upload failed: ${response.statusText}. Response body: ${errorBody}`,
            );
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
