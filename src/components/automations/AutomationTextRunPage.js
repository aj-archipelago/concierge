"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2 } from "lucide-react";
import { convertMessageToMarkdown } from "../chat/ChatMessage";
import { useAutomation, useAutomationRuns } from "../../hooks/useAutomations";
import StatusBadge from "./StatusBadge";
import { formatDate, getRunOutput, stringifyRunOutput } from "./runUtils";

export default function AutomationTextRunPage({ automationId, taskId }) {
    const { t } = useTranslation();
    const automationQuery = useAutomation(automationId);
    const runsQuery = useAutomationRuns(automationId);

    const automation = automationQuery.data;
    const runs = useMemo(
        () => runsQuery.data?.pages?.flatMap((page) => page.runs || []) || [],
        [runsQuery.data?.pages],
    );

    const run = useMemo(() => {
        if (taskId === "latest") {
            return runs[0] || null;
        }
        return runs.find((item) => String(item._id) === String(taskId)) || null;
    }, [runs, taskId]);

    const summary = getRunOutput(run);
    const rawOutput = stringifyRunOutput(run?.data?.result);

    if (automationQuery.isLoading || runsQuery.isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        );
    }

    if (automationQuery.isError || !automation) {
        return (
            <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {t("Automation not found")}
                </h1>
                <a
                    href="/automations"
                    className="inline-flex items-center gap-2 text-sm text-sky-600 hover:underline dark:text-sky-400"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t("Back to automations")}
                </a>
            </div>
        );
    }

    const backHref = `/automations/${encodeURIComponent(automationId)}`;

    if (!run) {
        return (
            <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {t("Run not found")}
                </h1>
                <a
                    href={backHref}
                    className="inline-flex items-center gap-2 text-sm text-sky-600 hover:underline dark:text-sky-400"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t("Back to automation")}
                </a>
            </div>
        );
    }

    return (
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 py-6 sm:px-6">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <a
                        href={backHref}
                        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {t("Back to automation")}
                    </a>
                    <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                        {automation.name}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={run.status} />
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(run.completedAt || run.createdAt)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {t("Summary")}
                    </h2>
                </div>
                <div className="p-4 text-sm text-gray-700 dark:text-gray-300">
                    {summary ? (
                        convertMessageToMarkdown({ payload: summary })
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400">
                            {t("No output yet.")}
                        </p>
                    )}
                </div>
            </div>

            {rawOutput && rawOutput !== summary ? (
                <div className="mt-4 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {t("Raw output")}
                        </h2>
                    </div>
                    <pre className="max-h-[40vh] overflow-auto p-4 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {rawOutput}
                    </pre>
                </div>
            ) : null}
        </div>
    );
}
