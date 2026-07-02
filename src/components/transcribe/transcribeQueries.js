import { QUERIES } from "../../graphql";
import { isYoutubeUrl } from "../../utils/urlUtils";

export const getDefaultTranscribeModelOption = (
    url,
    xaiTranscribeEnabled = false,
    xaiTranscribeDefaultEnabled = false,
    configuredDefaultModelOption = null,
) => {
    if (isYoutubeUrl(url)) return "Gemini";
    if (configuredDefaultModelOption) return configuredDefaultModelOption;
    return xaiTranscribeEnabled && xaiTranscribeDefaultEnabled
        ? "xAI + Gemini"
        : "Whisper";
};

export const getAlternateTranscribeModelOption = (
    url,
    configuredAlternateModelOption = null,
) => {
    if (isYoutubeUrl(url)) return "Gemini";
    if (configuredAlternateModelOption) return configuredAlternateModelOption;
    return "Whisper";
};

const normalizeModelOption = (modelOption) =>
    String(modelOption || "")
        .toLowerCase()
        .replace(/\s+/g, "");

const MAI_MODEL_OPTION_KEYS = new Set([
    "mai",
    "mai1.5",
    "mai-1.5",
    "maitranscribe1.5",
    "mai-transcribe-1.5",
]);

export const isXaiTranscribeModelOption = (modelOption) => {
    const normalized = normalizeModelOption(modelOption);
    return normalized === "xai" || normalized === "xai+gemini";
};

export const isMaiTranscribeModelOption = (modelOption) =>
    MAI_MODEL_OPTION_KEYS.has(normalizeModelOption(modelOption));

export const supportsWordTimestampedTranscribeOption = (modelOption) =>
    normalizeModelOption(modelOption) !== "gemini" &&
    !isMaiTranscribeModelOption(modelOption);

export const supportsSubtitleLayoutTranscribeOption = (modelOption) =>
    !isMaiTranscribeModelOption(modelOption);

export const getTranscribeQuery = (modelOption) => {
    switch (normalizeModelOption(modelOption)) {
        case "neuralspace":
            return QUERIES.TRANSCRIBE_NEURALSPACE;
        case "gemini":
            return QUERIES.TRANSCRIBE_GEMINI;
        case "mai":
        case "mai1.5":
        case "mai-1.5":
        case "maitranscribe1.5":
        case "mai-transcribe-1.5":
            return QUERIES.TRANSCRIBE_MAI_15;
        case "xai+gemini":
            return QUERIES.TRANSCRIBE_XAI_GEMINI;
        case "xai":
            return QUERIES.TRANSCRIBE_XAI;
        case "whisper":
            return QUERIES.TRANSCRIBE;
        default:
            return QUERIES.TRANSCRIBE;
    }
};

export const getTranscribeResult = (data) =>
    data?.transcribe?.result ||
    data?.transcribe_neuralspace?.result ||
    data?.transcribe_gemini?.result ||
    data?.transcribe_mai_15?.result ||
    data?.transcribe_xai_gemini?.result ||
    data?.transcribe_xai?.result;
