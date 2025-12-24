import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
    Check,
    X as XIcon,
    SkipForward,
    ArrowLeft,
    ArrowRight,
} from "lucide-react";
import { useLLMs } from "../../../app/queries/llms";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../../@/components/ui/select";

const NewStyleGuideModal = ({ text, onCommit, workspaceId = null }) => {
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
                    workspaceId: workspaceId,
                    files: files,
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
    };

    const handleAcceptAll = () => {
        const newStates = {};
        diffs.forEach((_, index) => {
            newStates[index] = "accepted";
        });
        setDiffStates(newStates);
    };

    const handleRejectAll = () => {
        const newStates = {};
        diffs.forEach((_, index) => {
            newStates[index] = "rejected";
        });
        setDiffStates(newStates);
    };

    return (
        <div className="max-w-7xl mx-auto">
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
                                            llm.identifier !== "labeebagent" &&
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
                                    placeholder={t("Select a style guide...")}
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

            {/* Diff Review Interface */}
            {showDiffReview && diffs.length > 0 ? (
                <div
                    ref={diffReviewRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    className="outline-none"
                >
                    {/* Keyboard shortcuts help */}
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md">
                        <h5 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                            {t("Keyboard Shortcuts")}
                        </h5>
                        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                            <div>
                                •{" "}
                                <kbd className="px-1 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs">
                                    ↑/↓
                                </kbd>{" "}
                                or{" "}
                                <kbd className="px-1 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs">
                                    ←/→
                                </kbd>{" "}
                                Navigate changes
                            </div>
                            <div>
                                •{" "}
                                <kbd className="px-1 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs">
                                    Enter
                                </kbd>{" "}
                                or{" "}
                                <kbd className="px-1 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs">
                                    Space
                                </kbd>{" "}
                                Accept change
                            </div>
                            <div>
                                •{" "}
                                <kbd className="px-1 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs">
                                    Backspace
                                </kbd>{" "}
                                or{" "}
                                <kbd className="px-1 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs">
                                    X
                                </kbd>{" "}
                                Reject change
                            </div>
                            <div>
                                •{" "}
                                <kbd className="px-1 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs">
                                    C
                                </kbd>{" "}
                                Toggle context view
                            </div>
                            <div>
                                •{" "}
                                <kbd className="px-1 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs">
                                    Esc
                                </kbd>{" "}
                                Exit review mode
                            </div>
                        </div>
                    </div>

                    {/* Progress and bulk actions */}
                    <div className="flex justify-between items-center mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                        <div className="flex items-center space-x-4">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t("Change")} {currentDiffIndex + 1} {t("of")}{" "}
                                {diffs.length}
                            </span>
                            <div className="flex space-x-1">
                                {diffs.map((_, index) => (
                                    <div
                                        key={index}
                                        className={`w-3 h-3 rounded-full border-2 ${
                                            index === currentDiffIndex
                                                ? "border-blue-500 bg-blue-200 dark:bg-blue-700"
                                                : diffStates[index] ===
                                                    "accepted"
                                                  ? "border-green-500 bg-green-200 dark:bg-green-700"
                                                  : diffStates[index] ===
                                                      "rejected"
                                                    ? "border-red-500 bg-red-200 dark:bg-red-700"
                                                    : "border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="flex space-x-2">
                            <button
                                onClick={() =>
                                    setShowContextView(!showContextView)
                                }
                                className={`px-3 py-1 text-xs rounded transition-colors ${
                                    showContextView
                                        ? "bg-blue-500 hover:bg-blue-600 text-white"
                                        : "bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200"
                                }`}
                            >
                                {showContextView
                                    ? t("Detail View")
                                    : t("Context View")}
                            </button>
                            <button
                                onClick={handleAcceptAll}
                                className="px-3 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                            >
                                {t("Accept All")}
                            </button>
                            <button
                                onClick={handleRejectAll}
                                className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                            >
                                {t("Reject All")}
                            </button>
                        </div>
                    </div>

                    {/* Current diff display */}
                    {diffs[currentDiffIndex] && (
                        <div className="mb-6 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                            <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                                <h5 className="font-medium text-gray-900 dark:text-gray-100">
                                    {t("Change")} {currentDiffIndex + 1}:{" "}
                                    {diffs[currentDiffIndex].type === "change"
                                        ? t("Modification")
                                        : diffs[currentDiffIndex].type ===
                                            "addition"
                                          ? t("Addition")
                                          : t("Deletion")}
                                </h5>
                            </div>

                            {showContextView ? (
                                /* Context View */
                                <div className="p-4">
                                    <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                        {t("Change in Context")}
                                    </h6>
                                    {(() => {
                                        const currentDiff =
                                            diffs[currentDiffIndex];
                                        const context =
                                            getContextAroundDiff(currentDiff);
                                        const state =
                                            diffStates[currentDiffIndex] ||
                                            "pending";

                                        return (
                                            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                                                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                                                    {/* Before context */}
                                                    <span className="text-gray-500 dark:text-gray-400">
                                                        {context.before}
                                                    </span>
                                                    {/* Current change */}
                                                    {state === "pending" ? (
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
                                                    {/* After context */}
                                                    <span className="text-gray-500 dark:text-gray-400">
                                                        {context.after}
                                                    </span>
                                                </pre>

                                                {/* Show change details below context */}
                                                {state === "pending" && (
                                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <h7 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                                                                    {t(
                                                                        "Current",
                                                                    )}
                                                                </h7>
                                                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-2">
                                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                                        "
                                                                        {currentDiff.original ||
                                                                            t(
                                                                                "(no text)",
                                                                            )}
                                                                        "
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <h7 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                                                                    {t(
                                                                        "Suggested",
                                                                    )}
                                                                </h7>
                                                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded p-2">
                                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                                        "
                                                                        {currentDiff.corrected ||
                                                                            t(
                                                                                "(no text)",
                                                                            )}
                                                                        "
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                /* Detail View */
                                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-600">
                                    {/* Original text */}
                                    <div className="p-4">
                                        <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            {t("Original")}
                                        </h6>
                                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-3 min-h-[80px]">
                                            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                                                {diffs[currentDiffIndex]
                                                    .original || (
                                                    <span className="italic text-gray-400">
                                                        {t("(no text)")}
                                                    </span>
                                                )}
                                            </pre>
                                        </div>
                                    </div>

                                    {/* Corrected text */}
                                    <div className="p-4">
                                        <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            {t("Suggested")}
                                        </h6>
                                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded p-3 min-h-[80px]">
                                            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                                                {diffs[currentDiffIndex]
                                                    .corrected || (
                                                    <span className="italic text-gray-400">
                                                        {t("(no text)")}
                                                    </span>
                                                )}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Action buttons for current diff */}
                            <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-600">
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() =>
                                            setCurrentDiffIndex(
                                                Math.max(
                                                    0,
                                                    currentDiffIndex - 1,
                                                ),
                                            )
                                        }
                                        disabled={currentDiffIndex === 0}
                                        className="flex items-center px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors"
                                    >
                                        <ArrowLeft className="w-4 h-4 mr-1" />
                                        {t("Previous")}
                                    </button>
                                    <button
                                        onClick={() =>
                                            setCurrentDiffIndex(
                                                Math.min(
                                                    diffs.length - 1,
                                                    currentDiffIndex + 1,
                                                ),
                                            )
                                        }
                                        disabled={
                                            currentDiffIndex ===
                                            diffs.length - 1
                                        }
                                        className="flex items-center px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors"
                                    >
                                        {t("Next")}
                                        <ArrowRight className="w-4 h-4 ml-1" />
                                    </button>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        {t("Status")}:
                                        <span
                                            className={`ml-1 font-medium ${
                                                diffStates[currentDiffIndex] ===
                                                "accepted"
                                                    ? "text-green-600 dark:text-green-400"
                                                    : diffStates[
                                                            currentDiffIndex
                                                        ] === "rejected"
                                                      ? "text-red-600 dark:text-red-400"
                                                      : "text-gray-500 dark:text-gray-400"
                                            }`}
                                        >
                                            {diffStates[currentDiffIndex] ===
                                            "accepted"
                                                ? t("Accepted")
                                                : diffStates[
                                                        currentDiffIndex
                                                    ] === "rejected"
                                                  ? t("Rejected")
                                                  : t("Pending")}
                                        </span>
                                    </span>
                                </div>

                                <div className="flex space-x-2">
                                    <button
                                        onClick={() =>
                                            handleResetDiff(currentDiffIndex)
                                        }
                                        className="flex items-center px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
                                    >
                                        <SkipForward className="w-4 h-4 mr-1" />
                                        {t("Reset")}
                                    </button>
                                    <button
                                        onClick={() =>
                                            handleRejectDiff(currentDiffIndex)
                                        }
                                        className="flex items-center px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                                    >
                                        <XIcon className="w-4 h-4 mr-1" />
                                        {t("Reject")}
                                    </button>
                                    <button
                                        onClick={() =>
                                            handleAcceptDiff(currentDiffIndex)
                                        }
                                        className="flex items-center px-3 py-1 text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                                    >
                                        <Check className="w-4 h-4 mr-1" />
                                        {t("Accept")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Final text preview */}
                    <div className="mt-6">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                            {t("Final Preview")}
                        </h4>
                        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md h-64 overflow-y-auto border">
                            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                                {finalText || text}
                            </pre>
                        </div>
                    </div>
                </div>
            ) : (
                /* Fallback: Two-pane layout for when no diffs or not in review mode */
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
                            {correctedText ? (
                                correctedText === text ? (
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
                                )
                            ) : (
                                <p className="text-gray-500 dark:text-gray-400 text-sm italic">
                                    {isChecking
                                        ? t("Processing...")
                                        : t(
                                              "Click 'Check Style Guide' to see corrected text here",
                                          )}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-end space-x-3 mt-6">
                <button
                    onClick={() => onCommit(text)}
                    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors duration-200 text-sm font-medium"
                >
                    {t("Keep Original")}
                </button>
                {showDiffReview && (
                    <button
                        onClick={() => setShowDiffReview(false)}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors duration-200 text-sm font-medium"
                    >
                        {t("Exit Review Mode")}
                    </button>
                )}
                <button
                    onClick={handleUseCorrectedText}
                    disabled={!correctedText}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200 text-sm font-medium"
                >
                    {showDiffReview
                        ? t("Use Final Text")
                        : t("Use Corrected Text")}
                </button>
            </div>
        </div>
    );
};

export default NewStyleGuideModal;
