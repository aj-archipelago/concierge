import { detectSubtitleFormat, convertSrtToVtt } from '../transcribe.utils';

describe('Subtitle Format Detection and Conversion', () => {
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

    describe('detectSubtitleFormat', () => {
        it('should detect SRT format correctly', () => {
            expect(detectSubtitleFormat(srtExample)).toBe('srt');
        });

        it('should detect VTT format correctly', () => {
            expect(detectSubtitleFormat(vttExample)).toBe('vtt');
        });

        it('should detect Arabic SRT format correctly', () => {
            expect(detectSubtitleFormat(arabicSrt)).toBe('srt');
        });

        it('should return null for plain text', () => {
            expect(detectSubtitleFormat('Just some plain text\nwith multiple lines')).toBeNull();
        });

        it('should handle empty input', () => {
            expect(detectSubtitleFormat('')).toBeNull();
        });
    });

    describe('convertSrtToVtt', () => {
        it('should convert SRT to VTT format correctly', () => {
            const converted = convertSrtToVtt(srtExample);
            expect(converted).toContain('WEBVTT');
            expect(converted).toContain('00:00:03.382 --> 00:00:04.952');
            expect(converted).toContain('كانت في مجزره مره في مدرسه السطاوي.');
        });

        it('should handle empty input', () => {
            const converted = convertSrtToVtt('');
            expect(converted).toBe('WEBVTT\n\n');
        });

        it('should convert Arabic SRT to VTT format correctly', () => {
            const converted = convertSrtToVtt(arabicSrt);
            expect(converted).toContain('WEBVTT');
            expect(converted).toContain('00:00:03.382 --> 00:00:04.952');
            expect(converted).toContain('كانت في مجزره مره في مدرسه السطاوي.');
            expect(converted).toContain('00:00:29.452 --> 00:00:31.672');
            expect(converted).toContain('قعدنا نردد نصيح');
        });

        it('should handle SRT without blank lines before sequence numbers', () => {
            const converted = convertSrtToVtt(srtWithoutBlankLines);
            expect(converted).toContain('WEBVTT');
            expect(converted).toContain('1\n00:00:03.382 --> 00:00:04.952\nFirst line\n\n');
            expect(converted).toContain('2\n00:00:05.072 --> 00:00:07.872\nSecond line\n\n');
            expect(converted).toContain('3\n00:00:08.012 --> 00:00:10.282\nThird line\n\n');
            // Make sure we don't have any trailing sequence numbers in the subtitle text
            expect(converted).not.toContain('First line\n2\n');
            expect(converted).not.toContain('Second line\n3\n');
        });
    });
}); 