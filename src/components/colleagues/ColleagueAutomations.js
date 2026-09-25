"use client";

import { useContext, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import AutomationResultsPanel from "../automations/AutomationResultsPanel";
import AutomationEditor from "../automations/AutomationEditor";
import {
    automationBelongsToColleague,
    getAutomationColleague,
} from "../../utils/automationColleagues";
import { isAutomationUnread } from "../../utils/automationsUnread";
import { useCurrentEntityTarget } from "../../contexts/CurrentEntityContext";
import { LanguageContext } from "../../contexts/LanguageProvider";
import ColleagueAvatar, { getEntityWispVariant } from "./ColleagueAvatar";
import ColleagueMessages from "./ColleagueMessages";
import TeamJobsList from "../teams/TeamJobsList";

function dayGroup(value) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "today";
    if (date.toDateString() === yesterday.toDateString()) return "yesterday";
    return "earlier";
}

export default function ColleagueAutomations({
    automations,
    colleagues,
    isLoading,
    error,
    lastViewedAt,
    readReceipts,
    markRead,
    view = "recent",
    onCreate,
}) {
    const { t } = useTranslation();
    const { direction, language } = useContext(LanguageContext);
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const requestedId = search.get("automation");
    const assigneeId = search.get("assignee") || "";
    const surfaceRef = useRef(null);
    useEffect(() => {
        surfaceRef.current?.scrollIntoView?.({ block: "start" });
        surfaceRef.current?.focus({ preventScroll: true });
    }, [requestedId, view, assigneeId, isLoading]);
    const assignee = colleagues.find(
        (colleague) => colleague.id === assigneeId,
    );
    const isEditing = search.get("edit") === "1";
    const selected = automations.find((task) => task._id === requestedId);
    const assignedColleague =
        selected && getAutomationColleague(selected, colleagues);
    useCurrentEntityTarget(assignedColleague?.id);
    const recent = view === "recent";
    const tasks = automations
        .filter(
            (task) =>
                !assigneeId || automationBelongsToColleague(task, assignee),
        )
        .filter(
            (task) => !recent || Number.isFinite(Date.parse(task.lastRunAt)),
        )
        .slice()
        .sort((a, b) =>
            recent
                ? Date.parse(b.lastRunAt) - Date.parse(a.lastRunAt)
                : Number(b.enabled) - Number(a.enabled) ||
                  a.name.localeCompare(b.name, language),
        );
    const groups = recent
        ? ["today", "yesterday", "earlier"]
              .map((key) => ({
                  key,
                  tasks: tasks.filter(
                      (task) => dayGroup(task.lastRunAt) === key,
                  ),
              }))
              .filter((group) => group.tasks.length)
        : [{ key: "tasks", tasks }];
    const navigate = (changes) => {
        const params = new URLSearchParams(search.toString());
        params.set("view", view);
        Object.entries(changes).forEach(([key, value]) =>
            value ? params.set(key, value) : params.delete(key),
        );
        router.push(`${pathname}?${params}`, { scroll: false });
    };
    const formatDate = (value) =>
        new Intl.DateTimeFormat(language || "en", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }).format(new Date(value));
    const back = () => navigate({ automation: null, edit: null });
    const backLabel = t(
        recent ? "colleagues.backToRecent" : "colleagues.backToTasks",
    );

    if (isLoading)
        return (
            <div
                role="status"
                className="flex items-center justify-center gap-2 py-20"
            >
                <Loader2 className="h-5 w-5 animate-spin" />
                {t("Loading...")}
            </div>
        );
    if (error)
        return (
            <p
                role="alert"
                className="rounded-2xl bg-red-50 p-5 text-sm text-red-700 dark:bg-red-950 dark:text-red-200"
            >
                {t("colleagues.resultsError")}
            </p>
        );
    if (requestedId)
        return (
            <section
                ref={surfaceRef}
                tabIndex={-1}
                className="mx-auto max-w-4xl space-y-6 outline-none"
                aria-label={t("colleagues.taskDetails")}
            >
                <Button
                    type="button"
                    variant="ghost"
                    className="min-h-10 -ms-3"
                    onClick={back}
                >
                    <ArrowLeft
                        className={`me-2 h-4 w-4 ${direction === "rtl" ? "rotate-180" : ""}`}
                    />
                    {backLabel}
                </Button>
                {!selected ? (
                    <p
                        role="status"
                        className="py-8 text-gray-600 dark:text-gray-400"
                    >
                        {t("colleagues.resultUnavailable")}
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <button
                                type="button"
                                disabled={!assignedColleague}
                                className="flex min-h-10 items-center gap-3 rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                onClick={() =>
                                    navigate({
                                        view: "team",
                                        entity: assignedColleague.id,
                                        tab: "tasks",
                                        archived:
                                            assignedColleague.status ===
                                            "archived"
                                                ? "1"
                                                : null,
                                        automation: null,
                                        edit: null,
                                    })
                                }
                            >
                                <ColleagueAvatar
                                    entityId={assignedColleague?.id}
                                    variant={getEntityWispVariant(
                                        assignedColleague,
                                    )}
                                    className="h-10 w-10"
                                />
                                <span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                                        {t("colleagues.taskWith")}
                                    </span>
                                    <span className="font-medium">
                                        {assignedColleague?.name ||
                                            t(
                                                selected.entityId
                                                    ? "colleagues.unavailableAssignee"
                                                    : "colleagues.personalAssistant",
                                            )}
                                    </span>
                                </span>
                            </button>
                            {!isEditing &&
                                isAutomationUnread(
                                    selected,
                                    lastViewedAt,
                                    readReceipts,
                                ) && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="min-h-10"
                                        onClick={() => markRead(selected)}
                                    >
                                        <Check className="me-2 h-4 w-4" />
                                        {t("colleagues.markResultRead")}
                                    </Button>
                                )}
                        </div>
                        {isEditing ? (
                            <AutomationEditor
                                key={selected._id}
                                selectedId={selected._id}
                                onDeleted={back}
                                onDone={() =>
                                    navigate({ edit: null, assignee: null })
                                }
                            />
                        ) : (
                            <AutomationResultsPanel
                                key={selected._id}
                                selectedId={selected._id}
                                onEdit={() => navigate({ edit: "1" })}
                            />
                        )}
                    </>
                )}
            </section>
        );

    return (
        <section
            ref={surfaceRef}
            tabIndex={-1}
            className="mx-auto max-w-3xl space-y-9 pb-8 outline-none"
            aria-label={t(recent ? "colleagues.recent" : "colleagues.tasks")}
        >
            <div className="flex flex-wrap items-start justify-between gap-4 pt-4 sm:pt-8">
                <div className="space-y-2">
                    <h2 className="text-2xl font-semibold tracking-tight">
                        {t(
                            recent
                                ? "colleagues.recentTitle"
                                : "colleagues.tasksTitle",
                        )}
                    </h2>
                    <p className="max-w-lg text-sm leading-6 text-gray-500 dark:text-gray-400">
                        {t(
                            recent
                                ? "colleagues.recentIntro"
                                : "colleagues.tasksIntro",
                        )}
                    </p>
                </div>
                <select
                    aria-label={t("colleagues.resultsFrom")}
                    value={assigneeId}
                    onChange={(event) =>
                        navigate({ assignee: event.target.value })
                    }
                    className="min-h-10 max-w-full rounded-xl border-gray-200 bg-white py-2 ps-3 pe-9 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                >
                    <option value="">{t("colleagues.allColleagues")}</option>
                    {colleagues.map((colleague) => (
                        <option key={colleague.id} value={colleague.id}>
                            {colleague.name}
                            {colleague.status === "archived"
                                ? ` (${t("colleagues.archived")})`
                                : ""}
                        </option>
                    ))}
                </select>
            </div>
            {recent && (
                <ColleagueMessages
                    colleagues={colleagues}
                    assigneeId={assigneeId}
                />
            )}
            <TeamJobsList
                colleagues={colleagues}
                assigneeId={assigneeId}
                recent={recent}
            />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t("teams.automations")}
            </h3>
            {!tasks.length ? (
                <div className="flex flex-col items-center gap-4 rounded-3xl bg-gray-50 px-6 py-12 text-center dark:bg-gray-900/60">
                    <ColleagueAvatar
                        entityId={assignee?.id || colleagues[0]?.id}
                        variant={getEntityWispVariant(
                            assignee || colleagues[0],
                        )}
                        className="h-16 w-16"
                    />
                    <h3 className="text-lg font-medium">
                        {t(
                            recent
                                ? "colleagues.recentEmpty"
                                : "colleagues.tasksEmpty",
                        )}
                    </h3>
                    <p className="max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
                        {t(
                            recent
                                ? "colleagues.recentEmptyHint"
                                : "colleagues.tasksEmptyHint",
                        )}
                    </p>
                    <Button
                        className="min-h-10 rounded-full"
                        onClick={
                            recent && automations.length
                                ? () => navigate({ view: "tasks" })
                                : onCreate
                        }
                    >
                        <Plus className="me-2 h-4 w-4" />
                        {t(
                            recent && automations.length
                                ? "colleagues.tasks"
                                : "colleagues.giveTask",
                        )}
                    </Button>
                </div>
            ) : (
                groups.map((group) => (
                    <section
                        key={group.key}
                        className="space-y-3"
                        aria-label={t(`colleagues.${group.key}`)}
                    >
                        {recent && (
                            <h3 className="px-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {t(`colleagues.${group.key}`)}
                            </h3>
                        )}
                        <ul className="space-y-3">
                            {group.tasks.map((task) => {
                                const colleague = getAutomationColleague(
                                    task,
                                    colleagues,
                                );
                                const unread = isAutomationUnread(
                                    task,
                                    lastViewedAt,
                                    readReceipts,
                                );
                                const colleagueName =
                                    colleague?.name ||
                                    t(
                                        task.entityId
                                            ? "colleagues.unavailableAssignee"
                                            : "colleagues.personalAssistant",
                                    );
                                return (
                                    <li key={task._id}>
                                        <button
                                            type="button"
                                            className="group flex w-full items-center gap-4 rounded-2xl border border-gray-200/80 bg-white px-4 py-5 text-start transition-colors hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:gap-5 sm:px-5 dark:border-gray-700/60 dark:bg-gray-900/40 dark:hover:border-sky-700 dark:hover:bg-sky-950/20"
                                            onClick={() =>
                                                navigate({
                                                    automation: task._id,
                                                    edit: null,
                                                })
                                            }
                                        >
                                            <ColleagueAvatar
                                                entityId={colleague?.id}
                                                variant={getEntityWispVariant(
                                                    colleague,
                                                )}
                                                className={
                                                    recent
                                                        ? "h-10 w-10 sm:h-12 sm:w-12"
                                                        : "h-10 w-10"
                                                }
                                                activity={
                                                    recent && unread
                                                        ? { phase: "done" }
                                                        : undefined
                                                }
                                            />
                                            <span className="min-w-0 flex-1 space-y-1.5">
                                                <span className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                    <span>
                                                        {recent
                                                            ? t(
                                                                  "colleagues.finishedBy",
                                                                  {
                                                                      name: colleagueName,
                                                                  },
                                                              )
                                                            : colleagueName}
                                                    </span>
                                                    {unread && (
                                                        <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                                            {t(
                                                                "colleagues.newResult",
                                                            )}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="block break-words text-base font-medium leading-snug text-gray-900 dark:text-gray-100">
                                                    {task.name}
                                                </span>
                                                {recent ? (
                                                    <time
                                                        dateTime={
                                                            task.lastRunAt
                                                        }
                                                        className="block text-xs text-gray-500 dark:text-gray-400"
                                                    >
                                                        {formatDate(
                                                            task.lastRunAt,
                                                        )}
                                                    </time>
                                                ) : (
                                                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                                                        {t(
                                                            task.enabled
                                                                ? task.schedule
                                                                      ?.frequency ===
                                                                  "files"
                                                                    ? "colleagues.fileTrigger"
                                                                    : "colleagues.scheduled"
                                                                : "colleagues.manual",
                                                        )}
                                                        {task.enabled &&
                                                        task.nextRunAt
                                                            ? ` · ${t("Next: {{date}}", { date: formatDate(task.nextRunAt) })}`
                                                            : ""}
                                                    </span>
                                                )}
                                            </span>
                                            <ArrowRight
                                                aria-hidden="true"
                                                className={`h-4 w-4 shrink-0 text-gray-400 group-hover:text-sky-600 dark:text-gray-500 dark:group-hover:text-sky-400 ${direction === "rtl" ? "rotate-180" : ""}`}
                                            />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))
            )}
        </section>
    );
}
