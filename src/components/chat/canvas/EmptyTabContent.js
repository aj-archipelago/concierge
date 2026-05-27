"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { FileText, FileCode, Loader2 } from "lucide-react";
import CanvasFileBrowser from "./CanvasFileBrowser";

/**
 * EmptyTabContent - Empty-tab home screen.
 * Renders the file browser alongside doc-creation choices. The file browser is
 * intentionally only reachable from here (via the "+" tab) — there is no
 * persistent file-browser sidebar in the canvas chrome.
 */
export default function EmptyTabContent({
    isMobile,
    onFileSelect,
    onNewArticle,
    onCreateApplet,
    isGeneratingApplet,
    chatTitleMap,
    refreshKey,
}) {
    const { t } = useTranslation();

    const browser = onFileSelect ? (
        <div
            className={`${isMobile ? "h-1/2 border-b" : "w-[260px] border-r"} border-gray-200 dark:border-gray-700 flex flex-col min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-900/40`}
        >
            <CanvasFileBrowser
                onFileSelect={onFileSelect}
                containerHeight="100%"
                chatTitleMap={chatTitleMap}
                refreshKey={refreshKey}
            />
        </div>
    ) : null;

    const choices = (
        <div className="flex-1 min-h-0 flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-6 max-w-md text-center">
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {t("Start something new")}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t("empty_canvas_subtitle")}
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                    <button
                        onClick={onNewArticle}
                        disabled={!onNewArticle}
                        className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-sky-500 dark:hover:border-sky-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FileText className="w-8 h-8 mb-2 text-gray-400 dark:text-gray-500" />
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t("New Article")}
                        </p>
                    </button>
                    <button
                        onClick={onCreateApplet}
                        disabled={!onCreateApplet || isGeneratingApplet}
                        className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-sky-500 dark:hover:border-sky-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGeneratingApplet ? (
                            <Loader2 className="w-8 h-8 mb-2 text-gray-400 dark:text-gray-500 animate-spin" />
                        ) : (
                            <FileCode className="w-8 h-8 mb-2 text-gray-400 dark:text-gray-500" />
                        )}
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t("New Applet")}
                        </p>
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div
            className={`flex ${isMobile ? "flex-col" : "flex-row"} h-full min-h-0 overflow-hidden`}
        >
            {browser}
            {choices}
        </div>
    );
}
