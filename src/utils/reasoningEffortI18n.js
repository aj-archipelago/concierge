/**
 * API/storage values for reasoning effort (aligned with Cortex entity options).
 * @type {Readonly<["none", "low", "medium", "high"]>}
 */
export const REASONING_EFFORT_LEVELS = Object.freeze([
    "none",
    "low",
    "medium",
    "high",
]);

/**
 * i18n key for the display label of a reasoning effort level (not the API value).
 * @param {string} level
 * @returns {string}
 */
export function reasoningEffortLevelLabelKey(level) {
    return `reasoning_effort_level_${level}`;
}

export function getReasoningEffortLevelsForModel(model) {
    const configuredLevels = model?.supportedReasoningEfforts;

    if (!Array.isArray(configuredLevels) || configuredLevels.length === 0) {
        return REASONING_EFFORT_LEVELS;
    }

    const configuredLevelSet = new Set(configuredLevels);
    const supportedLevels = REASONING_EFFORT_LEVELS.filter((level) =>
        configuredLevelSet.has(level),
    );

    return supportedLevels.length > 0
        ? supportedLevels
        : REASONING_EFFORT_LEVELS;
}

export function normalizeReasoningEffortForModel(
    model,
    reasoningEffort,
    fallback = "low",
) {
    const levels = getReasoningEffortLevelsForModel(model);
    const candidate = reasoningEffort || fallback;

    return levels.includes(candidate) ? candidate : levels[0];
}
