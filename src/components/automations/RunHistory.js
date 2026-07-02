"use client";

import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "./StatusBadge";
import {
    formatDate,
    getRunOutput,
    hasHtmlOutput,
    truncatePreview,
} from "./runUtils";

export default function RunHistory({
    runs,
    automationId,
    hasMore,
    isLoadingMore,
    onLoadMore,
}) {
    const { t } = useTranslation();

    return (
        <Card>
            <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t("Recent runs")}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
                {runs.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {t("No runs yet.")}
                    </div>
                ) : (
                    <>
                        {runs.map((run) => {
                            const output = getRunOutput(run);
                            const outputPreview =
                                truncatePreview(output) || t("No output yet.");
                            const htmlPreview = truncatePreview(
                                run.automation?.htmlOutputPreview,
                                180,
                            );
                            const runHref = `/automations/${encodeURIComponent(
                                automationId,
                            )}/runs/${encodeURIComponent(run._id)}`;

                            return (
                                <div
                                    key={run._id}
                                    className="rounded-md border border-gray-200 dark:border-gray-700 p-3"
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <a
                                            href={runHref}
                                            className="min-w-0 flex-1 text-start rounded-md transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 -m-1 p-1"
                                        >
                                            <div className="flex items-center gap-2">
                                                <StatusBadge
                                                    status={run.status}
                                                />
                                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                                    {formatDate(run.createdAt)}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                                                {outputPreview}
                                            </p>
                                            {htmlPreview && (
                                                <div className="mt-2 rounded-md bg-gray-50 dark:bg-gray-700 p-2 text-xs text-gray-600 dark:text-gray-300">
                                                    {htmlPreview}
                                                </div>
                                            )}
                                            <span className="mt-2 inline-flex text-sm text-sky-600 dark:text-sky-400 hover:underline">
                                                {t("View details")}
                                            </span>
                                        </a>
                                        {hasHtmlOutput(run) && (
                                            <a
                                                className="inline-flex shrink-0 items-center gap-1 text-sm text-sky-600 dark:text-sky-400 hover:underline"
                                                href={runHref}
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                                {t("View HTML")}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {hasMore && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onLoadMore}
                                disabled={isLoadingMore}
                            >
                                {isLoadingMore
                                    ? t("Loading...")
                                    : t("Load more")}
                            </Button>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
