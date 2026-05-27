"use client";

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useContext, useState, useMemo } from "react";
import { Search } from "lucide-react";
import { getHelpGuides } from "../../content/help-guides";
import { categoryColorClasses, getCategoryLabel } from "./categoryColors";
import classNames from "../../../app/utils/class-names";
import { LanguageContext } from "../../contexts/LanguageProvider";

const categoryDescriptionKeys = {
    "getting-started": "help_desc_getting_started",
    "using-chat": "help_desc_using_chat",
    "translating-content": "help_desc_translating_content",
    "transcribing-audio-video": "help_desc_transcribing_audio_video",
    "writing-with-ai": "help_desc_writing_with_ai",
    "creating-using-applets": "help_desc_creating_using_applets",
    "working-with-media": "help_desc_working_with_media",
    "using-docked-chat": "help_desc_using_docked_chat",
    "managing-apps": "help_desc_managing_apps",
    "keyboard-shortcuts": "help_desc_keyboard_shortcuts",
    "using-skills": "help_desc_using_skills",
    "using-connectors": "help_desc_using_connectors",
    "using-automations": "help_desc_using_automations",
};

function getCategoryDescription(t, id) {
    const key = categoryDescriptionKeys[id];
    if (!key) return "";
    const v = t(key);
    return v === key ? "" : v;
}

export default function HelpGuidesList() {
    const { t, i18n } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [activeTag, setActiveTag] = useState(null);

    const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
    const guides = useMemo(() => getHelpGuides(lang), [lang]);

    const categories = useMemo(
        () => [...new Set(guides.map((g) => g.category))],
        [guides],
    );

    const filtered = useMemo(() => {
        return guides.filter((g) => {
            const matchesTag = !activeTag || g.category === activeTag;
            const q = query.trim().toLowerCase();
            const matchesQuery =
                !q ||
                g.title.toLowerCase().includes(q) ||
                getCategoryDescription(t, g.id).toLowerCase().includes(q) ||
                g.category.toLowerCase().includes(q);
            return matchesTag && matchesQuery;
        });
    }, [guides, query, activeTag, t]);

    return (
        <div dir={direction} className="space-y-4">
            <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("Search guides…")}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setActiveTag(null)}
                    className={classNames(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        !activeTag
                            ? "bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600",
                    )}
                >
                    {t("All")}
                </button>
                {categories.map((cat) => (
                    <button
                        key={cat}
                        onClick={() =>
                            setActiveTag(activeTag === cat ? null : cat)
                        }
                        className={classNames(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                            activeTag === cat
                                ? categoryColorClasses[cat] ||
                                      categoryColorClasses.general
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600",
                        )}
                    >
                        {t(getCategoryLabel(cat))}
                    </button>
                ))}
            </div>

            {filtered.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                    {t("No guides found")}
                </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered.map((guide) => (
                    <Card
                        key={guide.id}
                        className="cursor-pointer hover:shadow-md hover:border-sky-200 dark:hover:border-sky-800 transition-all"
                        onClick={() => router.push(`/help/guides/${guide.id}`)}
                    >
                        <CardHeader className="p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryColorClasses[guide.category] || categoryColorClasses.general}`}
                                >
                                    {t(getCategoryLabel(guide.category))}
                                </span>
                            </div>
                            <CardTitle className="text-base">
                                {guide.title}
                            </CardTitle>
                            <CardDescription>
                                {getCategoryDescription(t, guide.id)}
                            </CardDescription>
                        </CardHeader>
                    </Card>
                ))}
            </div>
        </div>
    );
}
