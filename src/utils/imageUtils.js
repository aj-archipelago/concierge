// Support both CommonJS and ES modules
const getConfig = () => {
    try {
        return require("../../config").default;
    } catch {
        return require("../../config");
    }
};

// Get media helper URL in both frontend and worker contexts
const getMediaHelperUrl = (serverUrl) => {
    // Try worker environment first
    if (process.env.CORTEX_MEDIA_API_URL) {
        return process.env.CORTEX_MEDIA_API_URL;
    }
    // Fallback to frontend config
    const config = getConfig();
    return config.endpoints.mediaHelper(serverUrl);
};

// Skip image processing if no media helper is configured
const isMediaHelperConfigured = () => {
    try {
        return (
            process.env.CORTEX_MEDIA_API_URL ||
            (getConfig()?.endpoints?.mediaHelper &&
                typeof getConfig().endpoints.mediaHelper === "function")
        );
    } catch (error) {
        return false;
    }
};

// Common image extensions that we want to process
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

/**
 * Simple check if a URL points to an image based on file extension
 * @param {string} url - URL to check
 * @returns {boolean} - Whether the URL likely points to an image
 */
function isImageUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
    } catch (error) {
        // If URL parsing fails, try a simple string check
        const urlLower = url.toLowerCase();
        return IMAGE_EXTENSIONS.some((ext) => urlLower.endsWith(ext));
    }
}

const MEDIA_HELPER_TIMEOUT_MS = 5000; // 5 seconds timeout

/**
 * Processes a message containing image URLs, replacing temporary URLs with permanent ones
 * by uploading them to blob storage via the media helper.
 *
 * @param {string} message - The message containing image URLs to process
 * @param {string} serverUrl - The server URL to use for the media helper
 * @returns {Promise<string>} The message with temporary URLs replaced with permanent ones
 */
async function processImageUrls(message, serverUrl) {
    if (typeof message !== "string" || !isMediaHelperConfigured()) {
        return message;
    }

    // Match URLs in markdown image syntax ![description](url) or regular URLs
    const urlRegex = /(?:!\[([^\]]*)\]\(([^)]+)\))|(?:https?:\/\/[^\s<>"]+)/g;
    const matches = [];
    let match;

    // Extract URLs from matches, handling both markdown and regular URLs
    while ((match = urlRegex.exec(message)) !== null) {
        if (match[2]) {
            // It's a markdown image with [description](url)
            matches.push({
                url: match[2],
                description: match[1],
                fullMatch: match[0],
            });
        } else {
            // It's a regular URL
            matches.push({
                url: match[0],
                description: null,
                fullMatch: match[0],
            });
        }
    }

    for (const { url, description, fullMatch } of matches) {
        if (isImageUrl(url)) {
            try {
                const mediaHelperUrl = `${getMediaHelperUrl(serverUrl)}?fetch=${encodeURIComponent(url)}`;

                // Create an AbortController for the timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    MEDIA_HELPER_TIMEOUT_MS,
                );

                try {
                    const uploadResponse = await fetch(mediaHelperUrl, {
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);

                    if (uploadResponse.ok) {
                        const data = await uploadResponse.json();
                        if (description !== null) {
                            // Replace markdown image with preserved description
                            message = message.replace(
                                fullMatch,
                                `![${description}](${data.url})`,
                            );
                        } else {
                            // Replace regular URL
                            message = message.replace(url, data.url);
                        }
                        console.log(
                            "Replaced temporary image URL with permanent URL:",
                            data.url,
                        );
                    }
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    if (fetchError.name !== "AbortError") {
                        console.error(
                            "Error fetching from media helper:",
                            fetchError,
                        );
                    }
                }
            } catch (error) {
                console.error("Error processing image URL:", error);
            }
        }
    }
    return message;
}

// Export in a way that works for both CommonJS and ES modules
module.exports = { processImageUrls };
module.exports.default = { processImageUrls };
