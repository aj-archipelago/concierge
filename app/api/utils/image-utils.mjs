import { createCanvas, loadImage } from "canvas";

/**
 * Normalize profile picture to a standard size
 * @param {Buffer} imageBuffer - The image buffer to normalize
 * @param {Object} options - Normalization options
 * @param {number} options.size - Target size (default: 400)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.9)
 * @returns {Promise<Buffer>} - Normalized image buffer as JPEG
 */
export async function normalizeProfilePicture(imageBuffer, options = {}) {
    const { size = 400, quality = 0.9 } = options;

    try {
        // Load the image
        const image = await loadImage(imageBuffer);

        // Create a square canvas
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext("2d");

        // Calculate dimensions to maintain aspect ratio and fill the square
        // We'll crop to center (smart crop) rather than padding
        const imageAspect = image.width / image.height;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = image.width;
        let sourceHeight = image.height;

        // Determine crop area to get a square from the center
        if (imageAspect > 1) {
            // Image is wider than tall - crop width to make it square
            sourceWidth = image.height;
            sourceX = (image.width - sourceWidth) / 2;
        } else {
            // Image is taller than wide - crop height to make it square
            sourceHeight = image.width;
            sourceY = (image.height - sourceHeight) / 2;
        }

        // Fill background with white (for transparency handling)
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, size, size);

        // Draw the cropped square image, scaled to fit the canvas
        ctx.drawImage(
            image,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            size,
            size,
        );

        // Convert to JPEG buffer
        const normalizedBuffer = canvas.toBuffer("image/jpeg", {
            quality: quality,
        });

        return normalizedBuffer;
    } catch (error) {
        console.error("Error normalizing profile picture:", error);
        throw new Error(`Failed to normalize image: ${error.message}`);
    }
}
