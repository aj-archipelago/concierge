"use client";

import PropTypes from "prop-types";
import React, {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Button } from "react-bootstrap";
import styled from "styled-components";
import KeyboardShortcutsHelp from "./style_guide/KeyboardShortcutsHelp";
import Suggestion from "./style_guide/Suggestion";
import { getFinalText, getIndexInFinalText } from "./style_guide/utils";
import { ThemeContext } from "../../contexts/ThemeProvider";
import dynamic from "next/dynamic";

let diff;
let monaco;

if (typeof window !== "undefined") {
    import("diff").then((d) => {
        diff = d;
    });
    import("monaco-editor/esm/vs/editor/editor.api").then((m) => {
        monaco = m;
    });
}

const StyledButton = styled.div`
    padding: 2px;

    &:focus {
        padding: 0;
        border: 2px solid #666;
        outline: none;
        box-shadow: none;
    }
    &:focus-visible {
        padding: 0;
        box-shadow: none;
        outline: none;
    }
`;

const StyleGuideDiff = ({ styleGuideResult = "", setSelectedText }) => {
    let result;
    let error;
    const { theme } = useContext(ThemeContext);

    const MonacoEditor = useMemo(
        () => dynamic(() => import("react-monaco-editor"), { ssr: false }),
        [],
    );

    if (typeof window !== "undefined") {
        window.diff = diff;
    }

    try {
        result = JSON.parse(styleGuideResult);
    } catch (e) {
        error = e;
        result = null;
    }

    const resultSuggestions = result?.suggestions || [];

    resultSuggestions.sort((a, b) => a.index - b.index);

    for (let i = 0; i < resultSuggestions.length; i++) {
        const suggestion = resultSuggestions[i];
        const nextSuggestion = resultSuggestions[i + 1];

        // remove overlapping suggestions
        if (
            nextSuggestion &&
            suggestion.index + suggestion.suspect.length >= nextSuggestion.index
        ) {
            resultSuggestions.splice(i + 1, 1);
            i--;
        }

        // remove empty suggestions
        if (!suggestion.suspect?.length && !suggestion.suggestions.length) {
            resultSuggestions.splice(i, 1);
            i--;
        }
    }

    const currentlyHoveredIndexRef = useRef(null);
    const [suggestions, setSuggestions] = useState(resultSuggestions);
    const suggestionsRef = useRef(suggestions);
    const trackChangesRef = useRef(true);
    const manualEditsRef = useRef([]);
    const [deletedSuggestions, setDeletedSuggestions] = useState([]);
    const deletedSuggestionsRef = useRef(deletedSuggestions);
    deletedSuggestionsRef.current = deletedSuggestions;

    const currentDecorationsRef = useRef([]);
    suggestionsRef.current = suggestions;
    const editorRef = useRef(null);
    suggestions.sort((a, b) => a.index - b.index);

    const originalText = result?.text;

    useEffect(() => {
        if (setSelectedText && originalText) {
            setSelectedText(
                getFinalText(originalText, suggestions, manualEditsRef.current),
            );
            trackChangesRef.current = true;
        }
    }, [suggestions, setSelectedText, originalText]);

    function suggestionToRangeInModifiedText(
        suggestion,
        isActive,
        excludedRange,
    ) {
        const stringToSearch = getFinalText(
            originalText,
            suggestionsRef.current,
            manualEditsRef.current,
        );
        const globalIndex = getIndexInFinalText(
            originalText,
            suggestionsRef.current,
            manualEditsRef.current,
            suggestion,
        );

        if (globalIndex === -1) {
            return;
        }

        const replacement = suggestion.accepted
            ? suggestion.suggestions[suggestion.suggestionIndex || 0] || ""
            : suggestion.suspect;
        const startLineNumber = stringToSearch
            .substr(0, globalIndex)
            .split("\n").length;
        const startColumn =
            stringToSearch.substr(0, globalIndex).split("\n").pop().length + 1;
        const endLineNumber = stringToSearch
            .substr(0, globalIndex + replacement.length)
            .split("\n").length;
        let endColumn =
            stringToSearch
                .substr(0, globalIndex + replacement.length)
                .split("\n")
                .pop().length + 1;

        // check if suggestion falls within excluded range
        if (excludedRange) {
            const {
                startLineNumber: excludedStartLineNumber,
                startColumn: excludedStartColumn,
                endLineNumber: excludedEndLineNumber,
                endColumn: excludedEndColumn,
            } = excludedRange;

            if (
                startLineNumber >= excludedStartLineNumber &&
                startColumn >= excludedStartColumn &&
                endLineNumber <= excludedEndLineNumber &&
                endColumn <= excludedEndColumn
            ) {
                return;
            }
        }

        // is an addition
        if (
            !suggestion.accepted &&
            suggestion.suspect.length === 0 &&
            suggestion.suggestions.length > 0
        ) {
            return {
                range: new monaco.Range(
                    startLineNumber,
                    startColumn,
                    startLineNumber,
                    startColumn,
                ),
                options: {
                    className: isActive ? "add-highlight" : "",
                },
            };
        }

        // is a removal
        if (suggestion.accepted && !replacement) {
            return {
                range: new monaco.Range(
                    startLineNumber,
                    startColumn,
                    endLineNumber,
                    startColumn,
                ),
                options: {
                    className: isActive ? "red-highlight" : "",
                },
            };
        } else {
            return {
                range: new monaco.Range(
                    startLineNumber,
                    startColumn,
                    endLineNumber,
                    endColumn,
                ),
                options: {
                    inlineClassName: !suggestion.dismissed
                        ? `unread-underline`
                        : "read-underline",
                    className: isActive ? "highlight" : "",
                },
            };
        }
    }
    const suggestionToRangeInModifiedTextCallback = useCallback(
        suggestionToRangeInModifiedText,
        [originalText, monaco.Range],
    );
    const finalText = useMemo(
        () =>
            originalText
                ? getFinalText(
                      originalText,
                      suggestions,
                      manualEditsRef.current,
                  )
                : "",
        [originalText, suggestions],
    );

    const getDecorationsCallback = useCallback(
        (suggestions, i, excludedRange) => {
            console.log("i", i);
            return suggestions
                .map((s, sIndex) => {
                    return suggestionToRangeInModifiedTextCallback(
                        s,
                        i === sIndex,
                        excludedRange,
                    );
                })
                .filter((s) => s);
        },
        [suggestionToRangeInModifiedTextCallback],
    );

    const onHover = useCallback(
        (c, i, reveal = true) => {
            const { index } = c;
            const lineNumber = finalText.substr(0, index).split("\n").length;
            const column =
                finalText.substr(0, index).split("\n").pop().length + 1;

            if (editorRef.current) {
                if (reveal) {
                    editorRef.current.revealPositionInCenter(
                        { lineNumber, column },
                        0,
                    );
                }

                currentDecorationsRef.current = editorRef.current
                    .getModel()
                    .deltaDecorations(
                        currentDecorationsRef.current,
                        getDecorationsCallback(suggestionsRef.current, i),
                    );
            }
        },
        [getDecorationsCallback, finalText],
    );

    const filteredSuggestions = suggestions.filter((c) => c);

    const selectAndFocus = useCallback(
        (suggestions, index, scroll = true) => {
            setSelectedSuggestion(index);

            const id = `suggestion-${suggestions[index].index}`;
            const element =
                typeof document !== "undefined"
                    ? document.getElementById(id)
                    : null;

            if (element) {
                element.focus({
                    preventScroll: true,
                });
                if (scroll) {
                    setTimeout(
                        () =>
                            element.scrollIntoView({
                                behavior: "smooth",
                            }),
                        1,
                    );
                }
                onHover(suggestions[index], index);
            }
        },
        [onHover],
    );

    const [selectedSuggestion, setSelectedSuggestion] = useState(0);

    const moveForward = useCallback(
        (nextUnread, startIndex = selectedSuggestion) => {
            // find next suggestion that has not been dismissed and not been deleted
            let index = startIndex;

            do {
                index = Math.min(index + 1, suggestions.length - 1);
            } while (
                index < suggestions.length - 1 &&
                ((nextUnread && suggestions[index].dismissed) ||
                    deletedSuggestions.includes(index))
            );

            if (index !== -1) {
                selectAndFocus(suggestionsRef.current, index);
            }
        },
        [selectAndFocus, selectedSuggestion, deletedSuggestions, suggestions],
    );

    const onDismissCallback = useCallback(
        (value, all, i) => {
            const newSuggestions = [...suggestionsRef.current];
            newSuggestions[i].dismissed = value;
            const dismissed = value;

            if (all) {
                newSuggestions.forEach((s) => {
                    if (s.suspect === newSuggestions[i].suspect) {
                        s.dismissed = dismissed;
                    }
                });
                moveForward(true, i);
            } else {
                if (dismissed) {
                    moveForward(true, i);
                } else {
                    selectAndFocus(newSuggestions, i);
                }
            }
            setSuggestions(newSuggestions);
        },
        [suggestionsRef, moveForward, selectAndFocus],
    );

    const onSelectCallback = useCallback((i) => {
        console.log("onselectCallback");
        setSelectedSuggestion(i);
    }, []);

    const setSuggestionIndexCallback = useCallback((i, index) => {
        const newSuggestions = [...suggestionsRef.current];
        newSuggestions[i].suggestionIndex = index;
        setSuggestions(newSuggestions);
    }, []);

    const onAcceptChangeCallback = useCallback(
        (value, i) => {
            const newSuggestions = [...suggestionsRef.current];

            if (newSuggestions[i].suggestionIndex !== undefined) {
                // adjust manual edits
                if (!newSuggestions[i].accepted && value) {
                    const { index, suspect, suggestions } = newSuggestions[i];
                    const replacement =
                        suggestions[newSuggestions[i].suggestionIndex || 0] ||
                        "";

                    const differenceInLength =
                        replacement.length - suspect.length - 1;

                    // adjust manual edits that occur after this suggestion
                    const newManualEdits = [...manualEditsRef.current];
                    newManualEdits.forEach((edit) => {
                        if (edit.rangeOffset > index + replacement.length) {
                            edit.rangeOffset += differenceInLength;
                        }
                    });

                    manualEditsRef.current = newManualEdits;
                    setSelectedText(
                        getFinalText(
                            originalText,
                            newSuggestions,
                            manualEditsRef.current,
                        ),
                    );
                } else if (newSuggestions[i].accepted && !value) {
                    const { index, suspect, suggestions } = newSuggestions[i];
                    const differenceInLength =
                        suspect.length -
                        (suggestions[newSuggestions[i].suggestionIndex || 0]
                            ?.length || 0) +
                        1;

                    // adjust manual edits that occur after this suggestion
                    const newManualEdits = [...manualEditsRef.current];
                    newManualEdits.forEach((edit) => {
                        if (edit.rangeOffset > index + suspect.length) {
                            edit.rangeOffset += differenceInLength;
                        }
                    });

                    manualEditsRef.current = newManualEdits;
                    setSelectedText(
                        getFinalText(
                            originalText,
                            newSuggestions,
                            manualEditsRef.current,
                        ),
                    );
                }

                newSuggestions[i].accepted = value;

                setTimeout(() => {
                    selectAndFocus(newSuggestions, i, false);
                }, 1);

                trackChangesRef.current = false;
                setSuggestions(newSuggestions);
            }
        },
        [selectAndFocus, setSelectedText, suggestionsRef, originalText],
    );

    const timeoutIdRef = useRef(null);

    const debouncedUpdateDecorations = useCallback(() => {
        if (originalText) {
            if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
            }

            timeoutIdRef.current = setTimeout(() => {
                currentDecorationsRef.current = editorRef.current
                    .getModel()
                    .deltaDecorations(
                        currentDecorationsRef.current,
                        suggestionsRef.current
                            .map((s) =>
                                suggestionToRangeInModifiedTextCallback(s),
                            )
                            .filter((s) => s),
                    );
                clearTimeout(timeoutIdRef.current);
            }, 1);
        }
    }, [originalText, suggestionToRangeInModifiedTextCallback]);

    const handleEditorDidMount = useCallback(
        (editor) => {
            editor.onDidChangeCursorSelection((e) => {
                const { selection } = e;
                const {
                    startColumn,
                    startLineNumber,
                    endColumn,
                    endLineNumber,
                } = selection;

                if (
                    startColumn === endColumn &&
                    startLineNumber === endLineNumber
                ) {
                    const index = editor
                        .getModel()
                        .getOffsetAt(
                            new monaco.Position(startLineNumber, startColumn),
                        );
                    onDidChangePosition(index);
                    return;
                }

                console.log(
                    "clearing decorations",
                    startColumn,
                    startLineNumber,
                    endColumn,
                    endLineNumber,
                );

                // clear decorations in the slection range
                const newDecorations = editor
                    .getModel()
                    .deltaDecorations(
                        currentDecorationsRef.current,
                        getDecorationsCallback(
                            suggestionsRef.current,
                            -1,
                            new monaco.Range(
                                startLineNumber,
                                startColumn,
                                endLineNumber,
                                endColumn,
                            ),
                        ),
                    );
                currentDecorationsRef.current = newDecorations;
            });

            const onDidChangePosition = (index) => {
                let activeOffset = index;

                for (let i in suggestionsRef.current) {
                    const currentSuggestion = suggestionsRef.current[i];
                    const startOffset = getIndexInFinalText(
                        originalText,
                        suggestionsRef.current,
                        manualEditsRef.current,
                        currentSuggestion,
                    );

                    let endOffset;

                    if (currentSuggestion.accepted) {
                        endOffset =
                            startOffset +
                            (
                                currentSuggestion.suggestions[
                                    currentSuggestion.suggestionIndex || 0
                                ] || ""
                            ).length;
                    } else {
                        endOffset =
                            startOffset + currentSuggestion.suspect.length;
                    }

                    if (
                        startOffset <= activeOffset &&
                        activeOffset < endOffset
                    ) {
                        const id = `suggestion-${currentSuggestion.index}`;

                        setSelectedSuggestion(parseInt(i));
                        onHover(suggestionsRef.current[i], parseInt(i), false);

                        // scroll to element
                        const element =
                            typeof document !== "undefined"
                                ? document.getElementById(id)
                                : null;
                        setTimeout(() => {
                            element.scrollIntoView({
                                behavior: "smooth",
                            });
                        }, 1);
                    }
                }
            };

            editor.getModel().onDidChangeContent((e) => {
                const { changes } = e;

                if (trackChangesRef.current) {
                    const newManualEdits = [
                        ...manualEditsRef.current,
                        ...changes,
                    ];
                    manualEditsRef.current = newManualEdits;
                    setSelectedText(
                        getFinalText(
                            originalText,
                            suggestionsRef.current,
                            newManualEdits,
                        ),
                    );
                }

                // check if any suggestion has been deleted and add its index
                // to the deletedSuggestions state array if it has
                const suggestions = suggestionsRef.current;

                const deletedList = [];

                for (let i = 0; i < suggestions.length; i++) {
                    const suggestion = suggestions[i];

                    const hasBeenDeleted =
                        !suggestionToRangeInModifiedTextCallback(suggestion);

                    if (hasBeenDeleted) {
                        deletedList.push(i);
                    }
                }

                // apply changes to deletedSuggestions state
                setDeletedSuggestions(deletedList);
            });

            debouncedUpdateDecorations();

            editorRef.current = editor;
        },
        [
            debouncedUpdateDecorations,
            getDecorationsCallback,
            originalText,
            suggestionToRangeInModifiedTextCallback,
            onHover,
            setSelectedText,
            monaco.Range,
            monaco.Position,
        ],
    );

    if (!result) {
        return (
            <div className="alert alert-danger">
                There was an error parsing the style guide result:{" "}
                {error?.message}
            </div>
        );
    }

    return (
        <div
            className="ai-diff overflow-auto h-full gap-2"
            onKeyDown={(e) => {
                if (
                    typeof document !== "undefined" &&
                    document.activeElement.tagName === "TEXTAREA"
                ) {
                    return;
                }

                if (
                    e.key === "ArrowDown" ||
                    e.key === "ArrowUp" ||
                    e.key === "Enter" ||
                    e.key === " "
                ) {
                    e.stopPropagation();
                    e.preventDefault();
                }

                if (e.key === "ArrowDown") {
                    moveForward();
                } else if (e.key === "ArrowUp") {
                    let index = selectedSuggestion;

                    do {
                        index = Math.max(index - 1, 0);
                    } while (index > 0 && deletedSuggestions.includes(index));

                    selectAndFocus(suggestionsRef.current, index);
                } else if (e.key === "Enter") {
                    if (e.shiftKey) {
                        const newSuggestions = [...suggestionsRef.current];
                        newSuggestions[selectedSuggestion].dismissed = false;
                        setSuggestions(newSuggestions);
                    } else {
                        const newSuggestions = [...suggestionsRef.current];
                        newSuggestions[selectedSuggestion].dismissed = true;
                        setSuggestions(newSuggestions);
                        moveForward(true);
                    }
                } else if (e.key === " ") {
                    // if hasBeenDeleted
                    const hasBeenDeleted =
                        deletedSuggestions.includes(selectedSuggestion);

                    if (hasBeenDeleted) {
                        return;
                    }

                    if (suggestionsRef.current[selectedSuggestion].dismissed) {
                        // undismiss
                        onDismissCallback(false, false, selectedSuggestion);
                    } else {
                        onAcceptChangeCallback(
                            !suggestionsRef.current[selectedSuggestion]
                                .accepted,
                            selectedSuggestion,
                        );
                    }
                }
            }}
        >
            <div className="flex gap-2 h-full">
                <div className="basis-1/3 overflow-auto">
                    <h6 className="text-center">Editorial notes</h6>

                    {suggestions.length === 0 && (
                        <p className="text-center">No changes suggested</p>
                    )}
                    {/* {suggestions.length > 0 && <p className="text-center">Showing {filteredSuggestions.length} suggestions</p>} */}
                    <ul
                        style={{
                            paddingLeft: 0,
                            height: "calc(100% - 82px)",
                            overflowY: "auto",
                        }}
                        className="mb-0"
                    >
                        {filteredSuggestions.map((c, i) => {
                            let hasBeenDeleted = deletedSuggestions.includes(i);

                            return (
                                <li key={`suggestion-${c.index}`}>
                                    <StyledButton
                                        tabIndex={0}
                                        className="w-100 p-0 border-0 rounded mb-2"
                                        id={`suggestion-${c.index}`}
                                        onClick={() => {
                                            setSelectedSuggestion(i);
                                            if (
                                                currentlyHoveredIndexRef.current !==
                                                i
                                            ) {
                                                selectAndFocus(suggestions, i);
                                                currentlyHoveredIndexRef.current =
                                                    i;
                                            }
                                        }}
                                    >
                                        <Suggestion
                                            active={selectedSuggestion === i}
                                            i={i}
                                            token={c}
                                            dismissed={c.dismissed}
                                            accepted={c.accepted}
                                            onAcceptChange={
                                                onAcceptChangeCallback
                                            }
                                            hasBeenDeleted={hasBeenDeleted}
                                            setSuggestionIndex={
                                                setSuggestionIndexCallback
                                            }
                                            onDismiss={onDismissCallback}
                                            onSelect={onSelectCallback}
                                            suggestionToRangeInModifiedText={
                                                suggestionToRangeInModifiedTextCallback
                                            }
                                        />
                                    </StyledButton>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="text-center">
                        <small className="text-muted">
                            Read{" "}
                            {
                                suggestionsRef.current?.filter(
                                    (s, i) =>
                                        s.dismissed ||
                                        deletedSuggestions.includes(i),
                                )?.length
                            }
                            /
                            {
                                suggestionsRef.current?.filter(
                                    (s, i) => !deletedSuggestions.includes(i),
                                ).length
                            }
                        </small>
                    </div>
                    <div className="d-flex justify-content-between text-muted fs-8 mt-2 gap-2">
                        <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => {
                                const newSuggestions = [...suggestions];
                                newSuggestions.forEach(
                                    (s) => (s.dismissed = false),
                                );
                                setSuggestions(newSuggestions);
                                selectAndFocus(suggestions, 0);
                            }}
                        >
                            Mark all as unread
                        </Button>
                        <KeyboardShortcutsHelp />
                    </div>
                </div>
                <div className="flex-grow-1">
                    <div className="d-flex justify-content-between text-center">
                        <div className="flex-grow-1 fw-bold fs-6">
                            Modified Text (editable)
                        </div>
                    </div>
                    <div style={{ height: "calc(100% - 25px)" }}>
                        <MonacoEditor
                            theme={theme === "dark" ? "vs-dark" : "vs-light"}
                            editorDidMount={handleEditorDidMount}
                            value={finalText}
                            language="text"
                            options={{
                                wordWrap: "on",
                                diffWordWrap: "on",
                                renderSideBySide: true,
                                lineNumbers: false,
                                fontFamily: "Helvetica",
                                fontSize: 16,
                                occurrencesHighlight: false,
                                automaticLayout: true,
                                // turn off all warnings
                                renderValidationDecorations: "off",
                                unicodeHighlight: {
                                    ambiguousCharacters: false,
                                    invisibleCharacters: false,
                                },
                                contextmenu: false,
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

StyleGuideDiff.propTypes = {
    styleGuideResult: PropTypes.string,
};

if (typeof window !== "undefined") {
    // The following code is a workaround to get monaco to resize dynamically
    // (both horizontally and vertically) without crashing.
    //
    // More details on the bug and workaround are here:
    // https://github.com/microsoft/vscode/issues/183324
    // It can be removed once the bug is fixed.

    // Save a reference to the original ResizeObserver
    const OriginalResizeObserver = window.ResizeObserver;

    // Create a new ResizeObserver constructor
    window.ResizeObserver = function (callback) {
        const wrappedCallback = (entries, observer) => {
            window.requestAnimationFrame(() => {
                callback(entries, observer);
            });
        };

        // Create an instance of the original ResizeObserver
        // with the wrapped callback
        return new OriginalResizeObserver(wrappedCallback);
    };

    // Copy over static methods, if any
    for (let staticMethod in OriginalResizeObserver) {
        if (OriginalResizeObserver.hasOwnProperty(staticMethod)) {
            window.ResizeObserver[staticMethod] =
                OriginalResizeObserver[staticMethod];
        }
    }
}

export default StyleGuideDiff;
