import {
    TRANSCRIBE,
    TRANSCRIBE_GEMINI,
    TRANSCRIBE_NEURALSPACE,
    TRANSCRIBE_XAI_GEMINI,
    TRANSCRIBE_XAI,
} from "../graphql.mjs";
import {
    assertXaiTranscribeEnabled,
    normalizeModelOption,
} from "../../app/api/utils/transcribe-model-options.js";

export function getTranscribeQueryForModelOption(modelOption) {
    assertXaiTranscribeEnabled(modelOption);

    switch (normalizeModelOption(modelOption)) {
        case "neuralspace":
            return TRANSCRIBE_NEURALSPACE;
        case "gemini":
            return TRANSCRIBE_GEMINI;
        case "xai+gemini":
            return TRANSCRIBE_XAI_GEMINI;
        case "xai":
            return TRANSCRIBE_XAI;
        default:
            return TRANSCRIBE;
    }
}
