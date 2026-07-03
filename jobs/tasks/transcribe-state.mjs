function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrlForComparison(value) {
    if (!value) return "";

    try {
        const url = new URL(value);
        url.hash = "";
        return url.href;
    } catch {
        return String(value);
    }
}

export function shouldApplyTranscriptionToState(
    metadata,
    transcribeState = {},
) {
    const targetUrl = normalizeUrlForComparison(metadata?.url);
    if (!targetUrl) return true;

    const videoInformation = transcribeState.videoInformation;
    if (!videoInformation) return false;

    const currentTargets = [
        videoInformation.transcriptionUrl,
        videoInformation.videoUrl,
        transcribeState.url,
    ]
        .map(normalizeUrlForComparison)
        .filter(Boolean);

    if (!currentTargets.length) return false;
    return currentTargets.includes(targetUrl);
}

export function applyTranscriptionCompletionToState({
    state,
    transcriptionData,
    storedFormat,
    metadata,
}) {
    const transcribeState = state.transcribe || {};
    if (!shouldApplyTranscriptionToState(metadata, transcribeState)) {
        return { applied: false, state };
    }

    const transcripts = Array.isArray(transcribeState.transcripts)
        ? transcribeState.transcripts
        : [];
    const defaultName = storedFormat === "vtt" ? "Subtitles" : "Transcript";
    const requestedName =
        typeof metadata?.trackName === "string"
            ? metadata.trackName.trim()
            : "";
    const name = requestedName || defaultName;

    const baseNameMatch = name.match(/(.*?)(?:\s+\((\d+)\))?$/);
    const baseName = baseNameMatch[1];
    const escapedBaseName = escapeRegExp(baseName);
    const existingNumbers = transcripts
        .filter((transcript) => transcript.name?.startsWith(baseName))
        .map((transcript) => {
            const match = transcript.name.match(
                new RegExp(`${escapedBaseName}\\s+\\((\\d+)\\)$`),
            );
            return match ? parseInt(match[1]) : 0;
        });

    let newName = name;
    if (transcripts.some((transcript) => transcript.name === name)) {
        const nextNumber =
            existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
        newName = `${baseName} (${nextNumber})`;
    }

    const transcript = {
        text: transcriptionData,
        format: storedFormat,
        name: newName,
        timestamp: new Date().toISOString(),
    };

    if (metadata?.isAlternative) {
        transcript.isAlternative = true;
    }

    const updatedTranscripts = [...transcripts, transcript];
    const updatedState = {
        ...state,
        transcribe: {
            ...transcribeState,
            transcripts: updatedTranscripts,
            activeTranscript: updatedTranscripts.length - 1,
        },
    };

    return { applied: true, state: updatedState, transcript };
}
