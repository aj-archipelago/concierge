"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef } from "react";
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
} from "lucide-react";

export default function MarkdownEditor({
    value,
    onChange,
    placeholder,
    className = "",
}) {
    // Track the last value we set to prevent unnecessary updates
    const lastSetValueRef = useRef(value);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Markdown,
            Placeholder.configure({
                placeholder: placeholder || "Start typing...",
            }),
        ],
        content: value || "",
        immediatelyRender: false,
        onUpdate: ({ editor }) => {
            const markdown = editor.getMarkdown();
            // Update ref when editor content changes internally
            lastSetValueRef.current = markdown;
            onChange(markdown);
        },
        editorProps: {
            attributes: {
                class: `tiptap focus:outline-none ${className}`,
            },
        },
    });

    // Update editor content when value prop changes externally
    useEffect(() => {
        if (editor && value !== undefined) {
            // Only update if the value is different from what we last set
            // This prevents infinite loops when parent re-renders with the same value
            if (value !== lastSetValueRef.current) {
                editor.commands.setContent(value || "", {
                    contentType: "markdown",
                });
                lastSetValueRef.current = value;
            }
        }
    }, [value, editor]);

    if (!editor) {
        return null;
    }

    return (
        <>
            <div className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 rounded-t">
                <div
                    role="toolbar"
                    aria-label="Markdown formatting toolbar"
                    className="flex items-center gap-1 p-2 flex-wrap"
                >
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleBold().run()
                        }
                        disabled={
                            !editor.can().chain().focus().toggleBold().run()
                        }
                        aria-label="Bold"
                        aria-pressed={editor.isActive("bold")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("bold")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Bold"
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
                        aria-label="Italic"
                        aria-pressed={editor.isActive("italic")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("italic")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Italic"
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
                        aria-label="Strikethrough"
                        aria-pressed={editor.isActive("strike")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("strike")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Strikethrough"
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
                        aria-label="Inline Code"
                        aria-pressed={editor.isActive("code")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("code")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Inline Code"
                    >
                        <Code className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"
                    />
                    <button
                        type="button"
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .toggleHeading({ level: 1 })
                                .run()
                        }
                        aria-label="Heading 1"
                        aria-pressed={editor.isActive("heading", { level: 1 })}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("heading", { level: 1 })
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Heading 1"
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
                        aria-label="Heading 2"
                        aria-pressed={editor.isActive("heading", { level: 2 })}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("heading", { level: 2 })
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Heading 2"
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
                        aria-label="Heading 3"
                        aria-pressed={editor.isActive("heading", { level: 3 })}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("heading", { level: 3 })
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Heading 3"
                    >
                        <Heading3 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"
                    />
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleBulletList().run()
                        }
                        aria-label="Bullet List"
                        aria-pressed={editor.isActive("bulletList")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("bulletList")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Bullet List"
                    >
                        <List className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleOrderedList().run()
                        }
                        aria-label="Numbered List"
                        aria-pressed={editor.isActive("orderedList")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("orderedList")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Numbered List"
                    >
                        <ListOrdered className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            editor.chain().focus().toggleBlockquote().run()
                        }
                        aria-label="Blockquote"
                        aria-pressed={editor.isActive("blockquote")}
                        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            editor.isActive("blockquote")
                                ? "bg-gray-200 dark:bg-gray-700"
                                : ""
                        }`}
                        title="Blockquote"
                    >
                        <Quote className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"
                    />
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().chain().focus().undo().run()}
                        aria-label="Undo"
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Undo"
                    >
                        <Undo className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().chain().focus().redo().run()}
                        aria-label="Redo"
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Redo"
                    >
                        <Redo className="w-4 h-4" aria-hidden="true" />
                    </button>
                </div>
            </div>
            <style jsx global>{`
                .tiptap {
                    outline: none;
                    color: #111827;
                }
                .dark .tiptap {
                    color: #f3f4f6;
                }
                .tiptap p.is-editor-empty:first-child::before {
                    color: #9ca3af;
                    content: attr(data-placeholder);
                    float: left;
                    height: 0;
                    pointer-events: none;
                }
                .tiptap p {
                    margin: 0.5rem 0;
                }
                .tiptap p:first-child {
                    margin-top: 0;
                }
                .tiptap p:last-child {
                    margin-bottom: 0;
                }
                .tiptap h1 {
                    font-size: 1.25rem;
                    font-weight: bold;
                    margin: 0.75rem 0 0.5rem 0;
                }
                .tiptap h2 {
                    font-size: 1rem;
                    font-weight: bold;
                    margin: 0.75rem 0 0.5rem 0;
                }
                .tiptap h3 {
                    font-size: 0.875rem;
                    font-weight: 600;
                    margin: 0.5rem 0 0.25rem 0;
                }
                .tiptap ul,
                .tiptap ol {
                    padding-left: 1.5rem;
                    margin: 0.5rem 0;
                }
                .tiptap li {
                    margin: 0.25rem 0;
                }
                .tiptap code {
                    background-color: #e5e7eb;
                    padding: 0.125rem 0.25rem;
                    border-radius: 0.25rem;
                    font-family: monospace;
                    font-size: 0.875rem;
                }
                .dark .tiptap code {
                    background-color: #374151;
                }
                .tiptap pre {
                    background-color: #e5e7eb;
                    padding: 0.5rem;
                    border-radius: 0.25rem;
                    font-family: monospace;
                    font-size: 0.875rem;
                    overflow-x: auto;
                    margin: 0.5rem 0;
                }
                .dark .tiptap pre {
                    background-color: #374151;
                }
                .tiptap pre code {
                    background-color: transparent;
                    padding: 0;
                }
                .tiptap blockquote {
                    border-left: 4px solid #d1d5db;
                    padding-left: 0.5rem;
                    margin: 0.5rem 0;
                    font-style: italic;
                }
                .dark .tiptap blockquote {
                    border-left-color: #4b5563;
                }
                .tiptap a {
                    color: #2563eb;
                    text-decoration: underline;
                }
                .dark .tiptap a {
                    color: #60a5fa;
                }
            `}</style>
            <div className="lb-input min-h-[200px] max-h-[400px] overflow-auto p-3 bg-white dark:bg-gray-800 border border-t-0 border-gray-200 dark:border-gray-600 rounded-b">
                <EditorContent editor={editor} />
            </div>
        </>
    );
}
