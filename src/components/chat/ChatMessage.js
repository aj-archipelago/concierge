"use client";

import MarkdownCodeBlock from "../code/MarkdownCodeBlock";
import { renderChatMarkdownMessage } from "./chatMarkdownRenderer";

function convertMessageToMarkdown(
    message,
    finalRender = true,
    onLoad = null,
    onMermaidFix = null,
) {
    return renderChatMarkdownMessage({
        message,
        finalRender,
        onLoad,
        onMermaidFix,
        MarkdownCodeBlockComponent: MarkdownCodeBlock,
    });
}

export { convertMessageToMarkdown };
