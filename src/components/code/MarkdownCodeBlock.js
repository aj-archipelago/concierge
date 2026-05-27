"use client";

import React from "react";
import { renderChatMarkdownMessage } from "../chat/chatMarkdownRenderer";
import TabbedPreviewCodeBlock from "./TabbedPreviewCodeBlock";

const MarkdownCodeBlock = ({ code }) => {
    return (
        <TabbedPreviewCodeBlock
            code={code}
            highlightLanguage="markdown"
            previewSurfaceClassName="markdown-preview p-2.5"
            renderPreview={(trimmedCode) => (
                <div className="chat-message-bot chat-markdown-preview">
                    {renderChatMarkdownMessage({
                        message: {
                            payload: trimmedCode,
                            tool: null,
                            sender: "assistant",
                        },
                        finalRender: true,
                        MarkdownCodeBlockComponent: null,
                    })}
                </div>
            )}
        />
    );
};

export default MarkdownCodeBlock;
