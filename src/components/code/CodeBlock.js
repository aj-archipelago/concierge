import React from "react";
import { HighlightJS } from "highlight.js";
import CopyButton from "../CopyButton";

const CodeBlock = ({ code, language }) => {
    let highlightedCode = "";
    const trimmedCode = code?.trim() || "";

    if (language && HighlightJS.getLanguage(language)) {
        highlightedCode = HighlightJS.highlight(trimmedCode, {
            language: language,
        }).value;
    } else {
        highlightedCode = HighlightJS.highlightAuto(trimmedCode).value;
    }

    return (
        <div className="code-block py-3 mobile-overflow-safe">
            {language}
            <div style={{ position: "relative" }}>
                <CopyButton item={code} />
            </div>
            <pre className="mobile-overflow-safe">
                <code
                    className="hljs mobile-text-wrap"
                    dangerouslySetInnerHTML={{ __html: highlightedCode }}
                />
            </pre>
        </div>
    );
};

export default CodeBlock;
