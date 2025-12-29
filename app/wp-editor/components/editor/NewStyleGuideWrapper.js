"use client";

import React from "react";
import NewStyleGuideModal from "../../../../src/components/editor/NewStyleGuideModal";

/**
 * Wrapper component to integrate NewStyleGuideModal into wp-editor context
 * This bridges the interface expected by AIModal with the NewStyleGuideModal component
 */
const NewStyleGuideWrapper = ({ text, onSelect }) => {
    const handleCommit = (correctedText) => {
        // Call onSelect with the corrected text to update the editor
        onSelect(correctedText);
    };

    return (
        <div className="new-style-guide-wrapper">
            <NewStyleGuideModal text={text} onCommit={handleCommit} />
        </div>
    );
};

export default NewStyleGuideWrapper;
