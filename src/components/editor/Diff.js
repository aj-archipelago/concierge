"use client";

import React, { useEffect, useState } from "react";
import * as diff from "diff";
import PropTypes from "prop-types";
import { Form } from "react-bootstrap";

if (typeof window !== "undefined") {
    window.diff = diff;
}

const green = { color: "green" };
const red = { color: "red" };
const redBackground = { backgroundColor: "#fec4c0" };
const greenBackground = { backgroundColor: "#b5efdb" };
const bold = { fontWeight: "bold" };
const faded = { opacity: 0.5 };
const strikeThrough = { textDecoration: "line-through" };
const highlight = { backgroundColor: "yellow" };

const ChangeToken = ({ active, changeId, token }) => {
    let { added, removed, accepted } = token;

    const addedValue = added.join(" ");
    const removedValue = removed.join(" ");

    if (accepted) {
        return (
            <span id={changeId}>
                {removedValue && (
                    <mark
                        style={{
                            ...red,
                            ...redBackground,
                            ...strikeThrough,
                            ...faded,
                            ...(active && !addedValue ? highlight : {}),
                        }}
                    >
                        {removedValue}
                    </mark>
                )}
                {addedValue && (
                    <span
                        style={{
                            ...green,
                            ...greenBackground,
                            ...bold,
                            ...(active ? highlight : {}),
                        }}
                    >
                        {addedValue}
                    </span>
                )}
            </span>
        );
    } else {
        return (
            <span id={changeId}>
                {removedValue && (
                    <span
                        style={{
                            ...red,
                            ...bold,
                            ...(active ? highlight : {}),
                        }}
                    >
                        {removedValue}
                    </span>
                )}
                {addedValue && (
                    <span
                        style={{
                            ...green,
                            greenBackground,
                            ...strikeThrough,
                            ...faded,
                            ...(active && !removedValue ? highlight : {}),
                        }}
                    >
                        {addedValue}
                    </span>
                )}
            </span>
        );
    }
};

const Change = ({ token, onTokenChange }) => {
    const ClickableToken = ({
        children,
        className = "change-inline",
        changeId,
    }) => {
        return (
            <button
                style={{ padding: 10 }}
                id={changeId}
                className={className}
                onClick={(e) => {
                    onTokenChange(!accepted);
                }}
            >
                {children}
            </button>
        );
    };

    let { added, removed, accepted } = token;

    const addedValue = added.join(" ");
    const removedValue = removed.join(" ");

    let changeMarkup;

    if (addedValue && removedValue) {
        if (accepted) {
            changeMarkup = (
                <>
                    <span style={{ ...red, ...strikeThrough }}>
                        {removedValue}
                    </span>{" "}
                    →&nbsp;
                    <span style={{ ...green, ...bold }}>{addedValue}</span>
                </>
            );
        } else {
            changeMarkup = (
                <>
                    <span style={{ ...red, ...bold }}>{removedValue}</span>{" "}
                    →&nbsp;
                    <span style={{ ...green, ...strikeThrough }}>
                        {addedValue}
                    </span>
                </>
            );
        }
    } else if (addedValue) {
        if (accepted) {
            changeMarkup = (
                <>
                    Add{" "}
                    <span style={{ ...green, ...bold }}>"{addedValue}"</span>
                </>
            );
        } else {
            changeMarkup = (
                <>
                    Add <span style={{ ...green }}>"{addedValue}"</span>
                </>
            );
        }
    } else if (removedValue) {
        if (accepted) {
            changeMarkup = (
                <>
                    Remove{" "}
                    <span style={{ ...red, ...strikeThrough }}>
                        "{removedValue}"
                    </span>
                </>
            );
        } else {
            changeMarkup = (
                <>
                    Remove{" "}
                    <span style={{ ...red, ...strikeThrough }}>
                        "{removedValue}"
                    </span>
                </>
            );
        }
    }

    return (
        <ClickableToken className="change-button w-100 mb-3 d-flex gap-2">
            <Form.Check defaultChecked={accepted} tabIndex="-1" />
            <div>{changeMarkup}</div>
        </ClickableToken>
    );
};

const getFinalText = (groupedTokens) => {
    return groupedTokens
        .map((group) => {
            if (group.type === "change") {
                const { added, removed, accepted } = group;

                if (accepted) {
                    return added.map((a) => a.trim()).join(" ");
                } else {
                    return removed.map((r) => r.trim()).join(" ");
                }
            } else {
                return group.tokens.map((t) => t.value?.trim()).join(" ");
            }
        })
        .join(" ");
};

const Diff = ({ string1 = "", string2 = "", setSelectedText }) => {
    // normalize quotes in string2
    string2 = string2.replace(/“|”/g, '"');
    // normalize single quotes in string2
    string2 = string2.replace(/‘|’/g, "'");
    // normalize html spaces in string2 and string1
    string2 = string2.replace(/&nbsp;/g, " ");
    string1 = string1.replace(/&nbsp;/g, " ");

    const [diffGroups] = useState(diff.diffWords(string1, string2));
    const [activeChangeId, setActiveChangeId] = useState("change-0");
    const [groupedTokens, setGroupedTokens] = useState([]);

    useEffect(() => {
        if (setSelectedText) {
            setSelectedText(getFinalText(groupedTokens));
        }
    }, [groupedTokens, setSelectedText]);

    useEffect(() => {
        const groupedTokens = [];

        diffGroups.forEach((token, i) => {
            let { value, added, removed } = token;
            const isChange = added || removed;

            let lastGroupedToken = groupedTokens[groupedTokens.length - 1];
            const nextToken = diffGroups[i + 1];
            const isNextTokenChange = nextToken?.added || nextToken?.removed;

            const isWhiteSpaceBetweenChanges =
                value === " " &&
                lastGroupedToken?.type === "change" &&
                isNextTokenChange;

            if (isWhiteSpaceBetweenChanges) {
                return null;
            }

            if (isChange) {
                if (
                    groupedTokens.length === 0 ||
                    lastGroupedToken.type !== "change"
                ) {
                    groupedTokens.push({
                        type: "change",
                        removed: [],
                        added: [],
                        accepted: true,
                    });

                    lastGroupedToken = groupedTokens[groupedTokens.length - 1];
                }

                if (added) {
                    lastGroupedToken.added.push(token.value);
                }

                if (removed) {
                    lastGroupedToken.removed.push(token.value);
                }
            } else {
                if (
                    groupedTokens.length === 0 ||
                    lastGroupedToken.type !== "text"
                ) {
                    groupedTokens.push({
                        type: "text",
                        tokens: [],
                    });

                    lastGroupedToken = groupedTokens[groupedTokens.length - 1];
                }

                lastGroupedToken.tokens.push(token);
            }
        });

        setGroupedTokens(groupedTokens);
    }, [diffGroups]);

    const changes = [];

    const tokens = groupedTokens.map((group, i) => {
        if (group.type === "change") {
            const changeId = `change-${i}`;

            const handleTokenChange = (accepted) => {
                const newGroupedTokens = [...groupedTokens];
                newGroupedTokens[i].accepted = accepted;

                setGroupedTokens(newGroupedTokens);
            };

            changes.push({
                changeId,
                change: (
                    <Change
                        changeId={changeId}
                        token={group}
                        onTokenChange={handleTokenChange}
                    />
                ),
            });

            return (
                <span className="change-group">
                    <ChangeToken
                        active={activeChangeId === changeId}
                        changeId={changeId}
                        token={group}
                    />
                </span>
            );
        } else {
            const value = group.tokens.map((t) => t.value).join(" ");
            const paragraphs = value.split("\n\n");

            return paragraphs.map((line, i) => {
                if (i === paragraphs.length - 1) {
                    return <>{line}</>;
                } else {
                    return (
                        <>
                            {line}
                            <br></br>
                            <br></br>
                        </>
                    );
                }
            });
        }
    });

    return (
        <div className="ai-diff" style={{ gap: 10 }}>
            <div className="change-container">
                <div style={{ flexBasis: 300 }}>
                    <h6>Changes</h6>
                    <ul
                        style={{
                            paddingLeft: 0,
                            height: "100%",
                            overflowY: "auto",
                        }}
                    >
                        {changes
                            .filter((c) => c)
                            .map((c, i) => (
                                <li
                                    className="change-item"
                                    key={`change-item-${i}`}
                                    onMouseEnter={(e) => {
                                        const changeElement =
                                            document.getElementById(c.changeId);
                                        const divElement =
                                            document.getElementById(
                                                "ai-change-preview",
                                            );

                                        divElement.scrollTop =
                                            changeElement.offsetTop - 200;

                                        setActiveChangeId(c.changeId);
                                    }}
                                >
                                    {c.change}
                                </li>
                            ))}
                    </ul>
                </div>
                <div style={{ flex: 1 }}>
                    <h6 style={{ marginBottom: 15 }}>Changed Text</h6>
                    <div id="ai-change-preview">{tokens}</div>
                </div>
            </div>
        </div>
    );
};

Diff.propTypes = {
    string1: PropTypes.string,
    string2: PropTypes.string,
    mode: PropTypes.oneOf(["characters", "words"]),
};

export default Diff;
