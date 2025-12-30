/**
 * Checks if a given URL is a valid YouTube URL
 * Supports standard youtube.com, shortened youtu.be, embed URLs, and shorts URLs
 *
 * @param {string} url - The URL to check
 * @returns {boolean} - True if URL is a valid YouTube URL
 */
export function isYoutubeUrl(url) {
    try {
        const urlObj = new URL(url);

        // Check for standard youtube.com domains
        if (
            urlObj.hostname === "youtube.com" ||
            urlObj.hostname === "www.youtube.com"
        ) {
            // For standard watch URLs, verify they have a video ID
            if (urlObj.pathname === "/watch") {
                return !!urlObj.searchParams.get("v");
            }
            // For embed URLs, verify they have a video ID in the path
            if (urlObj.pathname.startsWith("/embed/")) {
                return urlObj.pathname.length > 7; // '/embed/' is 7 chars
            }
            // For shorts URLs, verify they have a video ID in the path
            if (urlObj.pathname.startsWith("/shorts/")) {
                return urlObj.pathname.length > 8; // '/shorts/' is 8 chars
            }
            return false;
        }

        // Check for shortened youtu.be domain
        if (urlObj.hostname === "youtu.be") {
            // Verify there's a video ID in the path
            return urlObj.pathname.length > 1; // '/' is 1 char
        }

        return false;
    } catch (err) {
        return false;
    }
}

/**
 * Converts a YouTube URL to its embed format
 * Supports standard youtube.com, shortened youtu.be URLs
 *
 * @param {string} url - The YouTube URL to convert
 * @returns {string|null} - The embed URL if valid, null if invalid
 */
export function getYoutubeEmbedUrl(url) {
    try {
        const urlObj = new URL(url);
        let videoId = null;

        // Handle standard youtube.com URLs
        if (
            urlObj.hostname === "youtube.com" ||
            urlObj.hostname === "www.youtube.com"
        ) {
            if (urlObj.pathname === "/watch") {
                videoId = urlObj.searchParams.get("v");
            } else if (urlObj.pathname.startsWith("/embed/")) {
                videoId = urlObj.pathname.slice(7); // Remove '/embed/'
            }
        }

        // Handle shortened youtu.be URLs
        else if (urlObj.hostname === "youtu.be") {
            videoId = urlObj.pathname.slice(1); // Remove leading '/'
        }

        return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    } catch (err) {
        return null;
    }
}

export function getYoutubeVideoId(url) {
    const embedUrl = getYoutubeEmbedUrl(url);
    if (!embedUrl) {
        throw new Error("Invalid YouTube URL");
    }
    const urlObj = new URL(embedUrl);
    return urlObj.pathname.slice(7); // Remove '/embed/'
}

/**
 * Extracts YouTube video ID from various YouTube URL formats
 * Supports watch URLs, embed URLs, youtu.be URLs, and shorts URLs
 *
 * @param {string} url - The YouTube URL
 * @returns {string|null} - The video ID if found, null otherwise
 */
export function extractYoutubeVideoId(url) {
    if (!url) return null;

    try {
        const urlObj = new URL(url);

        // Handle standard youtube.com URLs
        if (
            urlObj.hostname === "youtube.com" ||
            urlObj.hostname === "www.youtube.com"
        ) {
            if (urlObj.pathname === "/watch") {
                return urlObj.searchParams.get("v");
            } else if (urlObj.pathname.startsWith("/embed/")) {
                return urlObj.pathname.slice(7).split("?")[0]; // Remove '/embed/' and query params
            } else if (urlObj.pathname.startsWith("/shorts/")) {
                return urlObj.pathname.slice(8).split("?")[0]; // Remove '/shorts/' and query params
            }
        }

        // Handle shortened youtu.be URLs
        if (urlObj.hostname === "youtu.be") {
            return urlObj.pathname.slice(1).split("?")[0]; // Remove leading '/' and query params
        }

        // Fallback: try regex matching for edge cases
        const videoIdMatch = url.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^?&]+)/,
        );
        return videoIdMatch ? videoIdMatch[1] : null;
    } catch (err) {
        // Fallback: try regex matching if URL parsing fails
        const videoIdMatch = url.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^?&]+)/,
        );
        return videoIdMatch ? videoIdMatch[1] : null;
    }
}

/**
 * Gets YouTube thumbnail URL for a video ID
 *
 * @param {string} videoId - The YouTube video ID
 * @param {string} quality - Thumbnail quality: 'maxresdefault', 'hqdefault', 'mqdefault', 'sddefault', 'default'
 * @returns {string} - The thumbnail URL
 */
export function getYoutubeThumbnailUrl(videoId, quality = "maxresdefault") {
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}
