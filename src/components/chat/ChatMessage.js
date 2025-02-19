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

// Create a WeakMap to store stable IDs for image nodes
const imageNodeIds = new WeakMap();
// Add a Map to cache IDs by URL to prevent duplicates
const imageUrlToId = new Map();
let nextImageId = 1;

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

function convertMessageToMarkdown(message) {
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
        img: ChatMessageImage,
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
                const sourceIndex = parseInt(children);
                if (Array.isArray(citations) && citations[sourceIndex - 1]) {
                    return (
                        <TextWithCitations
                            index={sourceIndex}
                            citation={citations[sourceIndex - 1]}
                            {...props}
                        />
                    );
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
            className="chat-message min-h-[1.5rem] overflow-x-auto"
            components={{
                ...components,
                div: ({ node, ...props }) => (
                    <div
                        style={{ maxWidth: "100%", overflowWrap: "break-word" }}
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

const ChatMessageImage = React.memo(
    function ChatMessageImage({ node, alt, src, ...props }) {
        // First check if we have an ID for this URL
        let stableId = imageUrlToId.get(src);

        if (!stableId) {
            // If no URL-based ID exists, check the node map or create new ID
            stableId = imageNodeIds.get(node);
            if (!stableId) {
                stableId = `img-${nextImageId++}`;
                imageNodeIds.set(node, stableId);
            }
            // Cache the ID for this URL
            imageUrlToId.set(src, stableId);
        }

        const [permanentSrc, setPermanentSrc] = React.useState(src);
        const [isLoading, setIsLoading] = React.useState(false);
        const imgRef = React.useRef(null);
        const isMounted = React.useRef(true);

        React.useEffect(() => {
            isMounted.current = true;
            return () => {
                isMounted.current = false;
            };
        }, []);

        React.useEffect(() => {
            // If this is a temporary URL (e.g. from streaming), preload the permanent URL
            if (src.includes("/temp/") || src.includes("?temp=true")) {
                setIsLoading(true);
                const img = new Image();
                const permanentUrl = src
                    .replace("/temp/", "/")
                    .replace("?temp=true", "");

                img.onload = () => {
                    if (isMounted.current) {
                        setPermanentSrc(permanentUrl);
                        setIsLoading(false);
                    }
                };
                img.src = permanentUrl;
            }
        }, [src, stableId]);

        return (
            <img
                ref={imgRef}
                key={stableId}
                src={permanentSrc}
                alt={alt || ""}
                className="max-h-[20%] max-w-[60%] [.docked_&]:max-w-[90%] rounded my-2 shadow-lg dark:shadow-black/30"
                style={{
                    backgroundColor: "transparent",
                    border: "none",
                    outline: "none",
                    opacity: isLoading ? 0.3 : 1,
                    transition: "opacity 0.3s ease-in-out",
                }}
                {...props}
            />
        );
    },
    (prevProps, nextProps) => {
        // Only re-render if src or alt changes, or if node is different
        return (
            prevProps.src === nextProps.src &&
            prevProps.alt === nextProps.alt &&
            prevProps.node === nextProps.node
        );
    },
);

export { convertMessageToMarkdown };
