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

// Create a WeakMap to store stable IDs for image nodes
const imageNodeIds = new WeakMap();

// Add a Map to cache IDs by URL to prevent duplicates
const imageUrlToId = new Map();

// Add a Map to track temporary to permanent URL mappings
const tempToPermanentUrlMap = new Map();

let nextImageId = 1;

function getStableImageId(src, node = null) {
    // Check if this is a temporary URL that has a permanent version
    const permanentUrl = tempToPermanentUrlMap.get(src);
    const urlToUse = permanentUrl || src;

    // First check if we have an ID for this URL
    let stableId = imageUrlToId.get(urlToUse);
    if (!stableId) {
        // If we have a node, try to get its ID
        if (node && typeof node === "object") {
            stableId = imageNodeIds.get(node);
        }
        // If still no ID, generate a new one
        if (!stableId) {
            stableId = `img-${nextImageId++}`;
            // Only store in WeakMap if we have a valid node
            if (node && typeof node === "object") {
                imageNodeIds.set(node, stableId);
            }
        }
        // Cache the ID for this URL
        imageUrlToId.set(urlToUse, stableId);

        // If this is a temporary URL, also store the ID for the permanent URL
        if (permanentUrl) {
            imageUrlToId.set(permanentUrl, stableId);
        }
    }
    return stableId;
}

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

// Preload an image to ensure it's in the browser cache
function preloadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = (err) => reject(err);
        img.src = url;
    });
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

    // Create a map of replacements to apply
    const replacements = [];
    const preloadPromises = [];

    for (const { url, description, fullMatch } of matches) {
        if (isImageUrl(url)) {
            try {
                // Create URL object from base media helper URL
                const baseUrl = new URL(getMediaHelperUrl(serverUrl));
                // Add fetch parameter to existing parameters
                baseUrl.searchParams.append("fetch", url);
                const mediaHelperUrl = baseUrl.toString();

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

                        // Store the mapping from temporary to permanent URL
                        tempToPermanentUrlMap.set(url, data.url);

                        // Preload the permanent image and track the promise
                        preloadPromises.push(
                            preloadImage(data.url).catch(() => {}),
                        );

                        // Store the replacement to apply
                        if (description !== null) {
                            // Replace markdown image with preserved description
                            replacements.push({
                                original: fullMatch,
                                replacement: `![${description}](${data.url})`,
                            });
                        } else {
                            // Replace regular URL
                            replacements.push({
                                original: url,
                                replacement: data.url,
                            });
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

    // Wait for all images to preload (with a reasonable timeout)
    if (preloadPromises.length > 0) {
        await Promise.race([
            Promise.all(preloadPromises),
            new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
    }

    // Apply all replacements
    let processedMessage = message;
    for (const { original, replacement } of replacements) {
        processedMessage = processedMessage.replace(original, replacement);
    }

    return processedMessage;
}

export {
    getStableImageId,
    imageNodeIds,
    imageUrlToId,
    tempToPermanentUrlMap,
    IMAGE_EXTENSIONS,
    isImageUrl,
    processImageUrls,
};
