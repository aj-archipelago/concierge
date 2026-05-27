import { mergeMediaTags, parseMediaPromptTagsResult } from "../mediaPromptTags";

describe("mediaPromptTags", () => {
    test("parses JSON array responses and normalizes tags", () => {
        expect(
            parseMediaPromptTagsResult(
                '["Sunrise", "desert  landscape", "media", "Sunrise"]',
            ),
        ).toEqual(["sunrise", "desert landscape", "media"]);
    });

    test("parses object wrapper and caps auto tags", () => {
        expect(
            parseMediaPromptTagsResult({
                tags: [
                    "one",
                    "two",
                    "three",
                    "four",
                    "five",
                    "six",
                    "seven",
                    "eight",
                    "nine",
                ],
            }),
        ).toEqual([
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
        ]);
    });

    test("falls back to comma and newline lists", () => {
        expect(
            parseMediaPromptTagsResult("Desert, sunrise\n- cinematic"),
        ).toEqual(["desert", "sunrise", "cinematic"]);
    });

    test("merges existing and generated tags without duplicates", () => {
        expect(
            mergeMediaTags(["desert", "Arizona"], ["arizona", "wide shot"]),
        ).toEqual(["desert", "arizona", "wide shot"]);
    });
});
