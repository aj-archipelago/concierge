"use client";

import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import StatusBadge from "./StatusBadge";
import {
    formatDate,
    getRunOutput,
    hasHtmlOutput,
    stringifyRunOutput,
} from "./runUtils";

export default function RunDetailsDialog({ run, automationId, onOpenChange }) {
    const { t } = useTranslation();
    const output = getRunOutput(run);
    const rawOutput = stringifyRunOutput(run?.data?.result);
    const htmlPreview = stringifyRunOutput(run?.automation?.htmlOutputPreview);

    return (
        <Dialog open={!!run} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("Run details")}</DialogTitle>
                    <DialogDescription>
                        {run ? formatDate(run.createdAt) : ""}
                    </DialogDescription>
                </DialogHeader>

                {run && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <StatusBadge status={run.status} />
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                {run.automation?.trigger || ""}
                            </span>
                        </div>

                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {t("Summary")}
                            </h3>
                            <div className="max-h-60 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {output || t("No output yet.")}
                            </div>
                        </section>

                        {rawOutput && rawOutput !== output && (
                            <section>
                                <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {t("Raw output")}
                                </h3>
                                <pre className="max-h-72 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                    {rawOutput}
                                </pre>
                            </section>
                        )}

                        {htmlPreview && (
                            <section>
                                <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {t("HTML preview")}
                                </h3>
                                <div className="max-h-40 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                    {htmlPreview}
                                </div>
                            </section>
                        )}

                        {hasHtmlOutput(run) && (
                            <a
                                className="inline-flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400 hover:underline"
                                href={`/automations/${automationId}/runs/${run._id}`}
                            >
                                <ExternalLink className="h-4 w-4" />
                                {t("View HTML")}
                            </a>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
