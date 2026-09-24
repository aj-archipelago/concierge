import { buildMediaModelControls } from "./mediaModelControls.js";
import { resolveMediaModelOptions } from "./mediaModelOptions.js";
import { MEDIA_SETTING_KEYS } from "./mediaGenerationVariables.js";
import { sanitizeMediaModelSettings } from "./mediaGenerationSettings.js";

export const MEDIA_CATEGORIES = ["image", "video", "audio", "tts", "upscaling"];
export const isSelectableMediaModel = (model) =>
    model?.isAvailable !== false &&
    !model?.isDeprecated &&
    MEDIA_CATEGORIES.includes(model?.category);

export function mediaInputError(message) {
    return Object.assign(new Error(message), { status: 400 });
}

export function mediaOutputType(model) {
    if (model.category === "tts") return "audio";
    if (model.category === "upscaling")
        return model.mediaDefaults?.inputImages ? "image" : "video";
    return model.category;
}

export function describeMediaModel(model, settings = {}) {
    const resolved = resolveMediaModelOptions(model, settings);
    const controls = buildMediaModelControls(resolved);
    const keys = new Set(controls.map((control) => control.key));
    // Some older models expose settings only as defaults. Keep those usable too.
    for (const [key, value] of Object.entries(model.mediaDefaults || {})) {
        if (
            !keys.has(key) &&
            MEDIA_SETTING_KEYS.includes(key) &&
            ["string", "number", "boolean"].includes(typeof value)
        ) {
            controls.push({
                key,
                type: typeof value === "string" ? "text" : typeof value,
                defaultValue: value,
            });
        }
    }
    return {
        model: model.modelId,
        name: model.displayName || model.modelId,
        category: model.category,
        outputType: mediaOutputType(model),
        controls,
        defaults: model.mediaDefaults || {},
        conditionalOptions: model.mediaDefaultOverrides || [],
        inputModes: model.mediaInputModes || [],
        videoInputModes: model.videoInputModes || [],
        imageRoles: model.referenceImageRoles || [],
        imageRoleLimits: model.referenceImageRoleLimits || {},
        videoFrameRoles: model.videoFrameReferenceRoles || [],
        referenceDescriptions:
            model.mediaReferenceDescriptions ||
            model.referenceDescriptions ||
            {},
    };
}

export function validateMediaSettings(model, settings = {}) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
        throw mediaInputError("settings must be an object");
    const controls = describeMediaModel(model, settings).controls;
    const normalized = {};
    for (const [key, value] of Object.entries(settings)) {
        if (!MEDIA_SETTING_KEYS.includes(key))
            throw mediaInputError(
                `Unsupported setting: ${key}. Describe the selected model first.`,
            );
        const control = controls.find(
            (item) => item.key === key || item.aliases?.includes(key),
        );
        if (
            value == null ||
            !["string", "number", "boolean"].includes(typeof value)
        )
            throw mediaInputError(`Invalid value for ${key}`);
        if (typeof value === "string" && value.length > 50000)
            throw mediaInputError(`${key} is too long`);
        if (
            control?.options?.length &&
            !control.options.some(
                (option) => (option.value ?? option) === value,
            )
        )
            throw mediaInputError(
                `Invalid ${key}; describe the model with these settings to see allowed options`,
            );
        if (control?.type === "boolean" && typeof value !== "boolean")
            throw mediaInputError(`${key} must be boolean`);
        if (
            ["number", "integer"].includes(control?.type) &&
            (typeof value !== "number" ||
                !Number.isFinite(value) ||
                (control.type === "integer" && !Number.isInteger(value)) ||
                (control.min != null && value < control.min) ||
                (control.max != null && value > control.max))
        )
            throw mediaInputError(`Invalid number for ${key}`);
        if (
            ["text", "textarea"].includes(control?.type) &&
            typeof value !== "string"
        )
            throw mediaInputError(`${key} must be text`);
        const canonicalKey = control?.key || key;
        if (
            Object.hasOwn(normalized, canonicalKey) &&
            normalized[canonicalKey] !== value
        )
            throw mediaInputError(`Conflicting values for ${canonicalKey}`);
        normalized[canonicalKey] = value;
    }
    const sanitized = sanitizeMediaModelSettings(normalized, model.modelId);
    const removed = Object.keys(normalized).filter(
        (key) => !Object.hasOwn(sanitized, key),
    );
    if (removed.length)
        throw mediaInputError(
            `Settings no longer supported by this model: ${removed.join(", ")}`,
        );
    return sanitized;
}
