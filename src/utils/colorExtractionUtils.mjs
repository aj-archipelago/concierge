import { getDownloadUrl } from "./fileDownloadUtils.js";

/**
 * Extract dominant colors from an image URL
 * Returns an array of color hex codes representing the dominant colors in the image
 *
 * @param {string} imageUrl - URL of the image to extract colors from
 * @param {number} colorCount - Number of dominant colors to extract (default: 5)
 * @returns {Promise<string[]>} - Array of hex color codes (e.g., ['#FF5733', '#33FF57', ...])
 */
export async function extractColorPalette(imageUrl, colorCount = 5) {
    if (!imageUrl || typeof imageUrl !== "string") {
        return null;
    }

    try {
        // Route blob URLs through the image proxy (strips SAS for stable caching)
        const imageSrc = getDownloadUrl(imageUrl);

        // Create an image element to load the image
        const img = new Image();
        img.crossOrigin = "anonymous"; // Handle CORS if possible

        // Try to load image, with fallback to original URL if proxy fails
        let loaded = false;
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!loaded) {
                    reject(
                        new Error(
                            "Image load timeout: The image took too long to load. Please check the image URL or try again.",
                        ),
                    );
                }
            }, 10000); // 10 second timeout

            const handleLoad = () => {
                if (!loaded) {
                    loaded = true;
                    clearTimeout(timeout);
                    resolve();
                }
            };

            const handleError = () => {
                // If proxy failed and we haven't tried original URL yet, try it
                if (imageSrc !== imageUrl && !loaded) {
                    console.warn("Proxied image failed, trying original URL");
                    // Remove event listeners
                    img.onload = null;
                    img.onerror = null;
                    // Try original URL
                    img.src = imageUrl;
                    img.onload = handleLoad;
                    img.onerror = () => {
                        if (!loaded) {
                            loaded = true;
                            clearTimeout(timeout);
                            reject(
                                new Error(
                                    "Failed to load image: Unable to load the image from the provided URL. Please verify the URL is accessible.",
                                ),
                            );
                        }
                    };
                } else {
                    if (!loaded) {
                        loaded = true;
                        clearTimeout(timeout);
                        reject(
                            new Error(
                                "Failed to load image: Unable to load the image from the provided URL. Please verify the URL is accessible.",
                            ),
                        );
                    }
                }
            };

            img.onload = handleLoad;
            img.onerror = handleError;
            img.src = imageSrc;
        });

        // Create a canvas to analyze the image
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Set canvas size to image size (limit to reasonable size for performance)
        const maxDimension = 200;
        const scale = Math.min(
            maxDimension / img.width,
            maxDimension / img.height,
            1,
        );
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // Draw image to canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Extract colors using a simple quantization approach
        // Group similar colors together
        const colorMap = new Map();
        const sampleStep = 4; // Sample every 4th pixel for performance

        for (let i = 0; i < data.length; i += sampleStep * 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Skip transparent pixels
            if (a < 128) continue;

            // Quantize colors to reduce similar colors
            const quantizedR = Math.floor(r / 32) * 32;
            const quantizedG = Math.floor(g / 32) * 32;
            const quantizedB = Math.floor(b / 32) * 32;

            const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
            colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
        }

        // Sort colors by frequency and get top colors
        const sortedColors = Array.from(colorMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, colorCount)
            .map(([colorKey]) => {
                const [r, g, b] = colorKey.split(",").map(Number);
                return `#${[r, g, b]
                    .map((x) => {
                        const hex = x.toString(16);
                        return hex.length === 1 ? "0" + hex : hex;
                    })
                    .join("")}`;
            });

        return sortedColors.length > 0 ? sortedColors : null;
    } catch (error) {
        console.warn("Failed to extract color palette from image:", error);
        return null;
    }
}

/**
 * Format color palette for use in tool descriptions
 * @param {string[]|null} palette - Array of hex color codes
 * @returns {string} - Formatted string describing the color palette
 */
export function formatColorPalette(palette) {
    if (!palette || palette.length === 0) {
        return "";
    }

    return `The featured image uses the following color palette: ${palette.join(", ")}. Use these colors (or harmonious variations) in your HTML widget design to create visual coherence between the featured image and the HTML widget.`;
}
