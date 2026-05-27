export function getRangeMax(range, fallback = Infinity) {
    if (Array.isArray(range)) {
        const max = Number(range[1] ?? range[0]);
        return Number.isFinite(max) ? max : fallback;
    }
    const max = Number(range);
    return Number.isFinite(max) ? max : fallback;
}

function getRoleLimitMax(roleLimits, role, fallback) {
    if (!roleLimits || typeof roleLimits !== "object") return fallback;
    const range = roleLimits[role] ?? roleLimits.default;
    if (range === undefined) return fallback;
    return getRangeMax(range, fallback);
}

export function getImageReferenceLimitConfig(modelMeta, modelSettings = {}) {
    const mediaDefaults = modelMeta?.mediaDefaults || {};
    return {
        totalMax: getRangeMax(
            mediaDefaults.inputImages ?? modelSettings?.inputImages,
            3,
        ),
        roleLimits:
            modelMeta?.referenceImageRoleLimits ||
            modelMeta?.imageReferenceRoleLimits ||
            modelMeta?.inputImageRoleLimits ||
            null,
    };
}

export function getReferenceRoleLimitMax(modelMeta, role, modelSettings = {}) {
    const config = getImageReferenceLimitConfig(modelMeta, modelSettings);
    return getRoleLimitMax(
        config.roleLimits,
        role || "reference",
        config.totalMax,
    );
}

export function getVideoFrameReferenceRoles(modelMeta) {
    return new Set(modelMeta?.videoFrameReferenceRoles || []);
}

export function isVideoFrameReferenceRole(modelMeta, role) {
    return getVideoFrameReferenceRoles(modelMeta).has(role);
}

export function validateImageReferenceLimits(
    images,
    { modelMeta, modelSettings, getRole } = {},
) {
    const imageItems = (images || []).filter((item) => item?.type === "image");
    const config = getImageReferenceLimitConfig(modelMeta, modelSettings);
    if (imageItems.length > config.totalMax) return false;

    if (!config.roleLimits) return true;

    const countsByRole = new Map();
    for (const image of imageItems) {
        const role = getRole?.(image) || "reference";
        const nextCount = (countsByRole.get(role) || 0) + 1;
        countsByRole.set(role, nextCount);
        if (
            nextCount >
            getRoleLimitMax(config.roleLimits, role, config.totalMax)
        ) {
            return false;
        }
    }

    return true;
}

export function selectImageReferencesWithinLimits(
    images,
    { modelMeta, modelSettings, getRole } = {},
) {
    const imageItems = (images || []).filter((item) => item?.type === "image");
    const config = getImageReferenceLimitConfig(modelMeta, modelSettings);
    const selected = [];
    const countsByRole = new Map();

    for (const image of imageItems) {
        if (selected.length >= config.totalMax) break;

        const role = getRole?.(image) || "reference";
        const roleCount = countsByRole.get(role) || 0;
        const roleMax = getRoleLimitMax(
            config.roleLimits,
            role,
            config.totalMax,
        );
        if (roleCount >= roleMax) continue;

        selected.push(image);
        countsByRole.set(role, roleCount + 1);
    }

    return selected;
}
