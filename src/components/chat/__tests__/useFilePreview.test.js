/**
 * @jest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { useFilePreview } from "../useFilePreview";

describe("useFilePreview", () => {
    describe("extension detection", () => {
        test("should prioritize URL extension over filename for converted files", () => {
            // xlsx converted to csv - URL has .csv, filename has .xlsx
            const { result } = renderHook(() =>
                useFilePreview(
                    "https://storage.blob.core.windows.net/files/converted.csv",
                    "original-file.xlsx",
                ),
            );

            expect(result.current.extension).toBe(".csv");
            expect(result.current.isPreviewable).toBe(true);
        });

        test("should handle URLs with query strings", () => {
            const { result } = renderHook(() =>
                useFilePreview(
                    "https://storage.blob.core.windows.net/files/doc.csv?sv=2025&sig=abc",
                    "report.xlsx",
                ),
            );

            expect(result.current.extension).toBe(".csv");
        });

        test("should fall back to filename when src is null", () => {
            const { result } = renderHook(() =>
                useFilePreview(null, "document.pdf"),
            );

            expect(result.current.extension).toBe(".pdf");
            expect(result.current.isPdf).toBe(true);
        });
    });

    describe("file type detection", () => {
        test("should identify images", () => {
            const { result } = renderHook(() =>
                useFilePreview("https://example.com/photo.jpg", "photo.jpg"),
            );

            expect(result.current.isImage).toBe(true);
            expect(result.current.isPreviewable).toBe(true);
        });

        test("should identify videos", () => {
            const { result } = renderHook(() =>
                useFilePreview("https://example.com/video.mp4", "video.mp4"),
            );

            expect(result.current.isVideo).toBe(true);
            expect(result.current.isPreviewable).toBe(true); // videos are previewable
        });

        test("should identify PDFs", () => {
            const { result } = renderHook(() =>
                useFilePreview("https://example.com/doc.pdf", "doc.pdf"),
            );

            expect(result.current.isPdf).toBe(true);
            expect(result.current.isPreviewable).toBe(true);
        });

        test("should identify audio", () => {
            const { result } = renderHook(() =>
                useFilePreview("https://example.com/audio.mp3", "audio.mp3"),
            );

            expect(result.current.isAudio).toBe(true);
        });
    });

    describe("text file previewability", () => {
        const textFileTypes = [
            { ext: ".csv", name: "CSV" },
            { ext: ".json", name: "JSON" },
            { ext: ".md", name: "Markdown" },
            { ext: ".txt", name: "Text" },
            { ext: ".xml", name: "XML" },
            { ext: ".yaml", name: "YAML" },
        ];

        test.each(textFileTypes)(
            "should mark $name files as previewable",
            ({ ext }) => {
                const { result } = renderHook(() =>
                    useFilePreview(
                        `https://example.com/file${ext}`,
                        `file${ext}`,
                    ),
                );

                expect(result.current.isPreviewable).toBe(true);
                expect(result.current.isDoc).toBe(true);
            },
        );

        test("should NOT mark binary docs as previewable", () => {
            const { result } = renderHook(() =>
                useFilePreview("https://example.com/doc.docx", "doc.docx"),
            );

            expect(result.current.isDoc).toBe(true);
            expect(result.current.isPreviewable).toBe(false);
        });
    });

    describe("converted file scenarios", () => {
        test("xlsx converted to csv should be previewable as text", () => {
            const { result } = renderHook(() =>
                useFilePreview(
                    "https://storage.com/converted.csv",
                    "spreadsheet.xlsx",
                ),
            );

            expect(result.current.extension).toBe(".csv");
            expect(result.current.isPreviewable).toBe(true);
        });

        test("docx converted to md should be previewable as text", () => {
            const { result } = renderHook(() =>
                useFilePreview(
                    "https://storage.com/converted.md",
                    "document.docx",
                ),
            );

            expect(result.current.extension).toBe(".md");
            expect(result.current.isPreviewable).toBe(true);
        });
    });

    describe("edge cases", () => {
        test("should handle empty inputs", () => {
            const { result } = renderHook(() => useFilePreview(null, null));

            expect(result.current.isImage).toBe(false);
            expect(result.current.isPreviewable).toBe(false);
            expect(result.current.extension).toBe(null);
        });

        test("should handle undefined inputs", () => {
            const { result } = renderHook(() =>
                useFilePreview(undefined, undefined),
            );

            expect(result.current.isPreviewable).toBe(false);
        });
    });
});
