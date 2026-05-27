"use client";

import { useContext } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { getHelpGuide } from "../../content/help-guides";
import {
    categoryColorClasses,
    getCategoryLabel,
    formatHelpDate,
} from "./categoryColors";
import MarkdownContent from "./MarkdownContent";
import { LanguageContext } from "../../contexts/LanguageProvider";

export default function GuidePage({ guideId }) {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const { direction } = useContext(LanguageContext);
    const BackIcon = direction === "rtl" ? ArrowRight : ArrowLeft;
    const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
    const guide = getHelpGuide(lang, guideId);

    if (!guide) {
        return (
            <div dir={direction} className="p-4 max-w-4xl mx-auto">
                <p className="text-gray-500 dark:text-gray-400">
                    {t("Guide not found")}
                </p>
                <button
                    className="mt-4 text-sm text-sky-500 hover:text-sky-600 flex items-center gap-1"
                    onClick={() => router.push("/help")}
                >
                    <BackIcon className="h-4 w-4" />
                    {t("Back to Help")}
                </button>
            </div>
        );
    }

    return (
        <div dir={direction} className="p-4 max-w-4xl mx-auto">
            <button
                className="mb-4 text-sm text-sky-500 hover:text-sky-600 flex items-center gap-1"
                onClick={() => router.push("/help")}
            >
                <BackIcon className="h-4 w-4" />
                {t("Back to Help")}
            </button>
            <div className="flex items-center gap-2 mb-4">
                <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryColorClasses[guide.category] || categoryColorClasses.general}`}
                >
                    {t(getCategoryLabel(guide.category))}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatHelpDate(guide.date)}
                </span>
            </div>
            <MarkdownContent content={guide.content} />
        </div>
    );
}
