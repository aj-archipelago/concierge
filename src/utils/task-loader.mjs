/**
 * Loads a handler module by type with optional fallback behavior
 * @param {string} type - The type of handler to load
 * @param {boolean} [silent=false] - If true, returns null instead of throwing on error
 * @returns {Promise<Object|null>} The handler module or null if silent=true and loading fails
 */
export async function loadTaskDefinition(type, silent = false) {
    try {
        const handler = await import(`../../jobs/tasks/${type}.mjs`);
        return handler.default;
    } catch (error) {
        if (!silent) {
            console.error(`Failed to load handler for type ${type}:`, error);
            throw error;
        }
        return null;
    }
}

/**
 * Gets the display name for a handler type
 * @param {string} type - The type of handler
 * @returns {Promise<string>} The display name or the original type if not found
 */
export async function getTaskDisplayName(type) {
    const handler = await loadTaskDefinition(type, true);
    return handler?.displayName || type;
}
