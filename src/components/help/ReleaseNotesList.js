"use client";

import { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getReleaseNotes } from "../../content/help-content";
import { releaseNoteColorClasses, formatHelpDate } from "./categoryColors";
import MarkdownContent from "./MarkdownContent";
import classNames from "../../../app/utils/class-names";
import { LanguageContext } from "../../contexts/LanguageProvider";

export default function ReleaseNotesList({ initialItem }) {
    const { t, i18n } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
    const releaseNotes = useMemo(() => getReleaseNotes(lang), [lang]);

    const initialPage = useMemo(() => {
        if (!initialItem) return 0;
        const idx = releaseNotes.findIndex((n) => n.version === initialItem);
        return idx >= 0 ? idx : 0;
    }, [initialItem, releaseNotes]);

    const [currentPage, setCurrentPage] = useState(initialPage);
    const note = releaseNotes[currentPage];

    if (!note) {
        return (
            <p className="text-sm text-gray-500">{t("No release notes yet")}</p>
        );
    }

    return (
        <div
            dir={direction}
            className="flex flex-col sm:flex-row gap-4 sm:gap-6"
        >
            {/* Sidebar: horizontal scroll on mobile, vertical on desktop */}
            <div className="sm:w-48 sm:shrink-0">
                <ul className="flex flex-row sm:flex-col gap-1 sm:gap-0 sm:space-y-1 sm:sticky sm:top-4 overflow-x-auto sm:overflow-x-visible">
                    {releaseNotes.map((n, idx) => (
                        <li key={n.version} className="shrink-0 sm:shrink">
                            <button
                                onClick={() => setCurrentPage(idx)}
                                className={classNames(
                                    "w-full text-start rounded-lg px-3 py-2 transition-colors whitespace-nowrap sm:whitespace-normal",
                                    idx === currentPage
                                        ? "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
                                )}
                            >
                                <span className="block text-sm font-medium">
                                    v{n.version}
                                </span>
                                <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    {formatHelpDate(n.date)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${releaseNoteColorClasses}`}
                    >
                        v{note.version}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {note.date}
                    </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
                    {note.title}
                </h3>
                <MarkdownContent content={note.content} />
            </div>
        </div>
    );
}
