import {
    TRANSCRIBE,
    TRANSCRIBE_GEMINI,
    TRANSCRIBE_MAI_15,
    TRANSCRIBE_NEURALSPACE,
    TRANSCRIBE_XAI_GEMINI,
    TRANSCRIBE_XAI,
} from "../graphql.mjs";
import {
    assertTranscribeModelOptionEnabled,
    normalizeModelOption,
} from "../../app/api/utils/transcribe-model-options.js";

export function getTranscribeQueryForModelOption(modelOption) {
    assertTranscribeModelOptionEnabled(modelOption);

    switch (normalizeModelOption(modelOption)) {
        case "neuralspace":
            return TRANSCRIBE_NEURALSPACE;
        case "gemini":
            return TRANSCRIBE_GEMINI;
        case "mai":
        case "mai1.5":
        case "mai-1.5":
        case "maitranscribe1.5":
        case "mai-transcribe-1.5":
            return TRANSCRIBE_MAI_15;
        case "xai+gemini":
            return TRANSCRIBE_XAI_GEMINI;
        case "xai":
            return TRANSCRIBE_XAI;
        default:
            return TRANSCRIBE;
    }
}
