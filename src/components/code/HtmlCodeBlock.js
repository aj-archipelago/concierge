"use client";

import React from "react";
import TabbedPreviewCodeBlock from "./TabbedPreviewCodeBlock";

const HtmlCodeBlock = ({ code }) => {
    return (
        <TabbedPreviewCodeBlock
            code={code}
            highlightLanguage="html"
            previewSurfaceClassName="html-preview p-4"
            renderPreview={(trimmedCode) => (
                <div dangerouslySetInnerHTML={{ __html: trimmedCode }} />
            )}
        />
    );
};

export default HtmlCodeBlock;
