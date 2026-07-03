export const LANGUAGE_NAMES = {
    en: "English",
    ar: "Arabic",
    es: "Spanish",
    fr: "French",
    bs: "Bosnian",
    hr: "Croatian",
    zh: "Chinese",
    de: "German",
    he: "Hebrew",
    it: "Italian",
    ja: "Japanese",
    ko: "Korean",
    pt: "Portuguese",
    ru: "Russian",
    sr: "Serbian",
    tr: "Turkish",
    "ur-Latn": "Roman Urdu",
    pa: "Punjabi",
    hi: "Hindi",
};

const CODE_TRANSLATION_UNSUPPORTED_LANGUAGES = new Set(["ur-Latn"]);

export const TRANSLATION_STRATEGIES = {
    AZURE: "azure",
    GEMINI_31_PRO: "gemini31pro",
    GOOGLE_TRANSLATE_LLM: "googleTranslateLlm",
    GPT_55: "gpt55",
    CLAUDE_47_OPUS: "claude47opus",
    GEMINI_3_FLASH: "gemini3flash",
    GPT_54_MINI: "gpt54mini",
    CLAUDE_45_HAIKU: "claude45haiku",
    GPT_4O_LEGACY: "gpt4oLegacy",
};

export const DEFAULT_TRANSLATION_STRATEGY = TRANSLATION_STRATEGIES.GPT_55;

const LEGACY_TRANSLATION_STRATEGY_MAP = {
    "GPT-5.2": TRANSLATION_STRATEGIES.GPT_55,
    "GPT-4-OMNI": TRANSLATION_STRATEGIES.GPT_4O_LEGACY,
    traditional: TRANSLATION_STRATEGIES.AZURE,
    translate: TRANSLATION_STRATEGIES.GPT_55,
    quick: TRANSLATION_STRATEGIES.GPT_55,
    context: TRANSLATION_STRATEGIES.GPT_55,
    gpt54: TRANSLATION_STRATEGIES.GPT_55,
};

export const TRANSLATION_MODELS = {
    [TRANSLATION_STRATEGIES.GEMINI_31_PRO]: "gemini-pro-31-vision",
    [TRANSLATION_STRATEGIES.GPT_55]: "oai-gpt55",
    [TRANSLATION_STRATEGIES.CLAUDE_47_OPUS]: "claude-47-opus-vertex",
    [TRANSLATION_STRATEGIES.GEMINI_3_FLASH]: "gemini-flash-35-vision",
    [TRANSLATION_STRATEGIES.GPT_54_MINI]: "oai-gpt54-mini",
    [TRANSLATION_STRATEGIES.CLAUDE_45_HAIKU]: "claude-45-haiku-vertex",
    [TRANSLATION_STRATEGIES.GPT_4O_LEGACY]: "oai-gpt4o",
};

export function isGoogleTranslateLlmEnabled() {
    return process.env.NEXT_PUBLIC_ENABLE_GOOGLE_TRANSLATE_LLM !== "false";
}

export function normalizeTranslationStrategy(strategy) {
    if (
        strategy === TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM &&
        !isGoogleTranslateLlmEnabled()
    ) {
        return DEFAULT_TRANSLATION_STRATEGY;
    }

    if (Object.values(TRANSLATION_STRATEGIES).includes(strategy)) {
        return strategy;
    }

    return (
        LEGACY_TRANSLATION_STRATEGY_MAP[strategy] ||
        DEFAULT_TRANSLATION_STRATEGY
    );
}

export function getTranslationModel(strategy) {
    const normalizedStrategy = normalizeTranslationStrategy(strategy);

    if (
        normalizedStrategy === TRANSLATION_STRATEGIES.AZURE ||
        normalizedStrategy === TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM
    ) {
        return undefined;
    }

    return (
        TRANSLATION_MODELS[normalizedStrategy] ||
        TRANSLATION_MODELS[DEFAULT_TRANSLATION_STRATEGY]
    );
}

export function isCodeBasedTranslationStrategy(strategy) {
    const normalizedStrategy = normalizeTranslationStrategy(strategy);
    return (
        normalizedStrategy === TRANSLATION_STRATEGIES.AZURE ||
        normalizedStrategy === TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM
    );
}

export function getTranslationLanguageOptions(strategy) {
    const isCodeBased = isCodeBasedTranslationStrategy(strategy);

    return Object.entries(LANGUAGE_NAMES).filter(
        ([code]) =>
            !isCodeBased || !CODE_TRANSLATION_UNSUPPORTED_LANGUAGES.has(code),
    );
}
