import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getTextSuggestionsComponent } from "./TextSuggestions";
import { getGrammarEndpoint } from "../../utils/languageDetection";
import { extractWidgets, restoreWidgets } from "../../utils/widgetUtils";

// Pre-create grammar components to avoid recreating them on every render
const grammarComponents = {
    GRAMMAR: getTextSuggestionsComponent({
        query: "GRAMMAR",
        outputType: "diff",
    }),
    GRAMMAR_AR: getTextSuggestionsComponent({
        query: "GRAMMAR_AR",
        outputType: "diff",
    }),
};

const GrammarModal = ({ text, html, onCommit, onClose }) => {
    const { t } = useTranslation();
    const [correctedText, setCorrectedText] = useState("");
    const [error, setError] = useState("");
    const [isApplyingHtml, setIsApplyingHtml] = useState(false);

    // Store original HTML (html prop contains the original HTML from editor)
    // text prop contains plain text for grammar checking
    const [originalHtml, setOriginalHtml] = useState(html || "");

    // Update originalHtml when html prop changes
    useEffect(() => {
        if (html && typeof html === "string" && html.trim().length > 0) {
            setOriginalHtml(html);
        }
    }, [html]);

    const grammarQuery = getGrammarEndpoint(text);
    const GrammarComponent =
        grammarComponents[grammarQuery] || grammarComponents.GRAMMAR;

    // Handle when user selects corrected text from the diff view
    // This is called when the grammar component provides corrected text
    const handleSelect = useCallback((selectedText) => {
        if (
            selectedText &&
            typeof selectedText === "string" &&
            selectedText.trim().length > 0
        ) {
            setCorrectedText(selectedText);
        }
    }, []);

    // Handle applying corrections to HTML
    const handleUseCorrectedText = async () => {
        // Use html prop (original HTML) or fallback to originalHtml state
        const htmlToUse = html || originalHtml;

        console.log("GrammarModal: handleUseCorrectedText called", {
            htmlProp: html ? `${html.substring(0, 50)}...` : "undefined",
            htmlPropLength: html?.length,
            originalHtml: originalHtml
                ? `${originalHtml.substring(0, 50)}...`
                : "undefined",
            originalHtmlLength: originalHtml?.length,
            htmlToUse: htmlToUse
                ? `${htmlToUse.substring(0, 50)}...`
                : "undefined",
            htmlToUseLength: htmlToUse?.length,
            correctedText: correctedText
                ? `${correctedText.substring(0, 50)}...`
                : "undefined",
            correctedTextLength: correctedText?.length,
        });

        setIsApplyingHtml(true);
        setError("");

        try {
            // Validate that we have HTML content
            if (
                !htmlToUse ||
                typeof htmlToUse !== "string" ||
                htmlToUse.trim().length === 0
            ) {
                const errorMsg = t(
                    "Original HTML content is required to apply corrections. Please ensure the editor has content.",
                );
                console.error("Validation failed: HTML content missing", {
                    htmlProp: html,
                    originalHtml,
                    htmlToUse,
                    htmlPropType: typeof html,
                    originalHtmlType: typeof originalHtml,
                });
                setError(errorMsg);
                return;
            }

            // Validate that we have corrected text to apply
            if (
                !correctedText ||
                typeof correctedText !== "string" ||
                correctedText.trim().length === 0
            ) {
                const errorMsg = t(
                    "Corrected text is required to apply corrections.",
                );
                console.error("Validation failed: correctedText missing", {
                    correctedText,
                });
                setError(errorMsg);
                return;
            }

            // Extract widgets before sending to API
            const { html: htmlWithoutWidgets, widgets } =
                extractWidgets(htmlToUse);
            console.log("Making API call to apply-corrections-to-html", {
                htmlLength: htmlToUse.length,
                htmlWithoutWidgetsLength: htmlWithoutWidgets.length,
                widgetsCount: widgets.size,
                correctedTextLength: correctedText.length,
            });

            // Call the HTML corrections endpoint with the original HTML and corrected text
            // This call is MANDATORY - no fallback to plain text
            const response = await fetch("/api/apply-corrections-to-html", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    html: htmlWithoutWidgets, // HTML with widgets replaced by placeholders
                    correctedText: correctedText, // Pass the corrected plain text
                }),
            });

            console.log("API response status:", response.status, response.ok);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg =
                    errorData.message ||
                    `HTTP error! status: ${response.status}`;
                console.error("API call failed:", {
                    status: response.status,
                    errorData,
                });
                setError(errorMsg);
                return;
            }

            const result = await response.json();
            console.log("API result:", {
                hasCorrectedHtml: !!result.correctedHtml,
            });

            // Validate that we got corrected HTML back
            if (!result.correctedHtml) {
                const errorMsg = t("No corrected HTML returned from server.");
                console.error("No correctedHtml in result:", result);
                setError(errorMsg);
                return;
            }

            // Restore widgets in the corrected HTML
            const correctedHtmlWithWidgets = restoreWidgets(
                result.correctedHtml,
                widgets,
            );
            console.log(
                "Success! Restored widgets, committing corrected HTML",
                {
                    originalLength: result.correctedHtml.length,
                    restoredLength: correctedHtmlWithWidgets.length,
                    widgetsRestored: widgets.size,
                },
            );

            // Only commit and close if we successfully got corrected HTML
            onCommit(correctedHtmlWithWidgets);
            if (onClose) {
                onClose();
            }
        } catch (error) {
            console.error("Failed to apply HTML corrections:", error);
            // Show error but keep dialog open - do NOT fall back to plain text
            const errorMsg =
                error.message ||
                t("Failed to apply corrections to HTML. Please try again.");
            setError(errorMsg);
            // Do NOT close the modal or commit plain text - the HTML call is mandatory
        } finally {
            setIsApplyingHtml(false);
            // Only close modal on success (handled in try block)
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            {/* Error Display */}
            {error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-md">
                    <p className="text-red-700 dark:text-red-400 text-sm">
                        {error}
                    </p>
                </div>
            )}

            {/* Grammar Component - shows diff view */}
            <GrammarComponent
                text={text}
                onSelect={handleSelect}
                diffEditorRef={null}
            />

            {/* Apply Button */}
            {correctedText && (
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            console.log(
                                "Button clicked, calling handleUseCorrectedText",
                            );
                            handleUseCorrectedText();
                        }}
                        disabled={isApplyingHtml || !correctedText}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-sm font-medium"
                    >
                        {isApplyingHtml
                            ? t("Applying to HTML...")
                            : t("Use Corrected Version")}
                    </button>
                </div>
            )}
        </div>
    );
};

export default GrammarModal;
