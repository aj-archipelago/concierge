"use client";

import React, { useEffect, useState } from "react";
import * as diff from "diff";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

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

function isSubstantiveChange(oldText, newText) {
    const normalize = (str) =>
        str
            .replace(/[""]/g, '"')
            .replace(/[\u0022\u201C\u201D]/g, '"')
            .replace(/[''`´]/g, "'")
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[‹›«»]/g, '"')
            .replace(/[‚„]/g, ",")
            .replace(/…/g, "...")
            .replace(/[—–]/g, "-")
            .replace(/ /g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&ldquo;/g, '"')
            .replace(/&rdquo;/g, '"')
            .replace(/&lsquo;/g, "'")
            .replace(/&rsquo;/g, "'")
            .replace(/&laquo;/g, '"')
            .replace(/&raquo;/g, '"');

    return normalize(oldText) !== normalize(newText);
}

const Diff = ({ string1 = "", string2 = "", setSelectedText }) => {
    const [diffGroups] = useState(() =>
        diff.diffWordsWithSpace(string1, string2),
    );
    const [activeChangeId, setActiveChangeId] = useState("change-0");
    const [groupedTokens, setGroupedTokens] = useState([]);

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
                    const newChangeGroup = {
                        type: "change",
                        removed: [],
                        added: [],
                        accepted: true,
                    };
                    groupedTokens.push(newChangeGroup);
                    lastGroupedToken = newChangeGroup;
                }

                if (added) {
                    lastGroupedToken.added.push(token.value);
                }

                if (removed) {
                    lastGroupedToken.removed.push(token.value);
                }

                // Check if the change is substantive
                if (
                    lastGroupedToken.removed.length > 0 &&
                    lastGroupedToken.added.length > 0
                ) {
                    const oldText = lastGroupedToken.removed.join("");
                    const newText = lastGroupedToken.added.join("");
                    if (!isSubstantiveChange(oldText, newText)) {
                        // If it's not substantive, remove this change group
                        groupedTokens.pop();
                        // If the previous token was text, we need to merge this non-substantive change with it
                        if (
                            groupedTokens.length > 0 &&
                            groupedTokens[groupedTokens.length - 1].type ===
                                "text"
                        ) {
                            groupedTokens[groupedTokens.length - 1].tokens.push(
                                { value: oldText },
                            );
                        } else {
                            // Otherwise, add it as a new text token
                            groupedTokens.push({
                                type: "text",
                                tokens: [{ value: oldText }],
                            });
                        }
                    }
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

    const handleTokenChange = (index, accepted) => {
        const newGroupedTokens = [...groupedTokens];
        newGroupedTokens[index].accepted = accepted;
        setGroupedTokens(newGroupedTokens);
    };

    useEffect(() => {
        if (setSelectedText) {
            setSelectedText(getFinalText(groupedTokens));
        }
    }, [groupedTokens, setSelectedText]);

    const changes = [];

    const tokens = groupedTokens.map((group, i) => {
        if (group.type === "change") {
            const changeId = `change-${i}`;

            changes.push({
                changeId,
                change: (
                    <Change
                        key={changeId}
                        changeId={changeId}
                        token={group}
                        onTokenChange={(accepted) =>
                            handleTokenChange(i, accepted)
                        }
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

    const { t } = useTranslation();
    return (
        <div className="ai-diff flex flex-col md:flex-row gap-4 h-full overflow-hidden">
            <div className="change-container flex-1 h-[300px] md:h-[600px] overflow-y-auto">
                <h6 className="mb-4">{t("Changes")}</h6>
                <ul className="list-none p-0">
                    {changes.map((c, i) => (
                        <li
                            key={`change-item-${i}`}
                            className="change-item"
                            onMouseEnter={() => {
                                const changeElement = document.getElementById(
                                    c.changeId,
                                );
                                const divElement =
                                    document.getElementById(
                                        "ai-change-preview",
                                    );

                                if (divElement) {
                                    divElement.scrollTop =
                                        changeElement.offsetTop - 200;
                                }

                                setActiveChangeId(c.changeId);
                            }}
                        >
                            {c.change}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="flex-1 h-[300px] md:h-[600px] overflow-y-auto">
                <h6 className="mb-4">{t("Changed Text")}</h6>
                <div id="ai-change-preview">{tokens}</div>
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
