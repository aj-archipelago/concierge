import React from "react";
import { useTranslation } from "react-i18next";

const MermaidPlaceholder = React.memo(() => {
    const { t } = useTranslation();

    return (
        <div className="mermaid-placeholder my-3 px-2 sm:px-3 py-2 rounded-md border border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/30 flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            <div className="w-4 h-4 text-sky-500 dark:text-sky-400">
                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-sky-500 dark:border-t-sky-400 rounded-full animate-spin" />
            </div>
            <span className="font-medium">{t("Loading chart...")}</span>
        </div>
    );
});

MermaidPlaceholder.displayName = "MermaidPlaceholder";

export default MermaidPlaceholder;
