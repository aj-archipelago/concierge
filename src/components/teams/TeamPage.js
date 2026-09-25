"use client";
import { useContext } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    ArrowLeft,
    ArrowRight,
    Download,
    MessageCircle,
    ListTodo,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useAssistantTeam } from "../../hooks/useAssistantTeams";
import { useColleagues } from "../../hooks/useColleagues";
import PageHeader from "../../layout/PageHeader";
import { HeaderAction } from "../../layout/HeaderControls";
import ColleagueAvatar, {
    getEntityWispVariant,
} from "../colleagues/ColleagueAvatar";
import {
    assignmentState,
    isTeamActive,
    memberActivity,
    teamCounts,
    teamCurrentWork,
    teamState,
} from "../../utils/assistantTeamStatus";
import TeamStatus from "./TeamStatus";
import TeamWisps from "./TeamWisps";
import TeamConversationButton from "./TeamConversationButton";
import TeamJobControls from "./TeamJobControls";

const panel =
    "min-w-0 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900/40";
const action =
    "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300 dark:hover:bg-sky-950";
function Text({ children }) {
    if (!children) return null;
    return (
        <div className="prose prose-sm max-w-none break-words [overflow-wrap:anywhere] prose-pre:overflow-x-auto dark:prose-invert">
            <Markdown remarkPlugins={[remarkGfm]} skipHtml>
                {children}
            </Markdown>
        </div>
    );
}
export default function TeamPage({ teamId }) {
    const { t } = useTranslation();
    const { direction, language } = useContext(LanguageContext);
    const query = useAssistantTeam(teamId);
    const { data: colleagues = [] } = useColleagues({
        ids: query.data?.members?.map((member) => member.assistantId) || [],
        limit: 100,
    });
    const team = [401, 403, 404].includes(query.error?.response?.status)
        ? null
        : query.data;
    const name = (id) =>
        id === "user"
            ? t("teams.you")
            : team?.members.find((m) => m.assistantId === id)?.name ||
              colleagues.find((c) => c.id === id)?.name ||
              t("teams.assistant");
    const date = (value) =>
        value && Number.isFinite(Date.parse(value))
            ? new Date(value).toLocaleString(language, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
              })
            : "";
    const questions =
        team?.assignments.filter(
            (a) =>
                a.to === "user" && a.status === "pending" && isTeamActive(team),
        ) || [];
    const counts = team ? teamCounts(team) : null;
    return (
        <main
            dir={direction}
            className="mx-auto w-full max-w-6xl space-y-6 pb-10 text-gray-900 dark:text-gray-100"
            data-team-page
        >
            <PageHeader title={team?.title || t("teams.title")}>
                <HeaderAction
                    href="/colleagues?view=tasks"
                    icon={ListTodo}
                    label={t("teams.allTasks")}
                />
                {team?.chatId && (
                    <TeamConversationButton
                        chatId={team.chatId}
                        label={t("teams.openConversation")}
                        compact
                    />
                )}
                {team?.chatId && (
                    <HeaderAction
                        href={`/chat/${team.chatId}`}
                        icon={MessageCircle}
                        label={t("teams.fullConversation")}
                    />
                )}
            </PageHeader>
            {query.isError && (
                <div
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                >
                    {t(
                        team
                            ? "teams.refreshError"
                            : query.error?.response?.status === 404
                              ? "teams.notFound"
                              : "teams.loadError",
                    )}
                    <button
                        onClick={() => query.refetch()}
                        className="min-h-10 px-3 font-medium underline"
                    >
                        {t("teams.retry")}
                    </button>
                </div>
            )}
            {query.isLoading && (
                <p
                    role="status"
                    className="py-12 text-center text-gray-500 dark:text-gray-400"
                >
                    {t("teams.loading")}
                </p>
            )}
            {team && (
                <>
                    <section
                        className="overflow-hidden rounded-3xl border border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-violet-50/70 p-5 sm:p-7 dark:border-sky-900/70 dark:from-sky-950/50 dark:via-gray-900 dark:to-violet-950/30"
                        aria-label={t("teams.overview")}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <TeamWisps
                                    team={team}
                                    colleagues={colleagues}
                                    paused={query.isError}
                                />
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
                                        {t("teams.chatLabel", {
                                            count: team.members.length,
                                        })}
                                    </p>
                                    <div className="mt-2">
                                        <TeamStatus state={teamState(team)} />
                                    </div>
                                </div>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {t("teams.started", {
                                    date: date(team.createdAt),
                                })}
                            </span>
                        </div>
                        <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-t border-sky-100 pt-4 dark:border-sky-900/60">
                            <div className="min-w-0">
                                <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                    {t(
                                        isTeamActive(team)
                                            ? "teams.currentStep"
                                            : "teams.outcome",
                                    )}
                                </h2>
                                <p
                                    className="mt-1 break-words text-lg font-semibold sm:text-xl"
                                    role="status"
                                >
                                    {teamCurrentWork(team, t)}
                                </p>
                            </div>
                            <span className="rounded-full bg-white/70 px-3 py-1.5 text-xs text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                                {t("teams.assignmentCount", counts)}
                            </span>
                        </div>
                        <details className="mt-4 border-t border-sky-100 pt-2 dark:border-sky-900/60">
                            <summary className="min-h-10 cursor-pointer content-center text-xs font-medium text-gray-600 dark:text-gray-300">
                                {t("teams.brief")}
                            </summary>
                            <Text>{team.goal}</Text>
                        </details>
                    </section>
                    {teamState(team) === "completed" && team.result && (
                        <section
                            id="result"
                            className={`${panel} scroll-mt-24 border-emerald-200 dark:border-emerald-900`}
                            aria-label={t("teams.result")}
                        >
                            <h2 className="mb-4 font-semibold">
                                {t("teams.result")}
                            </h2>
                            <Text>{team.result.summary}</Text>
                            {team.downloads.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {team.downloads.map((file) => (
                                        <a
                                            key={file.url}
                                            href={file.url}
                                            className={`${action} border border-gray-200 dark:border-gray-700`}
                                        >
                                            <Download className="h-4 w-4 shrink-0" />
                                            <bdi className="break-all">
                                                {file.name}
                                            </bdi>
                                        </a>
                                    ))}
                                </div>
                            )}
                            {team.result.evidence?.length > 0 && (
                                <details className="mt-4">
                                    <summary className="min-h-10 cursor-pointer content-center text-sm font-medium">
                                        {t("teams.evidence")}
                                    </summary>
                                    <ul className="list-disc space-y-2 ps-5 text-sm">
                                        {team.result.evidence.map(
                                            (e, index) => (
                                                <li key={index}>
                                                    <Text>{e}</Text>
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                </details>
                            )}
                        </section>
                    )}
                    {team.error && (
                        <div
                            role="alert"
                            className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                        >
                            <h2 className="font-semibold">
                                {t("teams.problem")}
                            </h2>
                            <p className="mt-1 whitespace-pre-wrap break-words">
                                {team.error}
                            </p>
                        </div>
                    )}
                    {questions.map((question) => (
                        <section
                            key={question.messageId}
                            className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30"
                        >
                            <h2 className="mb-2 font-semibold">
                                {t("teams.questionFrom", {
                                    name: name(question.from),
                                })}
                            </h2>
                            <Text>{question.request}</Text>
                            {question.questionChatId ? (
                                <div className="mt-3">
                                    <TeamConversationButton
                                        chatId={
                                            team.chatId ||
                                            question.questionChatId
                                        }
                                        label={t("teams.answer")}
                                    />
                                </div>
                            ) : (
                                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                                    {t("teams.questionUnavailable")}
                                </p>
                            )}
                        </section>
                    ))}
                    <section aria-label={t("teams.people")}>
                        <h2 className="mb-3 text-sm font-semibold">
                            {t("teams.people")}
                        </h2>
                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {team.members.map((member) => {
                                const activity = memberActivity(team, member);
                                const entity = colleagues.find(
                                    (c) => c.id === member.assistantId,
                                );
                                return (
                                    <li
                                        key={member.assistantId}
                                        className={panel}
                                    >
                                        <div className="flex items-center gap-3">
                                            <ColleagueAvatar
                                                entityId={member.assistantId}
                                                variant={getEntityWispVariant(
                                                    entity,
                                                )}
                                                className="h-12 w-10"
                                                animated={
                                                    !query.isError &&
                                                    isTeamActive(team) &&
                                                    [
                                                        "working",
                                                        "reviewing",
                                                        "coordinating",
                                                    ].includes(activity.state)
                                                }
                                                activity={{
                                                    phase: [
                                                        "working",
                                                        "reviewing",
                                                        "coordinating",
                                                    ].includes(activity.state)
                                                        ? "thinking"
                                                        : activity.state ===
                                                            "needs_answer"
                                                          ? "attention"
                                                          : "idle",
                                                }}
                                            />
                                            <div className="min-w-0">
                                                <h3 className="truncate font-semibold">
                                                    <bdi>{member.name}</bdi>
                                                </h3>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {t(
                                                        member.assistantId ===
                                                            team.coordinatorId
                                                            ? "teams.coordinator"
                                                            : "teams.specialist",
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <p
                                            className="mt-3 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400"
                                            title={member.role}
                                        >
                                            {member.role}
                                        </p>
                                        <div className="mt-3">
                                            <TeamStatus
                                                state={activity.state}
                                            />
                                        </div>
                                        <p className="mt-3 line-clamp-3 break-words text-sm leading-6 text-gray-600 dark:text-gray-300">
                                            {([
                                                "completed",
                                                "accepted",
                                                "answered",
                                                "blocked",
                                                "needs_revision",
                                            ].includes(activity.state)
                                                ? activity.assignment?.result
                                                      ?.summary ||
                                                  activity.assignment?.answer
                                                : activity.assignment
                                                      ?.statusText) ||
                                                activity.assignment?.request ||
                                                t(
                                                    activity.state ===
                                                        "recruited"
                                                        ? "teams.recruitedHint"
                                                        : "teams.coordinatorHint",
                                                )}
                                        </p>
                                        {activity.assignment && (
                                            <a
                                                href={`#assignment-${activity.assignment.messageId}`}
                                                className={`${action} mt-2 -ms-3`}
                                            >
                                                {t("teams.assignmentDetails")}
                                                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                                            </a>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <section
                            aria-label={t("teams.activity")}
                            className="min-w-0"
                        >
                            <h2 className="mb-3 text-sm font-semibold">
                                {t("teams.activity")}
                            </h2>
                            {!team.assignments.length && (
                                <p
                                    className={`${panel} text-sm text-gray-500 dark:text-gray-400`}
                                >
                                    {t("teams.noAssignments")}
                                </p>
                            )}
                            <ol className="space-y-3">
                                {[...team.assignments]
                                    .reverse()
                                    .map((assignment) => (
                                        <li
                                            key={assignment.messageId}
                                            id={`assignment-${assignment.messageId}`}
                                            className={`${panel} scroll-mt-24`}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                    {t(
                                                        `teams.purpose.${assignment.purpose}`,
                                                    )}
                                                </span>
                                                <time
                                                    className="text-xs text-gray-500 dark:text-gray-400"
                                                    dateTime={
                                                        assignment.createdAt
                                                    }
                                                >
                                                    {date(assignment.createdAt)}
                                                </time>
                                            </div>
                                            <div className="my-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
                                                <bdi>
                                                    {name(assignment.from)}
                                                </bdi>
                                                <ArrowRight
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5 text-gray-400 rtl:rotate-180 dark:text-gray-500"
                                                />
                                                <bdi>{name(assignment.to)}</bdi>
                                                <TeamStatus
                                                    state={assignmentState(
                                                        assignment,
                                                        team,
                                                    )}
                                                />
                                            </div>
                                            <p className="line-clamp-2 break-words text-sm leading-6 text-gray-600 dark:text-gray-300">
                                                {assignment.request}
                                            </p>
                                            <details className="mt-2">
                                                <summary className="min-h-10 cursor-pointer content-center text-sm font-medium text-sky-700 dark:text-sky-300">
                                                    {t(
                                                        "teams.assignmentDetails",
                                                    )}
                                                </summary>
                                                <div className="space-y-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                                                    <Text>
                                                        {assignment.request}
                                                    </Text>
                                                    {assignment.checkpoint && (
                                                        <div>
                                                            <h3 className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                                {t(
                                                                    "teams.checkpoint",
                                                                )}
                                                            </h3>
                                                            <Text>
                                                                {
                                                                    assignment.checkpoint
                                                                }
                                                            </Text>
                                                        </div>
                                                    )}
                                                    {assignment.result
                                                        ?.summary && (
                                                        <div>
                                                            <h3 className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                                {t(
                                                                    "teams.handback",
                                                                )}
                                                            </h3>
                                                            <Text>
                                                                {
                                                                    assignment
                                                                        .result
                                                                        .summary
                                                                }
                                                            </Text>
                                                        </div>
                                                    )}
                                                    {assignment.answer && (
                                                        <div>
                                                            <h3 className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                                {t(
                                                                    "teams.answerReceived",
                                                                )}
                                                            </h3>
                                                            <Text>
                                                                {
                                                                    assignment.answer
                                                                }
                                                            </Text>
                                                        </div>
                                                    )}
                                                    {assignment.error && (
                                                        <p className="whitespace-pre-wrap break-words text-sm text-amber-800 dark:text-amber-200">
                                                            {assignment.error}
                                                        </p>
                                                    )}
                                                    {assignment.result?.evidence
                                                        ?.length > 0 && (
                                                        <ul className="list-disc space-y-2 ps-5 text-sm">
                                                            {assignment.result.evidence.map(
                                                                (e, index) => (
                                                                    <li
                                                                        key={
                                                                            index
                                                                        }
                                                                    >
                                                                        <Text>
                                                                            {e}
                                                                        </Text>
                                                                    </li>
                                                                ),
                                                            )}
                                                        </ul>
                                                    )}
                                                </div>
                                            </details>
                                        </li>
                                    ))}
                            </ol>
                        </section>
                        <aside className="min-w-0 space-y-4">
                            <section className={panel}>
                                <h2 className="mb-3 text-sm font-semibold">
                                    {t("teams.plan")}
                                </h2>
                                <Text>{team.plan}</Text>
                                {team.acceptanceCriteria.length > 0 && (
                                    <>
                                        <h3 className="mb-2 mt-5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                            {t("teams.criteria")}
                                        </h3>
                                        <ul className="list-disc space-y-2 ps-4 text-sm leading-6">
                                            {team.acceptanceCriteria.map(
                                                (criterion, index) => (
                                                    <li
                                                        key={index}
                                                        className="break-words"
                                                    >
                                                        {criterion}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    </>
                                )}
                            </section>
                            {team.decisions.length > 0 && (
                                <section className={panel}>
                                    <h2 className="mb-3 text-sm font-semibold">
                                        {t("teams.decisions")}
                                    </h2>
                                    <ol className="space-y-4">
                                        {team.decisions.map(
                                            (decision, index) => (
                                                <li key={index}>
                                                    <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                                                        {name(decision.author)}{" "}
                                                        · {date(decision.at)}
                                                    </p>
                                                    <Text>{decision.text}</Text>
                                                </li>
                                            ),
                                        )}
                                    </ol>
                                </section>
                            )}
                        </aside>
                    </div>
                    <TeamJobControls team={team} />
                    <Link href="/colleagues?view=tasks" className={action}>
                        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                        {t("teams.allTasks")}
                    </Link>
                </>
            )}
        </main>
    );
}
