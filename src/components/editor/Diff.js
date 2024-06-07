"use client";

import React, { useEffect, useState } from "react";
import * as diff from "diff";
import PropTypes from "prop-types";

if (typeof window !== "undefined") {
    window.diff = diff;
}

const ChangeToken = ({ active, changeId, token }) => {
    let { added, removed, accepted } = token;

    const addedValue = added.join(" ");
    const removedValue = removed.join(" ");

    if (accepted) {
        return (
            <span id={changeId}>
                {removedValue && (
                    <mark
                        className={`text-red-500 bg-red-200 line-through opacity-50 ${
                            active && !addedValue ? "bg-yellow-300" : ""
                        }`}
                    >
                        {removedValue}
                    </mark>
                )}
                {addedValue && (
                    <span
                        className={`text-green-500 bg-green-200 font-bold ${
                            active ? "bg-yellow-300" : ""
                        }`}
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
                        className={`text-red-500 font-bold ${
                            active ? "bg-yellow-300" : ""
                        }`}
                    >
                        {removedValue}
                    </span>
                )}
                {addedValue && (
                    <span
                        className={`text-green-500 bg-green-200 line-through opacity-50 ${
                            active && !removedValue ? "bg-yellow-300" : ""
                        }`}
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
                id={changeId}
                className={`${className} p-2 w-full mb-3 flex gap-2`}
                onClick={(e) => {
                    onTokenChange(!token.accepted);
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
                    <span className="text-red-500 line-through">
                        {removedValue}
                    </span>{" "}
                    →&nbsp;
                    <span className="text-green-500 font-bold">
                        {addedValue}
                    </span>
                </>
            );
        } else {
            changeMarkup = (
                <>
                    <span className="text-red-500 font-bold">
                        {removedValue}
                    </span>{" "}
                    →&nbsp;
                    <span className="text-green-500 line-through">
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
                    <span className="text-green-500 font-bold">
                        "{addedValue}"
                    </span>
                </>
            );
        } else {
            changeMarkup = (
                <>
                    Add <span className="text-green-500">"{addedValue}"</span>
                </>
            );
        }
    } else if (removedValue) {
        if (accepted) {
            changeMarkup = (
                <>
                    Remove{" "}
                    <span className="text-red-500 line-through">
                        "{removedValue}"
                    </span>
                </>
            );
        } else {
            changeMarkup = (
                <>
                    Remove{" "}
                    <span className="text-red-500 line-through">
                        "{removedValue}"
                    </span>
                </>
            );
        }
    }

    return (
        <ClickableToken className="change-button">
            <input type="checkbox" defaultChecked={accepted} tabIndex="-1" />
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
                        key={changeId}
                        changeId={changeId}
                        token={group}
                        onTokenChange={handleTokenChange}
                    />
                ),
            });

            return (
                <span key={changeId} className="change-group">
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
                    return <React.Fragment key={i}>{line}</React.Fragment>;
                } else {
                    return (
                        <React.Fragment key={i}>
                            {line}
                            <br />
                            <br />
                        </React.Fragment>
                    );
                }
            });
        }
    });

    return (
        <div className="ai-diff flex gap-4">
            <div className="change-container flex flex-col">
                <div className="flex-1" style={{ flexBasis: 300 }}>
                    <h6>Changes</h6>
                    <ul className="list-none p-0 h-full overflow-y-auto">
                        {changes.map((c, i) => (
                            <li
                                key={`change-item-${i}`}
                                className="change-item"
                                onMouseEnter={() => {
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
                <div className="flex-1">
                    <h6 className="mb-4">Changed Text</h6>
                    <div id="ai-change-preview">{tokens}</div>
                </div>
            </div>
        </div>
    );
};

Diff.propTypes = {
    string1: PropTypes.string,
    string2: PropTypes.string,
    setSelectedText: PropTypes.func,
};

export default Diff;
