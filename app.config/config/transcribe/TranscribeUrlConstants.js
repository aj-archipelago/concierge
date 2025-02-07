import { isYoutubeUrl } from "../../../src/utils/urlUtils";

export const AJE = "665003303001";
export const AJA = "665001584001";
export const getAxisUrl = (accountId, searchQuery) =>
    `https://axis.aljazeera.net/brightcove/playback/media/v1.0/${accountId}/videos?format=json&q=${encodeURIComponent(searchQuery)}`;

export const fetchUrlSource = async (url) => {
    const response = await fetch(
        `/api/urlsource?url=${encodeURIComponent(url)}`,
    );
    if (!response.ok) {
        const data = await response.json();
        if (data.error === "Unsupported YouTube channel" && isYoutubeUrl(url)) {
            // Convert YouTube URL to embed URL
            const videoId = url.match(/(?:v=|\/)([\w-]{11})(?:\?|$|&)/)?.[1];
            const embedUrl = videoId
                ? `https://www.youtube.com/embed/${videoId}`
                : url;

            // Fetch video title using oEmbed
            let videoTitle = "YouTube Video (External)";
            try {
                const oembedResponse = await fetch(
                    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
                );
                if (oembedResponse.ok) {
                    const oembedData = await oembedResponse.json();
                    videoTitle = oembedData.title;
                }
            } catch (e) {
                console.warn("Failed to fetch YouTube video title:", e);
            }

            return {
                results: [
                    {
                        name: videoTitle,
                        similarity: 1,
                        videoUrl: embedUrl,
                        url: url,
                        isYouTube: true,
                    },
                ],
            };
        }
        throw new Error(
            formatErrorMessage(data.error) || "Network response was not ok",
        );
    }
    return response.json();
};

const formatErrorMessage = (error) => {
    const errorMessages = {
        "Unsupported YouTube channel":
            "This YouTube channel is not supported. If you're using a YouTube URL, it should be from an Al Jazeera channel. Otherwise, please use a direct URL to a video file (e.g. mp4, webm, etc.)",
        // Add more error mappings as needed
    };

    return errorMessages[error] || error;
};
