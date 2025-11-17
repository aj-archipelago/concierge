"use client";

import React from "react";
import NewStyleGuideModal from "../../../../src/components/editor/NewStyleGuideModal";

/**
 * Wrapper component to integrate NewStyleGuideModal into wp-editor context
 * This bridges the interface expected by AIModal with the NewStyleGuideModal component
 */
const NewStyleGuideWrapper = ({ text, onSelect, args = {} }) => {
    const handleCommit = (correctedText) => {
        // Call onSelect with the corrected text to update the editor
        onSelect(correctedText);
    };

    // Extract workspaceId from args if provided
    const workspaceId = args.workspaceId || null;

    return (
        <div className="new-style-guide-wrapper">
            <NewStyleGuideModal
                text={text}
                onCommit={handleCommit}
                workspaceId={workspaceId}
            />
        </div>
    );
};

export default NewStyleGuideWrapper;
