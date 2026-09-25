"use client";

import PageHeader from "../../layout/PageHeader";
import { HeaderAction } from "../../layout/HeaderControls";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ExternalLink } from "lucide-react";
import AutomationHtmlFrame, { automationHtmlSrc } from "./AutomationHtmlFrame";
import TaskRunWaiting from "./TaskRunWaiting";

export default function AutomationHtmlPage({
    automationId,
    taskId,
    title,
    run,
}) {
    const { t } = useTranslation();
    const src = automationHtmlSrc(automationId, taskId);

    return (
        <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-gray-900">
            <PageHeader title={title || t("Automation")}>
                <HeaderAction
                    href="/colleagues?view=tasks"
                    icon={ArrowLeft}
                    iconClassName="rtl:rotate-180"
                    label={t("Back to automations")}
                />
                <HeaderAction
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    icon={ExternalLink}
                    label={t("Open HTML in new tab")}
                />
            </PageHeader>
            <TaskRunWaiting run={run} />
            <AutomationHtmlFrame
                automationId={automationId}
                taskId={taskId}
                className="min-h-0 flex-1"
            />
        </div>
    );
}
