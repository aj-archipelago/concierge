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
    isFailedRun,
    truncatePreview,
} from "./runUtils";

export default function RunHistory({
    runs,
    automationId,
    hasMore,
    isLoadingMore,
    onLoadMore,
    embedded = false,
}) {
    const { t } = useTranslation();

    const list = (
        <div className={embedded ? "space-y-2" : "space-y-3"}>
            {runs.length === 0 ? (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t("No runs yet.")}
                </div>
            ) : (
                <>
                    {runs.map((run) => {
                        const output = getRunOutput(run);
                        const outputPreview = run.outputExpiredAt
                            ? t("automations.outputExpired")
                            : isFailedRun(run)
                              ? t("colleagues.taskFailedTitle")
                              : truncatePreview(
                                    output,
                                    embedded ? 160 : undefined,
                                ) || t("No output yet.");
                        const htmlPreview = truncatePreview(
                            run.automation?.htmlOutputPreview,
                            embedded ? 120 : 180,
                        );
                        const runHref = `/automations/${encodeURIComponent(
                            automationId,
                        )}/runs/${encodeURIComponent(run._id)}`;

                        return (
                            <div
                                key={run._id}
                                className="rounded-md border border-gray-200 dark:border-gray-700 p-2.5"
                            >
                                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                                    <a
                                        href={runHref}
                                        className="min-w-0 flex-1 text-start rounded-md transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 -m-1 p-1"
                                    >
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <StatusBadge status={run.status} />
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {formatDate(run.createdAt)}
                                            </span>
                                        </div>
                                        <p className="mt-1.5 text-xs text-gray-700 dark:text-gray-300">
                                            {outputPreview}
                                        </p>
                                        {htmlPreview && (
                                            <div className="mt-1.5 rounded-md bg-gray-50 dark:bg-gray-700 p-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                                                {htmlPreview}
                                            </div>
                                        )}
                                        <span className="mt-1.5 inline-flex text-xs text-sky-600 dark:text-sky-400 hover:underline">
                                            {t("View details")}
                                        </span>
                                    </a>
                                    {hasHtmlOutput(run) && (
                                        <a
                                            className="inline-flex shrink-0 items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"
                                            href={runHref}
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
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
                            className="h-8 min-h-8 px-2.5 text-xs"
                            onClick={onLoadMore}
                            disabled={isLoadingMore}
                        >
                            {isLoadingMore ? t("Loading...") : t("Load more")}
                        </Button>
                    )}
                </>
            )}
        </div>
    );

    if (embedded) {
        return list;
    }

    return (
        <Card>
            <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t("Recent runs")}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">{list}</CardContent>
        </Card>
    );
}
