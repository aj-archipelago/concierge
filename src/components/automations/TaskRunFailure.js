"use client";

import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { getRunFailureDetails } from "./runUtils";

export default function TaskRunFailure({ run, showingPreviousReport = false }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const details = getRunFailureDetails(run);

    return (
        <section
            dir={direction}
            aria-label={t("colleagues.taskFailedTitle")}
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-100 sm:p-5"
        >
            <div className="flex items-start gap-3">
                <AlertCircle
                    className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                />
                <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold">
                        {t("colleagues.taskFailedTitle")}
                    </h3>
                    <p className="text-sm leading-6 text-amber-900 dark:text-amber-200">
                        {t("colleagues.taskFailedHelp")}
                    </p>
                    {showingPreviousReport && (
                        <p className="text-sm leading-6 text-amber-900 dark:text-amber-200">
                            {t("colleagues.showingPreviousReport")}
                        </p>
                    )}
                </div>
            </div>
            {details && (
                <details className="mt-3 min-w-0">
                    <summary className="min-h-10 cursor-pointer rounded-md py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                        {t("colleagues.technicalDetails")}
                    </summary>
                    <pre
                        dir="ltr"
                        className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white/70 p-3 text-start text-xs leading-5 text-gray-700 dark:bg-gray-950/60 dark:text-gray-300"
                    >
                        {details}
                    </pre>
                </details>
            )}
        </section>
    );
}
