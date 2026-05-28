/**
 * @jest-environment node
 */

import {
    getExtension,
    getFileIcon,
    generateFilenameFromMimeType,
    isSupportedFileUrl,
    makeUniqueFilename,
} from "../mediaUtils";

describe("mediaUtils", () => {
    describe("getExtension", () => {
        test("should extract extension from simple filename", () => {
            expect(getExtension("document.pdf")).toBe(".pdf");
            expect(getExtension("image.jpg")).toBe(".jpg");
            expect(getExtension("data.csv")).toBe(".csv");
        });

        test("should extract extension from URL", () => {
            expect(getExtension("https://example.com/file.csv")).toBe(".csv");
            expect(
                getExtension(
                    "https://storage.blob.core.windows.net/files/doc.md",
                ),
            ).toBe(".md");
        });

        test("should handle URLs with query strings", () => {
            expect(
                getExtension(
                    "https://storage.blob.core.windows.net/file.csv?sv=2025&sig=abc",
                ),
            ).toBe(".csv");
        });

        test("should ignore hostname dots when URL path has no extension", () => {
            expect(
                getExtension("https://concierge.example.com/uploads/file-id"),
            ).toBe("");
        });

        test("should ignore embedded origin dots in blob object URLs", () => {
            expect(
                getExtension(
                    "blob:https://concierge.example.com/ebdcd774-e783-4926-8322-59520a93a977",
                ),
            ).toBe("");
        });

        test("should handle URLs with hash fragments", () => {
            expect(getExtension("https://example.com/doc.pdf#page=2")).toBe(
                ".pdf",
            );
        });

        test("should handle files with multiple dots", () => {
            expect(getExtension("my.report.final.xlsx")).toBe(".xlsx");
            expect(getExtension("backup.2024.01.tar.gz")).toBe(".gz");
        });

        test("should return empty string for files without extension", () => {
            expect(getExtension("Makefile")).toBe("");
            expect(getExtension("README")).toBe("");
        });

        test("should handle empty/null input", () => {
            expect(getExtension("")).toBe("");
            expect(getExtension(null)).toBe("");
            expect(getExtension(undefined)).toBe("");
        });

        test("should lowercase extensions", () => {
            expect(getExtension("IMAGE.JPG")).toBe(".jpg");
            expect(getExtension("Document.PDF")).toBe(".pdf");
        });
    });

    describe("getFileIcon", () => {
        test("should return appropriate icons for common file types", () => {
            // Just verify it returns a component (not null/undefined)
            expect(getFileIcon("document.pdf")).toBeDefined();
            expect(getFileIcon("image.jpg")).toBeDefined();
            expect(getFileIcon("video.mp4")).toBeDefined();
            expect(getFileIcon("data.csv")).toBeDefined();
        });
    });

    describe("isSupportedFileUrl", () => {
        test("should allow any non-empty file URL or filename", () => {
            expect(isSupportedFileUrl("script.sh")).toBe(true);
            expect(isSupportedFileUrl("archive.zip")).toBe(true);
            expect(isSupportedFileUrl("Makefile")).toBe(true);
        });

        test("should reject empty values", () => {
            expect(isSupportedFileUrl("")).toBe(false);
            expect(isSupportedFileUrl(null)).toBe(false);
            expect(isSupportedFileUrl(undefined)).toBe(false);
        });
    });

    describe("makeUniqueFilename", () => {
        test("should insert short ID before extension", () => {
            const result = makeUniqueFilename("image.png");
            expect(result).toMatch(/^image-[a-z0-9]+\.png$/);
            expect(result).not.toBe("image.png");
        });

        test("should append short ID when no extension", () => {
            const result = makeUniqueFilename("pasted-file");
            expect(result).toMatch(/^pasted-file-[a-z0-9]+$/);
        });

        test("should handle multiple dots in filename", () => {
            const result = makeUniqueFilename("my.photo.jpg");
            expect(result).toMatch(/^my\.photo-[a-z0-9]+\.jpg$/);
        });
    });

    describe("generateFilenameFromMimeType", () => {
        test("should pass through non-generic filenames unchanged", () => {
            expect(
                generateFilenameFromMimeType({
                    name: "report.pdf",
                    type: "application/pdf",
                }),
            ).toBe("report.pdf");
        });

        test("should pass through filenames that are not generic clipboard names", () => {
            expect(
                generateFilenameFromMimeType({
                    name: "screenshot-2024.png",
                    type: "image/png",
                }),
            ).toBe("screenshot-2024.png");
        });

        test("should uniquify generic clipboard name image.png", () => {
            const result = generateFilenameFromMimeType({
                name: "image.png",
                type: "image/png",
            });
            expect(result).toMatch(/^image-[a-z0-9]+\.png$/);
            expect(result).not.toBe("image.png");
        });

        test("should uniquify generic clipboard name image.jpg", () => {
            const result = generateFilenameFromMimeType({
                name: "image.jpg",
                type: "image/jpeg",
            });
            expect(result).toMatch(/^image-[a-z0-9]+\.jpg$/);
        });

        test("should uniquify generic clipboard name case-insensitively", () => {
            const result = generateFilenameFromMimeType({
                name: "Image.PNG",
                type: "image/png",
            });
            expect(result).toMatch(/^Image-[a-z0-9]+\.PNG$/);
        });

        test("should generate unique name for empty name with mime type", () => {
            const result = generateFilenameFromMimeType({
                name: "",
                type: "image/png",
            });
            expect(result).toMatch(/^pasted-file-[a-z0-9]+\.png$/);
        });

        test("should generate unique name for empty name without mime type", () => {
            const result = generateFilenameFromMimeType({ name: "", type: "" });
            expect(result).toMatch(/^pasted-file-[a-z0-9]+$/);
        });
    });
});
