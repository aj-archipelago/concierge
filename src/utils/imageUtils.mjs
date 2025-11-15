// Get IMAGE_EXTENSIONS from mediaUtils
const getImageExtensions = async () => {
    const { IMAGE_EXTENSIONS } = await import("./mediaUtils.js");
    return IMAGE_EXTENSIONS;
};

/**
 * Simple check if a URL points to an image based on file extension
 * @param {string} url - URL to check
 * @returns {boolean} - Whether the URL likely points to an image
 */
async function isImageUrl(url) {
    try {
        const extensions = await getImageExtensions();
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        return extensions.some((ext) => pathname.endsWith(ext));
    } catch (error) {
        // If URL parsing fails, try a simple string check
        const extensions = await getImageExtensions();
        const urlLower = url.toLowerCase();
        return extensions.some((ext) => urlLower.endsWith(ext));
    }
}

export { isImageUrl };
