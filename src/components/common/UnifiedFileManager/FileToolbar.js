"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Folder,
    List,
    LayoutGrid,
    Upload,
    RefreshCw,
    Search,
} from "lucide-react";
import FilterInput from "@/src/components/common/FilterInput";

/**
 * Get a human-readable breadcrumb label for a path segment.
 */
function getBreadcrumbLabel(segment, chatTitleMap, t) {
    if (segment === "All Files") return t("All Files");
    if (segment === "global") return t("Global Files");
    if (segment === "chats") return t("Chat Files");
    if (segment === "workspaces") return t("Workspaces");
    if (chatTitleMap && chatTitleMap[segment]) {
        return chatTitleMap[segment];
    }
    return segment;
}

/**
 * FileToolbar - breadcrumb navigation, search, view toggle, upload, refresh.
 *
 * @param {Object} props
 * @param {Array} props.breadcrumbs - Array of { label, path } from useFolderNavigation
 * @param {Function} props.onNavigate - Navigate to a breadcrumb path
 * @param {string} props.filterText - Current filter text
 * @param {Function} props.onFilterChange - Set filter text
 * @param {string} props.viewMode - "list" or "grid"
 * @param {Function} props.onViewModeChange - Set view mode
 * @param {Function} props.onUploadClick - Open upload dialog
 * @param {Function} props.onRefresh - Reload files
 * @param {Object} props.chatTitleMap - Map of chatId -> title
 * @param {boolean} props.isMobile - Whether to use the mobile toolbar layout
 * @param {boolean} props.showMobileFolders - Whether the mobile folder panel is open
 * @param {Function} props.onToggleMobileFolders - Toggle the mobile folder panel
 */
export default function FileToolbar({
    breadcrumbs = [],
    onNavigate,
    filterText = "",
    onFilterChange,
    viewMode = "list",
    onViewModeChange,
    onUploadClick,
    onRefresh,
    chatTitleMap = {},
    isMobile = false,
    showMobileFolders = false,
    onToggleMobileFolders,
}) {
    const { t } = useTranslation();
    const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refreshTimerRef = useRef(null);
    const currentCrumb = breadcrumbs[breadcrumbs.length - 1];
    const currentLabel = currentCrumb
        ? getBreadcrumbLabel(currentCrumb.label, chatTitleMap, t)
        : t("All Files");
    const getCrumbLabel = (crumb) =>
        getBreadcrumbLabel(crumb.label, chatTitleMap, t);

    useEffect(() => {
        return () => {
            if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current);
            }
        };
    }, []);

    const handleRefreshClick = async () => {
        if (!onRefresh || isRefreshing) return;

        setIsRefreshing(true);
        const startedAt = Date.now();
        try {
            await onRefresh();
        } finally {
            const elapsed = Date.now() - startedAt;
            if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current);
            }
            refreshTimerRef.current = window.setTimeout(
                () => setIsRefreshing(false),
                Math.max(0, 450 - elapsed),
            );
        }
    };

    if (isMobile) {
        const showMobileFilter = isMobileFilterOpen || Boolean(filterText);

        return (
            <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50/50 px-2.5 py-2.5 dark:border-gray-700 dark:bg-gray-900/50">
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        type="button"
                        onClick={onToggleMobileFolders}
                        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                        <Folder className="h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                        <span className="min-w-0 truncate font-medium">
                            {currentLabel}
                        </span>
                        {showMobileFolders ? (
                            <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        ) : (
                            <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        )}
                    </button>

                    <button
                        onClick={() => setIsMobileFilterOpen((open) => !open)}
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                            showMobileFilter
                                ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50"
                                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                        }`}
                        title={t("Search")}
                        aria-label={t("Search")}
                        aria-pressed={showMobileFilter}
                        type="button"
                    >
                        <Search className="h-4 w-4" />
                    </button>

                    {onUploadClick && (
                        <button
                            onClick={onUploadClick}
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                            title={t("Upload")}
                            aria-label={t("Upload")}
                            type="button"
                        >
                            <Upload className="w-4 h-4 text-gray-500" />
                        </button>
                    )}

                    {onRefresh && (
                        <button
                            onClick={handleRefreshClick}
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                            title={t("Refresh")}
                            aria-label={t("Refresh")}
                            aria-busy={isRefreshing}
                            disabled={isRefreshing}
                            type="button"
                        >
                            <RefreshCw
                                className={`h-4 w-4 text-gray-500 ${
                                    isRefreshing ? "animate-spin" : ""
                                }`}
                            />
                        </button>
                    )}
                </div>

                {showMobileFilter && (
                    <FilterInput
                        value={filterText}
                        onChange={onFilterChange}
                        onClear={() => {
                            onFilterChange("");
                            setIsMobileFilterOpen(false);
                        }}
                        placeholder={t("Filter files...")}
                        className="h-10 text-sm"
                        autoFocus
                    />
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 min-w-0 flex-shrink-0">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-0.5 min-w-0 flex-shrink overflow-hidden text-sm">
                {breadcrumbs.map((crumb, idx) => (
                    <span
                        key={crumb.path}
                        className="flex items-center gap-0.5 min-w-0"
                    >
                        {idx > 0 && (
                            <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        )}
                        {idx < breadcrumbs.length - 1 ? (
                            <button
                                onClick={() => onNavigate(crumb.path)}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 truncate max-w-[120px] transition-colors"
                                title={getCrumbLabel(crumb)}
                            >
                                {getCrumbLabel(crumb)}
                            </button>
                        ) : (
                            <span
                                className="text-gray-700 dark:text-gray-200 font-medium truncate max-w-[160px]"
                                title={getCrumbLabel(crumb)}
                            >
                                {getCrumbLabel(crumb)}
                            </span>
                        )}
                    </span>
                ))}
            </nav>

            {/* Spacer */}
            <div className="flex-1 min-w-0" />

            {/* Search */}
            <div className="w-56 lg:w-72 flex-shrink-0">
                <FilterInput
                    value={filterText}
                    onChange={onFilterChange}
                    onClear={() => onFilterChange("")}
                    placeholder={t("Filter files...")}
                    className="h-10 text-base"
                />
            </div>

            {/* View toggle */}
            <div className="flex h-10 items-center border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden flex-shrink-0">
                <button
                    onClick={() => onViewModeChange("list")}
                    className={`flex h-full w-9 items-center justify-center transition-colors ${
                        viewMode === "list"
                            ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    title={t("List view")}
                >
                    <List className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => onViewModeChange("grid")}
                    className={`flex h-full w-9 items-center justify-center transition-colors ${
                        viewMode === "grid"
                            ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    title={t("Grid view")}
                >
                    <LayoutGrid className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Upload */}
            {onUploadClick && (
                <button
                    onClick={onUploadClick}
                    className="flex h-10 w-10 items-center justify-center rounded transition-colors flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800"
                    title={t("Upload")}
                >
                    <Upload className="w-4 h-4 text-gray-500" />
                </button>
            )}

            {/* Refresh */}
            {onRefresh && (
                <button
                    onClick={handleRefreshClick}
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded transition-colors hover:bg-gray-100 disabled:cursor-default dark:hover:bg-gray-800"
                    title={t("Refresh")}
                    aria-label={t("Refresh")}
                    aria-busy={isRefreshing}
                    disabled={isRefreshing}
                >
                    <RefreshCw
                        className={`h-4 w-4 text-gray-500 ${
                            isRefreshing ? "animate-spin" : ""
                        }`}
                    />
                </button>
            )}
        </div>
    );
}
