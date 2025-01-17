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
