const isEnvTrue = (value) => String(value).toLowerCase() === "true";
const MAI_MODEL_OPTION_KEYS = new Set([
    "mai",
    "mai1.5",
    "mai-1.5",
    "maitranscribe1.5",
    "mai-transcribe-1.5",
]);
const MAI_TRANSCRIBE_TASK_TIMEOUT_MS = 60 * 60 * 1000;

const MODEL_OPTIONS = {
    "gemini3.5transcribe": "Gemini 3.5 Transcribe",
    scribev2: "Scribe v2",
    whisper: "Whisper",
    neuralspace: "NeuralSpace",
    gemini: "Gemini",
    mai: "MAI-Transcribe-1.5",
    "mai1.5": "MAI-Transcribe-1.5",
    "mai-1.5": "MAI-Transcribe-1.5",
    "maitranscribe1.5": "MAI-Transcribe-1.5",
    "mai-transcribe-1.5": "MAI-Transcribe-1.5",
    xai: "xAI",
    "xai+gemini": "xAI + Gemini",
};

export function normalizeModelOption(modelOption) {
    return String(modelOption || "")
        .toLowerCase()
        .replace(/\s+/g, "");
}

export const isGemini35TranscribeEnabled = () =>
    isEnvTrue(process.env.ENABLE_GEMINI_35_TRANSCRIBE);
export const isScribeV2TranscribeEnabled = () =>
    isEnvTrue(process.env.ENABLE_SCRIBE_V2_TRANSCRIBE);

function isNewTranscribeOptionEnabled(modelOption) {
    const normalized = normalizeModelOption(modelOption);
    if (normalized === "gemini3.5transcribe")
        return isGemini35TranscribeEnabled();
    if (normalized === "scribev2") return isScribeV2TranscribeEnabled();
    return true;
}

export function isXaiTranscribeEnabled() {
    return isEnvTrue(process.env.ENABLE_XAI_TRANSCRIBE);
}

export function isMaiTranscribeEnabled() {
    return isEnvTrue(process.env.ENABLE_MAI_TRANSCRIBE);
}

export function isXaiTranscribeDefaultEnabled() {
    return (
        isXaiTranscribeEnabled() &&
        isEnvTrue(process.env.ENABLE_XAI_TRANSCRIBE_DEFAULT)
    );
}

export function getConfiguredTranscribeModelOption(value) {
    const modelOption = MODEL_OPTIONS[normalizeModelOption(value)];
    if (!modelOption || !isNewTranscribeOptionEnabled(modelOption)) return null;
    if (isXaiTranscribeModelOption(modelOption) && !isXaiTranscribeEnabled()) {
        return null;
    }
    if (isMaiTranscribeModelOption(modelOption) && !isMaiTranscribeEnabled()) {
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

export function isMaiTranscribeModelOption(modelOption) {
    return MAI_MODEL_OPTION_KEYS.has(normalizeModelOption(modelOption));
}

export function assertTranscribeModelOptionEnabled(modelOption) {
    if (!isNewTranscribeOptionEnabled(modelOption))
        throw new Error(
            "This transcription model is not enabled on this deployment",
        );
    if (isXaiTranscribeModelOption(modelOption) && !isXaiTranscribeEnabled()) {
        throw new Error("xAI transcription is not enabled on this deployment");
    }
    if (isMaiTranscribeModelOption(modelOption) && !isMaiTranscribeEnabled()) {
        throw new Error("MAI transcription is not enabled on this deployment");
    }
}

export function assertXaiTranscribeEnabled(modelOption) {
    assertTranscribeModelOptionEnabled(modelOption);
}

export function normalizeTranscribeTaskMetadata(metadata = {}) {
    if (!isMaiTranscribeModelOption(metadata.modelOption)) {
        if (normalizeModelOption(metadata.modelOption) !== "gemini") {
            return metadata;
        }

        return {
            ...metadata,
            wordTimestamped: false,
            maxWordsPerLine: undefined,
            highlightWords: false,
        };
    }

    return {
        ...metadata,
        wordTimestamped: false,
        maxLineCount: undefined,
        maxLineWidth: undefined,
        maxWordsPerLine: undefined,
        highlightWords: false,
    };
}

export function getTranscribeTaskTimeout(modelOption) {
    return isMaiTranscribeModelOption(modelOption) ||
        ["gemini3.5transcribe", "scribev2"].includes(
            normalizeModelOption(modelOption),
        )
        ? MAI_TRANSCRIBE_TASK_TIMEOUT_MS
        : undefined;
}
