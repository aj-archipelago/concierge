import {
    YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE,
    YOUTUBE_VIDEO_ACCESS_DENIED_CODE,
    getErrorMessageText,
    getYouTubeTranscriptionAccessErrorMessage,
    getNormalizedYouTubeTranscriptionAccessErrorMessage,
    isYouTubeTranscriptionAccessError,
} from "../transcriptionErrors";

const t = (key) => `translated:${key}`;
const youtubeContext = { url: "https://youtu.be/pA3c1O4Pyhs" };

describe("transcriptionErrors", () => {
    test("extracts nested Apollo GraphQL error text", () => {
        expect(
            getErrorMessageText({
                message: "ApolloError",
                graphQLErrors: [
                    {
                        message: `${YOUTUBE_VIDEO_ACCESS_DENIED_CODE}: private video`,
                    },
                ],
            }),
        ).toContain(YOUTUBE_VIDEO_ACCESS_DENIED_CODE);
    });

    test.each([
        `${YOUTUBE_VIDEO_ACCESS_DENIED_CODE}: This YouTube video is not accessible`,
        YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE,
    ])("detects known YouTube transcription errors", (message) => {
        expect(isYouTubeTranscriptionAccessError(message)).toBe(true);
        expect(getYouTubeTranscriptionAccessErrorMessage(message, t)).toBe(
            `translated:${YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE}`,
        );
        expect(
            getNormalizedYouTubeTranscriptionAccessErrorMessage(message),
        ).toBe(YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE);
    });

    test.each([
        "User does not have access to the video.; RPC to BAG server failed: PERMISSION_DENIED",
        "PERMISSION_DENIED: Error raised from operator beyond_api_gateway during video execution",
    ])("detects inaccessible YouTube transcription errors", (message) => {
        expect(isYouTubeTranscriptionAccessError(message, youtubeContext)).toBe(
            true,
        );
        expect(
            getYouTubeTranscriptionAccessErrorMessage(
                message,
                t,
                youtubeContext,
            ),
        ).toBe(`translated:${YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE}`);
        expect(
            getNormalizedYouTubeTranscriptionAccessErrorMessage(
                message,
                youtubeContext,
            ),
        ).toBe(YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE);
    });

    test("does not map raw provider video access errors without YouTube context", () => {
        const message =
            "User does not have access to the video.; RPC to BAG server failed: PERMISSION_DENIED";

        expect(isYouTubeTranscriptionAccessError(message)).toBe(false);
        expect(getYouTubeTranscriptionAccessErrorMessage(message, t)).toBe(
            null,
        );
        expect(
            getNormalizedYouTubeTranscriptionAccessErrorMessage(message),
        ).toBe(null);
    });

    test("detects raw provider errors from an explicit YouTube flag", () => {
        const message = "User does not have access to the video.";

        expect(
            getYouTubeTranscriptionAccessErrorMessage(message, t, {
                isYoutube: true,
            }),
        ).toBe(`translated:${YOUTUBE_TRANSCRIPTION_ACCESS_ERROR_MESSAGE}`);
    });

    test("does not map unrelated permission errors", () => {
        const message =
            "PERMISSION_DENIED: project is not allowed to use video understanding";

        expect(isYouTubeTranscriptionAccessError(message)).toBe(false);
        expect(getYouTubeTranscriptionAccessErrorMessage(message, t)).toBe(
            null,
        );
    });
});
