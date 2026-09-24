"use client";
import { useState, useEffect, useContext, useId } from "react";
import { useTranslation } from "react-i18next";
import { CurrentUserContext } from "../../App";
import { useColleagues, useAssistant } from "../../hooks/useColleagues";
export default function ColleagueSelect({ value, onChange, disabled = false }) {
    const { t } = useTranslation();
    const selectId = useId();
    const [text, setText] = useState("");
    const [query, setQuery] = useState("");
    const [offset, setOffset] = useState(0);
    useEffect(() => {
        const timer = setTimeout(() => {
            setQuery(text);
            setOffset(0);
        }, 200);
        return () => clearTimeout(timer);
    }, [text]);
    const {
        data: matches = [],
        page,
        isFetching,
    } = useColleagues({ query, offset, limit: 50 });
    const { data: selected } = useAssistant(value);
    const user = useContext(CurrentUserContext);
    const { data: personal } = useAssistant(user?.personalEntityId);
    const colleagues = [
        ...new Map(
            [
                ...matches,
                ...(personal ? [personal] : []),
                ...(selected ? [selected] : []),
            ].map((c) => [c.id, c]),
        ).values(),
    ];
    const personalId = colleagues.find((c) => c.kind === "personal")?.id || "";
    const personalName = colleagues.find((c) => c.kind === "personal")?.name;
    return (
        <div className="block space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
            <label htmlFor={selectId} className="block">
                {t("colleagues.assignedTo")}
            </label>
            <input
                type="search"
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-label={t("assistantDirectory.search")}
                placeholder={t("assistantDirectory.search")}
                disabled={disabled}
                className="min-h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <select
                id={selectId}
                value={value || personalId}
                onChange={(event) => onChange(event.target.value || null)}
                disabled={disabled}
                className="min-h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
                <option value={personalId}>
                    {personalName || t("colleagues.personalAssistant")}
                </option>
                {colleagues
                    .filter(
                        (c) =>
                            c.kind !== "personal" &&
                            (c.status !== "archived" || c.id === value),
                    )
                    .map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                            {c.status === "paused"
                                ? ` (${t("colleagues.paused")})`
                                : ""}
                        </option>
                    ))}
            </select>
            {(offset > 0 || page?.nextOffset != null) && (
                <span className="flex justify-between gap-2">
                    <button
                        type="button"
                        disabled={disabled || isFetching || !offset}
                        onClick={() => setOffset(Math.max(0, offset - 50))}
                        className="min-h-10 px-2 disabled:opacity-40"
                    >
                        {t("assistantDirectory.previous")}
                    </button>
                    <button
                        type="button"
                        disabled={
                            disabled || isFetching || page?.nextOffset == null
                        }
                        onClick={() => setOffset(page.nextOffset)}
                        className="min-h-10 px-2 disabled:opacity-40"
                    >
                        {t("assistantDirectory.next")}
                    </button>
                </span>
            )}
        </div>
    );
}
