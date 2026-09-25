"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ChevronDown,
    ExternalLink,
    Loader2,
    Pencil,
    Play,
    Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import classNames from "../../../app/utils/class-names";
import {
    useAutomation,
    useAutomationRuns,
    useRunAutomation,
} from "../../hooks/useAutomations";
import ShareButton from "@/components/share/ShareButton";
import AutomationHtmlFrame from "./AutomationHtmlFrame";
import RunHistory from "./RunHistory";
import StatusBadge from "./StatusBadge";
import TaskRunFailure from "./TaskRunFailure";
import TaskRunWaiting from "./TaskRunWaiting";
import { renderChatMarkdownMessage } from "../chat/chatMarkdownRenderer";
import {
    formatDate,
    getRunOutput,
    hasHtmlOutput,
    isFailedRun,
    truncatePreview,
} from "./runUtils";

const ACTIVE_RUN_STATUSES = new Set(["pending", "in_progress", "waiting"]);

const compactBtnClass =
    "h-10 min-h-10 sm:h-8 sm:min-h-8 px-2.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5";

export default function AutomationResultsPanel({ selectedId, onEdit }) {
    const { t } = useTranslation();
    const { data: automation, isLoading, error } = useAutomation(selectedId);
    const runsQuery = useAutomationRuns(selectedId);
    const runs = useMemo(
        () => runsQuery.data?.pages?.flatMap((page) => page.runs || []) || [],
        [runsQuery.data],
    );
    const runAutomation = useRunAutomation(selectedId);
    // Keep the report in focus; history is available when needed.
    const [recentRunsOpen, setRecentRunsOpen] = useState(false);

    const latestRun = runs[0] || null;
    const latestRunFailed = isFailedRun(latestRun);
    const latestHtmlRun = useMemo(
        () =>
            runs.find(
                (run) => run.status === "completed" && hasHtmlOutput(run),
            ),
        [runs],
    );
    const displayHtmlRun = useMemo(() => {
        if (latestRun && !isFailedRun(latestRun) && hasHtmlOutput(latestRun))
            return latestRun;
        return latestHtmlRun || null;
    }, [latestHtmlRun, latestRun]);
    const hasActiveRun = runs.some((run) =>
        ACTIVE_RUN_STATUSES.has(run.status),
    );
    const isRunning = runAutomation.isPending || hasActiveRun;
    const isOwner = automation?.isOwner === true;
    const readOnly = Boolean(automation?.readOnly);
    const runBase = `/automations/${encodeURIComponent(
        automation?.slug || selectedId,
    )}`;

    if (error || runsQuery.error) {
        return (
            <p
                role="alert"
                className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200"
            >
                {t("colleagues.resultsError")}
            </p>
        );
    }

    if (isLoading || runsQuery.isLoading || !automation) {
        return (
            <div className="flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
        );
    }

    const textOutput =
        getRunOutput(latestRun) ||
        truncatePreview(latestRun?.automation?.htmlOutputPreview, 500) ||
        "";
    const openRunHref = latestRun
        ? `${runBase}/runs/${encodeURIComponent(latestRun._id)}`
        : null;
    const openHtmlHref = displayHtmlRun
        ? `${runBase}/runs/${encodeURIComponent(displayHtmlRun._id)}`
        : null;

    return (
        <div className="flex min-h-0 flex-col gap-3">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <h2 className="break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {automation.name || t("Automation")}
                            </h2>
                            <Badge
                                variant={
                                    automation.enabled ? "default" : "secondary"
                                }
                                className={classNames(
                                    "px-1.5 py-0 text-[10px] font-medium",
                                    automation.enabled &&
                                        "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-200",
                                )}
                            >
                                {automation.enabled
                                    ? t("Enabled")
                                    : t("Disabled")}
                            </Badge>
                            {latestRun && (
                                <StatusBadge status={latestRun.status} />
                            )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                            {latestRun
                                ? formatDate(latestRun.createdAt)
                                : automation.lastRunAt
                                  ? t("Last run: {{date}}", {
                                        date: formatDate(automation.lastRunAt),
                                    })
                                  : t("No runs yet.")}
                            {automation.nextRunAt
                                ? ` · ${t("Next: {{date}}", {
                                      date: formatDate(automation.nextRunAt),
                                  })}`
                                : ""}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {isOwner && automation?._id && (
                            <ShareButton
                                entityType="automation"
                                entityId={automation._id}
                                className={compactBtnClass}
                            />
                        )}
                        {!readOnly && (
                            <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={() => runAutomation.mutate()}
                                disabled={isRunning}
                                className={classNames(
                                    compactBtnClass,
                                    "bg-sky-600 text-white shadow-sm shadow-sky-900/10 hover:bg-sky-700 focus-visible:ring-sky-500 disabled:bg-sky-500 disabled:text-white disabled:opacity-90 dark:bg-sky-500 dark:hover:bg-sky-400 dark:disabled:bg-sky-600",
                                )}
                            >
                                {isRunning &&
                                latestRun?.status !== "waiting" ? (
                                    <Loader2 className="me-1 animate-spin" />
                                ) : (
                                    <Play className="me-1" />
                                )}
                                {t("Run now")}
                            </Button>
                        )}
                        {!readOnly && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={compactBtnClass}
                                onClick={onEdit}
                                data-testid="automation-edit-button"
                            >
                                <Pencil className="me-1" />
                                {t("Edit")}
                            </Button>
                        )}
                        {openHtmlHref ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={compactBtnClass}
                                asChild
                            >
                                <a href={openHtmlHref}>
                                    <ExternalLink className="me-1" />
                                    {t("Open full page")}
                                </a>
                            </Button>
                        ) : openRunHref ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={compactBtnClass}
                                asChild
                            >
                                <a href={openRunHref}>
                                    <ExternalLink className="me-1" />
                                    {t("View details")}
                                </a>
                            </Button>
                        ) : null}
                    </div>
                </div>
            </div>

            <TaskRunWaiting run={latestRun} />
            {latestRunFailed && (
                <TaskRunFailure
                    run={latestRun}
                    showingPreviousReport={Boolean(displayHtmlRun)}
                />
            )}
            {(!latestRunFailed || displayHtmlRun) && (
                <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    {!latestRun && !displayHtmlRun ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                            <div className="rounded-full bg-sky-50 dark:bg-sky-900/30 p-3">
                                <Sparkles className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {t("No runs yet.")}
                                </p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {t(
                                        "Run this automation to see its latest output here.",
                                    )}
                                </p>
                            </div>
                        </div>
                    ) : displayHtmlRun ? (
                        <AutomationHtmlFrame
                            automationId={automation.slug || selectedId}
                            taskId={displayHtmlRun._id}
                            title={t("Automation HTML output")}
                            className="h-[min(70vh,720px)] min-h-[320px] w-full rounded-none"
                            cacheVersion={
                                displayHtmlRun.updatedAt ||
                                displayHtmlRun.createdAt
                            }
                        />
                    ) : (
                        <div className="space-y-2 p-3 sm:p-4">
                            <div className="break-words text-sm leading-6 text-gray-700 dark:text-gray-300 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold">
                                {textOutput
                                    ? renderChatMarkdownMessage({
                                          message: {
                                              payload: textOutput,
                                              tool: latestRun?.data?.tool,
                                          },
                                          allowRawHtml: false,
                                      })
                                    : t("No output yet.")}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                <button
                    type="button"
                    onClick={() => setRecentRunsOpen((open) => !open)}
                    className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    aria-expanded={recentRunsOpen}
                    data-testid="automation-recent-runs-toggle"
                >
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {t("Recent runs")}
                        {runs.length > 0 ? (
                            <span className="ms-1.5 font-normal text-gray-500 dark:text-gray-400">
                                ({runs.length}
                                {runsQuery.hasNextPage ? "+" : ""})
                            </span>
                        ) : null}
                    </span>
                    <ChevronDown
                        className={classNames(
                            "h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform dark:text-gray-400",
                            recentRunsOpen && "rotate-180",
                        )}
                    />
                </button>
                {recentRunsOpen && (
                    <div className="border-t border-gray-200 dark:border-gray-700 px-3 pb-3 pt-2">
                        <RunHistory
                            runs={runs}
                            automationId={automation.slug || selectedId}
                            hasMore={runsQuery.hasNextPage}
                            isLoadingMore={runsQuery.isFetchingNextPage}
                            onLoadMore={() => runsQuery.fetchNextPage()}
                            embedded
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
