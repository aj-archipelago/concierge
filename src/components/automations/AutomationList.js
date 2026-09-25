"use client";

import { useTranslation } from "react-i18next";
import { CalendarClock, Clock3, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import classNames from "../../../app/utils/class-names";
import { formatDate } from "./runUtils";
import { isAutomationUnread } from "../../utils/automationsUnread";
import { getAutomationColleague } from "../../utils/automationColleagues";
import ColleagueAvatar, {
    getEntityWispVariant,
} from "../colleagues/ColleagueAvatar";

export default function AutomationList({
    automations,
    selectedId,
    lastViewedAt = null,
    readReceipts = {},
    colleagues = [],
    onSelect,
    onCreate,
}) {
    const { t } = useTranslation();
    const isEmpty = automations.length === 0;

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="flex items-center justify-between gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                        {t("Your automations")}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("colleagues.newResultsFirst")}
                    </p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    className="min-h-10"
                    onClick={onCreate}
                >
                    <Plus className="me-1.5 h-4 w-4" />
                    {t("New")}
                </Button>
            </div>
            {isEmpty ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                    <div className="rounded-full bg-sky-50 dark:bg-sky-900/30 p-3">
                        <Sparkles className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {t("No automations yet")}
                        </h3>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t(
                                "Describe what you want Concierge to do - we'll set it up.",
                            )}
                        </p>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        className="min-h-10"
                        onClick={onCreate}
                    >
                        <Plus className="me-1.5 h-4 w-4" />
                        {t("Create your first")}
                    </Button>
                </div>
            ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {automations.map((automation) => {
                        const unread = isAutomationUnread(
                            automation,
                            lastViewedAt,
                            readReceipts,
                        );
                        const colleague = getAutomationColleague(
                            automation,
                            colleagues,
                        );
                        return (
                            <button
                                key={automation._id}
                                type="button"
                                aria-pressed={selectedId === automation._id}
                                onClick={() => onSelect(automation._id)}
                                className={classNames(
                                    "w-full text-start p-4 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 dark:hover:bg-gray-700",
                                    selectedId === automation._id &&
                                        "bg-sky-50 dark:bg-sky-900/20",
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            {unread && (
                                                <span
                                                    data-testid="automation-unread-dot"
                                                    className="h-2 w-2 shrink-0 rounded-full bg-sky-500"
                                                    aria-label={t(
                                                        "New automation result",
                                                    )}
                                                />
                                            )}
                                            <div className="break-words font-medium text-gray-900 dark:text-gray-100">
                                                {automation.name}
                                            </div>
                                        </div>
                                        <div className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                                            {automation.description ||
                                                t("No description")}
                                        </div>
                                    </div>
                                    <Badge
                                        variant={
                                            automation.enabled
                                                ? "default"
                                                : "secondary"
                                        }
                                        className={classNames(
                                            "shrink-0",
                                            automation.enabled &&
                                                "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-200",
                                        )}
                                    >
                                        {automation.enabled
                                            ? t("Enabled")
                                            : t("Disabled")}
                                    </Badge>
                                </div>
                                <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                    {colleague && (
                                        <ColleagueAvatar
                                            entityId={colleague.id}
                                            variant={getEntityWispVariant(
                                                colleague,
                                            )}
                                            className="h-7 w-7 shrink-0"
                                        />
                                    )}
                                    <span className="break-words">
                                        {colleague
                                            ? t("colleagues.runBy", {
                                                  name: colleague.name,
                                              })
                                            : t(
                                                  automation.entityId
                                                      ? "colleagues.unavailableAssignee"
                                                      : "colleagues.personalAssistant",
                                              )}
                                    </span>
                                </div>
                                {unread && (
                                    <p className="mt-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
                                        {t("New automation result")}
                                    </p>
                                )}
                                <div className="mt-2 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                                    <div className="flex items-center gap-1.5">
                                        <Clock3 className="h-3.5 w-3.5" />
                                        {automation.lastRunAt
                                            ? t("Last run: {{date}}", {
                                                  date: formatDate(
                                                      automation.lastRunAt,
                                                  ),
                                              })
                                            : t("No runs yet.")}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        {automation.nextRunAt
                                            ? t("Next: {{date}}", {
                                                  date: formatDate(
                                                      automation.nextRunAt,
                                                  ),
                                              })
                                            : t("Manual only")}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
