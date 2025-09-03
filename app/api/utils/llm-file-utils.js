import config from "../../../config/index.js";

/**
 * Generate short-lived URL from file hash using the media helper service
 * The checkHash operation now always returns short-lived URLs by default
 * @param {Object} file - File object with hash, url, filename properties
 * @param {number} minutes - Duration in minutes for the short-lived URL (default: 5)
 * @returns {Promise<string>} - Short-lived URL or fallback to original URL
 */
export async function generateShortLivedUrl(file, minutes = 5) {
    // Only generate short-lived URL if file has a hash
    if (!file.hash) {
        throw new Error("No hash found for file " + file.originalName);
    }

    try {
        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            throw new Error("mediaHelperDirect endpoint is not defined");
        }

        // Generate short-lived URL using checkHash (always returns short-lived URLs)
        const shortLivedResponse = await fetch(
            `${mediaHelperUrl}?hash=${file.hash}&checkHash=true&shortLivedMinutes=${minutes}`,
            {
                method: "GET",
            },
        );

        if (!shortLivedResponse.ok) {
            console.warn(
                `Failed to generate short-lived URL for hash ${file.hash}, using original URL. Status: ${shortLivedResponse.status}`,
            );
            return file.url;
        }

        const shortLivedData = await shortLivedResponse.json();

        if (!shortLivedData.shortLivedUrl) {
            throw new Error("No short-lived URL found for hash " + file.hash);
        }

        // checkHash now always returns shortLivedUrl, but keep fallback for safety
        return shortLivedData.shortLivedUrl;
    } catch (error) {
        console.error(
            `Error generating short-lived URL for hash ${file.hash}:`,
            error,
        );
        return file.url; // Fallback to original URL
    }
}

/**
 * Prepare file content for chat history with short-lived URLs
 * @param {Array} files - Array of file objects
 * @returns {Promise<Array>} - Array of stringified file content objects
 */
export async function prepareFileContentForLLM(files) {
    if (!files || files.length === 0) return [];

    // Generate short-lived URLs for all files
    const filePromises = files.map(async (file) => {
        const shortLivedUrl = await generateShortLivedUrl(file);

        const obj = {
            type: "image_url",
        };

        obj.gcs = file.gcsUrl || file.gcs || file.url;
        obj.url = shortLivedUrl; // Use short-lived URL for security
        obj.image_url = { url: shortLivedUrl }; // Use short-lived URL for security

        // Include original filename if available
        if (file.originalName || file.originalFilename) {
            obj.originalFilename = file.originalName || file.originalFilename;
        }

        return JSON.stringify(obj);
    });

    return Promise.all(filePromises);
}

/**
 * Get LLM by ID with fallback to default LLM
 * @param {import('../models/llm')} LLM - LLM model
 * @param {string} llmId - LLM ID to lookup
 * @returns {Promise<Object>} - LLM object
 */
export async function getLLMWithFallback(LLM, llmId) {
    let llm;

    if (llmId) {
        llm = await LLM.findOne({ _id: llmId });
    }

    // If no LLM is found, use the default LLM
    if (!llm) {
        llm = await LLM.findOne({ isDefault: true });
    }

    return llm;
}
