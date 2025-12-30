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
// Format: [restoreCurrency, placeholdersMap] in rehypePlugins array
function restoreCurrency(placeholders) {
    return (tree) => {
        if (!tree?.children) return;
        
        visit(tree, "text", (node) => {
            if (!node?.value || typeof node.value !== 'string') return;
            
            let modified = node.value;
            placeholders.forEach((original, placeholder) => {
                if (modified.includes(placeholder)) {
                    modified = modified.split(placeholder).join(original);
                }
            });
            
            if (modified !== node.value) {
                node.value = modified;
            }
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
    };

    // Protect currency amounts from being parsed as math equations
    // Rule: $<currency pattern>$ is math, $<currency pattern> (not followed by $) is currency
    // Examples: $10$ = math, $10M$ = math, $10M = currency, $10M-$12M = currency
    // We need to avoid matching currency inside $...$ math expressions and code blocks
    const currencyPlaceholders = new Map();
    let currencyIndex = 0;
    
    // First, protect code blocks (both inline and code fences) to avoid processing them
    const codePlaceholders = new Map();
    let codeIndex = 0;
    let tempPayload = payload
        // Protect code fences (```...```)
        .replace(/```[\s\S]*?```/g, (match) => {
            const placeholder = `__CODE_FENCE_${codeIndex}__`;
            codePlaceholders.set(placeholder, match);
            codeIndex++;
            return placeholder;
        })
        // Protect inline code (`...`)
        .replace(/`[^`\n]+`/g, (match) => {
            const placeholder = `__CODE_INLINE_${codeIndex}__`;
            codePlaceholders.set(placeholder, match);
            codeIndex++;
            return placeholder;
        });
    
    // Then, mark all $...$ patterns to avoid matching currency inside them
    // Only match if the content is clearly math (not currency-like)
    // IMPORTANT: Any $...$ pattern with a closing $ should be protected as math to prevent
    // currency regex from partially matching it (e.g., $10$ should be math, not $1 as currency)
    const mathPlaceholders = new Map();
    let mathIndex = 0;
    tempPayload = tempPayload.replace(/\$([^$\n]+?)\$/g, (match, content, offset, string) => {
        const trimmedContent = content.trim();
        
        // Skip if content contains currency-like patterns with words (digits followed by "million"/"billion" etc.)
        // But still protect simple numbers like $10$ as math to avoid partial currency matching
        if (/\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:\s+(?:million|billion|thousand|trillion))/i.test(trimmedContent)) {
            return match; // Contains currency pattern with words, skip
        }
        
        // Skip if the closing $ is immediately followed by a digit (likely currency)
        const afterMatch = string.slice(offset + match.length);
        if (/^\s*\d/.test(afterMatch)) {
            return match; // Likely part of a currency expression
        }
        
        // Protect as math (even if it's just digits like $10$ - this prevents currency regex from matching $1)
        const placeholder = `__MATH_${mathIndex}__`;
        mathPlaceholders.set(placeholder, match);
        mathIndex++;
        return placeholder;
    });
    
    // Now protect $<currency pattern> that is NOT followed by $ (and not inside math/code)
    // Also match optional words like "million", "billion" after the amount
    // Handle ranges with dashes (en-dash \u2013, em-dash \u2014, or hyphen -)
    // Match ranges first (like $150M–$200M), then single amounts with words (like $77 million)
    let protectedPayload = tempPayload.replace(
        /([-(]?)\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:[KMkm])?)(?:\s+(?:million|billion|thousand|trillion))?(?:\s*[–—-]\s*\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:[KMkm])?)(?:\s+(?:million|billion|thousand|trillion))?)(?!\$)/g,
        (match, prefix) => {
            const placeholder = `{CURRENCY_${currencyIndex}}`;
            currencyPlaceholders.set(placeholder, match);
            currencyIndex++;
            return prefix + placeholder;
        }
    );
    // Then match single amounts with optional words (ranges already protected won't match)
    protectedPayload = protectedPayload.replace(
        /([-(]?)\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:[KMkm])?)(?:\s+(?:million|billion|thousand|trillion))?(?!\$)/g,
        (match, prefix) => {
            const placeholder = `{CURRENCY_${currencyIndex}}`;
            currencyPlaceholders.set(placeholder, match);
            currencyIndex++;
            return prefix + placeholder;
        }
    );
    protectedPayload = protectedPayload
    // Restore math expressions
    .replace(/__MATH_(\d+)__/g, (match) => {
        return mathPlaceholders.get(match) || match;
    })
    // Restore code blocks
    .replace(/__(CODE_FENCE|CODE_INLINE)_(\d+)__/g, (match) => {
        return codePlaceholders.get(match) || match;
    });

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
