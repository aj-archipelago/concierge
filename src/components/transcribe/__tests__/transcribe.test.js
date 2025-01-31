import { detectSubtitleFormat, convertSrtToVtt } from "../transcribe.utils";

describe("Subtitle Format Detection and Conversion", () => {
    const srtExample = `1
00:00:03,382 --> 00:00:04,952
كانت في مجزره مره في مدرسه السطاوي.
2
00:00:05,072 --> 00:00:07,872
كانت اول مجزره على مستوى قطاع غزة
3
00:00:08,012 --> 00:00:10,282
للمدارس الايواء.`;

    const vttExample = `WEBVTT

1
00:00:03.382 --> 00:00:04.952
كانت في مجزره مره في مدرسه السطاوي.

2
00:00:05.072 --> 00:00:07.872
كانت اول مجزره على مستوى قطاع غزة`;

    const arabicSrt = `1
00:00:03,382 --> 00:00:04,952
كانت في مجزره مره في مدرسه السطاوي.
2
00:00:05,072 --> 00:00:07,872
كانت اول مجزره على مستوى قطاع غزة
3
00:00:08,012 --> 00:00:10,282
للمدارس الايواء.
4
00:00:10,282 --> 00:00:13,072
ايامها تحركنا حوالي ست سبع اسعافات
5
00:00:13,182 --> 00:00:16,152
لما وصلنا مكان المجزره هذه.
6
00:00:16,262 --> 00:00:18,602
دخلنا في المدرسه ما يقارب ال 12 اسعاف
7
00:00:18,712 --> 00:00:21,002
من شده هول المشهد لقينا الناس فتات
8
00:00:21,062 --> 00:00:23,972
لقينا الناس رماد في الارض
9
00:00:24,012 --> 00:00:29,382
ما لهم لا ولا لهم يعني شقف عظام لحوم صغيره
10
00:00:29,452 --> 00:00:31,672
قعدنا نردد نصيح`;

    const srtWithoutBlankLines = `1
00:00:03,382 --> 00:00:04,952
First line
2
00:00:05,072 --> 00:00:07,872
Second line
3
00:00:08,012 --> 00:00:10,282
Third line`;

    const sequentialVtt = `WEBVTT

1
00:03.298 --> 00:04.578
كانت في مجزره

2
00:04.578 --> 00:06.178
مرت في مدرسه
3
00:06.178 --> 00:07.518
الصفطاوي كانت
4
00:07.518 --> 00:08.468
اول مجزره
5
00:08.468 --> 00:10.368
على مستوى قطاع`;

    const longVttExample = `WEBVTT

1
00:03.298 --> 00:04.578
First line

2
00:04.578 --> 00:06.178
Second line
3
00:06.178 --> 00:07.518
Third line
4
00:07.518 --> 00:08.468
Fourth line
5
00:08.468 --> 00:10.368
Fifth line`;

    const longVttWithMissingNewlines = `WEBVTT

1
00:03.298 --> 00:04.578
First line
2
00:04.578 --> 00:06.178
Second line
3
00:06.178 --> 00:07.518
Third line`;

const longArabicVttWithParseIssues = `WEBVTT

1
00:03.298 --> 00:04.578
كانت في مجزره

2
00:04.578 --> 00:06.178
مرت في مدرسه
3
00:06.178 --> 00:07.518
الصفطاوي كانت
4
00:07.518 --> 00:08.468
اول مجزره
5
00:08.468 --> 00:10.368
على مستوى قطاع
6
00:10.368 --> 00:10.728
غزه
7
00:10.728 --> 00:13.318
ل لمدارس الايواء
8
00:13.318 --> 00:14.868
ايامها تحركنا
9
00:14.868 --> 00:17.768
حوالي ست سبع اسعافات
10
00:17.768 --> 00:20.808
لما وصلنا مكان المجزره

`;

    describe("detectSubtitleFormat", () => {
        it("should detect SRT format correctly", () => {
            expect(detectSubtitleFormat(srtExample)).toBe("srt");
        });

        it("should detect VTT format correctly", () => {
            expect(detectSubtitleFormat(vttExample)).toBe("vtt");
        });

        it("should detect Arabic SRT format correctly", () => {
            expect(detectSubtitleFormat(arabicSrt)).toBe("srt");
        });

        it("should return null for plain text", () => {
            expect(
                detectSubtitleFormat(
                    "Just some plain text\nwith multiple lines",
                ),
            ).toBeNull();
        });

        it("should handle empty input", () => {
            expect(detectSubtitleFormat("")).toBeNull();
        });

        it("should detect VTT format with sequential numbers and short timestamps", () => {
            expect(detectSubtitleFormat(sequentialVtt)).toBe("vtt");
        });

        it("should detect VTT format with MM:SS timestamps", () => {
            expect(detectSubtitleFormat(longVttExample)).toBe("vtt");
            expect(detectSubtitleFormat(longVttWithMissingNewlines)).toBe("vtt");
        });

        it("should detect VTT format with Arabic text", () => {
            expect(detectSubtitleFormat(longArabicVttWithParseIssues)).toBe("vtt");
        });

        it("should preserve VTT format when converting", () => {
            const converted = convertSrtToVtt(sequentialVtt);
            expect(converted).toContain("WEBVTT");
            expect(converted).toContain("00:00:03.298 --> 00:00:04.578");
            expect(converted).toContain("كانت في مجزره");
            // Verify sequential numbers are preserved
            expect(converted).toContain("1\n");
            expect(converted).toContain("2\n");
        });
    });

    describe("convertSrtToVtt", () => {
        it("should convert SRT to VTT format correctly", () => {
            const converted = convertSrtToVtt(srtExample);
            expect(converted).toContain("WEBVTT");
            expect(converted).toContain("00:00:03.382 --> 00:00:04.952");
            expect(converted).toContain("كانت في مجزره مره في مدرسه السطاوي.");
        });

        it("should handle empty input", () => {
            const converted = convertSrtToVtt("");
            expect(converted).toBe("WEBVTT\n\n");
        });

        it("should convert Arabic SRT to VTT format correctly", () => {
            const converted = convertSrtToVtt(arabicSrt);
            expect(converted).toContain("WEBVTT");
            expect(converted).toContain("00:00:03.382 --> 00:00:04.952");
            expect(converted).toContain("كانت في مجزره مره في مدرسه السطاوي.");
            expect(converted).toContain("00:00:29.452 --> 00:00:31.672");
            expect(converted).toContain("قعدنا نردد نصيح");
        });

        it("should handle SRT without blank lines before sequence numbers", () => {
            const converted = convertSrtToVtt(srtWithoutBlankLines);
            expect(converted).toContain("WEBVTT");
            expect(converted).toContain(
                "1\n00:00:03.382 --> 00:00:04.952\nFirst line\n\n",
            );
            expect(converted).toContain(
                "2\n00:00:05.072 --> 00:00:07.872\nSecond line\n\n",
            );
            expect(converted).toContain(
                "3\n00:00:08.012 --> 00:00:10.282\nThird line\n\n",
            );
            // Make sure we don't have any trailing sequence numbers in the subtitle text
            expect(converted).not.toContain("First line\n2\n");
            expect(converted).not.toContain("Second line\n3\n");
        });

        it("should properly format VTT with MM:SS timestamps and add hours", () => {
            const converted = convertSrtToVtt(longVttExample);
            expect(converted).toContain("WEBVTT");
            expect(converted).toContain("00:00:03.298 --> 00:00:04.578");
            expect(converted).toContain("First line");
            expect(converted).toContain("1\n00:00:03.298 --> 00:00:04.578\nFirst line\n\n");
            expect(converted).toContain("2\n00:00:04.578 --> 00:00:06.178\nSecond line\n\n");
        });

        it("should handle VTT with missing newlines between cues", () => {
            const converted = convertSrtToVtt(longVttWithMissingNewlines);
            expect(converted).toContain("WEBVTT");
            expect(converted).toContain("1\n00:00:03.298 --> 00:00:04.578\nFirst line\n\n");
            expect(converted).toContain("2\n00:00:04.578 --> 00:00:06.178\nSecond line\n\n");
            expect(converted).toContain("3\n00:00:06.178 --> 00:00:07.518\nThird line\n\n");
        });

        it("should convert ultra-short timestamps (SS.mmm) to full format", () => {
            const ultraShortVtt = `WEBVTT

1
03.298 --> 04.578
First line

2
04.578 --> 06.178
Second line`;
            
            const converted = convertSrtToVtt(ultraShortVtt);
            expect(converted).toContain("WEBVTT");
            expect(converted).toContain("1\n00:00:03.298 --> 00:00:04.578\nFirst line\n\n");
            expect(converted).toContain("2\n00:00:04.578 --> 00:00:06.178\nSecond line\n\n");
        });

        it("should handle mixed timestamp formats", () => {
            const mixedVtt = `WEBVTT

1
03.298 --> 04.578
First line

2
00:04.578 --> 00:06.178
Second line

3
00:00:06.178 --> 00:00:07.518
Third line`;
            
            const converted = convertSrtToVtt(mixedVtt);
            expect(converted).toContain("WEBVTT");
            expect(converted).toContain("1\n00:00:03.298 --> 00:00:04.578\nFirst line\n\n");
            expect(converted).toContain("2\n00:00:04.578 --> 00:00:06.178\nSecond line\n\n");
            expect(converted).toContain("3\n00:00:06.178 --> 00:00:07.518\nThird line\n\n");
        });
    });
});
