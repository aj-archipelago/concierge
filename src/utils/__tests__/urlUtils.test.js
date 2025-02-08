import {
    isYoutubeUrl,
    getYoutubeEmbedUrl,
    getYoutubeVideoId,
} from "../urlUtils";

describe("urlUtils", () => {
    describe("isYoutubeUrl", () => {
        it("should return true for valid YouTube URLs", () => {
            const validUrls = [
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "https://youtube.com/watch?v=dQw4w9WgXcQ",
                "https://youtu.be/dQw4w9WgXcQ",
                "https://www.youtube.com/embed/dQw4w9WgXcQ",
            ];

            validUrls.forEach((url) => {
                expect(isYoutubeUrl(url)).toBe(true);
            });
        });

        it("should return false for invalid YouTube URLs", () => {
            const invalidUrls = [
                "https://www.youtube.com",
                "https://youtube.com",
                "https://youtu.be",
                "https://www.youtube.com/embed/",
                "https://www.youtube.com/watch",
                "https://www.youtube.com/watch?",
                "https://www.otherdomain.com/watch?v=dQw4w9WgXcQ",
                "not a url",
                "",
            ];

            invalidUrls.forEach((url) => {
                expect(isYoutubeUrl(url)).toBe(false);
            });
        });
    });

    describe("getYoutubeEmbedUrl", () => {
        it("should convert standard YouTube URLs to embed format", () => {
            expect(
                getYoutubeEmbedUrl(
                    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                ),
            ).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");

            expect(
                getYoutubeEmbedUrl("https://youtube.com/watch?v=dQw4w9WgXcQ"),
            ).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
        });

        it("should handle shortened youtu.be URLs", () => {
            expect(getYoutubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
                "https://www.youtube.com/embed/dQw4w9WgXcQ",
            );
        });

        it("should handle embed URLs", () => {
            const embedUrl = "https://www.youtube.com/embed/dQw4w9WgXcQ";
            expect(getYoutubeEmbedUrl(embedUrl)).toBe(embedUrl);
        });

        it("should return null for invalid URLs", () => {
            const invalidUrls = [
                "https://www.youtube.com",
                "https://youtube.com",
                "https://youtu.be",
                "not a url",
                "",
            ];

            invalidUrls.forEach((url) => {
                expect(getYoutubeEmbedUrl(url)).toBeNull();
            });
        });
    });

    describe("getYoutubeVideoId", () => {
        it("should extract video ID from various YouTube URL formats", () => {
            const testCases = [
                {
                    input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    expected: "dQw4w9WgXcQ",
                },
                {
                    input: "https://youtu.be/dQw4w9WgXcQ",
                    expected: "dQw4w9WgXcQ",
                },
                {
                    input: "https://www.youtube.com/embed/dQw4w9WgXcQ",
                    expected: "dQw4w9WgXcQ",
                },
            ];

            testCases.forEach(({ input, expected }) => {
                expect(getYoutubeVideoId(input)).toBe(expected);
            });
        });

        it("should throw an error with a specific message for invalid URLs", () => {
            const invalidUrls = [
                "https://www.youtube.com",
                "https://youtube.com",
                "https://youtu.be",
                "not a url",
                "",
            ];

            invalidUrls.forEach((url) => {
                expect(() => getYoutubeVideoId(url)).toThrow(
                    "Invalid YouTube URL",
                );
            });
        });
    });
});
