"use client";

import PageHeader from "../../layout/PageHeader";
import { HeaderAction } from "../../layout/HeaderControls";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2 } from "lucide-react";
import { convertMessageToMarkdown } from "../chat/ChatMessage";
import { useAutomation, useAutomationRuns } from "../../hooks/useAutomations";
import StatusBadge from "./StatusBadge";
import TaskRunFailure from "./TaskRunFailure";
import TaskRunWaiting from "./TaskRunWaiting";
import {
    formatDate,
    getRunOutput,
    isFailedRun,
    stringifyRunOutput,
} from "./runUtils";

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
                <HeaderAction
                    href="/colleagues?view=tasks"
                    icon={ArrowLeft}
                    iconClassName="rtl:rotate-180"
                    label={t("Back to automations")}
                />
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
                <HeaderAction
                    href={backHref}
                    icon={ArrowLeft}
                    iconClassName="rtl:rotate-180"
                    label={t("Back to automation")}
                />
            </div>
        );
    }

    return (
        <div className="mx-auto flex min-h-full max-w-4xl flex-col px-4 py-2 sm:px-6">
            <PageHeader
                title={automation.name}
                description={automation.description}
            >
                <HeaderAction
                    href={backHref}
                    icon={ArrowLeft}
                    iconClassName="rtl:rotate-180"
                    label={t("Back to automation")}
                />
                <StatusBadge status={run.status} />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(run.completedAt || run.createdAt)}
                </span>
            </PageHeader>

            <TaskRunWaiting run={run} />
            {run.outputExpiredAt ? (
                <p
                    role="status"
                    className="rounded-lg border border-gray-200 bg-white p-4 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                    {t("automations.outputExpiredHelp")}
                </p>
            ) : isFailedRun(run) ? (
                <TaskRunFailure run={run} />
            ) : (
                <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {t("Summary")}
                        </h2>
                    </div>
                    <div className="p-4 text-sm text-gray-700 dark:text-gray-300">
                        {summary ? (
                            convertMessageToMarkdown({
                                payload: summary,
                                tool: run?.data?.tool,
                            })
                        ) : (
                            <p className="text-gray-500 dark:text-gray-400">
                                {t("No output yet.")}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {!isFailedRun(run) && rawOutput && rawOutput !== summary ? (
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
