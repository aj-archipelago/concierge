"use client";

import CodeBlock from "../code/CodeBlock";
import React from "react";
import i18next from "i18next";
import TextWithCitations from "./TextWithCitations";
import InlineEmotionDisplay from "./InlineEmotionDisplay";
import Markdown from "react-markdown";
import directive from "remark-directive";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { visit } from "unist-util-visit";
import MediaCard from "./MediaCard";
import MermaidDiagram from "../code/MermaidDiagram";
import MermaidPlaceholder from "../code/MermaidPlaceholder";
import { isVideoUrl } from "../../utils/mediaUtils";
import { getYoutubeEmbedUrl } from "../../utils/urlUtils";

function transformToCitation(content) {
    return content
        .replace(/\[doc(\d+)\]/g, ":cd_source[$1]")
        .replace(/\[upload\]/g, ":cd_upload");
}

// Rehype plugin to restore currency placeholders after markdown parsing
function restoreCurrency(placeholders) {
    return (tree) => {
        if (!tree?.children) return;
        visit(tree, "text", (node) => {
            if (!node?.value) return;
            let text = node.value;
            for (const [key, value] of placeholders) {
                if (text.includes(key)) text = text.split(key).join(value);
            }
            if (text !== node.value) node.value = text;
        });
    };
}

function customMarkdownDirective() {
    return (tree) => {
        visit(
            tree,
            ["textDirective", "leafDirective", "containerDirective"],
            (node) => {
                if (node.name === "cd_inline_emotion") {
                    const emotion = node.attributes.type || "neutral";
                    node.data = {
                        hName: node.name,
                        hProperties: {
                            emotion: emotion,
                            ...node.attributes,
                            ...node.data,
                        },
                    };
                } else if (node.name === "cd_source") {
                    node.data = {
                        hName: node.name,
                        hProperties: node.attributes,
                        ...node.data,
                    };
                } else {
                    node.data = {
                        hName: "cd_default",
                        hProperties: { name: node.name, ...node.attributes },
                        ...node.data,
                    };
                }
                return node;
            },
        );
    };
}

// Simple hash function for creating stable keys
// Uses first 50 chars (or all if shorter) to create a stable identifier
// that remains consistent as content streams in
function simpleHash(str) {
    if (!str || str.length === 0) return "empty";
    // Normalize: take first 50 chars, remove leading/trailing whitespace
    const normalized = str.trim().substring(0, 50);
    if (normalized.length === 0) return "empty";

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

function convertMessageToMarkdown(
    message,
    finalRender = true,
    onLoad = null,
    onMermaidFix = null,
) {
    const { payload, tool } = message;
    const citations = tool ? JSON.parse(tool).citations : null;
    let componentIndex = 0; // Counter for code blocks

    // Get translation function for use in components
    // Use i18next directly since we can't use hooks in the component mapping
    const t = i18next.t.bind(i18next);

    if (typeof payload !== "string") {
        return payload;
    }

    const components = {
        ol({ node, ...rest }) {
            return (
                <ol
                    style={{
                        listStyleType: "decimal",
                        marginBottom: "1rem",
                        paddingInlineStart: "1.5rem",
                    }}
                    {...rest}
                />
            );
        },
        ul({ node, ...rest }) {
            return (
                <ul
                    style={{
                        listStyleType: "disc",
                        marginBottom: "1rem",
                        paddingInlineStart: "1.5rem",
                    }}
                    {...rest}
                />
            );
        },
        p({ node, ...rest }) {
            return <div className="mb-1" {...rest} />;
        },
        img: ({ src, alt, ...props }) => {
            // Extract filename from src or use alt text
            let filename = alt || "Image";
            try {
                if (src && !filename.includes("Image")) {
                    // Try to extract filename from URL
                    const url = new URL(src);
                    const pathname = url.pathname;
                    const urlFilename = pathname.split("/").pop();
                    if (urlFilename && urlFilename.includes(".")) {
                        filename = decodeURIComponent(urlFilename);
                    } else if (alt) {
                        filename = alt;
                    }
                }
            } catch (e) {
                // If URL parsing fails, use alt or default
                filename = alt || "Image";
            }

            // Check if this is a video URL and render appropriate MediaCard type
            if (isVideoUrl(src)) {
                const youtubeEmbedUrl = getYoutubeEmbedUrl(src);
                if (youtubeEmbedUrl) {
                    return (
                        <MediaCard
                            type="youtube"
                            src={src}
                            filename={filename}
                            youtubeEmbedUrl={youtubeEmbedUrl}
                            className="my-2"
                            t={t}
                        />
                    );
                }
                return (
                    <MediaCard
                        type="video"
                        src={src}
                        filename={filename}
                        className="my-2"
                        t={t}
                    />
                );
            }

            return (
                <MediaCard
                    type="image"
                    src={src}
                    filename={filename}
                    className="my-2"
                    t={t}
                />
            );
        },
        cd_inline_emotion({ children, emotion }) {
            return (
                <InlineEmotionDisplay emotion={emotion}>
                    {children}
                </InlineEmotionDisplay>
            );
        },
        cd_source(props) {
            const { children } = props;
            if (children) {
                // Normalize children to string (children can be array or string)
                const childrenString = Array.isArray(children)
                    ? children.join("")
                    : String(children);

                // Try to parse as integer first
                const sourceIndex = parseInt(childrenString);
                if (
                    !isNaN(sourceIndex) &&
                    Array.isArray(citations) &&
                    citations[sourceIndex - 1]
                ) {
                    return (
                        <TextWithCitations
                            index={sourceIndex}
                            citation={citations[sourceIndex - 1]}
                            {...props}
                        />
                    );
                }

                // If not a valid index, try to find by searchResultId
                if (Array.isArray(citations)) {
                    const citation = citations.find(
                        (c) => c.searchResultId === childrenString,
                    );
                    if (citation) {
                        return (
                            <TextWithCitations
                                index={citations.indexOf(citation) + 1}
                                citation={citation}
                                {...props}
                            />
                        );
                    }
                }
                return null;
            }
            return null;
        },
        cd_default({ name, ...rest }) {
            return <span>{name}</span>;
        },
        code(props) {
            const { className, children } = props;
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : null;

            // Handle Mermaid diagrams
            if (language === "mermaid") {
                // Normalize code to string (children can be array or string)
                const codeString = Array.isArray(children)
                    ? children.join("")
                    : String(children);
                const stableKey = `mermaid-${simpleHash(codeString)}`;

                if (finalRender) {
                    return (
                        <MermaidDiagram
                            key={stableKey}
                            code={codeString}
                            onLoad={onLoad}
                            onMermaidFix={onMermaidFix || undefined}
                        />
                    );
                } else {
                    // During streaming, show placeholder instead of raw code
                    // Pass the stable key as a prop to preserve animation state across remounts
                    return (
                        <MermaidPlaceholder
                            key={stableKey}
                            spinnerKey={stableKey}
                        />
                    );
                }
            }
            return match ? (
                <CodeBlock
                    key={`codeblock-${++componentIndex}`}
                    code={children}
                    language={language}
                    {...props}
                />
            ) : (
                <code className="inline-code" {...props}>
                    {children}
                </code>
            );
        },
        pre({ children }) {
            // Check if the child is a code element with mermaid language
            const isMermaid = React.Children.toArray(children).some(
                (child) =>
                    React.isValidElement(child) &&
                    child.props.className?.includes("language-mermaid"),
            );

            if (isMermaid) {
                return <>{children}</>;
            }
            return <pre>{children}</pre>;
        },
        a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
            </a>
        ),
    };

    // Protect currency amounts from being parsed as math equations
    // Strategy: protect code → protect math → mark currency → restore code/math
    // Currency placeholders stay until rehype plugin restores them after markdown parsing
    const placeholders = new Map();
    let idx = 0;
    const ph = (value) => {
        const key = `__PH${idx++}__`;
        placeholders.set(key, value);
        return key;
    };

    // 1. Protect code blocks
    let text = payload.replace(/```[\s\S]*?```/g, ph).replace(/`[^`\n]+`/g, ph);

    // 2. Protect math expressions ($...$) but skip currency-like content
    text = text.replace(/\$([^$\n]+?)\$/g, (match, content, offset, str) => {
        // Skip if contains "million/billion" etc. - let currency handler deal with it
        if (/\d+\s+(?:million|billion|thousand|trillion)/i.test(content))
            return match;
        // Skip if followed by digit (likely part of currency range like $40...$50)
        if (/^\s*\d/.test(str.slice(offset + match.length))) return match;
        return ph(match);
    });

    // 3. Mark currency amounts (will be restored by rehype plugin)
    // Use «» to avoid markdown interpreting __ as bold
    const currencyPlaceholders = new Map();
    let currencyIdx = 0;
    const currencyPh = (match) => {
        const key = `«CURRENCY${currencyIdx++}»`;
        currencyPlaceholders.set(key, match);
        return key;
    };

    // Currency regex: $amount with optional K/M suffix and optional "million/billion" word
    const currencyAmount =
        /\$\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?[KMkm]?(?:\s+(?:million|billion|thousand|trillion))?/;
    const currencyRange = new RegExp(
        `([-(]?)${currencyAmount.source}(?:\\s*[–—-]\\s*${currencyAmount.source.slice(1)})?(?!\\$)`,
        "g",
    );
    text = text.replace(
        currencyRange,
        (match, prefix) => prefix + currencyPh(match),
    );

    // 4. Restore code and math (currency stays as placeholders for rehype)
    for (const [key, value] of placeholders) {
        text = text.split(key).join(value);
    }
    const protectedPayload = text;

    // Some models, like GPT-4o, will use inline LaTeX math markdown
    // and we need to change it here so that the markdown parser can
    // handle it correctly.
    const modifiedPayload = protectedPayload
        .replace(/\\\[/g, "$$$")
        .replace(/\\\]/g, "$$$")
        .replace(/\\\(/g, "$$$")
        .replace(/\\\)/g, "$$$");

    return (
        <Markdown
            className="chat-message min-h-[1.5rem] mobile-overflow-safe"
            components={{
                ...components,
                div: ({ node, ...props }) => (
                    <div
                        className="mobile-text-wrap"
                        style={{
                            maxWidth: "100%",
                            overflowWrap: "break-word",
                            wordWrap: "break-word",
                            wordBreak: "break-word",
                        }}
                        {...props}
                    />
                ),
            }}
            remarkPlugins={[
                directive,
                customMarkdownDirective,
                remarkGfm,
                [remarkMath, { singleDollarTextMath: true }],
            ]}
            rehypePlugins={[
                [rehypeKatex, { strict: false }],
                rehypeRaw,
                [restoreCurrency, currencyPlaceholders],
            ]}
            children={transformToCitation(modifiedPayload)}
        />
    );
}

export { convertMessageToMarkdown };
