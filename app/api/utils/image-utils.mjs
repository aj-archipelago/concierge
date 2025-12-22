import sharp from "sharp";

/**
 * Normalize profile picture to a standard size
 * Uses Sharp for broad format support (JPEG, PNG, WebP, HEIC, AVIF, etc.)
 *
 * @param {Buffer} imageBuffer - The image buffer to normalize
 * @param {Object} options - Normalization options
 * @param {number} options.size - Target size (default: 400)
 * @param {number} options.quality - JPEG quality 1-100 (default: 90)
 * @returns {Promise<Buffer>} - Normalized image buffer as JPEG
 */
export async function normalizeProfilePicture(imageBuffer, options = {}) {
    const { size = 400, quality = 90 } = options;

    try {
        const normalizedBuffer = await sharp(imageBuffer)
            // Resize to square, cropping from center to fill
            .resize(size, size, {
                fit: "cover",
                position: "center",
            })
            // Flatten transparency to white background
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            // Convert to JPEG
            .jpeg({ quality })
            .toBuffer();

        return normalizedBuffer;
    } catch (error) {
        console.error("Error normalizing profile picture:", error);
        throw new Error(`Failed to normalize image: ${error.message}`);
    }
}
