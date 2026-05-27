"use client";

import { useContext } from "react";
import { useTranslation } from "react-i18next";
import HelpGuidesList from "./HelpGuidesList";
import { LanguageContext } from "../../contexts/LanguageProvider";

export default function HelpPage() {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);

    return (
        <div dir={direction} className="p-4 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                {t("Help")}
            </h1>
            <HelpGuidesList />
        </div>
    );
}
