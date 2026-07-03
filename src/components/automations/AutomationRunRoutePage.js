"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useAutomation, useAutomationRuns } from "../../hooks/useAutomations";
import { hasHtmlOutput } from "./runUtils";
import AutomationHtmlPage from "./AutomationHtmlPage";
import AutomationTextRunPage from "./AutomationTextRunPage";

export default function AutomationRunRoutePage({ automationId, taskId }) {
    const automationQuery = useAutomation(automationId);
    const runsQuery = useAutomationRuns(automationId);

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
        (taskId === "latest" || !run || hasHtmlOutput(run));

    if (
        automationQuery.isLoading ||
        (runsQuery.isLoading && !automationQuery.data)
    ) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        );
    }

    if (showHtml) {
        return (
            <AutomationHtmlPage automationId={automationId} taskId={taskId} />
        );
    }

    return (
        <AutomationTextRunPage automationId={automationId} taskId={taskId} />
    );
}
