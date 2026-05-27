"use client";

import React from "react";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * Shared loading and error states for canvas tab content.
 * Used by ArticleTabContent (via Write), HtmlPreviewTabContent, and other tabs.
 *
 * @param {Object} props
 * @param {boolean} props.loading - Show loading spinner
 * @param {string|null} props.error - Error message (shows error UI with retry)
 * @param {function} [props.onRetry] - Retry handler for error state
 * @param {React.ReactNode} [props.children] - Content when not loading/error
 * @param {string} [props.loadingLabel] - Loading text (default: "Loading...")
 * @param {string} [props.retryLabel] - Retry button text (default: "Retry")
 */
export function TabContentLoader({
    loading,
    error,
    onRetry,
    children,
    loadingLabel = "Loading...",
    retryLabel = "Retry",
}) {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {loadingLabel}
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                <AlertCircle className="w-8 h-8 text-red-500" />
                <p className="text-sm text-red-500 dark:text-red-400 text-center">
                    {error}
                </p>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="text-sm text-sky-600 dark:text-sky-400 hover:underline"
                    >
                        {retryLabel}
                    </button>
                )}
            </div>
        );
    }

    return children ?? null;
}
