const isEnvTrue = (value) => String(value).toLowerCase() === "true";
const MODEL_OPTIONS = {
    whisper: "Whisper",
    neuralspace: "NeuralSpace",
    gemini: "Gemini",
    xai: "xAI",
    "xai+gemini": "xAI + Gemini",
};

export function normalizeModelOption(modelOption) {
    return String(modelOption || "")
        .toLowerCase()
        .replace(/\s+/g, "");
}

export function isXaiTranscribeEnabled() {
    return isEnvTrue(process.env.ENABLE_XAI_TRANSCRIBE);
}

export function isXaiTranscribeDefaultEnabled() {
    return (
        isXaiTranscribeEnabled() &&
        isEnvTrue(process.env.ENABLE_XAI_TRANSCRIBE_DEFAULT)
    );
}

export function getConfiguredTranscribeModelOption(value) {
    const modelOption = MODEL_OPTIONS[normalizeModelOption(value)];
    if (!modelOption) return null;
    if (isXaiTranscribeModelOption(modelOption) && !isXaiTranscribeEnabled()) {
        return null;
    }
    return modelOption;
}

export function getTranscribeDefaultModelOption() {
    return (
        getConfiguredTranscribeModelOption(
            process.env.TRANSCRIBE_DEFAULT_MODEL_OPTION,
        ) || (isXaiTranscribeDefaultEnabled() ? "xAI + Gemini" : "Whisper")
    );
}

export function getTranscribeAlternateModelOption() {
    return (
        getConfiguredTranscribeModelOption(
            process.env.TRANSCRIBE_ALTERNATE_MODEL_OPTION,
        ) || "Whisper"
    );
}

export function isXaiTranscribeModelOption(modelOption) {
    const normalized = normalizeModelOption(modelOption);
    return normalized === "xai" || normalized === "xai+gemini";
}

export function assertXaiTranscribeEnabled(modelOption) {
    if (isXaiTranscribeModelOption(modelOption) && !isXaiTranscribeEnabled()) {
        throw new Error("xAI transcription is not enabled on this deployment");
    }
}
