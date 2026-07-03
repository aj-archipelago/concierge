import { isYoutubeUrl } from "./urlUtils.js";

export const YOUTUBE_VIDEO_ACCESS_DENIED_CODE = "YOUTUBE_VIDEO_ACCESS_DENIED";

export const YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE =
    "This YouTube video could not be transcribed because it is private, members-only, age-restricted, region-restricted, or unavailable. Use a public YouTube link or upload the video/audio file directly.";

const CORTEX_YOUTUBE_ACCESS_ERROR_PREFIX =
    "This YouTube video is not accessible for transcription.";

function isKnownYouTubeAccessErrorMessage(message) {
    return (
        message.includes(YOUTUBE_VIDEO_ACCESS_DENIED_CODE) ||
        message.includes(YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE) ||
        message.includes(CORTEX_YOUTUBE_ACCESS_ERROR_PREFIX)
    );
}

function hasYouTubeContext({ isYoutube = false, url } = {}) {
    return isYoutube || isYoutubeUrl(url);
}

export function getErrorMessageText(error) {
    if (!error) return "";
    if (typeof error === "string") return error;

    const graphQLErrors = Array.isArray(error.graphQLErrors)
        ? error.graphQLErrors
              .map((graphQLError) => graphQLError?.message)
              .filter(Boolean)
        : [];

    return [error.message, ...graphQLErrors, error.networkError?.message]
        .filter(Boolean)
        .join(" ");
}

export function isYouTubeTranscriptionAccessError(error, options = {}) {
    const message = getErrorMessageText(error);
    if (isKnownYouTubeAccessErrorMessage(message)) return true;
    if (!hasYouTubeContext(options)) return false;

    return (
        /user does not have access to the video/i.test(message) ||
        (/permission_denied/i.test(message) &&
            /\b(beyond_api_gateway|bag server)\b/i.test(message))
    );
}

export function getYouTubeTranscriptionAccessErrorMessage(error, t, options) {
    if (!isYouTubeTranscriptionAccessError(error, options)) return null;
    return t(YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE);
}

export function getNormalizedYouTubeTranscriptionAccessErrorMessage(
    error,
    options,
) {
    if (!isYouTubeTranscriptionAccessError(error, options)) return null;
    return YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE;
}
