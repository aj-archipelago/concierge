import React from "react";
import { Badge, Form } from "react-bootstrap";

const green = { color: "green" };
const red = { color: "red" };
const redBackground = { backgroundColor: "#fec4c0" };
const greenBackground = { backgroundColor: "#b5efdb" };
const bold = { fontWeight: "bold" };
const faded = { opacity: 0.5 };
const strikeThrough = { textDecoration: "line-through" };

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

        // if displaySuspect is all whitespace, surround it in quotes and use &nbsp;'s
        if (displaySuspect.trim().length === 0 && displaySuspect.length > 0) {
            displaySuspect = `"${displaySuspect.replace(/ /gm, "\u00a0")}"`;
        }

        let displaySuggestion = (
            suggestions[suggestionIndex || 0] || ""
        ).replace(/\n/gm, "(newline)");

        // if displaySuggestion is all whitespace, surround it in quotes and use &nbsp;'s
        if (
            displaySuggestion.trim().length === 0 &&
            displaySuggestion.length > 0
        ) {
            displaySuggestion = `"${displaySuggestion.replace(/ /gm, "\u00a0")}"`;
        }

        if (accepted) {
            title = (
                <div>
                    <Form.Check
                        checked={accepted}
                        tabIndex="-1"
                        onChange={(e) => {
                            onAcceptChange(e.target.checked, i);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        label={
                            <div>
                                {!suggestions[suggestionIndex] && "Remove "}
                                <span
                                    style={{
                                        ...faded,
                                        ...redBackground,
                                        ...red,
                                        ...strikeThrough,
                                    }}
                                >
                                    {displaySuspect.replace(
                                        /\n/gm,
                                        "(newline)",
                                    )}
                                </span>
                                {suggestions[suggestionIndex] && (
                                    <>
                                        {suspect?.length > 0 ? "→ " : "Add "}
                                        <span style={{ ...green, ...bold }}>
                                            {displaySuggestion}
                                        </span>
                                    </>
                                )}
                            </div>
                        }
                    />
                </div>
            );
        } else {
            title = (
                <div>
                    <Form.Check
                        checked={accepted}
                        tabIndex="-1"
                        onChange={(e) => {
                            onAcceptChange(e.target.checked, i);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        label={
                            <div>
                                {!suggestions[suggestionIndex] &&
                                    "Don't remove "}
                                {suspect && (
                                    <span style={{ ...red, ...bold }}>
                                        {displaySuspect.replace(
                                            /\n/gm,
                                            "(newline)",
                                        )}
                                    </span>
                                )}
                                {suggestions[suggestionIndex] && (
                                    <>
                                        {suspect?.length > 0
                                            ? "→ "
                                            : "Don't add "}
                                        <span
                                            style={{
                                                ...faded,
                                                ...greenBackground,
                                                ...green,
                                                ...strikeThrough,
                                            }}
                                        >
                                            {displaySuggestion}
                                        </span>
                                    </>
                                )}
                            </div>
                        }
                    />
                </div>
            );
        }
    } else {
        title = (
            <div>
                <span style={{ ...bold }}>{suspect}</span>
            </div>
        );
    }

    changeMarkup = (
        <>
            <div className="d-flex justify-content-between flex-grow-1">
                <div
                    className="flex-grow-1 px-3 py-2"
                    style={{ fontSize: 14, fontWeight: "bold" }}
                >
                    {title}
                </div>
                <div
                    className="text-end mb-3"
                    style={{ color: "#999", width: 105, whiteSpace: "nowrap" }}
                >
                    <div
                        className="bg-transparent border-0 py-2 px-3 border-start border-bottom"
                        style={{
                            fontSize: 12,
                            color: "#666",
                            backgroundColor: "#ccc",
                            borderEndStartRadius: 5,
                        }}
                        onClick={(e) => {
                            onDismiss(true, false, i);
                            e.stopPropagation();
                        }}
                    >
                        <div className="d-flex gap-2 align-items-center">
                            Mark as read
                        </div>
                    </div>
                </div>
            </div>
            <p className="px-3">
                <small style={{ textTransform: "uppercase", color: "#999" }}>
                    Notes:
                </small>
                &nbsp;
                {notes}
                {!notes && <span style={{ color: "#999" }}>(None)</span>}
            </p>
            <div className="px-3">
                <div className="mb-2">
                    <small
                        style={{ textTransform: "uppercase", color: "#999" }}
                    >
                        Replacements:
                    </small>
                </div>
                <span style={{ ...green, ...bold }}>
                    {suggestions.map((s, index) =>
                        s === suspect ? null : (
                            <button
                                key={`suggestion-button-${index}`}
                                className="me-2"
                                style={{
                                    padding: 0,
                                    border: 0,
                                    backgroundColor: "transparent",
                                }}
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
                                    style={{
                                        backgroundColor:
                                            index === suggestionIndex &&
                                            accepted
                                                ? "green"
                                                : "#999",
                                    }}
                                    className="mb-1"
                                    bg="fake"
                                >
                                    {s.replace(/\n/gm, "(newline)")}
                                </Badge>
                            </button>
                        ),
                    )}
                    {suggestions.filter((s) => s !== suspect).length === 0 && (
                        <span
                            className="me-2"
                            style={{ color: "#999", fontWeight: 400 }}
                        >
                            (None)
                        </span>
                    )}
                </span>
            </div>
        </>
    );

    if (hasBeenDeleted) {
        return (
            <div
                style={{
                    opacity: 0.5,
                    color: "#888",
                    fontSize: 12,
                    width: "100%",
                }}
                className="px-2 pt-2 d-flex justify-content-between deleted-style-guide-item"
            >
                <div className="text-italic mb-2">{title}</div>
                <div>Deleted</div>
            </div>
        );
    }

    if (dismissed) {
        return (
            <button
                style={{
                    opacity: 0.5,
                    color: "#888",
                    fontSize: 12,
                    width: "100%",
                }}
                onClick={() => onDismiss(false, false, i)}
                className={`d-flex justify-content-between align-items-center bg-transparent border-0 change-button ${active ? "active" : ""} px-3 py-2`}
            >
                <div className="text-muted">{title}</div>
                <div>Mark as unread</div>
            </button>
        );
    }

    return (
        <div
            id={`button-suggestion-${i}`}
            className={`change-button ${active ? "active" : ""}`}
            style={{ cursor: "pointer" }}
        >
            <div>
                <div
                    className="flex-grow-1 mb-3"
                    style={{ opacity: hasBeenDeleted ? 0.5 : 1 }}
                >
                    {changeMarkup}
                </div>

                {notes !== "Suggested by AI" && (
                    <div className="text-center mb-2">
                        <button
                            className="text-center bg-transparent border-0 p-0"
                            style={{ fontSize: 12, color: "#999" }}
                            onClick={() => onDismiss(true, true, i)}
                        >
                            Mark all instances of <strong>"{suspect}"</strong>{" "}
                            as read
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
