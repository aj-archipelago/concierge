"use client";

import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import AppCatalogSearchInput from "./AppCatalogSearchInput";

export default function AppLibraryControlBar({
    searchValue,
    onSearchChange,
    onClearSearch,
    searchPlaceholder,
    searchLabel,
    countLabel,
    sortValue,
    onSortChange,
    sortOptions = [],
    sortLabel,
    actions = null,
    className,
    searchClassName,
}) {
    const { t } = useTranslation();
    const showSort = Boolean(onSortChange && sortOptions.length > 0);
    const resolvedSortLabel = sortLabel || t("Sort:");

    return (
        <div
            className={cn(
                "mb-4 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800",
                className,
            )}
        >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <AppCatalogSearchInput
                    placeholder={searchPlaceholder}
                    label={searchLabel}
                    value={searchValue}
                    onChange={onSearchChange}
                    onClear={onClearSearch}
                    className={searchClassName}
                />
                <div className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
                    {countLabel}
                </div>
                {showSort && (
                    <label className="flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 sm:w-48">
                        <ArrowUpDown className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                        <span className="sr-only">{resolvedSortLabel}</span>
                        <select
                            value={sortValue}
                            onChange={onSortChange}
                            aria-label={resolvedSortLabel}
                            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-gray-800 outline-none dark:text-gray-100"
                        >
                            {sortOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {t(option.label)}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {actions && (
                    <div className="flex flex-col items-stretch gap-2 sm:ms-auto sm:flex-row sm:items-center">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}
