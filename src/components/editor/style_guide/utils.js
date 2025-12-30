export const getIndexInFinalText = (
    originalText,
    suggestions,
    manualEdits,
    suggestionForIndex,
) => {
    let result = "";
    let index = 0;

    // order suggestions by index
    suggestions.sort((a, b) => a.index - b.index);

    let suggestionIndex = 0;
    let suggestion;
    let finalIndex = 0;

    if (suggestionForIndex && suggestionForIndex.index > 0) {
        do {
            suggestion = suggestions[suggestionIndex];
            const char = originalText[index];

            if (suggestion && index === suggestion.index) {
                if (suggestion.accepted) {
                    const doesSuggestionStartWithSpace = (
                        suggestion.suggestions[
                            suggestion.suggestionIndex || 0
                        ] || ""
                    ).startsWith(" ");

                    if (
                        doesSuggestionStartWithSpace &&
                        result.endsWith(" ") &&
                        !result.endsWith("\n ")
                    ) {
                        result = result.slice(0, -1);
                        finalIndex--;
                    }

                    result +=
                        suggestion.suggestions[
                            suggestion.suggestionIndex || 0
                        ] || "";

                    // if the change is a deletion and there's a space after it, remove the space
                    // e.g. deleting against from "protest against the rules" results in "protest  the rules"
                    if (
                        !suggestion.suggestions[suggestion.suggestionIndex || 0]
                    ) {
                        if (
                            originalText[index + suggestion.suspect.length] ===
                            " "
                        ) {
                            // index++;
                        }
                    }

                    // if the change is an addition and there's no space after it or at the end of it, add a space
                    // e.g. adding against to "protest the rules" results in "protest againstthe rules"
                    if (
                        suggestion.suggestions[suggestion.suggestionIndex || 0]
                    ) {
                        const nextChar =
                            originalText[index + suggestion.suspect.length];
                        const doesSuggestionEndWithWhiteSpace =
                            suggestion.suggestions[
                                suggestion.suggestionIndex || 0
                            ].endsWith(" ") ||
                            suggestion.suggestions[
                                suggestion.suggestionIndex || 0
                            ].endsWith("\n");

                        // check using regex if nextChar is alphanumeric and not punctuation
                        if (
                            nextChar &&
                            nextChar.match(/^[0-9a-zA-Z]$/) &&
                            !doesSuggestionEndWithWhiteSpace
                        ) {
                            result += " ";
                            finalIndex++;
                        }
                    }

                    finalIndex +=
                        suggestion.suggestions[suggestion.suggestionIndex || 0]
                            ?.length || 0;
                } else {
                    // use a substring equal to the suspect's length, but not the suspect itself
                    // to preserve case
                    result += originalText.slice(
                        index,
                        index + suggestion.suspect.length,
                    );
                    finalIndex += suggestion.suspect?.length;
                }

                index += suggestion.suspect?.length || 0;
                suggestionIndex++;
            } else {
                result += char;
                index++;
                finalIndex++;
            }

            if (suggestionForIndex && suggestionForIndex.index === index) {
                break;
            }
        } while (index < originalText.length);
    }

    // adjust the final index based on manual edits
    for (const edit of manualEdits) {
        const { text, rangeLength, rangeOffset } = edit;
        if (rangeOffset <= finalIndex) {
            // if this section of the text has been deleted, return -1;
            if (finalIndex < rangeOffset + rangeLength && text.length === 0) {
                return -1;
            } else {
                finalIndex += edit.text.length - rangeLength;
            }
        }
    }

    return finalIndex;
};

export const getFinalText = (originalText, suggestions, manualEdits) => {
    let result = "";
    let index = 0;

    // order suggestions by index
    suggestions.sort((a, b) => a.index - b.index);

    let suggestionIndex = 0;
    let suggestion;

    do {
        suggestion = suggestions[suggestionIndex];
        const char = originalText[index];

        if (suggestion && index === suggestion.index) {
            if (suggestion.accepted) {
                const selectedSuggestion =
                    suggestion.suggestions[suggestion.suggestionIndex || 0] ||
                    "";

                const doesSuggestionStartWithSpace =
                    selectedSuggestion.startsWith(" ");

                if (
                    doesSuggestionStartWithSpace &&
                    result.endsWith(" ") &&
                    !result.endsWith("\n ")
                ) {
                    result = result.slice(0, -1);
                }

                result += selectedSuggestion;

                // if the change is a deletion and there's a space after it, remove the space
                // e.g. deleting against from "protest against the rules" results in "protest  the rules"
                if (!suggestion.suggestions[suggestion.suggestionIndex || 0]) {
                    if (
                        originalText[index + suggestion.suspect.length] === " "
                    ) {
                        // index++;
                    }
                }

                // if the change is an addition and there's no space after it or at the end of it, add a space
                // e.g. adding against to "protest the rules" results in "protest againstthe rules"
                const nextChar =
                    originalText[index + suggestion.suspect.length];
                const doesSuggestionEndWithWhiteSpace =
                    selectedSuggestion.endsWith(" ") ||
                    selectedSuggestion.endsWith("\n") ||
                    !selectedSuggestion;

                // check using regex if nextChar is alphanumeric and not punctuation
                if (
                    nextChar &&
                    nextChar.match(/^[0-9a-zA-Z]$/) &&
                    !doesSuggestionEndWithWhiteSpace
                ) {
                    result += " ";
                }
            } else {
                // use a substring equal to the suspect's length, but not the suspect itself
                // to preserve case
                result += originalText.slice(
                    index,
                    index + suggestion.suspect.length,
                );
            }

            index += suggestion.suspect?.length || 0;
            suggestionIndex++;
        } else {
            result += char;
            index++;
        }
    } while (index < originalText.length);

    // apply manual edits to result
    manualEdits.forEach((edit) => {
        const { rangeLength, rangeOffset } = edit;
        result =
            result.slice(0, rangeOffset) +
            edit.text +
            result.slice(rangeOffset + rangeLength);
    });

    return result;
};
