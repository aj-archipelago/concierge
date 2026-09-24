"use client";
import { useContext, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useAssistantTeams } from "../../hooks/useAssistantTeams";
import { useColleagues } from "../../hooks/useColleagues";
import {
    teamState,
    teamCurrentWork,
    isTeamActive,
} from "../../utils/assistantTeamStatus";
import TeamWisps from "./TeamWisps";

export default function ChatTeamActivity({ chatId, enabled = true }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [selection, setSelection] = useState(null);
    const query = useAssistantTeams({ chatId, enabled: enabled && !!chatId });
    const { data: colleagues = [] } = useColleagues({
        enabled: enabled && !!chatId,
        ids: [
            ...new Set(
                (query.data?.pages || []).flatMap((page) =>
                    page.teams.flatMap((team) =>
                        team.members.map((member) => member.assistantId),
                    ),
                ),
            ),
        ],
        limit: 100,
    });
    if (!enabled || [401, 403, 404].includes(query.error?.response?.status))
        return null;
    const teams = query.data?.pages?.flatMap((page) => page.teams) || [];
    const team =
        (selection?.chatId === chatId &&
            teams.find((t) => t.teamId === selection.teamId)) ||
        teams.find((t) => teamState(t) === "needs_answer") ||
        teams.find(isTeamActive) ||
        teams[0];
    if (!team)
        return query.isError && query.error?.response?.status !== 404 ? (
            <div
                dir={direction}
                role="alert"
                className="flex shrink-0 items-center gap-2 text-xs text-amber-700 dark:text-amber-300"
            >
                {t("teams.loadError")}
                <button
                    onClick={() => query.refetch()}
                    className="min-h-10 px-2 underline"
                >
                    {t("teams.retry")}
                </button>
            </div>
        ) : query.hasPreviousPage ? (
            <button
                type="button"
                onClick={query.fetchPreviousPage}
                className="min-h-10 px-2 text-sm text-sky-700 dark:text-sky-300"
            >
                {t("assistantDirectory.previous")}
            </button>
        ) : null;
    return (
        <div className="shrink-0 space-y-1.5" dir={direction}>
            {(teams.length > 1 ||
                query.hasNextPage ||
                query.hasPreviousPage) && (
                <div className="flex min-w-0 items-center gap-2">
                    <select
                        aria-label={t("teams.chooseJob")}
                        value={team.teamId}
                        onChange={(e) =>
                            setSelection({ chatId, teamId: e.target.value })
                        }
                        className="min-h-10 min-w-0 flex-1 rounded-lg border-gray-200 bg-white py-1 ps-3 pe-8 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    >
                        {teams.map((job) => (
                            <option key={job.teamId} value={job.teamId}>
                                {job.title} ·{" "}
                                {t(`teams.state.${teamState(job)}`)}
                            </option>
                        ))}
                    </select>
                    {query.hasPreviousPage && (
                        <button
                            type="button"
                            onClick={query.fetchPreviousPage}
                            className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
                        >
                            {t("assistantDirectory.previous")}
                        </button>
                    )}
                    {query.hasNextPage && (
                        <button
                            type="button"
                            disabled={query.isFetchingNextPage}
                            onClick={() => query.fetchNextPage()}
                            className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
                        >
                            {t("assistantDirectory.next")}
                        </button>
                    )}
                </div>
            )}
            <Link
                dir={direction}
                href={`/teams/${team.teamId}`}
                data-chat-team
                className="group flex shrink-0 items-center gap-3 rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50/70 to-violet-50/60 px-3 py-1.5 text-start text-gray-900 transition-colors hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-sky-900/80 dark:from-sky-950/30 dark:to-violet-950/20 dark:text-gray-100 dark:hover:border-sky-600"
            >
                <TeamWisps
                    team={team}
                    colleagues={colleagues}
                    paused={query.isError}
                />
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                        <span>
                            {t("teams.chatLabel", {
                                count: team.members.length,
                            })}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{t(`teams.state.${teamState(team)}`)}</span>
                    </span>
                    <span className="block truncate text-sm font-semibold">
                        {team.title}
                    </span>
                    <span
                        className="block truncate text-xs text-gray-600 dark:text-gray-400"
                        role="status"
                    >
                        {query.isError
                            ? t("teams.refreshError")
                            : teamCurrentWork(team, t)}
                    </span>
                </span>
                <span className="hidden text-xs font-medium text-sky-700 sm:block dark:text-sky-300">
                    {t("teams.open")}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" />
            </Link>
        </div>
    );
}
