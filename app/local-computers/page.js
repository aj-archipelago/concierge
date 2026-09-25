"use client";

import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import LocalComputers from "../../src/components/chat/LocalComputers";
import { LanguageContext } from "../../src/contexts/LanguageProvider";

export default function LocalComputersPage() {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    return (
        <div dir={direction} className="mx-auto w-full max-w-2xl p-4 sm:p-6">
            <h1 className="mb-5 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {t("Concierge Companion")}
            </h1>
            <LocalComputers />
        </div>
    );
}
