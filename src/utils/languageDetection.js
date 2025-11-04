/**
 * Utility functions for detecting text language
 */

/**
 * Detects if the given text is primarily Arabic
 * @param {string} text - The text to analyze
 * @returns {boolean} - True if the text is primarily Arabic, false otherwise
 */
export function isArabicText(text) {
    if (!text || typeof text !== "string") {
        return false;
    }

    // Remove HTML tags, whitespace, numbers, and punctuation for analysis
    const cleanText = text
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/\s+/g, "") // Remove whitespace
        .replace(/[0-9]/g, "") // Remove numbers
        .replace(/[.,;:!?()[\]{}"'-]/g, ""); // Remove common punctuation

    if (cleanText.length === 0) {
        return false;
    }

    // Arabic Unicode range: U+0600 to U+06FF (Arabic block)
    // Additional Arabic ranges: U+0750-U+077F (Arabic Supplement), U+08A0-U+08FF (Arabic Extended-A)

    // Count Arabic characters
    const arabicMatches = cleanText.match(
        /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g,
    );
    const arabicCharCount = arabicMatches ? arabicMatches.length : 0;

    // Consider text Arabic if more than 30% of characters are Arabic
    // This threshold works better for mixed content scenarios
    const arabicRatio = arabicCharCount / cleanText.length;

    return arabicRatio > 0.3;
}

/**
 * Determines the appropriate grammar endpoint based on text language
 * @param {string} text - The text to analyze
 * @returns {string} - Returns 'GRAMMAR_AR' if Arabic is detected, otherwise 'GRAMMAR'
 */
export function getGrammarEndpoint(text) {
    return isArabicText(text) ? "GRAMMAR_AR" : "GRAMMAR";
}
