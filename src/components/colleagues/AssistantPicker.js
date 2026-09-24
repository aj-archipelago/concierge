"use client";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAssistantDirectory } from "../../hooks/useColleagues";
import { LanguageContext } from "../../contexts/LanguageProvider";
import ColleagueAvatar from "./ColleagueAvatar";

export default function AssistantPicker({ onSelect }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
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
    const result = useAssistantDirectory({
        query,
        offset,
        limit: 20,
        status: "active",
    });
    return (
        <div dir={direction} className="min-w-0 space-y-1 p-1">
            <input
                type="search"
                aria-label={t("assistantDirectory.search")}
                placeholder={t("assistantDirectory.search")}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="sticky top-0 min-h-10 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            {result.data?.colleagues.map((assistant) => (
                <button
                    type="button"
                    role="menuitem"
                    key={assistant.id}
                    onClick={() => onSelect(assistant)}
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm text-gray-800 hover:bg-gray-100 focus:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
                >
                    <ColleagueAvatar
                        entityId={assistant.id}
                        variant={assistant.avatar}
                        className="h-6 w-6 shrink-0"
                        animated={false}
                    />
                    <span className="min-w-0 break-words">
                        {assistant.name}
                    </span>
                </button>
            ))}
            {result.isLoading && (
                <p role="status" className="p-2 text-sm">
                    {t("assistantDirectory.loading")}
                </p>
            )}
            {result.error && (
                <p role="alert" className="p-2 text-sm">
                    {t("colleagues.error")}
                </p>
            )}
            {result.data?.total === 0 && (
                <p role="status" className="p-2 text-sm">
                    {t("assistantDirectory.noMatches")}
                </p>
            )}
            <div className="flex justify-between gap-2 text-sm">
                <button
                    type="button"
                    disabled={!offset || result.isFetching}
                    onClick={() => setOffset(Math.max(0, offset - 20))}
                    className="min-h-10 px-2 disabled:opacity-40"
                >
                    {t("assistantDirectory.previous")}
                </button>
                <button
                    type="button"
                    disabled={
                        result.data?.nextOffset == null || result.isFetching
                    }
                    onClick={() => setOffset(result.data.nextOffset)}
                    className="min-h-10 px-2 disabled:opacity-40"
                >
                    {t("assistantDirectory.next")}
                </button>
            </div>
        </div>
    );
}
