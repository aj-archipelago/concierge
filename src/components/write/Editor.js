"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MonacoEditor from "@monaco-editor/react";
import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Undo,
    Redo,
    FileCode,
    Code2,
    Image as ImageIcon,
} from "lucide-react";
import CopyButton from "../CopyButton";
import { RawHtml } from "./RawHtmlExtension";
import ImageDialog from "./ImageDialog";

function Editor({
    value,
    onChange,
    onSelect,
    onEditorReady,
    contextId,
    direction,
    isActive,
    fileHash,
}) {
    const { t } = useTranslation();
    const lastSetValueRef = useRef(value);
    const prevFileHashRef = useRef(fileHash);
    const selectionTimeoutRef = useRef(null);
    const [isCodeView, setIsCodeView] = useState(false);
    const [codeViewContent, setCodeViewContent] = useState(value || "");
    const lastCodeViewValueRef = useRef(value);
    const [showRawHtmlDialog, setShowRawHtmlDialog] = useState(false);
    const [rawHtmlInput, setRawHtmlInput] = useState("");
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [showImageDialog, setShowImageDialog] = useState(false);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Disable markdown shortcuts since we want HTML
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Placeholder.configure({
                placeholder: t("Enter story content"),
            }),
            Image.configure({
                inline: true,
                allowBase64: false,
            }),
            RawHtml,
        ],
        content: value || "",
        immediatelyRender: false,
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            lastSetValueRef.current = html;
            onChange(html);

            // Handle selection tracking
            if (onSelect) {
                const { from, to } = editor.state.selection;
                const selectedText = editor.state.doc.textBetween(
                    from,
                    to,
                    " ",
                );

                // Debounce selection updates
                if (selectionTimeoutRef.current) {
                    clearTimeout(selectionTimeoutRef.current);
                }

                selectionTimeoutRef.current = setTimeout(() => {
                    // Get plain text version for start/end positions
                    const beforeSelection = editor.state.doc.textBetween(
                        0,
                        from,
                        " ",
                    );

                    onSelect({
                        start: beforeSelection.length,
                        end: beforeSelection.length + selectedText.length,
                        text: selectedText,
                    });
                }, 100);
            }
        },
        onSelectionUpdate: ({ editor }) => {
            if (onSelect) {
                const { from, to } = editor.state.selection;
                const selectedText = editor.state.doc.textBetween(
                    from,
                    to,
                    " ",
                );
                const beforeSelection = editor.state.doc.textBetween(
                    0,
                    from,
                    " ",
                );

                if (selectionTimeoutRef.current) {
                    clearTimeout(selectionTimeoutRef.current);
                }

                selectionTimeoutRef.current = setTimeout(() => {
                    onSelect({
                        start: beforeSelection.length,
                        end: beforeSelection.length + selectedText.length,
                        text: selectedText,
                    });
                }, 100);
            }
        },
        editorProps: {
            attributes: {
                class: "tiptap-editor focus:outline-none h-full overflow-auto",
                dir: direction || "ltr",
            },
        },
    });

    // Update editor content when value prop changes externally
    useEffect(() => {
        if (editor && value !== undefined && !isCodeView) {
            // Force setContent when the file identity changed (different article)
            const fileChanged = fileHash !== prevFileHashRef.current;
            prevFileHashRef.current = fileHash;

            if (fileChanged || value !== lastSetValueRef.current) {
                editor.commands.setContent(value || "", false);
                lastSetValueRef.current = value;
            }
        }
        // Update code view content if in code view mode and value changed externally
        if (
            isCodeView &&
            value !== undefined &&
            value !== lastCodeViewValueRef.current
        ) {
            setCodeViewContent(value || "");
            lastCodeViewValueRef.current = value;
        }
    }, [value, editor, isCodeView, fileHash]);

    // Force content refresh when tab becomes visible
    // TipTap/ProseMirror may not properly render content set while hidden (display:none)
    const prevIsActiveRef = useRef(isActive);
    useEffect(() => {
        if (
            isActive &&
            !prevIsActiveRef.current &&
            editor &&
            value !== undefined
        ) {
            editor.commands.setContent(value || "", false);
            lastSetValueRef.current = value;
        }
        prevIsActiveRef.current = isActive;
    }, [isActive, editor, value]);

    // Sync code view content when switching to code view mode
    useEffect(() => {
        if (isCodeView && editor) {
            const htmlContent = editor.getHTML();
            setCodeViewContent(htmlContent);
            lastCodeViewValueRef.current = htmlContent;
        }
    }, [isCodeView, editor]);

    // Expose editor instance to parent component
    useEffect(() => {
        if (editor && onEditorReady) {
            onEditorReady(editor);
        }
    }, [editor, onEditorReady]);

    // Detect dark mode
    useEffect(() => {
        const checkDarkMode = () => {
            setIsDarkMode(document.documentElement.classList.contains("dark"));
        };

        checkDarkMode();

        // Watch for dark mode changes
        const observer = new MutationObserver(checkDarkMode);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        return () => observer.disconnect();
    }, []);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (selectionTimeoutRef.current) {
                clearTimeout(selectionTimeoutRef.current);
            }
        };
    }, []);

    if (!editor) {
        return null;
    }

    return (
        <div className="relative grow h-full flex flex-col rounded-lg overflow-hidden">
            {/* Toolbar */}
            <div className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
                <div
                    role="toolbar"
                    aria-label="Text formatting toolbar"
                    className="flex items-center gap-1 p-2 flex-wrap"
                >
                    {/* Text Formatting */}
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleBold().run()
                        }
                        disabled={
                            !editor.can().chain().focus().toggleBold().run()
                        }
                        aria-label={t("Bold")}
                        aria-pressed={editor.isActive("bold")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("bold")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Bold")}
                    >
                        <Bold className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleItalic().run()
                        }
                        disabled={
                            !editor.can().chain().focus().toggleItalic().run()
                        }
                        aria-label={t("Italic")}
                        aria-pressed={editor.isActive("italic")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("italic")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Italic")}
                    >
                        <Italic className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleStrike().run()
                        }
                        disabled={
                            !editor.can().chain().focus().toggleStrike().run()
                        }
                        aria-label={t("Strikethrough")}
                        aria-pressed={editor.isActive("strike")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("strike")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Strikethrough")}
                    >
                        <Strikethrough className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleCode().run()
                        }
                        disabled={
                            !editor.can().chain().focus().toggleCode().run()
                        }
                        aria-label={t("Inline Code")}
                        aria-pressed={editor.isActive("code")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("code")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Inline Code")}
                    >
                        <Code className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"
                    />
                    {/* Headings */}
                    <button
                        type="button"
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .toggleHeading({ level: 1 })
                                .run()
                        }
                        aria-label={t("Heading 1")}
                        aria-pressed={editor.isActive("heading", { level: 1 })}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("heading", { level: 1 })
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Heading 1")}
                    >
                        <Heading1 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .toggleHeading({ level: 2 })
                                .run()
                        }
                        aria-label={t("Heading 2")}
                        aria-pressed={editor.isActive("heading", { level: 2 })}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("heading", { level: 2 })
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Heading 2")}
                    >
                        <Heading2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .toggleHeading({ level: 3 })
                                .run()
                        }
                        aria-label={t("Heading 3")}
                        aria-pressed={editor.isActive("heading", { level: 3 })}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("heading", { level: 3 })
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Heading 3")}
                    >
                        <Heading3 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"
                    />
                    {/* Lists */}
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleBulletList().run()
                        }
                        aria-label={t("Bullet List")}
                        aria-pressed={editor.isActive("bulletList")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("bulletList")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Bullet List")}
                    >
                        <List className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleOrderedList().run()
                        }
                        aria-label={t("Numbered List")}
                        aria-pressed={editor.isActive("orderedList")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("orderedList")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Numbered List")}
                    >
                        <ListOrdered className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleBlockquote().run()
                        }
                        aria-label={t("Blockquote")}
                        aria-pressed={editor.isActive("blockquote")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("blockquote")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title={t("Blockquote")}
                    >
                        <Quote className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"
                    />
                    {/* Undo/Redo */}
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().chain().focus().undo().run()}
                        aria-label={t("Undo")}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("Undo")}
                    >
                        <Undo className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().chain().focus().redo().run()}
                        aria-label={t("Redo")}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("Redo")}
                    >
                        <Redo className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"
                    />
                    {/* Code View Toggle */}
                    <button
                        type="button"
                        onClick={() => {
                            if (isCodeView) {
                                // Switching from code view to visual view
                                const htmlContent = codeViewContent;
                                if (editor) {
                                    editor.commands.setContent(
                                        htmlContent || "",
                                        false,
                                    );
                                    lastSetValueRef.current = htmlContent;
                                    lastCodeViewValueRef.current = htmlContent;
                                    onChange(htmlContent);
                                }
                            } else {
                                // Switching from visual view to code view
                                const htmlContent = editor
                                    ? editor.getHTML()
                                    : value || "";
                                setCodeViewContent(htmlContent);
                                lastCodeViewValueRef.current = htmlContent;
                            }
                            setIsCodeView(!isCodeView);
                        }}
                        aria-label={t("Code View")}
                        aria-pressed={isCodeView}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            isCodeView ? "bg-gray-200 dark:bg-gray-700" : ""
                        }`}
                        title={t("Code View")}
                    >
                        <FileCode className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"
                    />
                    {/* Insert Raw HTML */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowRawHtmlDialog(true);
                            setRawHtmlInput("");
                        }}
                        aria-label={t("Insert Raw HTML")}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title={t("Insert Raw HTML")}
                    >
                        <Code2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"
                    />
                    {/* Insert Image */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowImageDialog(true);
                        }}
                        aria-label={t("Insert Image")}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title={t("Insert Image")}
                    >
                        <ImageIcon className="w-4 h-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {/* Raw HTML Dialog */}
            {showRawHtmlDialog && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setShowRawHtmlDialog(false);
                            setRawHtmlInput("");
                        }
                    }}
                >
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
                            {t("Insert Raw HTML")}
                        </h3>
                        <textarea
                            value={rawHtmlInput}
                            onChange={(e) => setRawHtmlInput(e.target.value)}
                            className="w-full h-64 p-3 font-mono text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={t("Paste or type your HTML here...")}
                            spellCheck={false}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowRawHtmlDialog(false);
                                    setRawHtmlInput("");
                                }}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            >
                                {t("Cancel")}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (editor && rawHtmlInput.trim()) {
                                        editor.commands.setRawHtml(
                                            rawHtmlInput.trim(),
                                        );
                                        setShowRawHtmlDialog(false);
                                        setRawHtmlInput("");
                                    }
                                }}
                                disabled={!rawHtmlInput.trim()}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t("Insert")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Dialog */}
            <ImageDialog
                show={showImageDialog}
                onHide={() => setShowImageDialog(false)}
                onImageSelected={(url) => {
                    if (editor && url) {
                        editor.chain().focus().setImage({ src: url }).run();
                        setShowImageDialog(false);
                    }
                }}
                contextId={contextId}
            />

            {/* Editor Content */}
            <div className="flex-1 relative bg-white dark:bg-gray-800 overflow-hidden min-h-[300px] sm:min-h-[500px] pt-4">
                {value && !isCodeView && (
                    <CopyButton
                        item={value}
                        className="absolute top-3 end-4 z-10"
                    />
                )}
                {isCodeView ? (
                    <MonacoEditor
                        height="100%"
                        width="100%"
                        language="html"
                        theme={isDarkMode ? "vs-dark" : "vs"}
                        value={codeViewContent}
                        onChange={(newValue) => {
                            const updatedValue = newValue || "";
                            setCodeViewContent(updatedValue);
                            lastCodeViewValueRef.current = updatedValue;
                            onChange(updatedValue);
                        }}
                        options={{
                            fontSize: 14,
                            fontWeight: "normal",
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            wordWrap: "on",
                            automaticLayout: true,
                            formatOnPaste: true,
                            formatOnType: true,
                            tabSize: 2,
                            insertSpaces: true,
                            trimAutoWhitespace: true,
                            renderWhitespace: "selection",
                            lineNumbers: "on",
                            folding: true,
                            bracketPairColorization: { enabled: true },
                            suggest: {
                                showKeywords: true,
                                showSnippets: true,
                            },
                        }}
                    />
                ) : (
                    <EditorContent editor={editor} />
                )}
            </div>

            {/* Styles */}
            <style jsx global>{`
                .tiptap-editor {
                    outline: none;
                    color: #111827;
                    font-family: Georgia, serif;
                    min-height: 500px;
                }
                .dark .tiptap-editor {
                    color: #f3f4f6;
                }
                .tiptap-editor p.is-editor-empty:first-child::before {
                    color: #9ca3af;
                    content: attr(data-placeholder);
                    float: left;
                    height: 0;
                    pointer-events: none;
                }
                .tiptap-editor[dir="rtl"] p.is-editor-empty:first-child::before,
                [dir="rtl"]
                    .tiptap-editor
                    p.is-editor-empty:first-child::before {
                    float: right;
                }
                .dark .tiptap-editor p.is-editor-empty:first-child::before {
                    color: #6b7280;
                }
                .dark
                    .tiptap-editor[dir="rtl"]
                    p.is-editor-empty:first-child::before,
                .dark
                    [dir="rtl"]
                    .tiptap-editor
                    p.is-editor-empty:first-child::before {
                    color: #6b7280;
                }
                .tiptap-editor p {
                    margin: 0.5rem 0;
                }
                .tiptap-editor p:first-child {
                    margin-top: 0;
                }
                .tiptap-editor p:last-child {
                    margin-bottom: 0;
                }
                .tiptap-editor h1 {
                    font-size: 2.25rem;
                    font-weight: 700;
                    font-family: "Roboto", sans-serif;
                    margin: 2.25rem 0 1rem 0;
                    line-height: 1.2;
                }
                .tiptap-editor h2 {
                    font-size: 1.875rem;
                    font-weight: 700;
                    font-family: "Roboto", sans-serif;
                    margin: 2rem 0 1rem 0;
                    line-height: 1.3;
                }
                .tiptap-editor h3 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    font-family: "Roboto", sans-serif;
                    margin: 1.75rem 0 0.875rem 0;
                    line-height: 1.4;
                }
                .tiptap-editor ul,
                .tiptap-editor ol {
                    padding-inline-start: 1.5rem;
                    margin: 0.5rem 0;
                }
                .tiptap-editor li {
                    margin: 0.25rem 0;
                }
                .tiptap-editor code {
                    background-color: #e5e7eb;
                    padding: 0.125rem 0.25rem;
                    border-radius: 0.25rem;
                    font-family: monospace;
                    font-size: 0.875rem;
                }
                .dark .tiptap-editor code {
                    background-color: #374151;
                }
                .tiptap-editor pre {
                    background-color: #e5e7eb;
                    padding: 0.75rem;
                    border-radius: 0.375rem;
                    font-family: monospace;
                    font-size: 0.875rem;
                    overflow-x: auto;
                    margin: 0.5rem 0;
                }
                .dark .tiptap-editor pre {
                    background-color: #374151;
                }
                .tiptap-editor pre code {
                    background-color: transparent;
                    padding: 0;
                }
                .tiptap-editor blockquote {
                    border-inline-start: 4px solid #d1d5db;
                    padding-inline-start: 1rem;
                    margin: 0.5rem 0;
                    font-style: italic;
                    color: #6b7280;
                }
                .dark .tiptap-editor blockquote {
                    border-inline-start-color: #4b5563;
                    color: #9ca3af;
                }
                .tiptap-editor a {
                    color: #2563eb;
                    text-decoration: underline;
                }
                .dark .tiptap-editor a {
                    color: #60a5fa;
                }
                .tiptap-editor strong {
                    font-weight: bold;
                }
                .tiptap-editor em {
                    font-style: italic;
                }
                .raw-html-wrapper {
                    border: 1px dashed #d1d5db;
                    padding: 8px;
                    margin: 8px 0;
                    border-radius: 4px;
                    background-color: #f9fafb;
                    position: relative;
                    cursor: grab;
                }
                .raw-html-wrapper:active {
                    cursor: grabbing;
                }
                .dark .raw-html-wrapper {
                    border-color: #4b5563;
                    background-color: #1f2937;
                }
                .raw-html-content {
                    min-height: 100px;
                    width: 100%;
                    display: block;
                    border: none;
                    background: transparent;
                    pointer-events: auto; /* Ensure iframe can receive pointer events */
                }
                .raw-html-copy {
                    position: absolute;
                    top: 4px;
                    inset-inline-end: 36px;
                    width: 24px;
                    height: 24px;
                    border: none;
                    border-radius: 4px;
                    background-color: rgba(0, 0, 0, 0.1);
                    color: #6b7280;
                    font-size: 14px;
                    line-height: 1;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    transition: all 0.2s;
                    opacity: 0;
                }
                .raw-html-wrapper:hover .raw-html-copy {
                    opacity: 0.7;
                }
                .raw-html-copy:hover {
                    background-color: rgba(59, 130, 246, 0.1);
                    color: #3b82f6;
                    opacity: 1 !important;
                }
                .dark .raw-html-copy {
                    background-color: rgba(255, 255, 255, 0.1);
                    color: #9ca3af;
                }
                .dark .raw-html-wrapper:hover .raw-html-copy {
                    opacity: 0.7;
                }
                .dark .raw-html-copy:hover {
                    background-color: rgba(59, 130, 246, 0.2);
                    color: #60a5fa;
                    opacity: 1 !important;
                }
                .raw-html-delete {
                    position: absolute;
                    top: 4px;
                    inset-inline-end: 4px;
                    width: 24px;
                    height: 24px;
                    border: none;
                    border-radius: 4px;
                    background-color: rgba(0, 0, 0, 0.1);
                    color: #6b7280;
                    font-size: 20px;
                    line-height: 1;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    transition: all 0.2s;
                    opacity: 0;
                }
                .raw-html-wrapper:hover .raw-html-delete {
                    opacity: 0.7;
                }
                .raw-html-delete:hover {
                    background-color: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    opacity: 1 !important;
                }
                .dark .raw-html-delete {
                    background-color: rgba(255, 255, 255, 0.1);
                    color: #9ca3af;
                }
                .dark .raw-html-wrapper:hover .raw-html-delete {
                    opacity: 0.7;
                }
                .dark .raw-html-delete:hover {
                    background-color: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                    opacity: 1 !important;
                }
                .tiptap-editor img {
                    max-width: 100%;
                    height: auto;
                    margin: 1rem 0;
                    border-radius: 0.375rem;
                }
                .tiptap-editor img:first-child {
                    margin-top: 0;
                }
                .tiptap-editor img:last-child {
                    margin-bottom: 0;
                }
            `}</style>
        </div>
    );
}

export default Editor;
