/** @jest-environment node */
import { normalizeUploadMimeType, validateFile } from "../fileValidation";

test.each([
    ["captions.srt", "", "application/x-subrip"],
    ["CAPTIONS.SRT", "application/octet-stream", "application/x-subrip"],
    ["captions.vtt", "application/octet-stream", "text/vtt"],
    ["captions.srt", "text/plain", "text/plain"],
])(
    "accepts supported subtitles %s with browser type %s",
    (name, type, expected) => {
        expect(normalizeUploadMimeType(name, type)).toBe(expected);
        const result = validateFile({ name, type, size: 100 });
        expect(result.isValid).toBe(true);
        expect(result.fileInfo.type).toBe(expected);
    },
);

test.each([
    ["payload.bin", "application/octet-stream"],
    ["payload.exe.srt", "application/octet-stream"],
    ["captions.srt", "application/x-executable"],
])("continues rejecting unsupported or blocked uploads %s", (name, type) => {
    expect(validateFile({ name, type, size: 100 }).isValid).toBe(false);
});
