"use client";

import { t } from "i18next";
import Link from "next/link";
import CodeBlock from "../code/CodeBlock";
import React from "react";
import TextWithCitations from "./TextWithCitations";
import FileUploadComponent from "./FileUploadComponent";
import Markdown from "react-markdown";
import directive from "remark-directive";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { visit } from "unist-util-visit";

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
                if (
                    node.name === "cd_source" ||
                    node.name === "cd_upload" ||
                    node.name === "cd_servicelink"
                ) {
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
    const { payload, tool, id } = message;

    const citations = tool ? JSON.parse(tool).citations : null;

    let componentIndex = 0;

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
                        paddingInlineStart: "1rem",
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
                        paddingInlineStart: "1rem",
                    }}
                    {...rest}
                />
            );
        },
        p({ node, ...rest }) {
            return (
                <div
                    style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}
                    {...rest}
                />
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
        cd_upload(props) {
            return <FileUploadComponent {...props} />;
        },
        cd_servicelink(props) {
            const { children } = props;
            //console.log("serviceLink children", children);
            const serviceName = children;
            const tServiceName = t(serviceName + " interface");
            const tServiceAction = t("Click here for my");

            return (
                <div className="service-link">
                    <Link href={`/${serviceName}`} {...props}>
                        {tServiceAction}&nbsp;{tServiceName}
                    </Link>
                    .
                </div>
            );
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

    return (
        <Markdown
            className="chat-message"
            key={`lm-${id}`}
            remarkPlugins={[
                directive,
                customMarkdownDirective,
                remarkGfm,
                [remarkMath, { singleDollarTextMath: false }],
            ]}
            rehypePlugins={[rehypeKatex]}
            components={components}
            children={transformToCitation(payload)}
        />
    );
}

export { convertMessageToMarkdown };
