"use client";
import { useContext } from "react";
import { ArrowUpRight, MessageCircle, EyeOff } from "lucide-react";
import { LanguageContext } from "../../contexts/LanguageProvider";
import TeamWisps from "../teams/TeamWisps";
import TeamStatus from "../teams/TeamStatus";
import {
    teamState,
    teamCurrentWork,
    isTeamActive,
} from "../../utils/assistantTeamStatus";

export default function TeamNotificationItem({
    notification,
    router,
    setIsNotificationOpen,
    onMarkRead,
    handleDismiss,
    t,
}) {
    const { direction } = useContext(LanguageContext);
    const { team } = notification;
    const state = teamState(team);
    const active = isTeamActive(team);
    if (notification.dismissed && !active) return null;
    const needsAnswer = state === "needs_answer";
    const path = `/teams/${team.teamId}`;
    const coordinator = team.members.find(
        (m) => m.assistantId === team.coordinatorId,
    );
    const open = (event, destination) => {
        if (notification.notificationIds?.length)
            onMarkRead?.(notification.notificationIds);
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
        event.preventDefault();
        setIsNotificationOpen?.(false);
        router.push(destination);
    };
    return (
        <article
            dir={direction}
            data-request-id={notification._id}
            data-team-notification={team.teamId}
            className={`mb-2 overflow-hidden rounded-2xl border text-start ${needsAnswer ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20" : !notification.read ? "border-sky-300 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-950/20" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}
        >
            <a
                href={path}
                onClick={(event) => open(event, path)}
                className="block p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
            >
                <div className="flex items-start gap-3">
                    <TeamWisps team={team} compact />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {team.title}
                            </h3>
                            {!notification.read && (
                                <span
                                    aria-hidden="true"
                                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-600 dark:bg-sky-400"
                                />
                            )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {t("teams.ledBy", {
                                name: coordinator?.name || t("teams.assistant"),
                                count: team.members.length,
                            })}
                        </p>
                        <div className="mt-2">
                            <TeamStatus state={state} />
                        </div>
                        <p className="mt-2 line-clamp-2 break-words text-sm text-gray-700 dark:text-gray-300">
                            {teamCurrentWork(team, t)}
                        </p>
                    </div>
                </div>
            </a>
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-200/70 px-3 py-1.5 dark:border-gray-700/70">
                {needsAnswer && team.chatId && (
                    <a
                        href={`/chat/${team.chatId}`}
                        onClick={(event) => open(event, `/chat/${team.chatId}`)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    >
                        <MessageCircle className="h-4 w-4" />
                        {t("teams.answer")}
                    </a>
                )}
                <a
                    href={`${path}${state === "completed" ? "#result" : ""}`}
                    onClick={(event) =>
                        open(
                            event,
                            `${path}${state === "completed" ? "#result" : ""}`,
                        )
                    }
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 dark:text-sky-300 dark:hover:bg-sky-950"
                >
                    <ArrowUpRight className="h-4 w-4" />
                    {t(
                        state === "completed"
                            ? "teams.viewResults"
                            : "teams.open",
                    )}
                </a>
                {!active && handleDismiss && (
                    <button
                        type="button"
                        onClick={() => handleDismiss(notification._id, "task")}
                        className="ms-auto flex min-h-10 min-w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                        title={t("Hide")}
                        aria-label={t("Hide")}
                    >
                        <EyeOff className="h-4 w-4" />
                    </button>
                )}
            </div>
        </article>
    );
}
