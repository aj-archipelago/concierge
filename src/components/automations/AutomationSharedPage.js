"use client";

import PageHeader from "../../layout/PageHeader";
import { HeaderAction } from "../../layout/HeaderControls";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAutomation, useAutomationRuns } from "../../hooks/useAutomations";
import RunHistory from "./RunHistory";
import AutomationEditor from "./AutomationEditor";

export default function AutomationSharedPage({ automationId }) {
    const { t } = useTranslation();
    const router = useRouter();
    const searchParams = useSearchParams();
    const automationQuery = useAutomation(automationId);
    const runsQuery = useAutomationRuns(automationId);

    const automation = automationQuery.data;
    const showEditor =
        automation && !automation.readOnly && searchParams.get("edit") === "1";
    const runs = useMemo(
        () => runsQuery.data?.pages?.flatMap((page) => page.runs || []) || [],
        [runsQuery.data?.pages],
    );

    useEffect(() => {
        if (!automation?.producesHtml || showEditor) return;
        router.replace(
            `/automations/${encodeURIComponent(automationId)}/runs/latest`,
        );
    }, [automation?.producesHtml, automationId, router, showEditor]);

    if (
        automationQuery.isLoading ||
        (automation?.producesHtml && !showEditor)
    ) {
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
                <HeaderAction
                    href="/colleagues?view=tasks"
                    icon={ArrowLeft}
                    iconClassName="rtl:rotate-180"
                    label={t("Back to automations")}
                />
            </div>
        );
    }

    // Editor-role recipients get the full editor experience, not just run history.
    if (!automation.readOnly) {
        return (
            <AutomationEditor
                headerInApp
                selectedId={automationId}
                onDeleted={() => router.replace("/automations")}
            />
        );
    }

    return (
        <div className="mx-auto flex min-h-full max-w-4xl flex-col px-4 py-2 sm:px-6">
            <PageHeader
                title={automation.name}
                description={automation.description}
            >
                <HeaderAction
                    href="/colleagues?view=tasks"
                    icon={ArrowLeft}
                    iconClassName="rtl:rotate-180"
                    label={t("Back to automations")}
                />
            </PageHeader>

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
