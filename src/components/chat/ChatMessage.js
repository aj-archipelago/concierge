"use client";

import CodeBlock from "../code/CodeBlock";
import React from "react";
import TextWithCitations from "./TextWithCitations";
import FileUploadComponent from "./FileUploadComponent";

function formatText(content, element = "div", citations = null) {
    content = decodeHTML(content);

    let parts = content.split(/(\[doc\d+\])|(\[upload]\.?)/g);
    let fileUploadHandler = false;

    parts = parts.map((part, index) => {
        if (!part) return null;
        let match = part.match(/\[doc(\d+)\]/);
        if (match) {
            const index = parseInt(match[1]);
            if (Array.isArray(citations) && citations[index - 1]) {
                return (
                    <TextWithCitations
                        index={index}
                        citation={citations[index - 1]}
                    />
                );
            }
            return null;
        } else if (part.startsWith("[upload]")) {
            fileUploadHandler = true;
            return null; //"file upload handler"; //<FileUploadComponent />;
        } else {
            const styledPart = part.replace(
                /`([^`]+)`/g,
                '<span class="bt-highlight">`$1`</span>',
            );
            return (
                <span
                    key={index}
                    dangerouslySetInnerHTML={{ __html: styledPart }}
                />
            );
        }
    });

    fileUploadHandler && parts.push(<FileUploadComponent />);

    if (element === "pre") {
        return <pre>{parts}</pre>;
    } else {
        return <div>{parts}</div>;
    }
}

function decodeHTML(html) {
    var txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
}

function highlightCode(input, element = "div", citations = null) {
    if (typeof input !== "string") {
        return input;
    }

    const splitCodeBlocksRegex = /(```[\s\S]*?```)(?=\n|$)/;
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n\s*```/;

    const segments = input
        .split(splitCodeBlocksRegex)
        .map((segment) =>
            segment.match(codeBlockRegex)
                ? { type: "code", content: segment }
                : { type: "text", content: segment },
        )
        .flat();

    return (
        <>
            {segments.map((segment, index) => {
                if (segment.type === "code") {
                    const language = segment.content.match(codeBlockRegex)[1];
                    const code = segment.content.match(codeBlockRegex)[2];

                    return (
                        <CodeBlock
                            language={language}
                            key={`codeblock-${index}`}
                            code={code}
                        />
                    );
                } else {
                    return (
                        <React.Fragment key={`textblock-${index}`}>
                            {formatText(
                                segment.content.trim(),
                                element,
                                citations,
                            )}
                        </React.Fragment>
                    );
                }
            })}
        </>
    );
}

export { highlightCode };
