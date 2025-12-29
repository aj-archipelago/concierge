import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
    Check,
    X as XIcon,
    ArrowLeft,
    ArrowRight,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { useLLMs } from "../../../app/queries/llms";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../../@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../../../@/components/ui/dialog";

const NewStyleGuideModal = ({ text, onCommit, onClose }) => {
    const { t } = useTranslation();
    const { data: llms, isLoading: llmsLoading } = useLLMs();
    const [selectedLLM, setSelectedLLM] = useState("");
    const [correctedText, setCorrectedText] = useState("");
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState("");

    // Diff review states
    const [diffs, setDiffs] = useState([]);
    const [currentDiffIndex, setCurrentDiffIndex] = useState(0);
    const [diffStates, setDiffStates] = useState({}); // { diffIndex: 'pending'|'accepted'|'rejected' }
    const [showDiffReview, setShowDiffReview] = useState(false);
    const [finalText, setFinalText] = useState("");
    const [showContextView, setShowContextView] = useState(true);

    // System style guides
    const [systemStyleGuides, setSystemStyleGuides] = useState([]);
    const [selectedStyleGuide, setSelectedStyleGuide] = useState("");

    // Agent mode and research mode
    const [agentMode, setAgentMode] = useState(false);
    const [researchMode, setResearchMode] = useState(false);

    // Keyboard shortcuts dialog
    const [showKeyboardShortcutsDialog, setShowKeyboardShortcutsDialog] =
        useState(false);

    // Refs for keyboard handling
    const diffReviewRef = useRef(null);

    // Set default LLM when data is loaded (excluding legacy agent LLMs)
    React.useEffect(() => {
        if (llms && llms.length > 0 && !selectedLLM) {
            const filteredLLMs = llms.filter(
                (llm) =>
                    llm.identifier !== "labeebagent" &&
                    llm.identifier !== "labeebresearchagent",
            );
            if (filteredLLMs.length > 0) {
                const defaultLLM =
                    filteredLLMs.find((llm) => llm.isDefault) ||
                    filteredLLMs[0];
                if (defaultLLM) {
                    setSelectedLLM(defaultLLM._id);
                }
            }
        }
    }, [llms, selectedLLM]);

    // Fetch system style guides
    React.useEffect(() => {
        const fetchSystemStyleGuides = async () => {
            try {
                const response = await fetch("/api/style-guides");
                if (response.ok) {
                    const data = await response.json();
                    setSystemStyleGuides(data.styleGuides || []);
                }
            } catch (error) {
                console.error("Error fetching system style guides:", error);
            }
        };

        fetchSystemStyleGuides();
    }, []);

    // Prepare files data for sending to server
    const prepareFilesData = useCallback(() => {
        const files = [];

        // Add selected style guide file if any
        if (selectedStyleGuide) {
            const styleGuide = systemStyleGuides.find(
                (sg) => sg._id === selectedStyleGuide,
            );
            if (styleGuide && styleGuide.file) {
                files.push({
                    url: styleGuide.file.url,
                    gcs: styleGuide.file.gcsUrl || styleGuide.file.gcs,
                    displayFilename:
                        styleGuide.file.displayFilename ||
                        styleGuide.file.originalName,
                    _id: styleGuide.file._id,
                });
            }
        }

        return files;
    }, [selectedStyleGuide, systemStyleGuides]);

    // Improved diff computation function that groups consecutive changes
    const computeDiffs = useCallback((original, corrected) => {
        const originalWords = original.split(/(\s+)/);
        const correctedWords = corrected.split(/(\s+)/);

        // First pass: compute basic alignment using Myers algorithm concept
        const alignment = [];
        let i = 0,
            j = 0;

        while (i < originalWords.length && j < correctedWords.length) {
            if (originalWords[i] === correctedWords[j]) {
                alignment.push({
                    type: "match",
                    originalIndex: i,
                    correctedIndex: j,
                });
                i++;
                j++;
            } else {
                // Find the next matching point
                let foundMatch = false;
                let bestMatch = {
                    oi: originalWords.length,
                    oj: correctedWords.length,
                    distance: Infinity,
                };

                // Look ahead for the next match within a reasonable window
                for (
                    let oi = i;
                    oi < Math.min(i + 10, originalWords.length);
                    oi++
                ) {
                    for (
                        let oj = j;
                        oj < Math.min(j + 10, correctedWords.length);
                        oj++
                    ) {
                        if (originalWords[oi] === correctedWords[oj]) {
                            const distance = oi - i + (oj - j);
                            if (distance < bestMatch.distance) {
                                bestMatch = { oi, oj, distance };
                                foundMatch = true;
                            }
                        }
                    }
                }

                if (foundMatch && bestMatch.distance < 8) {
                    // Found a reasonable match, mark the span as a change
                    alignment.push({
                        type: "change",
                        originalStart: i,
                        originalEnd: bestMatch.oi,
                        correctedStart: j,
                        correctedEnd: bestMatch.oj,
                    });
                    i = bestMatch.oi;
                    j = bestMatch.oj;
                } else {
                    // No good match found, consume remaining
                    alignment.push({
                        type: "change",
                        originalStart: i,
                        originalEnd: originalWords.length,
                        correctedStart: j,
                        correctedEnd: correctedWords.length,
                    });
                    break;
                }
            }
        }

        // Handle remaining content
        if (i < originalWords.length) {
            alignment.push({
                type: "deletion",
                originalStart: i,
                originalEnd: originalWords.length,
                correctedStart: j,
                correctedEnd: j,
            });
        }

        if (j < correctedWords.length) {
            alignment.push({
                type: "addition",
                originalStart: i,
                originalEnd: i,
                correctedStart: j,
                correctedEnd: correctedWords.length,
            });
        }

        // Second pass: convert alignment to diffs, merging adjacent changes
        const diffs = [];
        for (const item of alignment) {
            if (item.type === "match") {
                continue; // Skip matches
            }

            const originalText = originalWords
                .slice(item.originalStart, item.originalEnd)
                .join("");
            const correctedText = correctedWords
                .slice(item.correctedStart, item.correctedEnd)
                .join("");

            // Determine change type
            let changeType = "change";
            if (originalText === "") {
                changeType = "addition";
            } else if (correctedText === "") {
                changeType = "deletion";
            }

            // Only add if there's an actual difference
            if (originalText !== correctedText) {
                diffs.push({
                    type: changeType,
                    original: originalText,
                    corrected: correctedText,
                    originalStart: item.originalStart,
                    originalEnd: item.originalEnd,
                    correctedStart: item.correctedStart,
                    correctedEnd: item.correctedEnd,
                });
            }
        }

        // Third pass: merge adjacent/overlapping diffs
        const mergedDiffs = [];
        for (let k = 0; k < diffs.length; k++) {
            const currentDiff = diffs[k];
            let merged = false;

            // Check if this diff should be merged with the previous one
            if (mergedDiffs.length > 0) {
                const lastDiff = mergedDiffs[mergedDiffs.length - 1];

                // Merge if they are adjacent or overlapping
                const gap = currentDiff.originalStart - lastDiff.originalEnd;
                if (gap <= 2) {
                    // Allow for small gaps (like single spaces)
                    // Merge the diffs
                    const gapText =
                        gap > 0
                            ? originalWords
                                  .slice(
                                      lastDiff.originalEnd,
                                      currentDiff.originalStart,
                                  )
                                  .join("")
                            : "";
                    const correctedGapText =
                        gap > 0
                            ? correctedWords
                                  .slice(
                                      lastDiff.correctedEnd,
                                      currentDiff.correctedStart,
                                  )
                                  .join("")
                            : "";

                    lastDiff.original += gapText + currentDiff.original;
                    lastDiff.corrected +=
                        correctedGapText + currentDiff.corrected;
                    lastDiff.originalEnd = currentDiff.originalEnd;
                    lastDiff.correctedEnd = currentDiff.correctedEnd;
                    merged = true;
                }
            }

            if (!merged) {
                mergedDiffs.push({ ...currentDiff });
            }
        }

        return mergedDiffs;
    }, []);

    // Get context around a diff for better understanding (1-2 lines before/after)
    const getContextAroundDiff = useCallback(
        (diff, contextLines = 2) => {
            if (!text) return { before: "", after: "" };

            const words = text.split(/(\s+)/);

            // Calculate context based on sentence boundaries and line breaks for better structure
            let contextWords = 30; // Base word count

            // Find sentence/line boundaries for more natural context
            const findContextBoundary = (startPos, direction, maxWords) => {
                let pos = startPos;
                let wordCount = 0;
                let lineCount = 0;

                while (wordCount < maxWords && lineCount < contextLines) {
                    if (direction > 0) {
                        if (pos >= words.length) break;
                        const word = words[pos];
                        if (
                            word &&
                            (word.includes("\n") ||
                                word.includes(".") ||
                                word.includes("!") ||
                                word.includes("?"))
                        ) {
                            lineCount++;
                        }
                        pos += direction;
                    } else {
                        if (pos <= 0) break;
                        pos += direction;
                        const word = words[pos];
                        if (
                            word &&
                            (word.includes("\n") ||
                                word.includes(".") ||
                                word.includes("!") ||
                                word.includes("?"))
                        ) {
                            lineCount++;
                        }
                    }
                    if (!words[pos] || words[pos].trim() !== "") {
                        wordCount++;
                    }
                }

                return pos;
            };

            const startIndex = Math.max(
                0,
                findContextBoundary(diff.originalStart, -1, contextWords),
            );
            const endIndex = Math.min(
                words.length,
                findContextBoundary(diff.originalEnd, 1, contextWords),
            );

            const beforeContext = words
                .slice(startIndex, diff.originalStart)
                .join("");
            const afterContext = words
                .slice(diff.originalEnd, endIndex)
                .join("");

            return {
                before: beforeContext,
                after: afterContext,
                fullContext: words.slice(startIndex, endIndex).join(""),
                changeStart: diff.originalStart - startIndex,
                changeEnd: diff.originalEnd - startIndex,
            };
        },
        [text],
    );

    // Generate final text based on diff states
    const generateFinalText = useCallback(() => {
        if (!text || diffs.length === 0) return text;

        let result = "";
        const originalWords = text.split(/(\s+)/);
        let i = 0;

        for (let diffIndex = 0; diffIndex < diffs.length; diffIndex++) {
            const diff = diffs[diffIndex];
            const state = diffStates[diffIndex] || "pending";

            // Add text before this diff
            while (i < diff.originalStart) {
                result += originalWords[i];
                i++;
            }

            // Handle the diff based on its state
            if (state === "accepted") {
                result += diff.corrected;
            } else {
                result += diff.original;
            }

            // Skip past the original text
            i = diff.originalEnd;
        }

        // Add remaining text
        while (i < originalWords.length) {
            result += originalWords[i];
            i++;
        }

        return result;
    }, [text, diffs, diffStates]);

    // Update final text when diff states change
    useEffect(() => {
        setFinalText(generateFinalText());
    }, [generateFinalText]);

    // Keyboard event handler
    const handleKeyDown = useCallback(
        (e) => {
            if (!showDiffReview || diffs.length === 0) return;

            switch (e.key) {
                case "ArrowUp":
                case "ArrowLeft":
                    e.preventDefault();
                    setCurrentDiffIndex((prev) => Math.max(0, prev - 1));
                    break;
                case "ArrowDown":
                case "ArrowRight":
                    e.preventDefault();
                    setCurrentDiffIndex((prev) =>
                        Math.min(diffs.length - 1, prev + 1),
                    );
                    break;
                case "Enter":
                case " ":
                    e.preventDefault();
                    handleAcceptDiff(currentDiffIndex);
                    break;
                case "Backspace":
                case "Delete":
                case "x":
                case "X":
                    e.preventDefault();
                    handleRejectDiff(currentDiffIndex);
                    break;
                case "Escape":
                    e.preventDefault();
                    setShowDiffReview(false);
                    break;
                case "c":
                case "C":
                    e.preventDefault();
                    setShowContextView((prev) => !prev);
                    break;
                default:
                    break;
            }
        },
        [showDiffReview, diffs.length, currentDiffIndex],
    );

    // Set up keyboard event listener
    useEffect(() => {
        if (showDiffReview) {
            diffReviewRef.current?.focus();
        }
    }, [showDiffReview]);

    // Diff action handlers
    const handleAcceptDiff = (index) => {
        setDiffStates((prev) => ({ ...prev, [index]: "accepted" }));
    };

    const handleRejectDiff = (index) => {
        setDiffStates((prev) => ({ ...prev, [index]: "rejected" }));
    };

    const handleResetDiff = (index) => {
        setDiffStates((prev) => {
            const newStates = { ...prev };
            delete newStates[index];
            return newStates;
        });
    };

    const handleAcceptAll = () => {
        const newStates = {};
        for (let i = 0; i < diffs.length; i++) {
            newStates[i] = "accepted";
        }
        setDiffStates(newStates);
    };

    const handleRejectAll = () => {
        const newStates = {};
        for (let i = 0; i < diffs.length; i++) {
            newStates[i] = "rejected";
        }
        setDiffStates(newStates);
    };

    // Check if there are any pending changes
    const hasPendingChanges = diffs.some(
        (_, index) => !diffStates[index] || diffStates[index] === "pending",
    );

    const handleStyleGuideCheck = async () => {
        if (!text || !selectedLLM) {
            setError(t("Please ensure text and AI model are selected"));
            return;
        }

        setIsChecking(true);
        setError("");

        try {
            const files = prepareFilesData();
            const response = await fetch("/api/style-guide-check", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: text,
                    llmId: selectedLLM,
                    files: files,
                    agentMode: agentMode,
                    researchMode: researchMode,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            setCorrectedText(result.correctedText);

            // Compute diffs and set up review mode
            if (result.correctedText && result.correctedText !== text) {
                const computedDiffs = computeDiffs(text, result.correctedText);
                setDiffs(computedDiffs);
                setDiffStates({});
                setCurrentDiffIndex(0);
                setShowDiffReview(true);
            } else {
                // No changes detected
                setDiffs([]);
                setShowDiffReview(false);
            }
        } catch (error) {
            console.error("Style guide check failed:", error);
            setError(t("Failed to check style guide. Please try again."));
        } finally {
            setIsChecking(false);
        }
    };

    const handleUseCorrectedText = () => {
        if (showDiffReview && finalText) {
            onCommit(finalText);
        } else if (correctedText) {
            onCommit(correctedText);
        }
        // Close the modal after committing
        if (onClose) {
            onClose();
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            {!(showDiffReview && diffs.length > 0) && (
                <div className="mb-6">
                    {/* LLM Selector */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t("AI Model")}
                        </label>
                        {llmsLoading ? (
                            <div className="text-sm text-gray-500 dark:text-gray-400 py-2">
                                {t("Loading models...")}
                            </div>
                        ) : (
                            <Select
                                value={selectedLLM}
                                onValueChange={setSelectedLLM}
                                disabled={isChecking}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue
                                        placeholder={t("Select an AI model...")}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {llms
                                        ?.filter(
                                            (llm) =>
                                                llm.identifier !==
                                                    "labeebagent" &&
                                                llm.identifier !==
                                                    "labeebresearchagent",
                                        )
                                        .map((llm) => (
                                            <SelectItem
                                                key={llm._id}
                                                value={llm._id}
                                            >
                                                {llm.name}{" "}
                                                {llm.isDefault
                                                    ? `(${t("Default")})`
                                                    : ""}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* System Style Guides Section */}
                    {systemStyleGuides.length > 0 && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t("Style Guide")}
                            </label>
                            <Select
                                value={selectedStyleGuide}
                                onValueChange={setSelectedStyleGuide}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue
                                        placeholder={t(
                                            "Select a style guide...",
                                        )}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {systemStyleGuides.map((styleGuide) => (
                                        <SelectItem
                                            key={styleGuide._id}
                                            value={styleGuide._id}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium">
                                                    {styleGuide.name}
                                                </span>
                                                {styleGuide.description && (
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {styleGuide.description}
                                                    </span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Agent Mode and Research Mode */}
                    <div className="mb-4 flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="agentMode"
                                checked={agentMode}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setAgentMode(checked);
                                    if (!checked) {
                                        setResearchMode(false);
                                    }
                                }}
                                disabled={isChecking}
                                className="accent-sky-500"
                            />
                            <label
                                htmlFor="agentMode"
                                className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                            >
                                {t("Agent Mode")}
                            </label>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="researchMode"
                                checked={researchMode}
                                onChange={(e) =>
                                    setResearchMode(e.target.checked)
                                }
                                disabled={isChecking || !agentMode}
                                className="accent-sky-500"
                            />
                            <label
                                htmlFor="researchMode"
                                className={`text-sm cursor-pointer ${
                                    !agentMode
                                        ? "text-gray-400 dark:text-gray-600"
                                        : "text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                {t("Research Mode")}
                            </label>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="mb-4">
                        <button
                            onClick={handleStyleGuideCheck}
                            disabled={!text || !selectedLLM || isChecking}
                            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-sm font-medium flex items-center space-x-2"
                        >
                            {isChecking && (
                                <svg
                                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    ></circle>
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                            )}
                            <span>
                                {isChecking
                                    ? t("Checking...")
                                    : t("Check Style Guide")}
                            </span>
                        </button>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-md">
                            <p className="text-red-700 dark:text-red-400 text-sm">
                                {error}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Diff Review Interface */}
            {showDiffReview && diffs.length > 0 ? (
                <div
                    ref={diffReviewRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    className="outline-none"
                >
                    {/* Two-pane layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-6">
                        {/* Left Pane: Changes List */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                    {t("Changes")} ({diffs.length})
                                </h4>
                            </div>
                            {/* Accept All / Reject All buttons */}
                            <div className="flex gap-2 mb-3">
                                <button
                                    onClick={handleAcceptAll}
                                    className="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-green-600 dark:text-green-400 border border-green-300 dark:border-green-600 rounded transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Check className="w-3 h-3" />
                                    {t("Accept All")}
                                </button>
                                <button
                                    onClick={handleRejectAll}
                                    className="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-600 rounded transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <XIcon className="w-3 h-3" />
                                    {t("Reject All")}
                                </button>
                            </div>
                            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
                                {diffs.map((diff, index) => {
                                    const state =
                                        diffStates[index] || "pending";
                                    const isSelected =
                                        index === currentDiffIndex;

                                    // Truncate text for concise display
                                    const truncateText = (
                                        str,
                                        maxLength = 50,
                                    ) => {
                                        if (!str) return t("(no text)");
                                        if (str.length <= maxLength) return str;
                                        return (
                                            str.substring(0, maxLength) + "..."
                                        );
                                    };

                                    return (
                                        <button
                                            key={index}
                                            onClick={() =>
                                                setCurrentDiffIndex(index)
                                            }
                                            className={`w-full text-left p-3 border-b border-gray-200 dark:border-gray-600 transition-colors ${
                                                isSelected
                                                    ? "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500"
                                                    : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                            #{index + 1}
                                                        </span>
                                                        <span
                                                            className={`text-xs px-2 py-0.5 rounded ${
                                                                diff.type ===
                                                                "addition"
                                                                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                                                    : diff.type ===
                                                                        "deletion"
                                                                      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                                                                      : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                                                            }`}
                                                        >
                                                            {diff.type ===
                                                            "addition"
                                                                ? t("Addition")
                                                                : diff.type ===
                                                                    "deletion"
                                                                  ? t(
                                                                        "Deletion",
                                                                    )
                                                                  : t("Change")}
                                                        </span>
                                                        <span
                                                            className={`text-xs font-medium ${
                                                                state ===
                                                                "accepted"
                                                                    ? "text-green-600 dark:text-green-400"
                                                                    : state ===
                                                                        "rejected"
                                                                      ? "text-red-600 dark:text-red-400"
                                                                      : "text-gray-500 dark:text-gray-400"
                                                            }`}
                                                        >
                                                            {state ===
                                                            "accepted"
                                                                ? t("Accepted")
                                                                : state ===
                                                                    "rejected"
                                                                  ? t(
                                                                        "Rejected",
                                                                    )
                                                                  : t(
                                                                        "Pending",
                                                                    )}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-gray-700 dark:text-gray-300">
                                                        <div className="line-through text-red-600 dark:text-red-400 mb-1">
                                                            {truncateText(
                                                                diff.original,
                                                            )}
                                                        </div>
                                                        <div className="text-green-600 dark:text-green-400">
                                                            {truncateText(
                                                                diff.corrected,
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {isSelected && (
                                                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Keyboard Shortcuts Button at bottom */}
                            {diffs.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                    <Dialog
                                        open={showKeyboardShortcutsDialog}
                                        onOpenChange={
                                            setShowKeyboardShortcutsDialog
                                        }
                                    >
                                        <DialogTrigger asChild>
                                            <button className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors flex items-center justify-center gap-2">
                                                <span>
                                                    {t("Keyboard Shortcuts")}
                                                </span>
                                            </button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>
                                                    {t("Keyboard Shortcuts")}
                                                </DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-3 py-4">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex gap-1 mt-0.5">
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            ↑
                                                        </kbd>
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            ↓
                                                        </kbd>
                                                    </div>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        or{" "}
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            ←
                                                        </kbd>{" "}
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            →
                                                        </kbd>{" "}
                                                        {t("Navigate changes")}
                                                    </span>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <div className="flex gap-1 mt-0.5">
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            Enter
                                                        </kbd>
                                                    </div>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        or{" "}
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            Space
                                                        </kbd>{" "}
                                                        {t("Accept change")}
                                                    </span>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <div className="flex gap-1 mt-0.5">
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            Backspace
                                                        </kbd>
                                                    </div>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        or{" "}
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            X
                                                        </kbd>{" "}
                                                        {t("Reject change")}
                                                    </span>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <div className="flex gap-1 mt-0.5">
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            C
                                                        </kbd>
                                                    </div>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        {t(
                                                            "Toggle context view",
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <div className="flex gap-1 mt-0.5">
                                                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">
                                                            Esc
                                                        </kbd>
                                                    </div>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        {t("Exit review mode")}
                                                    </span>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            )}
                        </div>

                        {/* Right Pane: Change Details + Final Preview */}
                        <div className="space-y-4">
                            {/* Selected Change Details */}
                            {diffs[currentDiffIndex] && (
                                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                                    <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                                        <div className="flex items-center justify-between">
                                            <h5 className="font-medium text-gray-900 dark:text-gray-100">
                                                {t("Change")}{" "}
                                                {currentDiffIndex + 1}:{" "}
                                                {diffs[currentDiffIndex]
                                                    .type === "change"
                                                    ? t("Modification")
                                                    : diffs[currentDiffIndex]
                                                            .type === "addition"
                                                      ? t("Addition")
                                                      : t("Deletion")}
                                            </h5>
                                            <span
                                                className={`text-xs px-2 py-1 rounded font-medium ${
                                                    diffStates[
                                                        currentDiffIndex
                                                    ] === "accepted"
                                                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                                        : diffStates[
                                                                currentDiffIndex
                                                            ] === "rejected"
                                                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                                                          : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                                }`}
                                            >
                                                {diffStates[
                                                    currentDiffIndex
                                                ] === "accepted"
                                                    ? t("Accepted")
                                                    : diffStates[
                                                            currentDiffIndex
                                                        ] === "rejected"
                                                      ? t("Rejected")
                                                      : t("Pending")}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Change in Context */}
                                    <div className="p-4">
                                        {(() => {
                                            const currentDiff =
                                                diffs[currentDiffIndex];
                                            const context =
                                                getContextAroundDiff(
                                                    currentDiff,
                                                );
                                            const state =
                                                diffStates[currentDiffIndex] ||
                                                "pending";

                                            return (
                                                <div className="space-y-4">
                                                    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                                                        <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                                            {t(
                                                                "Change in Context",
                                                            )}
                                                        </h6>
                                                        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                                                            <span className="text-gray-500 dark:text-gray-400">
                                                                {context.before}
                                                            </span>
                                                            {state ===
                                                            "pending" ? (
                                                                <span>
                                                                    <span className="bg-red-200 dark:bg-red-700 text-red-800 dark:text-red-200 line-through font-medium rounded px-1 mr-1">
                                                                        {
                                                                            currentDiff.original
                                                                        }
                                                                    </span>
                                                                    <span className="bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-200 font-medium rounded px-1">
                                                                        {
                                                                            currentDiff.corrected
                                                                        }
                                                                    </span>
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    className={`font-medium rounded px-1 ${
                                                                        state ===
                                                                        "accepted"
                                                                            ? "bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-200"
                                                                            : "bg-red-200 dark:bg-red-700 text-red-800 dark:text-red-200 line-through"
                                                                    }`}
                                                                >
                                                                    {state ===
                                                                    "accepted"
                                                                        ? currentDiff.corrected
                                                                        : currentDiff.original}
                                                                </span>
                                                            )}
                                                            <span className="text-gray-500 dark:text-gray-400">
                                                                {context.after}
                                                            </span>
                                                        </pre>
                                                    </div>

                                                    {/* Change Details */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                                {t("Original")}
                                                            </h6>
                                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-3">
                                                                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                                                                    {currentDiff.original || (
                                                                        <span className="italic text-gray-400">
                                                                            {t(
                                                                                "(no text)",
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                                {t("Suggested")}
                                                            </h6>
                                                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded p-3">
                                                                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                                                                    {currentDiff.corrected || (
                                                                        <span className="italic text-gray-400">
                                                                            {t(
                                                                                "(no text)",
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Action buttons */}
                                                    <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                                        <button
                                                            onClick={() =>
                                                                handleRejectDiff(
                                                                    currentDiffIndex,
                                                                )
                                                            }
                                                            disabled={
                                                                diffStates[
                                                                    currentDiffIndex
                                                                ] === "rejected"
                                                            }
                                                            className="flex items-center px-3 py-1 text-sm bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded transition-colors"
                                                        >
                                                            <XIcon className="w-4 h-4 mr-1" />
                                                            {t("Reject")}
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                handleAcceptDiff(
                                                                    currentDiffIndex,
                                                                )
                                                            }
                                                            disabled={
                                                                diffStates[
                                                                    currentDiffIndex
                                                                ] === "accepted"
                                                            }
                                                            className="flex items-center px-3 py-1 text-sm bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded transition-colors"
                                                        >
                                                            <Check className="w-4 h-4 mr-1" />
                                                            {t("Accept")}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* Final Preview */}
                            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                                <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                        {t("Final Preview")}
                                    </h4>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-700 p-4 h-64 overflow-y-auto">
                                    <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                                        {finalText || text}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : correctedText ? (
                /* Fallback: Two-pane layout for when no diffs or not in review mode, but we have corrected text */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Original Text Pane */}
                    <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                            {t("Original Text")}
                        </h4>
                        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md h-96 overflow-y-auto border">
                            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                                {text || t("No text provided")}
                            </pre>
                        </div>
                    </div>

                    {/* Corrected Text Pane */}
                    <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                            {t("Style Guide Checked Text")}
                        </h4>
                        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md h-96 overflow-y-auto border">
                            {correctedText === text ? (
                                <p className="text-green-600 dark:text-green-400 text-sm italic flex items-center">
                                    <Check className="w-4 h-4 mr-2" />
                                    {t(
                                        "No style guide changes needed! Your text looks good.",
                                    )}
                                </p>
                            ) : (
                                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                                    {correctedText}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Only show buttons when we have corrected text or are in diff review */}
            {(correctedText || (showDiffReview && diffs.length > 0)) && (
                <div className="mt-6">
                    {/* Show message if there are pending changes */}
                    {showDiffReview && diffs.length > 0 && hasPendingChanges && (
                        <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-md">
                            <p className="text-yellow-700 dark:text-yellow-400 text-sm">
                                {t(
                                    "Please accept or reject each change before using the corrected text.",
                                )}
                            </p>
                        </div>
                    )}
                    <div className="flex justify-end space-x-3">
                        <button
                            onClick={() => {
                                onCommit(text);
                                // Close the modal after committing
                                if (onClose) {
                                    onClose();
                                }
                            }}
                            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors duration-200 text-sm font-medium"
                        >
                            {t("Keep Original")}
                        </button>
                        <button
                            onClick={handleUseCorrectedText}
                            disabled={
                                !correctedText ||
                                (showDiffReview &&
                                    diffs.length > 0 &&
                                    hasPendingChanges)
                            }
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-sm font-medium"
                        >
                            {t("Use Corrected Text")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NewStyleGuideModal;
