export function getInputRequirementRange(requirement) {
    if (Array.isArray(requirement)) {
        return [
            Number(requirement[0] ?? 0) || 0,
            Number(requirement[1] ?? requirement[0] ?? 0),
        ];
    }
    if (requirement === undefined || requirement === null) return null;
    const value = Number(requirement);
    if (!Number.isFinite(value)) return null;
    return [value, value];
}

function countMatchesInputRequirement(count, requirement) {
    const range = getInputRequirementRange(requirement);
    if (!range) return true;
    const [min = 0, max = Number.POSITIVE_INFINITY] = range;
    return count >= min && count <= max;
}

function hasInputModeTextRequirement(requirement, { modelSettings, prompt }) {
    if (!requirement || typeof requirement !== "object") return false;
    if (requirement.prompt === true)
        return Boolean(String(prompt || "").trim());
    if (requirement.setting) {
        const value = modelSettings?.[requirement.setting];
        return typeof value === "string"
            ? Boolean(value.trim())
            : Boolean(value);
    }
    return false;
}

function isMediaInputModeSatisfied(
    mode,
    {
        inputImagesCount,
        inputVideosCount,
        inputAudioCount,
        modelSettings,
        prompt,
    },
) {
    const requires = mode?.requires || {};
    if (
        !countMatchesInputRequirement(inputImagesCount, requires.inputImages) ||
        !countMatchesInputRequirement(inputVideosCount, requires.inputVideos) ||
        !countMatchesInputRequirement(inputAudioCount, requires.inputAudio)
    ) {
        return false;
    }

    if (
        !Array.isArray(mode?.requiresAnyOf) ||
        mode.requiresAnyOf.length === 0
    ) {
        return true;
    }

    return mode.requiresAnyOf.some((requirement) =>
        hasInputModeTextRequirement(requirement, { modelSettings, prompt }),
    );
}

export function hasSatisfiedPromptlessInputMode(modelMeta, context) {
    const modes = Array.isArray(modelMeta?.mediaInputModes)
        ? modelMeta.mediaInputModes
        : [];
    return modes.some(
        (mode) =>
            mode?.promptRequired === false &&
            isMediaInputModeSatisfied(mode, context),
    );
}
