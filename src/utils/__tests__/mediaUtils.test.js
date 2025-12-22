/**
 * @jest-environment node
 */

import { getExtension, getFileIcon } from "../mediaUtils";

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
});
