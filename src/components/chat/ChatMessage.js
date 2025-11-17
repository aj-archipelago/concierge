"use client";

import CodeBlock from "../code/CodeBlock";
import React from "react";
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
import ChatImage from "../images/ChatImage";
import MermaidDiagram from "../code/MermaidDiagram";
import MermaidPlaceholder from "../code/MermaidPlaceholder";

function transformToCitation(content) {
    return content
        .replace(/\[doc(\d+)\]/g, ":cd_source[$1]")
        .replace(/\[upload\]/g, ":cd_upload");
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

function convertMessageToMarkdown(message, finalRender = true, onLoad = null) {
    const { payload, tool } = message;
    const citations = tool ? JSON.parse(tool).citations : null;
    let componentIndex = 0; // Counter for code blocks

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
        img: ChatImage,
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
                // Try to parse as integer first
                const sourceIndex = parseInt(children);
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
                        (c) => c.searchResultId === children,
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

    // Some models, like GPT-4o, will use inline LaTeX math markdown
    // and we need to change it here so that the markdown parser can
    // handle it correctly.
    const modifiedPayload = payload
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
                [remarkMath, { singleDollarTextMath: false }],
            ]}
            rehypePlugins={[rehypeRaw, [rehypeKatex, { strict: false }]]}
            children={transformToCitation(modifiedPayload)}
        />
    );
}

export { convertMessageToMarkdown };
