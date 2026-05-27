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

export const isXaiTranscribeModelOption = (modelOption) => {
    const normalized = normalizeModelOption(modelOption);
    return normalized === "xai" || normalized === "xai+gemini";
};

export const supportsWordTimestampedTranscribeOption = (modelOption) =>
    normalizeModelOption(modelOption) !== "gemini";

export const getTranscribeQuery = (modelOption) => {
    switch (normalizeModelOption(modelOption)) {
        case "neuralspace":
            return QUERIES.TRANSCRIBE_NEURALSPACE;
        case "gemini":
            return QUERIES.TRANSCRIBE_GEMINI;
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
    data?.transcribe_xai_gemini?.result ||
    data?.transcribe_xai?.result;
