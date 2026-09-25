"use client";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { Clock3, Play, Pencil, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useRunAutomation } from "../../hooks/useAutomations";

export default function AutomationWaitingPage({ automation, automationId }) {
    const { t } = useTranslation();
    const { direction, language } = useContext(LanguageContext);
    const run = useRunAutomation(automationId);
    return (
        <main
            dir={direction}
            className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center gap-5 px-5 py-10 text-gray-900 dark:text-gray-100"
        >
            <Clock3 className="h-10 w-10 text-sky-600 dark:text-sky-400" />
            <div>
                <h1 className="text-2xl font-semibold">{automation.name}</h1>
                <h2 className="mt-3 text-lg font-medium">
                    {t("automations.waitingTitle")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                    {t("automations.waitingDescription")}
                </p>
                {automation.enabled && automation.nextRunAt && (
                    <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                        {t("automations.nextRun", {
                            date: new Date(automation.nextRunAt).toLocaleString(
                                language,
                                { timeZone: automation.timezone || "UTC" },
                            ),
                            timezone: automation.timezone || "UTC",
                        })}
                    </p>
                )}
                {automation.enabled &&
                    automation.schedule?.frequency === "files" && (
                        <p className="mt-3 break-words text-sm text-gray-700 dark:text-gray-300">
                            {t("colleagues.watchSummary", {
                                path: automation.schedule.watchPath,
                            })}
                        </p>
                    )}
            </div>
            <div className="flex flex-wrap gap-3">
                {!automation.readOnly && (
                    <>
                        <Button
                            className="min-h-10"
                            disabled={run.isPending}
                            onClick={() => run.mutate()}
                        >
                            {run.isPending ? (
                                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Play className="me-2 h-4 w-4" />
                            )}
                            {t("Run now")}
                        </Button>
                        <Button asChild variant="outline" className="min-h-10">
                            <a
                                href={`/automations/${encodeURIComponent(automationId)}?edit=1`}
                            >
                                <Pencil className="me-2 h-4 w-4" />
                                {t("Edit")}
                            </a>
                        </Button>
                    </>
                )}
                <Button asChild variant="ghost" className="min-h-10">
                    <a href="/automations">
                        <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
                        {t("Back to automations")}
                    </a>
                </Button>
            </div>
            {run.isError && (
                <p
                    role="alert"
                    className="text-sm text-red-700 dark:text-red-300"
                >
                    {run.error?.response?.data?.error || t("colleagues.error")}
                </p>
            )}
        </main>
    );
}
