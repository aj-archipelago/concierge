import { Badge } from "@/components/ui/badge"; // Adjust the import path as necessary

const green = "text-green-500";
const red = "text-red-500";
const redBackground = "bg-red-200";
const greenBackground = "bg-green-200";
const bold = "font-bold";
const faded = "opacity-50";
const strikeThrough = "line-through";

export default function Suggestion({
    active,
    i,
    token,
    dismissed,
    hasBeenDeleted,
    onAcceptChange,
    setSuggestionIndex,
    onDismiss,
}) {
    let { suspect, suggestions, notes, accepted, suggestionIndex } = token;
    let changeMarkup;
    let title;

    const hasReplacement = suggestionIndex !== undefined;

    if (hasReplacement) {
        let displaySuspect = suspect;

        if (displaySuspect.trim().length === 0 && displaySuspect.length > 0) {
            displaySuspect = `"${displaySuspect.replace(/ /gm, "\u00a0")}"`;
        }

        let displaySuggestion = (
            suggestions[suggestionIndex || 0] || ""
        ).replace(/\n/gm, "(newline)");

        if (
            displaySuggestion.trim().length === 0 &&
            displaySuggestion.length > 0
        ) {
            displaySuggestion = `"${displaySuggestion.replace(/ /gm, "\u00a0")}"`;
        }

        if (accepted) {
            title = (
                <div>
                    <input
                        type="checkbox"
                        checked={accepted}
                        tabIndex="-1"
                        onChange={(e) => {
                            onAcceptChange(e.target.checked, i);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mr-2"
                    />
                    {!suggestions[suggestionIndex] && "Remove "}
                    <span
                        className={`${faded} ${redBackground} ${red} ${strikeThrough}`}
                    >
                        {displaySuspect.replace(/\n/gm, "(newline)")}
                    </span>
                    {suggestions[suggestionIndex] && (
                        <>
                            {suspect?.length > 0 ? "→ " : "Add "}
                            <span className={`${green} ${bold}`}>
                                {displaySuggestion}
                            </span>
                        </>
                    )}
                </div>
            );
        } else {
            title = (
                <div>
                    <input
                        type="checkbox"
                        checked={accepted}
                        tabIndex="-1"
                        onChange={(e) => {
                            onAcceptChange(e.target.checked, i);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mr-2"
                    />
                    {!suggestions[suggestionIndex] && "Don't remove "}
                    {suspect && (
                        <span className={`${red} ${bold}`}>
                            {displaySuspect.replace(/\n/gm, "(newline)")}
                        </span>
                    )}
                    {suggestions[suggestionIndex] && (
                        <>
                            {suspect?.length > 0 ? "→ " : "Don't add "}
                            <span
                                className={`${faded} ${greenBackground} ${green} ${strikeThrough}`}
                            >
                                {displaySuggestion}
                            </span>
                        </>
                    )}
                </div>
            );
        }
    } else {
        title = <span className={bold}>{suspect}</span>;
    }

    changeMarkup = (
        <>
            <div className="flex justify-between grow">
                <div className="grow px-3 py-2 text-lg font-bold">{title}</div>
                <div
                    className="text-end mb-3 text-gray-500"
                    style={{ width: 105, whiteSpace: "nowrap" }}
                >
                    <button
                        className="bg-transparent border-0 py-2 px-3 border-l border-b text-sm text-gray-600 bg-gray-300 rounded-bl-md"
                        onClick={(e) => {
                            onDismiss(true, false, i);
                            e.stopPropagation();
                        }}
                    >
                        <div className="flex gap-2 items-center">
                            Mark as read
                        </div>
                    </button>
                </div>
            </div>
            <p className="px-3">
                <small className="uppercase text-gray-500">Notes:</small>&nbsp;
                {notes}
                {!notes && <span className="text-gray-500">(None)</span>}
            </p>
            <div className="px-3">
                <div className="mb-2">
                    <small className="uppercase text-gray-500">
                        Replacements:
                    </small>
                </div>
                <span className={`${green} ${bold}`}>
                    {suggestions.map((s, index) =>
                        s === suspect ? null : (
                            <button
                                key={`suggestion-button-${index}`}
                                className="mr-2 bg-transparent border-0"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        setSuggestionIndex(i, index);
                                        onAcceptChange(true, i);
                                        e.stopPropagation();
                                    }
                                }}
                                onClick={(e) => {
                                    setSuggestionIndex(i, index);
                                    onAcceptChange(true, i);
                                    e.stopPropagation();
                                }}
                            >
                                <Badge
                                    className={`mb-1 ${index === suggestionIndex && accepted ? "bg-green-500" : "bg-gray-500"}`}
                                >
                                    {s.replace(/\n/gm, "(newline)")}
                                </Badge>
                            </button>
                        ),
                    )}
                    {suggestions.filter((s) => s !== suspect).length === 0 && (
                        <span className="mr-2 text-gray-500 font-normal">
                            (None)
                        </span>
                    )}
                </span>
            </div>
        </>
    );

    if (hasBeenDeleted) {
        return (
            <div className="opacity-50 text-gray-500 text-xs w-full px-2 pt-2 flex justify-between">
                <div className="italic mb-2">{title}</div>
                <div>Deleted</div>
            </div>
        );
    }

    if (dismissed) {
        return (
            <button
                className={`opacity-50 text-gray-500 text-xs w-full flex justify-between items-center bg-transparent border-0 px-3 py-2 ${active ? "active" : ""}`}
                onClick={() => onDismiss(false, false, i)}
            >
                <div className="text-muted">{title}</div>
                <div>Mark as unread</div>
            </button>
        );
    }

    return (
        <div
            id={`button-suggestion-${i}`}
            className={`cursor-pointer ${active ? "active" : ""}`}
        >
            <div
                className="grow mb-3"
                style={{ opacity: hasBeenDeleted ? 0.5 : 1 }}
            >
                {changeMarkup}
            </div>

            {notes !== "Suggested by AI" && (
                <div className="text-center mb-2">
                    <button
                        className="bg-transparent border-0 p-0 text-xs text-gray-500"
                        onClick={() => onDismiss(true, true, i)}
                    >
                        Mark all instances of <strong>"{suspect}"</strong> as
                        read
                    </button>
                </div>
            )}
        </div>
    );
}
