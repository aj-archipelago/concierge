"use client";

import React from "react";
import Markdown from "react-markdown";
import directive from "remark-directive";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { visit } from "unist-util-visit";
import CodeBlock from "../code/CodeBlock";
import HtmlCodeBlock from "../code/HtmlCodeBlock";
import MermaidDiagram from "../code/MermaidDiagram";
import MermaidPlaceholder from "../code/MermaidPlaceholder";
import TextWithCitations from "./TextWithCitations";
import InlineEmotionDisplay from "./InlineEmotionDisplay";
import { MarkdownImageRenderer } from "./chatMarkdownMedia";

function transformToCitation(content) {
    return content
        .replace(/\[doc(\d+)\]/g, ":cd_source[$1]")
        .replace(/\[upload\]/g, ":cd_upload");
}

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
                            emotion,
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

function simpleHash(str) {
    if (!str || str.length === 0) return "empty";
    const normalized = str.trim().substring(0, 50);
    if (normalized.length === 0) return "empty";

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

function hasUnclosedMermaidFence(payload) {
    const mermaidBlocks = payload.match(/```mermaid\b[\s\S]*?(?:```|$)/gi);

    if (!mermaidBlocks?.length) {
        return false;
    }

    return !mermaidBlocks[mermaidBlocks.length - 1].trimEnd().endsWith("```");
}

function renderChatMarkdownMessage({
    message,
    finalRender = true,
    onLoad = null,
    onMermaidFix = null,
    MarkdownCodeBlockComponent = null,
    allowRawHtml = true,
}) {
    const { payload, tool } = message || {};
    let citations = null;
    try {
        citations = tool ? JSON.parse(tool).citations : null;
    } catch (e) {
        console.warn("Failed to parse message tool field:", e.message);
    }
    let componentIndex = 0;

    if (typeof payload !== "string") {
        return payload;
    }

    if (!finalRender && hasUnclosedMermaidFence(payload)) {
        return (
            <MermaidPlaceholder spinnerKey="mermaid-streaming-placeholder" />
        );
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
        img: MarkdownImageRenderer,
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
                const childrenString = Array.isArray(children)
                    ? children.join("")
                    : String(children);

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

            const codeString = Array.isArray(children)
                ? children.join("")
                : String(children);

            if (language === "mermaid") {
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
                }

                return (
                    <MermaidPlaceholder
                        key={stableKey}
                        spinnerKey={stableKey}
                    />
                );
            }

            const isMarkdown = language === "md" || language === "markdown";
            const isHtml =
                language === "html" ||
                (match && /<[a-z][\s\S]*>/i.test(codeString.trim()));

            if (isMarkdown && match && MarkdownCodeBlockComponent) {
                return (
                    <MarkdownCodeBlockComponent
                        key={`markdowncodeblock-${++componentIndex}`}
                        code={codeString}
                    />
                );
            }

            if (isHtml && match) {
                return (
                    <HtmlCodeBlock
                        key={`htmlcodeblock-${++componentIndex}`}
                        code={codeString}
                    />
                );
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
            const customBlockComponents = new Set([
                MermaidDiagram,
                MermaidPlaceholder,
                CodeBlock,
                HtmlCodeBlock,
            ]);

            if (MarkdownCodeBlockComponent) {
                customBlockComponents.add(MarkdownCodeBlockComponent);
            }

            const shouldBypassPre = React.Children.toArray(children).some(
                (child) =>
                    React.isValidElement(child) &&
                    (customBlockComponents.has(child.type) ||
                        child.props.className?.includes("language-mermaid")),
            );

            if (shouldBypassPre) {
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

    const placeholders = new Map();
    let idx = 0;
    const ph = (value) => {
        const key = `__PH${idx++}__`;
        placeholders.set(key, value);
        return key;
    };

    let text = payload.replace(/```[\s\S]*?```/g, ph).replace(/`[^`\n]+`/g, ph);

    text = text.replace(/\$([^$\n]+?)\$/g, (match, content, offset, str) => {
        if (/\d+\s+(?:million|billion|thousand|trillion)/i.test(content))
            return match;
        if (/^\s*\d/.test(str.slice(offset + match.length))) return match;
        return ph(match);
    });

    const currencyPlaceholders = new Map();
    let currencyIdx = 0;
    const currencyPh = (match) => {
        const key = `«CURRENCY${currencyIdx++}»`;
        currencyPlaceholders.set(key, match);
        return key;
    };

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

    for (const [key, value] of placeholders) {
        text = text.split(key).join(value);
    }
    const protectedPayload = text;

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
                ...(allowRawHtml ? [rehypeRaw] : []),
                [restoreCurrency, currencyPlaceholders],
            ]}
        >
            {transformToCitation(modifiedPayload)}
        </Markdown>
    );
}

export { renderChatMarkdownMessage };
