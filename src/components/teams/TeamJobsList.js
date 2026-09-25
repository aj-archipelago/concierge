"use client";
import { useContext, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useAssistantTeams } from "../../hooks/useAssistantTeams";
import { teamState, teamCurrentWork } from "../../utils/assistantTeamStatus";
import TeamWisps from "./TeamWisps";
import TeamStatus from "./TeamStatus";

export default function TeamJobsList({
    colleagues = [],
    assigneeId = "",
    recent = false,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [status, setStatus] = useState(recent ? "all" : "active");
    const query = useAssistantTeams({ status });
    const teams = (
        query.data?.pages?.flatMap((page) => page.teams) || []
    ).filter(
        (team) =>
            !assigneeId ||
            team.members.some((m) => m.assistantId === assigneeId),
    );
    return (
        <section
            dir={direction}
            aria-label={t("teams.jobs")}
            className="space-y-3"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {t("teams.jobs")}
                </h3>
                <select
                    aria-label={t("teams.filter")}
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="min-h-10 rounded-lg border-gray-200 bg-white ps-3 pe-8 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                >
                    {["active", "history", "all"].map((value) => (
                        <option key={value} value={value}>
                            {t(`teams.filter.${value}`)}
                        </option>
                    ))}
                </select>
            </div>
            {query.isError && (
                <div
                    role="alert"
                    className="text-sm text-amber-700 dark:text-amber-300"
                >
                    {t(query.data ? "teams.refreshError" : "teams.loadError")}{" "}
                    <button
                        className="min-h-10 px-2 underline"
                        onClick={() => query.refetch()}
                    >
                        {t("teams.retry")}
                    </button>
                </div>
            )}
            {query.isLoading && (
                <p
                    role="status"
                    className="text-sm text-gray-500 dark:text-gray-400"
                >
                    {t("teams.loading")}
                </p>
            )}
            {!query.isLoading && !query.isError && !teams.length && (
                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {t("teams.empty")}
                </p>
            )}
            <ul className="space-y-3">
                {teams.map((team) => (
                    <li key={team.teamId}>
                        <Link
                            href={`/teams/${team.teamId}`}
                            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 text-start transition-colors hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:border-sky-600"
                        >
                            <TeamWisps
                                team={team}
                                colleagues={colleagues}
                                paused={query.isError}
                            />
                            <span className="min-w-0 flex-1">
                                <span className="mb-1 block">
                                    <TeamStatus state={teamState(team)} />
                                </span>
                                <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {team.title}
                                </span>
                                <span className="mt-1 block truncate text-xs text-gray-500 dark:text-gray-400">
                                    {teamCurrentWork(team, t)}
                                </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 rtl:rotate-180 dark:text-gray-500" />
                        </Link>
                    </li>
                ))}
            </ul>
            {query.hasPreviousPage && (
                <button
                    type="button"
                    onClick={query.fetchPreviousPage}
                    className="min-h-10 rounded-lg px-4 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
                >
                    {t("assistantDirectory.previous")}
                </button>
            )}
            {query.hasNextPage && (
                <button
                    disabled={query.isFetchingNextPage}
                    onClick={() => query.fetchNextPage()}
                    className="min-h-10 rounded-lg px-4 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
                >
                    {t("assistantDirectory.next")}
                </button>
            )}
        </section>
    );
}
