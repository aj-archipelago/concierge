import { useCallback } from "react";
import Diff from "./Diff";
import StyleGuideDiff from "./StyleGuideDiff";

const DiffComponent = ({
    inputText,
    outputText,
    setSelectedText,
    type = "default",
}) => {
    const setSelectedTextCallback = useCallback(
        (text) => {
            setSelectedText(text);
        },
        [setSelectedText],
    );

    // Normalize quotes
    inputText = inputText.replace(/"|"|'|'/g, (match) =>
        match === "'" || match === "'" ? "'" : '"',
    );

    if (type === "style-guide") {
        return (
            <StyleGuideDiff
                styleGuideResult={outputText}
                setSelectedText={setSelectedTextCallback}
            />
        );
    }

    return (
        <Diff
            string1={inputText}
            string2={outputText}
            setSelectedText={setSelectedTextCallback}
        />
    );
};

export default DiffComponent;
