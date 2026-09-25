import {
    Captions,
    Languages,
    Loader2,
    Pause,
    Play,
    Radio,
    Settings2,
    Square,
    Volume2,
    VolumeX,
} from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { LanguageContext } from "../../contexts/LanguageProvider";

const LIVE_SOURCE_LANGUAGES = [
    { value: "auto", labelKey: "Auto detect" },
    { value: "ar", labelKey: "Arabic" },
    { value: "en", labelKey: "English" },
    { value: "fr", labelKey: "French" },
    { value: "es", labelKey: "Spanish" },
    { value: "de", labelKey: "German" },
    { value: "he", labelKey: "Hebrew" },
    { value: "tr", labelKey: "Turkish" },
    { value: "ur", labelKey: "Urdu" },
    { value: "hi", labelKey: "Hindi" },
];

const LIVE_TARGET_LANGUAGES = LIVE_SOURCE_LANGUAGES.filter(
    (language) => language.value !== "auto",
);

const LIVE_DELAYS = [
    { value: "minimal", labelKey: "Fastest" },
    { value: "low", labelKey: "Low delay" },
    { value: "medium", labelKey: "Balanced" },
    { value: "high", labelKey: "Higher accuracy" },
];

const LIVE_SESSION_CLOSE_TIMEOUT_MS = 5000;
const MAX_TRANSLATION_SOCKET_BUFFERED_BYTES = 2 * 1024 * 1024;
const WEBRTC_DISCONNECT_GRACE_MS = 5000;
const REALTIME_TRANSLATION_SAMPLE_RATE = 24000;
const MIN_LIVE_CUE_DURATION_SECONDS = 1;
const LIVE_FALLBACK_TIMING_OFFSET_SECONDS = 1;
const LIVE_SEEK_RESTART_DELAY_MS = 350;
const LIVE_CUE_TARGET_CHARS = 90;
const LIVE_CUE_MAX_CHARS = 140;

const LIVE_TEXT_BOUNDARY_REPAIRS = [
    { pattern: /\btutupbir\b/gi, replacement: "tutup bir" },
];

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function encodePcm16Base64(samples, inputSampleRate) {
    const ratio = inputSampleRate / REALTIME_TRANSLATION_SAMPLE_RATE;
    const outputLength = Math.max(1, Math.floor(samples.length / ratio));
    const buffer = new ArrayBuffer(outputLength * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < outputLength; i += 1) {
        const sourceIndex = i * ratio;
        const leftIndex = Math.floor(sourceIndex);
        const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
        const weight = sourceIndex - leftIndex;
        const sample =
            samples[leftIndex] * (1 - weight) + samples[rightIndex] * weight;
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(
            i * 2,
            clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
            true,
        );
    }

    return arrayBufferToBase64(buffer);
}

function decodePcm16Base64(base64) {
    const buffer = base64ToArrayBuffer(base64);
    const view = new DataView(buffer);
    const samples = new Float32Array(buffer.byteLength / 2);
    for (let i = 0; i < samples.length; i += 1) {
        samples[i] = view.getInt16(i * 2, true) / 0x8000;
    }
    return samples;
}

function getAudioContextClass() {
    return window.AudioContext || window.webkitAudioContext;
}

function getRealtimeWebSocketUrl(url) {
    const realtimeUrl = new URL(url, window.location.href);
    if (realtimeUrl.protocol === "https:") realtimeUrl.protocol = "wss:";
    if (realtimeUrl.protocol === "http:") realtimeUrl.protocol = "ws:";
    return realtimeUrl.toString();
}

export function createLiveTranscriptState() {
    return {
        text: "",
        items: new Map(),
        fallbackItemId: null,
        sequence: 0,
    };
}

function normalizeLiveText(text) {
    return LIVE_TEXT_BOUNDARY_REPAIRS.reduce(
        (value, repair) => value.replace(repair.pattern, repair.replacement),
        `${text || ""}`
            .replace(/\s+/g, " ")
            .replace(/([,.;:!?؟؛،])(?=\S)/g, "$1 ")
            .replace(
                /([A-Za-z0-9])(?=[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}])/gu,
                "$1 ",
            )
            .replace(
                /([\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}])(?=[A-Za-z0-9])/gu,
                "$1 ",
            )
            .replace(/([’'](?:da|de|ta|te))(?=[A-Za-zÇĞİÖŞÜçğıöşü])/gi, "$1 "),
    )
        .replace(/\s+/g, " ")
        .trim();
}

function splitLongLiveSegment(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const segments = [];
    let current = "";

    words.forEach((word) => {
        if (current && `${current} ${word}`.length > LIVE_CUE_MAX_CHARS) {
            segments.push(current);
            current = word;
            return;
        }

        current = current ? `${current} ${word}` : word;
    });

    if (current) segments.push(current);
    return segments;
}

function splitLiveCueText(text) {
    const normalized = normalizeLiveText(text);
    if (!normalized) return [];

    const phrases = normalized.match(/[^,.;:!?؟؛،]+(?:[,.;:!?؟؛،]+|$)/g) || [
        normalized,
    ];
    const segments = [];
    let current = "";

    phrases.forEach((phrase) => {
        const cleanPhrase = phrase.trim();
        if (!cleanPhrase) return;

        if (cleanPhrase.length > LIVE_CUE_MAX_CHARS) {
            if (current) {
                segments.push(current);
                current = "";
            }
            segments.push(...splitLongLiveSegment(cleanPhrase));
            return;
        }

        const combined = current ? `${current} ${cleanPhrase}` : cleanPhrase;
        if (
            current &&
            combined.length > LIVE_CUE_TARGET_CHARS &&
            current.length >= LIVE_CUE_TARGET_CHARS / 2
        ) {
            segments.push(current);
            current = cleanPhrase;
            return;
        }

        current = combined;
    });

    if (current) segments.push(current);
    return segments.length ? segments : [normalized];
}

function expandLiveCues(cues) {
    return cues.flatMap((cue) => {
        const segments = splitLiveCueText(cue.text);
        if (segments.length <= 1) {
            return [
                {
                    ...cue,
                    text: segments[0] || cue.text,
                },
            ];
        }

        const startTime = Math.max(0, cue.startTime || 0);
        const endTime = Math.max(
            cue.endTime || 0,
            startTime + segments.length * MIN_LIVE_CUE_DURATION_SECONDS,
        );
        const totalCharacters = segments.reduce(
            (total, segment) => total + segment.length,
            0,
        );
        let cursor = startTime;

        return segments.map((segment, index) => {
            const remainingSegments = segments.length - index;
            const remainingDuration = Math.max(
                MIN_LIVE_CUE_DURATION_SECONDS * remainingSegments,
                endTime - cursor,
            );
            const proportionalDuration =
                totalCharacters > 0
                    ? ((endTime - startTime) * segment.length) / totalCharacters
                    : MIN_LIVE_CUE_DURATION_SECONDS;
            const duration =
                index === segments.length - 1
                    ? remainingDuration
                    : Math.max(
                          MIN_LIVE_CUE_DURATION_SECONDS,
                          Math.min(
                              proportionalDuration,
                              remainingDuration -
                                  MIN_LIVE_CUE_DURATION_SECONDS *
                                      (remainingSegments - 1),
                          ),
                      );
            const nextCue = {
                ...cue,
                text: segment,
                startTime: cursor,
                endTime: cursor + duration,
            };
            cursor += duration;
            return nextCue;
        });
    });
}

export function formatLiveVttTimestamp(seconds = 0) {
    const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
    const milliseconds = totalMilliseconds % 1000;
    const totalSeconds = Math.floor(totalMilliseconds / 1000);
    const displaySeconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(displaySeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function buildLiveVtt(cues) {
    const body = expandLiveCues(cues)
        .filter((cue) => normalizeLiveText(cue.text))
        .map((cue, index) => {
            const startTime = formatLiveVttTimestamp(cue.startTime);
            const endTime = formatLiveVttTimestamp(
                Math.max(
                    cue.endTime,
                    cue.startTime + MIN_LIVE_CUE_DURATION_SECONDS,
                ),
            );
            return `${index + 1}\n${startTime} --> ${endTime}\n${normalizeLiveText(cue.text)}`;
        })
        .join("\n\n");

    return `WEBVTT\n\n${body}${body ? "\n" : ""}`;
}

function getEventTimeSeconds(event, fallbackTime, sessionMediaTimeOffset = 0) {
    const milliseconds =
        event?.start_ms ??
        event?.audio_start_ms ??
        event?.audio_start_ms_absolute;
    if (typeof milliseconds === "number") {
        return Math.max(0, (sessionMediaTimeOffset || 0) + milliseconds / 1000);
    }
    return Math.max(0, fallbackTime || 0);
}

function hasEventStartTime(event) {
    return [
        event?.start_ms,
        event?.audio_start_ms,
        event?.audio_start_ms_absolute,
    ].some((milliseconds) => typeof milliseconds === "number");
}

function getEventEndTimeSeconds(
    event,
    fallbackTime,
    sessionMediaTimeOffset = 0,
) {
    const milliseconds =
        event?.end_ms ?? event?.audio_end_ms ?? event?.audio_end_ms_absolute;
    if (typeof milliseconds === "number") {
        return Math.max(0, (sessionMediaTimeOffset || 0) + milliseconds / 1000);
    }
    return Math.max(0, fallbackTime || 0);
}

function hasEventEndTime(event) {
    return [
        event?.end_ms,
        event?.audio_end_ms,
        event?.audio_end_ms_absolute,
    ].some((milliseconds) => typeof milliseconds === "number");
}

function getRealtimeEventItemId(event, role) {
    const parts = [
        event?.item_id,
        event?.item?.id,
        event?.response_id,
        event?.output_index,
        event?.content_index,
    ].filter((part) => part !== undefined && part !== null);

    return parts.length ? `${role}:${parts.join(":")}` : null;
}

function isRealtimeTranscriptEvent(event) {
    return [
        "conversation.item.input_audio_transcription.delta",
        "session.input_transcript.delta",
        "conversation.item.input_audio_transcription.completed",
        "session.output_transcript.delta",
        "response.output_audio_transcript.delta",
        "session.output_transcript.done",
        "response.output_audio_transcript.done",
    ].includes(event?.type);
}

export function appendRealtimeText({
    ref,
    setText,
    itemId,
    delta,
    completedText,
    event,
    currentTime = 0,
    sessionMediaTimeOffset = 0,
}) {
    const state = ref.current || createLiveTranscriptState();
    const items = new Map(state.items);
    const textDelta = delta || "";
    const hasCompletedText =
        completedText !== undefined && completedText !== null;
    const now = Math.max(0, currentTime || 0);
    let nextFallbackItemId = state.fallbackItemId;
    let nextSequence = state.sequence;
    let cueId = itemId;

    if (!cueId) {
        if (!nextFallbackItemId) {
            nextSequence += 1;
            nextFallbackItemId = `fallback-${nextSequence}`;
        }
        cueId = nextFallbackItemId;
    }

    if (cueId && (textDelta || hasCompletedText)) {
        const existingCue = items.get(cueId);
        const eventHasStartTime = hasEventStartTime(event);
        const eventHasEndTime = hasEventEndTime(event);
        const startTime =
            eventHasStartTime || existingCue?.startTime === undefined
                ? Math.max(
                      0,
                      getEventTimeSeconds(event, now, sessionMediaTimeOffset) -
                          (eventHasStartTime
                              ? 0
                              : LIVE_FALLBACK_TIMING_OFFSET_SECONDS),
                  )
                : existingCue.startTime;
        const existingDuration =
            existingCue?.startTime !== undefined &&
            existingCue?.endTime !== undefined
                ? Math.max(
                      MIN_LIVE_CUE_DURATION_SECONDS,
                      existingCue.endTime - existingCue.startTime,
                  )
                : MIN_LIVE_CUE_DURATION_SECONDS;
        const fallbackEndTime =
            eventHasStartTime && !eventHasEndTime
                ? startTime + existingDuration
                : now;
        const nextText = hasCompletedText
            ? completedText
            : `${existingCue?.text || ""}${textDelta}`;
        items.set(cueId, {
            text: nextText,
            startTime,
            endTime: Math.max(
                getEventEndTimeSeconds(
                    event,
                    fallbackEndTime,
                    sessionMediaTimeOffset,
                ),
                startTime + MIN_LIVE_CUE_DURATION_SECONDS,
            ),
        });
    }

    if (hasCompletedText && !itemId) {
        nextFallbackItemId = null;
    }

    const cues = Array.from(items.values());
    const text = cues
        .map((cue) => normalizeLiveText(cue.text))
        .filter(Boolean)
        .join("\n")
        .trim();
    const previewText =
        [...cues].reverse().find((cue) => normalizeLiveText(cue.text))?.text ||
        "";

    ref.current = {
        text,
        items,
        fallbackItemId: nextFallbackItemId,
        sequence: nextSequence,
    };

    setText(text);

    return {
        text,
        vtt: buildLiveVtt(cues),
        previewText: normalizeLiveText(previewText),
    };
}

function getLiveTranscriptSnapshot(ref) {
    const cues = Array.from(ref.current?.items?.values?.() || []);
    const previewText =
        [...cues].reverse().find((cue) => normalizeLiveText(cue.text))?.text ||
        "";

    return {
        text: ref.current?.text || "",
        vtt: buildLiveVtt(cues),
        previewText: normalizeLiveText(previewText),
    };
}

function getPlayerCaptureStream(mediaElement) {
    const captureStream =
        mediaElement?.captureStream || mediaElement?.mozCaptureStream;
    if (!captureStream) return null;
    return captureStream.call(mediaElement);
}

function getSessionMode(mode) {
    return mode === "transcribe" ? "transcribe" : "translate";
}

export default function RealtimeAudioLiveControls({
    mediaElementRef,
    realtimeAudio,
    disabledReason,
    onLiveTrackUpdate,
    onSelectLiveTrack,
    onClearLiveTrack,
    onLiveSessionActiveChange,
    activeLiveTrackId,
    activeLiveTrackRole,
    className = "",
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [mode, setMode] = useState("transcribe");
    const [sourceLanguage, setSourceLanguage] = useState("auto");
    const [targetLanguage, setTargetLanguage] = useState("ar");
    const [delay, setDelay] = useState("low");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [status, setStatus] = useState("idle");
    const [isMediaPaused, setIsMediaPaused] = useState(
        Boolean(mediaElementRef?.current?.paused),
    );
    const [sourceText, setSourceText] = useState("");
    const [targetText, setTargetText] = useState("");
    const [translationMuted, setTranslationMuted] = useState(false);
    const statusRef = useRef(status);
    const peerConnectionRef = useRef(null);
    const dataChannelRef = useRef(null);
    const websocketRef = useRef(null);
    const captureStreamRef = useRef(null);
    const captureAudioContextRef = useRef(null);
    const captureAudioSourceRef = useRef(null);
    const captureAudioProcessorRef = useRef(null);
    const captureAudioSinkRef = useRef(null);
    const outputAudioContextRef = useRef(null);
    const outputAudioGainRef = useRef(null);
    const outputAudioStartRef = useRef(0);
    const remoteAudioRef = useRef(null);
    const closeTimeoutRef = useRef(null);
    const webRtcDisconnectTimerRef = useRef(null);
    const sessionRunRef = useRef(0);
    const sessionAbortRef = useRef(null);
    const activeModeRef = useRef(mode);
    const sourceTranscriptRef = useRef(createLiveTranscriptState());
    const targetTranscriptRef = useRef(createLiveTranscriptState());
    const liveTrackIdsRef = useRef({ source: null, target: null });
    const liveTrackSeenRef = useRef({ source: false, target: false });
    const liveSessionStartedAtRef = useRef(null);
    const liveSessionMediaTimeOffsetRef = useRef(null);
    const webRtcPausedAtRef = useRef(null);
    const webRtcPausedDurationRef = useRef(0);
    const showOnVideoRef = useRef(true);
    const listenToTranslationRef = useRef(true);
    const audioOutputEnabledRef = useRef(false);
    const translationMutedRef = useRef(false);
    const enforceOriginalMuteRef = useRef(false);
    const originalMediaMutedRef = useRef(null);
    const cleanupSessionRef = useRef(null);
    const saveLiveTracksRef = useRef(null);
    const startLiveRef = useRef(null);
    const restartAfterSeekRef = useRef(false);
    const seekRestartTimerRef = useRef(null);
    const seekWasPlayingRef = useRef(false);
    const ignoreStartRewindSeekRef = useRef(false);
    const holdMediaPlaybackForSetupRef = useRef(false);

    const isActive =
        status === "connecting" || status === "live" || status === "closing";
    const capabilities = realtimeAudio?.capabilities || {};
    const hasTranscribe = Boolean(capabilities.transcribe);
    const hasTranslate = Boolean(capabilities.translate);
    const isConfigured = Boolean(realtimeAudio?.enabled);
    const startDisabled =
        !isConfigured ||
        isActive ||
        Boolean(disabledReason) ||
        (mode === "transcribe" && !hasTranscribe) ||
        (mode !== "transcribe" && !hasTranslate);

    const primaryModeOptions = [
        {
            value: "transcribe",
            label: t("Captions"),
            icon: Captions,
            disabled: !hasTranscribe,
        },
        {
            value: "translate",
            label: t("Audio"),
            icon: Languages,
            disabled: !hasTranslate,
        },
    ];

    const setLiveStatus = useCallback((nextStatus) => {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
    }, []);

    useEffect(() => {
        if (mode === "transcribe" && !hasTranscribe && hasTranslate) {
            setMode("translate");
        }
    }, [hasTranslate, hasTranscribe, mode]);

    useEffect(() => {
        if (isActive) return;
        if (activeLiveTrackRole === "source" && hasTranscribe) {
            setMode("transcribe");
        }
        if (activeLiveTrackRole === "target" && hasTranslate) {
            setMode("translate");
        }
    }, [activeLiveTrackRole, hasTranscribe, hasTranslate, isActive]);

    const resetTranscriptText = useCallback(() => {
        sourceTranscriptRef.current = createLiveTranscriptState();
        targetTranscriptRef.current = createLiveTranscriptState();
        liveTrackIdsRef.current = {
            source: `live-${Date.now()}-${Math.random().toString(36).slice(2)}-source`,
            target: `live-${Date.now()}-${Math.random().toString(36).slice(2)}-target`,
        };
        liveTrackSeenRef.current = { source: false, target: false };
        liveSessionStartedAtRef.current = new Date().toISOString();
        liveSessionMediaTimeOffsetRef.current = null;
        webRtcPausedAtRef.current = null;
        webRtcPausedDurationRef.current = 0;
        setSourceText("");
        setTargetText("");
    }, []);

    const freezeLiveSessionMediaTimeOffset = useCallback(() => {
        if (typeof liveSessionMediaTimeOffsetRef.current === "number") {
            return liveSessionMediaTimeOffsetRef.current;
        }

        const mediaTime = Math.max(
            0,
            mediaElementRef?.current?.currentTime || 0,
        );
        liveSessionMediaTimeOffsetRef.current = mediaTime;
        return mediaTime;
    }, [mediaElementRef]);

    const restoreOriginalMediaAudio = useCallback(() => {
        enforceOriginalMuteRef.current = false;
        const mediaElement = mediaElementRef?.current;
        if (!mediaElement || originalMediaMutedRef.current === null) return;

        mediaElement.muted = originalMediaMutedRef.current;
        originalMediaMutedRef.current = null;
    }, [mediaElementRef]);

    const syncOriginalMediaAudio = useCallback(
        ({ muteForTranslation }) => {
            const mediaElement = mediaElementRef?.current;
            if (!mediaElement) return;

            if (muteForTranslation) {
                enforceOriginalMuteRef.current = true;
                if (originalMediaMutedRef.current === null) {
                    originalMediaMutedRef.current = mediaElement.muted;
                }
                mediaElement.muted = true;
                return;
            }

            restoreOriginalMediaAudio();
        },
        [mediaElementRef, restoreOriginalMediaAudio],
    );

    const resetTranslatedAudioOutput = useCallback(() => {
        const outputAudioContext = outputAudioContextRef.current;
        outputAudioContextRef.current = null;
        outputAudioGainRef.current = null;
        outputAudioStartRef.current = 0;

        if (!outputAudioContext) return;

        try {
            outputAudioContext.close?.();
        } catch {
            // The browser may already have closed the context during teardown.
        }
    }, []);

    const syncTranslatedAudioVolume = useCallback(() => {
        const gain = outputAudioGainRef.current?.gain;
        if (!gain) return;
        gain.value = translationMutedRef.current
            ? 0
            : Math.max(0, Math.min(1, mediaElementRef?.current?.volume ?? 1));
    }, [mediaElementRef]);

    const toggleTranslationMute = useCallback(() => {
        const muted = !translationMutedRef.current;
        translationMutedRef.current = muted;
        setTranslationMuted(muted);
        syncTranslatedAudioVolume();
    }, [syncTranslatedAudioVolume]);

    const stopTranslatedAudioOutput = useCallback(() => {
        audioOutputEnabledRef.current = false;
        resetTranslatedAudioOutput();
    }, [resetTranslatedAudioOutput]);

    const prepareTranslationAudioContexts = useCallback(() => {
        const AudioContextClass = getAudioContextClass();
        if (!AudioContextClass) {
            throw new Error(
                t("Live capture needs a direct audio or video file."),
            );
        }

        if (!captureAudioContextRef.current) {
            captureAudioContextRef.current = new AudioContextClass();
        }
        if (listenToTranslationRef.current && !outputAudioContextRef.current) {
            outputAudioContextRef.current = new AudioContextClass();
        }

        const captureResume = captureAudioContextRef.current.resume?.();
        const outputResume = outputAudioContextRef.current?.resume?.();
        captureResume?.catch?.(() => {});
        outputResume?.catch?.(() => {});
    }, [t]);

    const cleanupSession = useCallback(() => {
        sessionRunRef.current += 1;
        sessionAbortRef.current?.abort();
        sessionAbortRef.current = null;
        audioOutputEnabledRef.current = false;
        holdMediaPlaybackForSetupRef.current = false;

        if (seekRestartTimerRef.current) {
            clearTimeout(seekRestartTimerRef.current);
            seekRestartTimerRef.current = null;
        }

        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }

        if (webRtcDisconnectTimerRef.current) {
            clearTimeout(webRtcDisconnectTimerRef.current);
            webRtcDisconnectTimerRef.current = null;
        }
        webRtcPausedAtRef.current = null;
        webRtcPausedDurationRef.current = 0;

        dataChannelRef.current?.close();
        websocketRef.current?.close();
        peerConnectionRef.current?.close();
        captureAudioProcessorRef.current?.disconnect();
        captureAudioSourceRef.current?.disconnect();
        captureAudioSinkRef.current?.disconnect();
        captureAudioContextRef.current?.close?.();
        outputAudioContextRef.current?.close?.();
        captureStreamRef.current?.getTracks().forEach((track) => track.stop());
        if (remoteAudioRef.current) {
            remoteAudioRef.current.pause();
            remoteAudioRef.current.srcObject = null;
        }
        dataChannelRef.current = null;
        websocketRef.current = null;
        peerConnectionRef.current = null;
        captureAudioContextRef.current = null;
        captureAudioSourceRef.current = null;
        captureAudioProcessorRef.current = null;
        captureAudioSinkRef.current = null;
        outputAudioContextRef.current = null;
        outputAudioGainRef.current = null;
        outputAudioStartRef.current = 0;
        captureStreamRef.current = null;
        remoteAudioRef.current = null;
        restoreOriginalMediaAudio();
        onLiveSessionActiveChange?.(false);
        setLiveStatus("idle");
    }, [onLiveSessionActiveChange, restoreOriginalMediaAudio, setLiveStatus]);

    const emitLiveTrack = useCallback(
        (role, snapshot, { isLive = true, liveStatus = "live" } = {}) => {
            const text = snapshot?.text?.trim();
            const trackId = liveTrackIdsRef.current[role];
            const sessionMode = activeModeRef.current;

            if (!text || !trackId) return;

            const targetLanguageLabel = t(
                LIVE_TARGET_LANGUAGES.find(
                    (language) => language.value === targetLanguage,
                )?.labelKey || targetLanguage.toUpperCase(),
            );
            const isTargetTrack = role === "target";
            const wasSeen = liveTrackSeenRef.current[role];
            liveTrackSeenRef.current = {
                ...liveTrackSeenRef.current,
                [role]: true,
            };

            onLiveTrackUpdate?.(
                {
                    liveTrackId: trackId,
                    text: snapshot.vtt,
                    format: "vtt",
                    name: isTargetTrack
                        ? `${t("Live translation")} - ${targetLanguageLabel}`
                        : t("Live captions"),
                    timestamp:
                        liveSessionStartedAtRef.current ||
                        new Date().toISOString(),
                    isLive,
                    liveStatus,
                    liveRole: role,
                    liveMode: sessionMode,
                    previewText: snapshot.previewText,
                    sourceLanguage,
                    targetLanguage: isTargetTrack ? targetLanguage : undefined,
                    showOnVideo: showOnVideoRef.current,
                    hasLiveAudio: isTargetTrack,
                    listenToTranslation:
                        isTargetTrack && listenToTranslationRef.current,
                },
                {
                    activate:
                        statusRef.current !== "closing" &&
                        !wasSeen &&
                        (isTargetTrack || sessionMode === "transcribe"),
                },
            );
        },
        [onLiveTrackUpdate, sourceLanguage, targetLanguage, t],
    );

    const saveLiveTracks = useCallback(
        ({ isLive = false, liveStatus = "complete" } = {}) => {
            const capturedSource = sourceTranscriptRef.current.text.trim();
            const capturedTarget = targetTranscriptRef.current.text.trim();

            if (capturedSource) {
                emitLiveTrack(
                    "source",
                    getLiveTranscriptSnapshot(sourceTranscriptRef),
                    {
                        isLive,
                        liveStatus,
                    },
                );
            }

            if (capturedTarget) {
                emitLiveTrack(
                    "target",
                    getLiveTranscriptSnapshot(targetTranscriptRef),
                    {
                        isLive,
                        liveStatus,
                    },
                );
            }
        },
        [emitLiveTrack],
    );

    const clearLivePreviewText = useCallback(() => {
        setSourceText("");
        setTargetText("");
    }, []);

    const finishSession = useCallback(
        ({ save = false } = {}) => {
            const shouldSave =
                save &&
                (sourceTranscriptRef.current.text.trim() ||
                    targetTranscriptRef.current.text.trim());
            if (shouldSave) saveLiveTracks();
            cleanupSession();
            clearLivePreviewText();
        },
        [cleanupSession, clearLivePreviewText, saveLiveTracks],
    );

    useEffect(() => {
        cleanupSessionRef.current = cleanupSession;
    }, [cleanupSession]);

    useEffect(() => {
        saveLiveTracksRef.current = saveLiveTracks;
    }, [saveLiveTracks]);

    const handleRealtimeEvent = useCallback(
        (event) => {
            const currentTime = Math.max(
                0,
                mediaElementRef?.current?.currentTime || 0,
            );
            const sessionMediaTimeOffset =
                (liveSessionMediaTimeOffsetRef.current ?? currentTime) -
                (getSessionMode(activeModeRef.current) === "transcribe"
                    ? webRtcPausedDurationRef.current
                    : 0);
            const shouldUpdatePreview = statusRef.current !== "closing";
            switch (event.type) {
                case "conversation.item.input_audio_transcription.delta":
                case "session.input_transcript.delta":
                    emitLiveTrack(
                        "source",
                        appendRealtimeText({
                            ref: sourceTranscriptRef,
                            setText: shouldUpdatePreview
                                ? setSourceText
                                : () => {},
                            itemId: getRealtimeEventItemId(event, "source"),
                            delta: event.delta,
                            event,
                            currentTime,
                            sessionMediaTimeOffset,
                        }),
                    );
                    break;
                case "conversation.item.input_audio_transcription.completed":
                    emitLiveTrack(
                        "source",
                        appendRealtimeText({
                            ref: sourceTranscriptRef,
                            setText: shouldUpdatePreview
                                ? setSourceText
                                : () => {},
                            itemId: getRealtimeEventItemId(event, "source"),
                            completedText: event.transcript,
                            event,
                            currentTime,
                            sessionMediaTimeOffset,
                        }),
                    );
                    break;
                case "session.output_transcript.delta":
                case "response.output_audio_transcript.delta":
                    emitLiveTrack(
                        "target",
                        appendRealtimeText({
                            ref: targetTranscriptRef,
                            setText: shouldUpdatePreview
                                ? setTargetText
                                : () => {},
                            itemId: getRealtimeEventItemId(event, "target"),
                            delta: event.delta,
                            event,
                            currentTime,
                            sessionMediaTimeOffset,
                        }),
                    );
                    break;
                case "session.output_transcript.done":
                case "response.output_audio_transcript.done":
                    emitLiveTrack(
                        "target",
                        appendRealtimeText({
                            ref: targetTranscriptRef,
                            setText: shouldUpdatePreview
                                ? setTargetText
                                : () => {},
                            itemId: getRealtimeEventItemId(event, "target"),
                            completedText: event.transcript || event.text,
                            event,
                            currentTime,
                            sessionMediaTimeOffset,
                        }),
                    );
                    break;
                case "error":
                case "session.error":
                    if (statusRef.current === "closing") break;
                    toast.error(
                        event.error?.message ||
                            event.message ||
                            t("Realtime audio session failed"),
                    );
                    break;
                default:
                    break;
            }
        },
        [emitLiveTrack, mediaElementRef, t],
    );

    const playTranslatedAudioDelta = useCallback(
        async (base64Audio) => {
            if (
                !base64Audio ||
                !listenToTranslationRef.current ||
                !audioOutputEnabledRef.current
            ) {
                return;
            }
            const mediaElement = mediaElementRef?.current;
            if (mediaElement?.paused || mediaElement?.ended) return;

            const AudioContextClass = getAudioContextClass();
            if (!AudioContextClass) return;

            syncOriginalMediaAudio({ muteForTranslation: true });

            let audioContext = outputAudioContextRef.current;
            if (!audioContext) {
                audioContext = new AudioContextClass();
                outputAudioContextRef.current = audioContext;
            }
            if (audioContext.state === "suspended") {
                await audioContext.resume();
            }
            if (
                outputAudioContextRef.current !== audioContext ||
                !audioOutputEnabledRef.current
            ) {
                return;
            }

            const samples = decodePcm16Base64(base64Audio);
            const buffer = audioContext.createBuffer(
                1,
                samples.length,
                REALTIME_TRANSLATION_SAMPLE_RATE,
            );
            buffer.copyToChannel(samples, 0);

            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            let outputGain = outputAudioGainRef.current;
            if (!outputGain) {
                outputGain = audioContext.createGain();
                outputGain.connect(audioContext.destination);
                outputAudioGainRef.current = outputGain;
            }
            syncTranslatedAudioVolume();
            source.connect(outputGain);
            const startAt = Math.max(
                audioContext.currentTime,
                outputAudioStartRef.current,
            );
            source.start(startAt);
            outputAudioStartRef.current = startAt + buffer.duration;
        },
        [mediaElementRef, syncOriginalMediaAudio, syncTranslatedAudioVolume],
    );

    const startTranslationWebSocket = useCallback(
        async ({ session, captureStream, isCurrentRun, onReady }) => {
            if (!session?.brokerUrl || !session?.brokerToken) {
                throw new Error(
                    t("Realtime audio is not available right now."),
                );
            }

            const AudioContextClass = getAudioContextClass();
            if (!AudioContextClass) {
                throw new Error(
                    t("Live capture needs a direct audio or video file."),
                );
            }

            const websocket = new WebSocket(
                getRealtimeWebSocketUrl(session.brokerUrl),
            );
            websocketRef.current = websocket;
            let setupComplete = false;
            let unavailableDuringSetup = false;
            const brokerReady = new Promise((resolve, reject) => {
                let timeout;
                const unavailableError = () =>
                    new Error(t("Realtime audio is not available right now."));
                const cleanupBrokerReadyWait = () => {
                    clearTimeout(timeout);
                    websocket.removeEventListener("error", handleUnavailable);
                    websocket.removeEventListener("close", handleUnavailable);
                    websocket.removeEventListener("message", handleBrokerReady);
                };
                const handleUnavailable = () => {
                    cleanupBrokerReadyWait();
                    reject(unavailableError());
                };
                const handleBrokerReady = ({ data }) => {
                    try {
                        const event = JSON.parse(data);
                        if (event.type === "broker.ready") {
                            cleanupBrokerReadyWait();
                            resolve();
                        }
                    } catch {
                        // Non-JSON messages are ignored by the broker-ready wait.
                    }
                };

                timeout = setTimeout(handleUnavailable, 12000);
                websocket.addEventListener("error", handleUnavailable);
                websocket.addEventListener("close", handleUnavailable);
                websocket.addEventListener("message", handleBrokerReady);
            });
            void brokerReady.catch(() => {});
            websocket.addEventListener(
                "open",
                () => {
                    websocket.send(
                        JSON.stringify({
                            type: "auth",
                            capability: session.mode || "translate",
                            brokerToken: session.brokerToken,
                            targetLanguage: session.targetLanguage,
                        }),
                    );
                },
                { once: true },
            );

            const captureAudioContext =
                captureAudioContextRef.current || new AudioContextClass();
            captureAudioContextRef.current = captureAudioContext;
            if (captureAudioContext.state === "suspended") {
                await captureAudioContext.resume();
            }
            if (!isCurrentRun()) {
                captureAudioContext.close?.();
                return;
            }

            const source =
                captureAudioContext.createMediaStreamSource(captureStream);
            const processor = captureAudioContext.createScriptProcessor(
                4096,
                1,
                1,
            );
            const sink = captureAudioContext.createGain();
            sink.gain.value = 0;
            source.connect(processor);
            processor.connect(sink);
            sink.connect(captureAudioContext.destination);
            captureAudioSourceRef.current = source;
            captureAudioProcessorRef.current = processor;
            captureAudioSinkRef.current = sink;

            processor.onaudioprocess = (event) => {
                if (
                    !isCurrentRun() ||
                    websocket.readyState !== WebSocket.OPEN ||
                    statusRef.current !== "live" ||
                    mediaElementRef?.current?.paused ||
                    mediaElementRef?.current?.ended
                ) {
                    return;
                }

                if (
                    websocket.bufferedAmount >
                    MAX_TRANSLATION_SOCKET_BUFFERED_BYTES
                ) {
                    toast.error(t("Realtime audio session failed"));
                    finishSession({ save: true });
                    return;
                }

                freezeLiveSessionMediaTimeOffset();
                websocket.send(
                    JSON.stringify({
                        type: "audio",
                        audio: encodePcm16Base64(
                            event.inputBuffer.getChannelData(0),
                            captureAudioContext.sampleRate,
                        ),
                    }),
                );
            };

            websocket.addEventListener("message", ({ data }) => {
                if (!isCurrentRun()) return;
                try {
                    const event = JSON.parse(data);
                    if (event.type === "session.closed") {
                        if (!setupComplete && statusRef.current !== "closing") {
                            unavailableDuringSetup = true;
                            return;
                        }
                        finishSession({ save: true });
                        return;
                    }
                    if (event.type === "broker.ready") {
                        if (statusRef.current === "closing") return;
                        setLiveStatus("live");
                        return;
                    }
                    if (event.type === "session.output_audio.delta") {
                        if (statusRef.current === "closing") return;
                        playTranslatedAudioDelta(event.delta).catch(() => {});
                        return;
                    }
                    if (
                        statusRef.current === "closing" &&
                        !isRealtimeTranscriptEvent(event)
                    ) {
                        return;
                    }
                    handleRealtimeEvent(event);
                } catch (error) {
                    console.warn("Ignoring realtime audio event:", error);
                }
            });

            websocket.addEventListener("close", () => {
                if (!isCurrentRun()) return;
                if (!setupComplete && statusRef.current !== "closing") {
                    unavailableDuringSetup = true;
                    return;
                }
                finishSession({ save: true });
            });

            websocket.addEventListener("error", () => {
                if (!isCurrentRun()) return;
                if (!setupComplete && statusRef.current !== "closing") {
                    unavailableDuringSetup = true;
                    return;
                }
                if (statusRef.current !== "closing") {
                    toast.error(t("Realtime audio session failed"));
                }
                finishSession({ save: true });
            });

            await brokerReady;
            if (!isCurrentRun()) return;
            if (unavailableDuringSetup) {
                throw new Error(
                    t("Realtime audio is not available right now."),
                );
            }
            setLiveStatus("live");
            await onReady();
            if (unavailableDuringSetup) {
                throw new Error(
                    t("Realtime audio is not available right now."),
                );
            }
            setupComplete = true;
        },
        [
            finishSession,
            freezeLiveSessionMediaTimeOffset,
            handleRealtimeEvent,
            mediaElementRef,
            playTranslatedAudioDelta,
            setLiveStatus,
            t,
        ],
    );

    const requestLiveSessionFlush = useCallback(() => {
        if (statusRef.current === "closing") return;
        if (statusRef.current !== "live") {
            finishSession({ save: true });
            return;
        }

        stopTranslatedAudioOutput();
        restoreOriginalMediaAudio();

        const websocket = websocketRef.current;
        if (websocket) {
            setLiveStatus("closing");
            captureStreamRef.current?.getAudioTracks().forEach((track) => {
                track.enabled = false;
            });

            try {
                if (websocket.readyState === WebSocket.OPEN) {
                    websocket.send(JSON.stringify({ type: "close" }));
                } else {
                    websocket.close();
                }
            } catch {
                finishSession({ save: true });
                return;
            }

            closeTimeoutRef.current = setTimeout(() => {
                finishSession({ save: true });
            }, LIVE_SESSION_CLOSE_TIMEOUT_MS);
            return;
        }

        const dataChannel = dataChannelRef.current;
        if (dataChannel?.readyState !== "open") {
            finishSession({ save: true });
            return;
        }

        setLiveStatus("closing");
        captureStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = false;
        });

        try {
            dataChannel.send(JSON.stringify({ type: "session.close" }));
        } catch {
            finishSession({ save: true });
            return;
        }

        closeTimeoutRef.current = setTimeout(() => {
            finishSession({ save: true });
        }, LIVE_SESSION_CLOSE_TIMEOUT_MS);
    }, [
        finishSession,
        restoreOriginalMediaAudio,
        setLiveStatus,
        stopTranslatedAudioOutput,
    ]);

    const stopLive = useCallback(() => {
        restartAfterSeekRef.current = false;
        if (seekRestartTimerRef.current) {
            clearTimeout(seekRestartTimerRef.current);
            seekRestartTimerRef.current = null;
        }

        const mediaElement = mediaElementRef?.current;
        if (mediaElement && !mediaElement.paused && !mediaElement.ended) {
            mediaElement.pause();
            setIsMediaPaused(true);
        }

        onClearLiveTrack?.(activeLiveTrackId);
        clearLivePreviewText();

        finishSession({ save: true });
    }, [
        activeLiveTrackId,
        clearLivePreviewText,
        finishSession,
        mediaElementRef,
        onClearLiveTrack,
    ]);

    const toggleMediaPlayback = useCallback(async () => {
        const mediaElement = mediaElementRef?.current;
        if (!mediaElement) return;

        if (mediaElement.paused) {
            try {
                await mediaElement.play();
                setIsMediaPaused(false);
            } catch (error) {
                toast.error(
                    error?.message ||
                        t("Realtime audio is not available right now."),
                );
            }
            return;
        }

        mediaElement.pause();
        setIsMediaPaused(true);
    }, [mediaElementRef, t]);

    const scheduleSeekRestart = useCallback(
        (delayMs = LIVE_SEEK_RESTART_DELAY_MS) => {
            if (!restartAfterSeekRef.current) return;

            if (seekRestartTimerRef.current) {
                clearTimeout(seekRestartTimerRef.current);
            }

            onLiveSessionActiveChange?.(true);
            setLiveStatus("connecting");
            seekRestartTimerRef.current = setTimeout(() => {
                seekRestartTimerRef.current = null;
                const currentMediaElement = mediaElementRef?.current;

                if (!restartAfterSeekRef.current) return;
                if (!currentMediaElement || currentMediaElement.ended) {
                    restartAfterSeekRef.current = false;
                    restoreOriginalMediaAudio();
                    onLiveSessionActiveChange?.(false);
                    setLiveStatus("idle");
                    return;
                }
                if (currentMediaElement.paused && !seekWasPlayingRef.current) {
                    restartAfterSeekRef.current = false;
                    restoreOriginalMediaAudio();
                    onLiveSessionActiveChange?.(false);
                    setLiveStatus("idle");
                    return;
                }

                restartAfterSeekRef.current = false;
                startLiveRef.current?.();
            }, delayMs);
        },
        [
            mediaElementRef,
            onLiveSessionActiveChange,
            restoreOriginalMediaAudio,
            setLiveStatus,
        ],
    );

    const restartLiveAfterSeek = useCallback(() => {
        const mediaElement = mediaElementRef?.current;
        const currentStatus = statusRef.current;
        const hasActiveSession =
            currentStatus === "connecting" || currentStatus === "live";

        if (!hasActiveSession && !restartAfterSeekRef.current) {
            return;
        }

        restartAfterSeekRef.current = true;
        seekWasPlayingRef.current = mediaElement
            ? !mediaElement.paused || holdMediaPlaybackForSetupRef.current
            : true;

        if (seekRestartTimerRef.current) {
            clearTimeout(seekRestartTimerRef.current);
            seekRestartTimerRef.current = null;
        }

        if (hasActiveSession) {
            saveLiveTracks({
                isLive: false,
                liveStatus: "complete",
            });
            cleanupSession();

            if (
                activeModeRef.current === "translate" &&
                listenToTranslationRef.current &&
                seekWasPlayingRef.current
            ) {
                syncOriginalMediaAudio({ muteForTranslation: true });
            }
        }
    }, [
        cleanupSession,
        mediaElementRef,
        saveLiveTracks,
        syncOriginalMediaAudio,
    ]);

    useEffect(() => {
        return () => {
            restartAfterSeekRef.current = false;
            if (seekRestartTimerRef.current) {
                clearTimeout(seekRestartTimerRef.current);
                seekRestartTimerRef.current = null;
            }
            saveLiveTracksRef.current?.({
                isLive: false,
                liveStatus: "complete",
            });
            cleanupSessionRef.current?.();
        };
    }, []);

    useEffect(() => {
        const mediaElement = mediaElementRef?.current;
        if (!mediaElement) return undefined;

        setIsMediaPaused(Boolean(mediaElement.paused));

        const clearSeekRestart = () => {
            restartAfterSeekRef.current = false;
            if (seekRestartTimerRef.current) {
                clearTimeout(seekRestartTimerRef.current);
                seekRestartTimerRef.current = null;
            }
        };

        const handleSeeking = () => {
            if (
                ignoreStartRewindSeekRef.current &&
                mediaElement.currentTime <= 0.05
            ) {
                return;
            }
            ignoreStartRewindSeekRef.current = false;
            restartLiveAfterSeek();
        };

        const handleSeeked = () => {
            if (ignoreStartRewindSeekRef.current) {
                ignoreStartRewindSeekRef.current = false;
                return;
            }
            if (restartAfterSeekRef.current && seekWasPlayingRef.current) {
                scheduleSeekRestart(150);
            }
        };

        const handlePlay = () => {
            if (
                holdMediaPlaybackForSetupRef.current &&
                statusRef.current === "connecting"
            ) {
                mediaElement.pause();
                setIsMediaPaused(true);
                return;
            }
            setIsMediaPaused(false);
            if (
                getSessionMode(activeModeRef.current) === "transcribe" &&
                webRtcPausedAtRef.current !== null
            ) {
                webRtcPausedDurationRef.current += Math.max(
                    0,
                    (Date.now() - webRtcPausedAtRef.current) / 1000,
                );
                webRtcPausedAtRef.current = null;
            }
            if (
                getSessionMode(activeModeRef.current) === "translate" &&
                listenToTranslationRef.current &&
                statusRef.current !== "idle"
            ) {
                audioOutputEnabledRef.current = true;
                syncOriginalMediaAudio({ muteForTranslation: true });
            }
            if (restartAfterSeekRef.current) {
                scheduleSeekRestart(100);
            }
        };

        const handleVolumeChange = () => {
            syncTranslatedAudioVolume();
            if (
                enforceOriginalMuteRef.current &&
                !mediaElement.paused &&
                !mediaElement.ended &&
                getSessionMode(activeModeRef.current) === "translate" &&
                statusRef.current !== "idle" &&
                !mediaElement.muted
            ) {
                mediaElement.muted = true;
            }
        };

        const handlePause = () => {
            setIsMediaPaused(true);
            if (
                getSessionMode(activeModeRef.current) === "transcribe" &&
                statusRef.current === "live" &&
                webRtcPausedAtRef.current === null
            ) {
                webRtcPausedAtRef.current = Date.now();
            }
            if (
                getSessionMode(activeModeRef.current) === "translate" &&
                statusRef.current !== "idle"
            ) {
                resetTranslatedAudioOutput();
                restoreOriginalMediaAudio();
            }
        };

        const handleEnded = () => {
            setIsMediaPaused(true);
            const shouldFinish =
                restartAfterSeekRef.current || statusRef.current !== "idle";
            clearSeekRestart();
            if (shouldFinish) {
                requestLiveSessionFlush();
            }
        };

        mediaElement.addEventListener("seeking", handleSeeking);
        mediaElement.addEventListener("seeked", handleSeeked);
        mediaElement.addEventListener("play", handlePlay);
        mediaElement.addEventListener("volumechange", handleVolumeChange);
        mediaElement.addEventListener("pause", handlePause);
        mediaElement.addEventListener("ended", handleEnded);

        return () => {
            mediaElement.removeEventListener("seeking", handleSeeking);
            mediaElement.removeEventListener("seeked", handleSeeked);
            mediaElement.removeEventListener("play", handlePlay);
            mediaElement.removeEventListener(
                "volumechange",
                handleVolumeChange,
            );
            mediaElement.removeEventListener("pause", handlePause);
            mediaElement.removeEventListener("ended", handleEnded);
        };
    }, [
        mediaElementRef,
        requestLiveSessionFlush,
        resetTranslatedAudioOutput,
        restoreOriginalMediaAudio,
        restartLiveAfterSeek,
        scheduleSeekRestart,
        syncOriginalMediaAudio,
        syncTranslatedAudioVolume,
    ]);

    const startLive = async () => {
        const mediaElement = mediaElementRef?.current;
        if (!mediaElement) return;
        const mediaTimeBeforeStart = mediaElement.currentTime;
        const mediaWasPlayingBeforeStart =
            !mediaElement.paused && !mediaElement.ended;

        const restartFromBeginning =
            mediaElement.ended ||
            (Number.isFinite(mediaElement.duration) &&
                mediaElement.duration > 0 &&
                mediaElement.currentTime >= mediaElement.duration);
        ignoreStartRewindSeekRef.current = restartFromBeginning;
        if (restartFromBeginning) mediaElement.currentTime = 0;

        restartAfterSeekRef.current = false;
        if (seekRestartTimerRef.current) {
            clearTimeout(seekRestartTimerRef.current);
            seekRestartTimerRef.current = null;
        }

        const runId = sessionRunRef.current + 1;
        sessionRunRef.current = runId;
        const isCurrentRun = () => sessionRunRef.current === runId;

        try {
            activeModeRef.current = mode;
            audioOutputEnabledRef.current =
                getSessionMode(mode) === "translate" &&
                listenToTranslationRef.current;
            setLiveStatus("connecting");
            resetTranscriptText();
            onLiveSessionActiveChange?.(true);
            if (getSessionMode(mode) === "translate") {
                prepareTranslationAudioContexts();
            }

            const captureStream = getPlayerCaptureStream(mediaElement);
            if (!captureStream?.getAudioTracks().length) {
                throw new Error(
                    t("Live capture needs a direct audio or video file."),
                );
            }

            captureStreamRef.current = captureStream;
            const shouldResumeMediaAfterSetup =
                restartFromBeginning || !mediaElement.ended;
            holdMediaPlaybackForSetupRef.current = shouldResumeMediaAfterSetup;
            if (!mediaElement.paused) {
                mediaElement.pause();
            }
            setIsMediaPaused(Boolean(mediaElement.paused));
            const resumeMediaAfterSetup = async () => {
                if (
                    !shouldResumeMediaAfterSetup ||
                    !isCurrentRun() ||
                    !mediaElement.paused ||
                    (mediaElement.ended && !restartFromBeginning)
                ) {
                    return;
                }

                syncOriginalMediaAudio({
                    muteForTranslation:
                        getSessionMode(mode) === "translate" &&
                        listenToTranslationRef.current,
                });
                try {
                    await mediaElement.play();
                } finally {
                    if (isCurrentRun()) {
                        holdMediaPlaybackForSetupRef.current = false;
                    }
                }
                if (!isCurrentRun()) {
                    if (statusRef.current !== "live" && !mediaElement.paused) {
                        mediaElement.pause();
                    }
                    return;
                }
                if (statusRef.current !== "live") {
                    if (!mediaElement.paused) mediaElement.pause();
                    return;
                }
                setIsMediaPaused(Boolean(mediaElement.paused));
            };
            if (!isCurrentRun()) {
                restoreOriginalMediaAudio();
                captureStream.getTracks().forEach((track) => track.stop());
                return;
            }

            const abortController = new AbortController();
            sessionAbortRef.current = abortController;
            const response = await fetch("/api/realtime-audio/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: abortController.signal,
                body: JSON.stringify({
                    mode: getSessionMode(mode),
                    sourceLanguage,
                    targetLanguage,
                    delay,
                }),
            });
            const session = await response.json();
            if (!isCurrentRun()) return;
            if (!response.ok) {
                throw new Error(
                    session.error ||
                        t("Realtime audio is not available right now."),
                );
            }

            if (getSessionMode(mode) === "translate") {
                await startTranslationWebSocket({
                    session,
                    captureStream,
                    isCurrentRun,
                    onReady: resumeMediaAfterSetup,
                });
                return;
            }

            const peerConnection = new RTCPeerConnection();
            if (!isCurrentRun()) {
                peerConnection.close();
                return;
            }
            peerConnectionRef.current = peerConnection;
            let markWebRtcReady = () => {};
            let markWebRtcUnavailable = () => {};
            const webRtcReady = new Promise((resolve, reject) => {
                let settled = false;
                const timeout = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    reject(
                        new Error(
                            t("Realtime audio is not available right now."),
                        ),
                    );
                }, 12000);
                markWebRtcReady = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    resolve();
                };
                markWebRtcUnavailable = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    reject(
                        new Error(
                            t("Realtime audio is not available right now."),
                        ),
                    );
                };
            });
            void webRtcReady.catch(() => {});
            abortController.signal.addEventListener(
                "abort",
                markWebRtcUnavailable,
                { once: true },
            );
            let webRtcSetupComplete = false;
            let webRtcUnavailableDuringSetup = false;
            const handleWebRtcUnavailable = () => {
                markWebRtcUnavailable();
                if (!webRtcSetupComplete) {
                    webRtcUnavailableDuringSetup = true;
                    return;
                }
                finishSession({ save: true });
            };

            peerConnection.onconnectionstatechange = () => {
                if (!isCurrentRun()) return;
                if (peerConnection.connectionState === "connected") {
                    if (webRtcDisconnectTimerRef.current) {
                        clearTimeout(webRtcDisconnectTimerRef.current);
                        webRtcDisconnectTimerRef.current = null;
                    }
                    return;
                }
                if (peerConnection.connectionState === "failed") {
                    handleWebRtcUnavailable();
                    return;
                }
                if (
                    peerConnection.connectionState === "disconnected" &&
                    !webRtcDisconnectTimerRef.current
                ) {
                    webRtcDisconnectTimerRef.current = setTimeout(() => {
                        webRtcDisconnectTimerRef.current = null;
                        if (
                            isCurrentRun() &&
                            !["connected", "closed"].includes(
                                peerConnection.connectionState,
                            )
                        ) {
                            handleWebRtcUnavailable();
                        }
                    }, WEBRTC_DISCONNECT_GRACE_MS);
                }
            };

            const [audioTrack] = captureStream.getAudioTracks();
            peerConnection.addTrack(audioTrack, captureStream);

            const dataChannel = peerConnection.createDataChannel("oai-events");
            dataChannelRef.current = dataChannel;
            dataChannel.addEventListener("open", () => {
                if (!isCurrentRun()) return;
                freezeLiveSessionMediaTimeOffset();
                setLiveStatus("live");
                markWebRtcReady();
            });
            const handleDataChannelUnavailable = () => {
                if (
                    !isCurrentRun() ||
                    statusRef.current === "idle" ||
                    statusRef.current === "closing"
                ) {
                    return;
                }
                handleWebRtcUnavailable();
            };
            dataChannel.addEventListener("close", handleDataChannelUnavailable);
            dataChannel.addEventListener("error", handleDataChannelUnavailable);
            dataChannel.addEventListener("message", ({ data }) => {
                if (!isCurrentRun()) return;
                try {
                    const event = JSON.parse(data);
                    if (event.type === "session.closed") {
                        if (statusRef.current === "closing") {
                            finishSession({ save: true });
                        } else {
                            handleWebRtcUnavailable();
                        }
                        return;
                    }
                    if (
                        statusRef.current === "closing" &&
                        !isRealtimeTranscriptEvent(event)
                    ) {
                        return;
                    }
                    handleRealtimeEvent(event);
                } catch (error) {
                    console.warn("Ignoring realtime audio event:", error);
                }
            });

            const offer = await peerConnection.createOffer();
            if (!isCurrentRun()) return;
            await peerConnection.setLocalDescription(offer);
            if (!isCurrentRun()) return;

            const sdpResponse = await fetch(session.callsUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.value}`,
                    "Content-Type": "application/sdp",
                },
                signal: abortController.signal,
                body: offer.sdp,
            });
            if (!isCurrentRun()) return;

            if (!sdpResponse.ok) {
                throw new Error(await sdpResponse.text());
            }

            await peerConnection.setRemoteDescription({
                type: "answer",
                sdp: await sdpResponse.text(),
            });
            if (!isCurrentRun()) return;
            await webRtcReady;
            if (!isCurrentRun()) return;
            if (webRtcUnavailableDuringSetup) {
                throw new Error(
                    t("Realtime audio is not available right now."),
                );
            }
            await resumeMediaAfterSetup();
            if (webRtcUnavailableDuringSetup) {
                throw new Error(
                    t("Realtime audio is not available right now."),
                );
            }
            webRtcSetupComplete = true;
        } catch (error) {
            if (error?.name === "AbortError" || !isCurrentRun()) return;
            cleanupSession();
            if (restartFromBeginning) {
                mediaElement.currentTime = mediaTimeBeforeStart;
            }
            if (
                mediaWasPlayingBeforeStart &&
                mediaElement.paused &&
                !mediaElement.ended
            ) {
                mediaElement.play().catch(() => {});
            } else if (!mediaWasPlayingBeforeStart && !mediaElement.paused) {
                mediaElement.pause();
            }
            toast.error(
                error?.message ||
                    t("Realtime audio is not available right now."),
            );
        }
    };

    startLiveRef.current = startLive;

    if (!isConfigured) return null;

    const panelReason =
        disabledReason ||
        (!hasTranscribe && !hasTranslate
            ? t("Azure realtime audio is not configured.")
            : null);
    const statusLabel =
        status === "connecting"
            ? t("Connecting...")
            : status === "closing"
              ? t("Stopping...")
              : status === "live"
                ? t("Live")
                : t("Ready");
    const targetLanguageLabel = t(
        LIVE_TARGET_LANGUAGES.find(
            (language) => language.value === targetLanguage,
        )?.labelKey || targetLanguage.toUpperCase(),
    );
    const liveTrackButtons = [
        {
            role: "source",
            trackId: liveTrackIdsRef.current.source,
            text: sourceText,
            label: t("Captions"),
            icon: Captions,
            hidden: false,
        },
        {
            role: "target",
            trackId: liveTrackIdsRef.current.target,
            text: targetText,
            label: `${t("Translation")} - ${targetLanguageLabel}`,
            icon: Languages,
            hidden: false,
        },
    ].filter((track) => track.text && track.trackId && !track.hidden);

    return (
        <div className={className} dir={direction}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    <Radio className="h-4 w-4 shrink-0 text-red-500 dark:text-red-300" />
                    <span className="truncate">{t("Live")}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {isActive && mode !== "transcribe" && (
                        <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                            onClick={toggleTranslationMute}
                            aria-label={t(
                                translationMuted
                                    ? "Unmute live audio"
                                    : "Mute live audio",
                            )}
                            title={t(
                                translationMuted
                                    ? "Unmute live audio"
                                    : "Mute live audio",
                            )}
                        >
                            {translationMuted ? (
                                <VolumeX className="h-3.5 w-3.5" />
                            ) : (
                                <Volume2 className="h-3.5 w-3.5" />
                            )}
                        </button>
                    )}
                    {isActive && (
                        <span
                            className="inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-200"
                            role="status"
                            aria-live="polite"
                        >
                            {status === "connecting" || status === "closing" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            )}
                            {statusLabel}
                        </span>
                    )}
                    <button
                        type="button"
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                            showAdvanced
                                ? "border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800"
                                : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                        }`}
                        onClick={() => setShowAdvanced((value) => !value)}
                        aria-expanded={showAdvanced}
                        aria-label={t("Advanced")}
                        title={t("Advanced")}
                    >
                        <Settings2 className="h-3.5 w-3.5 text-gray-500 dark:text-gray-300" />
                    </button>
                </div>
            </div>

            <div className="mt-2 grid gap-1">
                {primaryModeOptions.map((option) => {
                    const Icon = option.icon;
                    const selected =
                        option.value === "translate"
                            ? mode !== "transcribe"
                            : mode === option.value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            disabled={isActive || option.disabled}
                            aria-pressed={selected}
                            className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-md border px-2 text-start text-xs font-medium transition-colors ${
                                selected
                                    ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
                                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                            }`}
                            onClick={() => setMode(option.value)}
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="whitespace-normal break-words">
                                    {option.label}
                                </span>
                            </span>
                            <span
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                    selected
                                        ? "bg-sky-500"
                                        : "bg-gray-300 dark:bg-gray-600"
                                }`}
                            />
                        </button>
                    );
                })}
            </div>

            {mode !== "transcribe" && (
                <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/60">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {t("Target language")}
                        <select
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                            disabled={isActive}
                            value={targetLanguage}
                            onChange={(event) =>
                                setTargetLanguage(event.target.value)
                            }
                        >
                            {LIVE_TARGET_LANGUAGES.map((language) => (
                                <option
                                    key={language.value}
                                    value={language.value}
                                >
                                    {t(language.labelKey)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            )}

            {showAdvanced && mode === "transcribe" && (
                <div className="mt-2 grid gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/60">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {t("Source language")}
                        <select
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                            disabled={isActive}
                            value={sourceLanguage}
                            onChange={(event) =>
                                setSourceLanguage(event.target.value)
                            }
                        >
                            {LIVE_SOURCE_LANGUAGES.map((language) => (
                                <option
                                    key={language.value}
                                    value={language.value}
                                >
                                    {t(language.labelKey)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {t("Latency")}
                        <select
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                            disabled={isActive}
                            value={delay}
                            onChange={(event) => setDelay(event.target.value)}
                        >
                            {LIVE_DELAYS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {t(option.labelKey)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            )}

            {panelReason && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                    {panelReason}
                </div>
            )}

            <div className="mt-2">
                {isActive ? (
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            className="lb-outline-secondary lb-sm flex w-full items-center justify-center gap-1"
                            disabled={
                                status === "closing" ||
                                (status !== "live" && isMediaPaused) ||
                                !mediaElementRef?.current
                            }
                            onClick={toggleMediaPlayback}
                        >
                            {isMediaPaused ? (
                                <Play className="h-4 w-4" />
                            ) : (
                                <Pause className="h-4 w-4" />
                            )}
                            {isMediaPaused ? t("Play") : t("Pause")}
                        </button>
                        <button
                            type="button"
                            className="lb-outline-secondary lb-sm flex w-full items-center justify-center gap-1"
                            disabled={status === "closing"}
                            onClick={stopLive}
                        >
                            {status === "closing" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Square className="h-4 w-4" />
                            )}
                            {status === "closing"
                                ? t("Stopping...")
                                : t("Stop")}
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="lb-primary lb-sm flex w-full items-center justify-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={startDisabled}
                        onClick={startLive}
                    >
                        <Radio className="h-4 w-4" />
                        {t("Start live")}
                    </button>
                )}
            </div>

            {liveTrackButtons.length > 0 && (
                <div className="mt-2 grid gap-1">
                    {liveTrackButtons.map((track) => {
                        const Icon = track.icon;
                        return (
                            <button
                                key={track.role}
                                type="button"
                                aria-pressed={
                                    activeLiveTrackId === track.trackId
                                }
                                className={`flex min-h-10 min-w-0 items-center gap-2 rounded-md border px-2 text-start text-xs transition-colors ${
                                    activeLiveTrackId === track.trackId
                                        ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
                                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                }`}
                                onClick={() =>
                                    onSelectLiveTrack?.(track.trackId)
                                }
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 grow">
                                    <span className="block truncate font-medium">
                                        {track.label}
                                    </span>
                                    <span className="block truncate text-[11px] opacity-75">
                                        {track.text}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
