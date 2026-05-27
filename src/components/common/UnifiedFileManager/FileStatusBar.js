"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatFileSize } from "@/src/components/common/FileManager";

/**
 * FileStatusBar - displays file count, selection info, and total size.
 *
 * @param {Object} props
 * @param {number} props.fileCount - Number of files in current view
 * @param {number} props.totalFileCount - Total number of files across all folders
 * @param {number} props.selectedCount - Number of selected files
 * @param {Array} props.files - Files in current view (for computing total size)
 * @param {string} props.selectedPath - Currently selected folder path
 */
export default function FileStatusBar({
    fileCount = 0,
    totalFileCount = 0,
    selectedCount = 0,
    files = [],
    selectedPath = "",
}) {
    const { t } = useTranslation();

    const totalSize = useMemo(() => {
        return files.reduce((sum, f) => sum + (f?.size || 0), 0);
    }, [files]);

    return (
        <div className="flex items-center gap-4 px-3 py-1 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">
            <span>
                {fileCount} {fileCount === 1 ? t("file") : t("files")}
                {selectedPath !== "" &&
                    totalFileCount !== fileCount &&
                    ` (${totalFileCount} ${t("total")})`}
            </span>
            {selectedCount > 0 && (
                <span className="text-sky-600 dark:text-sky-400">
                    {selectedCount} {t("selected")}
                </span>
            )}
            {totalSize > 0 && (
                <span className="ms-auto tabular-nums">
                    {formatFileSize(totalSize)}
                </span>
            )}
        </div>
    );
}
