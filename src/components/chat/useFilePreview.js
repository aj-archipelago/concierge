"use client";

import { useMemo, useState, useEffect, useContext } from "react";
import mime from "mime-types";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MonacoEditor from "@monaco-editor/react";
import {
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    getExtension,
} from "../../utils/mediaUtils";
import { getTextProxyUrl } from "../../utils/proxyUrl";
import { getDownloadUrl } from "../../utils/fileDownloadUtils";
import { ThemeContext } from "../../contexts/ThemeProvider";
import { ImageWithFallback } from "./MediaCard";

const MONACO_LANGUAGE_BY_EXTENSION = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    go: "go",
    rs: "rust",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    swift: "swift",
    php: "php",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ps1: "powershell",
    sql: "sql",
    r: "r",
    lua: "lua",
    pl: "perl",
    scala: "scala",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    xml: "xml",
    html: "html",
    htm: "html",
    svg: "xml",
    dockerfile: "dockerfile",
    makefile: "makefile",
    graphql: "graphql",
    gql: "graphql",
    proto: "protobuf",
    tf: "hcl",
    dart: "dart",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    clj: "clojure",
    vue: "html",
    svelte: "html",
};

const PREVIEW_LABELS = {
    image: "Preview",
    video: "Preview",
    audio: "Preview",
    pdf: "Document Preview",
    markdown: "Markdown Preview",
    csv: "Table",
    code: "Preview",
    text: "Preview",
    spreadsheet: "Spreadsheet",
    docx: "Document Preview",
    unsupported: "Preview",
};

/** Max text preview size (1MB) to prevent memory issues with large files */
const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

function getExtensionWithoutDot(value) {
    return value ? value.replace(/^\./, "").toLowerCase() : "";
}

function getMonacoLanguage(extension) {
    return (
        MONACO_LANGUAGE_BY_EXTENSION[getExtensionWithoutDot(extension)] || null
    );
}

function isTextBasedMimeType(mimeType) {
    if (!mimeType) return false;

    if (mimeType.startsWith("text/")) return true;

    const textBasedAppTypes = [
        "application/json",
        "application/xml",
        "application/javascript",
        "application/x-javascript",
        "application/ecmascript",
        "application/x-yaml",
        "application/yaml",
    ];

    return textBasedAppTypes.includes(mimeType);
}

function isMarkdownType(extension, mimeType) {
    const ext = getExtensionWithoutDot(extension);
    return mimeType === "text/markdown" || ext === "md" || ext === "mdx";
}

function isCsvType(extension, mimeType) {
    return (
        getExtensionWithoutDot(extension) === "csv" || mimeType === "text/csv"
    );
}

function isSpreadsheetType(extension, mimeType) {
    const ext = getExtensionWithoutDot(extension);
    return (
        ext === "xlsx" ||
        ext === "xls" ||
        mimeType ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mimeType === "application/vnd.ms-excel"
    );
}

function isDocxType(extension, mimeType) {
    return (
        getExtensionWithoutDot(extension) === "docx" ||
        mimeType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
}

function getPreviewKind(extension, mimeType) {
    if (!extension && !mimeType) return "unsupported";

    if (
        (mimeType && mimeType.startsWith("image/")) ||
        (extension ? IMAGE_EXTENSIONS.includes(extension) : false)
    ) {
        return "image";
    }

    if (
        (mimeType && mimeType.startsWith("video/")) ||
        (extension ? VIDEO_EXTENSIONS.includes(extension) : false)
    ) {
        return "video";
    }

    if (
        (mimeType && mimeType.startsWith("audio/")) ||
        (extension ? AUDIO_EXTENSIONS.includes(extension) : false)
    ) {
        return "audio";
    }

    if (
        mimeType === "application/pdf" ||
        getExtensionWithoutDot(extension) === "pdf"
    ) {
        return "pdf";
    }

    if (isMarkdownType(extension, mimeType)) return "markdown";
    if (isCsvType(extension, mimeType)) return "csv";
    if (getMonacoLanguage(extension)) return "code";
    if (isSpreadsheetType(extension, mimeType)) return "spreadsheet";
    if (isDocxType(extension, mimeType)) return "docx";
    if (isTextBasedMimeType(mimeType)) return "text";

    return "unsupported";
}

function PreviewState({
    loading,
    error,
    compact = false,
    className = "",
    t = null,
}) {
    const translationFn = t || ((key) => key);

    if (loading) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-gray-50 dark:bg-gray-900`}
            >
                <div
                    className={`text-gray-500 dark:text-gray-400 ${compact ? "text-xs" : ""}`}
                >
                    {translationFn("Loading...")}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-gray-50 dark:bg-gray-900`}
            >
                <div
                    className={`text-red-500 dark:text-red-400 text-center ${compact ? "p-1" : "p-4"}`}
                >
                    <p className={compact ? "text-[8px]" : ""}>
                        {translationFn("Unable to load file")}
                    </p>
                    {!compact && (
                        <p className="text-xs mt-1 text-gray-500">{error}</p>
                    )}
                </div>
            </div>
        );
    }

    return null;
}

function CsvTablePreview({ rows, compact = false }) {
    if (!rows || rows.length === 0) return null;

    const visibleRows = compact ? rows.slice(0, 6) : rows;

    return (
        <div className="h-full overflow-auto">
            <table className="min-w-full border-collapse text-sm">
                <tbody>
                    {visibleRows.map((row, rowIdx) => (
                        <tr
                            key={rowIdx}
                            className={
                                rowIdx === 0
                                    ? "bg-gray-100 dark:bg-gray-800 font-medium sticky top-0"
                                    : rowIdx % 2 === 0
                                      ? "bg-white dark:bg-gray-900"
                                      : "bg-gray-50 dark:bg-gray-900/50"
                            }
                        >
                            {row.map((cell, colIdx) => {
                                const CellTag = rowIdx === 0 ? "th" : "td";
                                return (
                                    <CellTag
                                        key={colIdx}
                                        className={`border border-gray-200 dark:border-gray-700 text-left text-gray-800 dark:text-gray-200 ${compact ? "px-2 py-1 text-xs max-w-[8rem]" : "px-3 py-1.5 whitespace-nowrap max-w-xs"} truncate`}
                                        title={cell}
                                    >
                                        {cell}
                                    </CellTag>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function parseCsv(content) {
    if (!content) return [];

    return content
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
            const result = [];
            let current = "";
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (ch === "," && !inQuotes) {
                    result.push(current);
                    current = "";
                } else {
                    current += ch;
                }
            }

            result.push(current);
            return result;
        });
}

export function TextFilePreview({
    src,
    filename,
    className = "",
    onLoad,
    t,
    compact = false,
    mode = "text",
    inlineContent = null,
    isActive = true,
}) {
    const { theme } = useContext(ThemeContext);
    const monacoTheme = theme === "dark" ? "vs-dark" : "vs";
    const [content, setContent] = useState(inlineContent ?? null);
    const [loading, setLoading] = useState(Boolean(src) && !inlineContent);
    const [error, setError] = useState(null);
    const translationFn = t || ((key) => key);

    useEffect(() => {
        if (inlineContent == null) return;
        setContent(inlineContent);
        setLoading(false);
        setError(null);
        onLoad?.();
    }, [inlineContent, onLoad]);

    useEffect(() => {
        if (inlineContent != null || !src) {
            if (!src && inlineContent == null) {
                setLoading(false);
            }
            return;
        }

        if (!isActive) return;

        let cancelled = false;

        setLoading(true);
        setError(null);

        fetch(getTextProxyUrl(src))
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load file: ${response.status}`);
                }

                const contentLength = response.headers.get("content-length");
                if (
                    contentLength &&
                    parseInt(contentLength, 10) > MAX_TEXT_PREVIEW_BYTES
                ) {
                    throw new Error("File too large to preview");
                }

                return response.text();
            })
            .then((text) => {
                if (cancelled) return;

                const truncated =
                    text.length > MAX_TEXT_PREVIEW_BYTES
                        ? `${text.slice(0, MAX_TEXT_PREVIEW_BYTES)}\n\n... (truncated)`
                        : text;

                setContent(truncated);
                setLoading(false);
                onLoad?.();
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Error loading text file:", err);
                setError(err.message);
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [src, inlineContent, isActive, onLoad]);

    const state = PreviewState({
        loading,
        error,
        compact,
        className,
        t: translationFn,
    });
    if (state) return state;
    if (content == null) return null;

    if (compact) {
        return (
            <div
                className={`${className} bg-white dark:bg-gray-900 overflow-auto`}
            >
                <pre className="p-1 text-[9px] leading-tight text-gray-800 dark:text-gray-200 whitespace-pre font-mono overflow-hidden">
                    {content}
                </pre>
            </div>
        );
    }

    if (mode === "markdown") {
        return (
            <div
                className={`${className} h-full overflow-auto p-6 bg-white dark:bg-gray-900`}
            >
                <div className="max-w-3xl mx-auto prose prose-sm dark:prose-invert prose-headings:font-semibold prose-a:text-sky-600 dark:prose-a:text-sky-400 prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800">
                    <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
                </div>
            </div>
        );
    }

    if (mode === "csv") {
        return (
            <div className={`${className} h-full bg-white dark:bg-gray-900`}>
                <CsvTablePreview rows={parseCsv(content)} />
            </div>
        );
    }

    return (
        <div className={`${className} h-full bg-white dark:bg-gray-900`}>
            <MonacoEditor
                height="100%"
                width="100%"
                language={
                    mode === "code"
                        ? getMonacoLanguage(getExtension(filename))
                        : "plaintext"
                }
                theme={monacoTheme}
                options={{
                    fontSize: 13,
                    readOnly: true,
                    wordWrap: "on",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    renderLineHighlight: "none",
                    lineNumbers: "on",
                    folding: true,
                }}
                value={content}
            />
        </div>
    );
}

function SpreadsheetPreview({
    src,
    className = "",
    onLoad,
    t,
    compact = false,
    isActive = true,
}) {
    const translationFn = t || ((key) => key);
    const [sheets, setSheets] = useState(null);
    const [activeSheet, setActiveSheet] = useState(0);
    const [loading, setLoading] = useState(Boolean(src));
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!src || !isActive) {
            if (!src) {
                setLoading(false);
            }
            return;
        }

        let cancelled = false;

        setLoading(true);
        setError(null);

        (async () => {
            try {
                const xlsxModule = await import("xlsx");
                const XLSX = xlsxModule.default || xlsxModule;
                const response = await fetch(getDownloadUrl(src));
                if (!response.ok) {
                    throw new Error(`Failed to load file: ${response.status}`);
                }

                const workbook = XLSX.read(await response.arrayBuffer(), {
                    type: "array",
                });

                const parsed = workbook.SheetNames.map((name) => ({
                    name,
                    data: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
                        header: 1,
                        defval: "",
                    }),
                }));

                if (cancelled) return;

                setSheets(parsed);
                setLoading(false);
                onLoad?.();
            } catch (err) {
                if (cancelled) return;
                console.error("Error loading spreadsheet:", err);
                setError(err.message || "Failed to load spreadsheet");
                setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [src, isActive, onLoad]);

    const state = PreviewState({
        loading,
        error,
        compact,
        className,
        t: translationFn,
    });
    if (state) return state;
    if (!sheets || sheets.length === 0) return null;

    const currentSheet = sheets[Math.min(activeSheet, sheets.length - 1)];
    const rows = compact
        ? (currentSheet?.data || []).slice(0, 6)
        : currentSheet?.data || [];

    return (
        <div
            className={`${className} flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden`}
        >
            {!compact && sheets.length > 1 && (
                <div className="flex-shrink-0 flex gap-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-x-auto">
                    {sheets.map((sheet, index) => (
                        <button
                            key={sheet.name}
                            type="button"
                            onClick={() => setActiveSheet(index)}
                            className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                                index === activeSheet
                                    ? "border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300 bg-white dark:bg-gray-900"
                                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                            }`}
                        >
                            {sheet.name}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto">
                <CsvTablePreview rows={rows} compact={compact} />
            </div>
        </div>
    );
}

function DocxPreview({
    src,
    className = "",
    onLoad,
    t,
    compact = false,
    isActive = true,
}) {
    const translationFn = t || ((key) => key);
    const [html, setHtml] = useState(null);
    const [loading, setLoading] = useState(Boolean(src));
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!src || !isActive) {
            if (!src) {
                setLoading(false);
            }
            return;
        }

        let cancelled = false;

        setLoading(true);
        setError(null);

        (async () => {
            try {
                const mammothModule = await import("mammoth");
                const mammoth = mammothModule.default || mammothModule;
                const response = await fetch(getDownloadUrl(src));
                if (!response.ok) {
                    throw new Error(`Failed to load file: ${response.status}`);
                }

                const result = await mammoth.convertToHtml({
                    arrayBuffer: await response.arrayBuffer(),
                });

                if (cancelled) return;

                setHtml(result.value);
                setLoading(false);
                onLoad?.();
            } catch (err) {
                if (cancelled) return;
                console.error("Error loading document:", err);
                setError(err.message || "Failed to load document");
                setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [src, isActive, onLoad]);

    const state = PreviewState({
        loading,
        error,
        compact,
        className,
        t: translationFn,
    });
    if (state) return state;
    if (!html) return null;

    return (
        <div
            className={`${className} h-full overflow-auto ${compact ? "p-3" : "p-6"} bg-white dark:bg-gray-900`}
        >
            <div
                className={`mx-auto prose dark:prose-invert prose-headings:font-semibold prose-a:text-sky-600 dark:prose-a:text-sky-400 prose-img:rounded-lg ${compact ? "prose-xs max-w-none" : "prose-sm max-w-3xl"}`}
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </div>
    );
}

export function useFilePreview(src, filename, mimeType = null) {
    return useMemo(() => {
        if (!src && !filename) {
            return {
                isImage: false,
                isVideo: false,
                isAudio: false,
                isDoc: false,
                isPdf: false,
                isPreviewable: false,
                extension: null,
                mimeType: null,
                previewKind: "unsupported",
                previewLabel: PREVIEW_LABELS.unsupported,
            };
        }

        const sourceExtension = src ? getExtension(src) : "";
        const filenameExtension = filename ? getExtension(filename) : "";
        const extension = sourceExtension || filenameExtension || null;

        const derivedMimeType = extension
            ? mime.lookup(getExtensionWithoutDot(extension)) || null
            : null;

        const normalizedMimeType = sourceExtension
            ? derivedMimeType
            : mimeType || derivedMimeType;

        const previewKind = getPreviewKind(extension, normalizedMimeType);
        const isImage = previewKind === "image";
        const isVideo = previewKind === "video";
        const isAudio = previewKind === "audio";
        const isPdf = previewKind === "pdf";
        const isDoc = [
            "pdf",
            "markdown",
            "csv",
            "code",
            "text",
            "spreadsheet",
            "docx",
        ].includes(previewKind);
        const isPreviewable = previewKind !== "unsupported";

        return {
            isImage,
            isVideo,
            isAudio,
            isDoc,
            isPdf,
            isPreviewable,
            extension,
            mimeType: normalizedMimeType,
            previewKind,
            previewLabel: PREVIEW_LABELS[previewKind] || PREVIEW_LABELS.text,
        };
    }, [src, filename, mimeType]);
}

export function renderFilePreview({
    src,
    filename,
    fileType,
    className = "",
    onLoad,
    autoPlay = false,
    t = null,
    compact = false,
    inlineContent = null,
    isActive = true,
    showVideoControls = true,
}) {
    const { isImage, isVideo, isAudio, isPdf, previewKind } = fileType;
    const translationFn = t || ((key) => key);
    const previewSrc = src ? getDownloadUrl(src) : src;

    if (!src && inlineContent == null) return null;

    if (isImage && src) {
        return (
            <ImageWithFallback
                src={src}
                alt={filename || translationFn("Image")}
                className={className}
                onLoad={onLoad}
            />
        );
    }

    if (isVideo && src) {
        return (
            <video
                src={previewSrc}
                className={className}
                controls={showVideoControls}
                preload="metadata"
                autoPlay={autoPlay}
                loop={autoPlay}
                muted={autoPlay}
                playsInline={autoPlay}
                onLoadedData={onLoad}
            />
        );
    }

    if (isAudio && src) {
        return (
            <div
                className={`flex flex-col items-center justify-center gap-2 p-4 bg-gray-100 dark:bg-gray-800 ${className}`}
            >
                <div className="text-3xl">🎵</div>
                <div className="text-center text-xs font-medium truncate w-full">
                    {filename}
                </div>
                <audio
                    src={previewSrc}
                    controls
                    autoPlay={autoPlay}
                    className="w-full"
                    onLoadedData={onLoad}
                />
            </div>
        );
    }

    if (isPdf && src) {
        return (
            <div className={`${className} bg-white dark:bg-gray-900`}>
                <iframe
                    src={src}
                    title={filename || translationFn("PDF")}
                    className="w-full h-full"
                    allow="fullscreen"
                    onLoad={onLoad}
                />
            </div>
        );
    }

    if (
        previewKind === "markdown" ||
        previewKind === "csv" ||
        previewKind === "code" ||
        previewKind === "text"
    ) {
        return (
            <TextFilePreview
                src={src}
                filename={filename}
                className={className}
                onLoad={onLoad}
                t={translationFn}
                compact={compact}
                mode={previewKind}
                inlineContent={inlineContent}
                isActive={isActive}
            />
        );
    }

    if (previewKind === "spreadsheet") {
        return (
            <SpreadsheetPreview
                src={src}
                className={className}
                onLoad={onLoad}
                t={translationFn}
                compact={compact}
                isActive={isActive}
            />
        );
    }

    if (previewKind === "docx") {
        return (
            <DocxPreview
                src={src}
                className={className}
                onLoad={onLoad}
                t={translationFn}
                compact={compact}
                isActive={isActive}
            />
        );
    }

    return null;
}
