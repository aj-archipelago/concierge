"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useAutomation, useAutomationRuns } from "../../hooks/useAutomations";
import { hasHtmlOutput } from "./runUtils";
import AutomationHtmlPage from "./AutomationHtmlPage";
import AutomationTextRunPage from "./AutomationTextRunPage";
import AutomationWaitingPage from "./AutomationWaitingPage";
import { useTranslation } from "react-i18next";

export default function AutomationRunRoutePage({ automationId, taskId }) {
    const { t } = useTranslation();
    const automationQuery = useAutomation(automationId);
    const runsQuery = useAutomationRuns(automationId, {
        pollUntilFirstRun: taskId === "latest",
    });

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

    const automation = automationQuery.data;
    const showHtml =
        automation?.producesHtml &&
        (taskId === "latest"
            ? Boolean(
                  automation.latestHtmlOutputPath || runs.some(hasHtmlOutput),
              )
            : // Older direct links may be outside the loaded history page.
              // Their HTML endpoint resolves the specific run independently.
              !run || hasHtmlOutput(run));

    if (automationQuery.isLoading || runsQuery.isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        );
    }

    if (runsQuery.isError)
        return (
            <div
                role="alert"
                className="mx-auto max-w-xl space-y-4 p-8 text-gray-900 dark:text-gray-100"
            >
                <p>{t("automations.runHistoryError")}</p>
                <button
                    className="min-h-10 text-sky-700 dark:text-sky-300"
                    onClick={() => runsQuery.refetch()}
                >
                    {t("Retry")}
                </button>
            </div>
        );

    if (showHtml) {
        return (
            <AutomationHtmlPage
                automationId={automationId}
                taskId={taskId}
                title={automation?.name}
                run={run}
            />
        );
    }

    if (automation && !run && taskId === "latest")
        return (
            <AutomationWaitingPage
                automation={automation}
                automationId={automationId}
            />
        );

    return (
        <AutomationTextRunPage automationId={automationId} taskId={taskId} />
    );
}
