"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAutomation, useAutomationRuns } from "../../hooks/useAutomations";
import RunHistory from "./RunHistory";
import AutomationEditor from "./AutomationEditor";

export default function AutomationSharedPage({ automationId }) {
    const { t } = useTranslation();
    const router = useRouter();
    const automationQuery = useAutomation(automationId);
    const runsQuery = useAutomationRuns(automationId);

    const automation = automationQuery.data;
    const runs = useMemo(
        () => runsQuery.data?.pages?.flatMap((page) => page.runs || []) || [],
        [runsQuery.data?.pages],
    );

    useEffect(() => {
        if (!automation?.producesHtml) return;
        router.replace(
            `/automations/${encodeURIComponent(automationId)}/runs/latest`,
        );
    }, [automation?.producesHtml, automationId, router]);

    if (automationQuery.isLoading || automation?.producesHtml) {
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
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t(
                        "This automation may have been deleted, or you may not have access to it.",
                    )}
                </p>
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

    // Editor-role recipients get the full editor experience, not just run history.
    if (!automation.readOnly) {
        return (
            <AutomationEditor
                selectedId={automationId}
                onDeleted={() => router.replace("/automations")}
            />
        );
    }

    return (
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 py-6 sm:px-6">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {t("Shared automation")}
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                        {automation.name}
                    </h1>
                    {automation.description ? (
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            {automation.description}
                        </p>
                    ) : null}
                </div>
                <a
                    href="/automations"
                    className="inline-flex shrink-0 items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t("Back to automations")}
                </a>
            </div>

            {runsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("Loading automation content...")}
                </div>
            ) : (
                <RunHistory
                    runs={runs}
                    automationId={automationId}
                    hasMore={runsQuery.hasNextPage}
                    isLoadingMore={runsQuery.isFetchingNextPage}
                    onLoadMore={() => runsQuery.fetchNextPage()}
                />
            )}
        </div>
    );
}
