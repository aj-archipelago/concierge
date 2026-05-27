const OBSOLETE_AUDIO_PROMPT_SETTING_KEYS = [
    "audioUseCase",
    "audioStyle",
    "audioMood",
];

const OBSOLETE_AUDIO_MODEL_SETTING_KEYS = [
    "duration",
    "negativePrompt",
    "negative_prompt",
];

const AUDIO_MODELS_WITH_DURATION_CONTROL = new Set([
    "replicate-elevenlabs-music",
]);

const UNSUPPORTED_MINIMAX_COVER_SETTING_KEYS = [
    "audioFormat",
    "audio_format",
    "sampleRate",
    "sample_rate",
    "bitrate",
];

const OBSOLETE_AUDIO_DEFAULT_KEYS = [
    "defaultDuration",
    "defaultUseCase",
    "defaultStyle",
    "defaultMood",
];

function hasAnyKey(source, keys) {
    return keys.some((key) => key in source);
}

function isAudioModelSettings(modelSettings, modelId = "") {
    return (
        modelSettings?.type === "audio" ||
        /lyria|music/i.test(modelId) ||
        hasAnyKey(modelSettings, OBSOLETE_AUDIO_PROMPT_SETTING_KEYS)
    );
}

function isMiniMaxCoverModel(modelId = "") {
    return modelId === "replicate-minimax-music-cover";
}

export function sanitizeMediaModelSettings(modelSettings = {}, modelId = "") {
    if (!modelSettings || typeof modelSettings !== "object") {
        return modelSettings;
    }

    const obsoleteKeys = [
        ...OBSOLETE_AUDIO_PROMPT_SETTING_KEYS,
        ...(isAudioModelSettings(modelSettings, modelId)
            ? OBSOLETE_AUDIO_MODEL_SETTING_KEYS.filter(
                  (key) =>
                      key !== "duration" ||
                      !AUDIO_MODELS_WITH_DURATION_CONTROL.has(modelId),
              )
            : []),
        ...(isMiniMaxCoverModel(modelId)
            ? UNSUPPORTED_MINIMAX_COVER_SETTING_KEYS
            : []),
    ];

    if (!hasAnyKey(modelSettings, obsoleteKeys)) {
        return modelSettings;
    }

    const sanitized = { ...modelSettings };
    for (const key of obsoleteKeys) {
        delete sanitized[key];
    }
    return sanitized;
}

export function sanitizeLegacyAudioDefaults(audioSettings = {}) {
    if (!audioSettings || typeof audioSettings !== "object") {
        return audioSettings;
    }

    if (!OBSOLETE_AUDIO_DEFAULT_KEYS.some((key) => key in audioSettings)) {
        return audioSettings;
    }

    const sanitized = { ...audioSettings };
    for (const key of OBSOLETE_AUDIO_DEFAULT_KEYS) {
        delete sanitized[key];
    }
    return sanitized;
}

export function sanitizeMediaSettings(settings = {}) {
    if (!settings || typeof settings !== "object") {
        return settings;
    }

    let changed = false;
    let models = settings.models;

    if (settings.models) {
        models = {};
        for (const [modelId, modelSettings] of Object.entries(
            settings.models,
        )) {
            const sanitized = sanitizeMediaModelSettings(
                modelSettings,
                modelId,
            );
            models[modelId] = sanitized;
            changed = changed || sanitized !== modelSettings;
        }
    }

    const audio = sanitizeLegacyAudioDefaults(settings.audio);
    if (audio !== settings.audio) {
        changed = true;
    }

    if (!changed) {
        return settings;
    }

    return {
        ...settings,
        ...(settings.models ? { models } : {}),
        ...(settings.audio ? { audio } : {}),
    };
}
