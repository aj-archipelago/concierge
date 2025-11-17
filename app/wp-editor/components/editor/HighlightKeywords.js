import React, { useMemo, useEffect, useCallback } from "react";

/**
 * HighlightKeywords Component
 *
 * This React component processes a given content string, highlighting specified keywords.
 *
 * @component
 * @param {Object} props - The component props
 * @param {string} props.content - The original content to be processed
 * @param {string[]} props.keywords - An array of keywords to highlight in the content
 * @param {Object[]} props.addedLinks - An array of objects containing information about keywords to be converted to links
 * @param {string} props.selectedKeyword - The currently selected keyword (if any) to be specially highlighted
 * @param {Function} props.onTextSelect - Callback function that will be called when text is selected
 *
 * @returns {JSX.Element} A div element with the processed content rendered as HTML
 *
 * @description
 * The component uses useMemo for performance optimization, processing the content only when its dependencies change.
 * It performs the following steps:
 * 1. Sorts keywords by length (descending) to ensure longer keywords are processed first
 * 2. Escapes special regex characters in keywords
 * 3. Uses regex to find keywords in the content
 * 4. Replaces found keywords with either:
 *    a) An <a> tag if the keyword is in the addedLinks array
 *    b) A <mark> tag otherwise, with an additional class if it's the selectedKeyword
 * 5. Returns a div with the processed content set as innerHTML
 * 6. Adds event listeners to handle text selection for highlighting
 */

const HighlightKeywords = ({
    content,
    keywords,
    addedLinks,
    selectedKeyword,
    onTextSelect,
}) => {
    const processedContent = useMemo(() => {
        let processedHTML = content;

        const sortedKeywords = [...keywords].sort(
            (a, b) => b.length - a.length,
        );

        sortedKeywords.forEach((keyword) => {
            const escapedKeyword = keyword.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
            );
            const regex = new RegExp(`(^|\\s)(${escapedKeyword})(\\s|$)`, "g");

            processedHTML = processedHTML.replace(
                regex,
                (match, p1, p2, p3) => {
                    const addedLink = addedLinks.find(
                        (link) => link.keyword === p2,
                    );

                    if (addedLink) {
                        return `${p1}<a href="${addedLink.url}" class="highlight-link" data-post-id="${addedLink.postId}">${p2}</a>${p3}`;
                    } else {
                        const isSelected = selectedKeyword === p2;
                        return `${p1}<mark class="highlight${
                            isSelected ? " selected" : ""
                        }">${p2}</mark>${p3}`;
                    }
                },
            );
        });

        return processedHTML;
    }, [content, keywords, addedLinks, selectedKeyword]);

    const handleTextSelection = useCallback(() => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const selectedText = selection.toString().trim();

            // Only process non-empty selections that are not already highlighted
            if (selectedText && selectedText.length > 0) {
                const range = selection.getRangeAt(0);
                const container = range.commonAncestorContainer;

                // Check if selection is within our component and not already in a highlight
                const isInHighlight =
                    container.parentNode.closest("mark.highlight") ||
                    container.parentNode.closest("a.highlight-link");

                if (
                    !isInHighlight &&
                    onTextSelect &&
                    typeof onTextSelect === "function"
                ) {
                    onTextSelect(selectedText);
                }
            }
        }
    }, [onTextSelect]);

    useEffect(() => {
        const contentDiv = document.querySelector(
            ".highlight-keywords-container",
        );
        if (contentDiv) {
            contentDiv.addEventListener("mouseup", handleTextSelection);

            return () => {
                contentDiv.removeEventListener("mouseup", handleTextSelection);
            };
        }
    }, [handleTextSelection]);

    return (
        <div
            dir="auto"
            className="highlight-keywords-container"
            dangerouslySetInnerHTML={{ __html: processedContent }}
        />
    );
};

export default HighlightKeywords;
