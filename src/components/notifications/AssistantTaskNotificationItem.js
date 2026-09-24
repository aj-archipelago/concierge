"use client";
import { useContext } from "react";
import { Check, Clock, AlertCircle, MessageCircle } from "lucide-react";
import { LanguageContext } from "../../contexts/LanguageProvider";
import ColleagueAvatar from "../colleagues/ColleagueAvatar";
import { getNotificationNavigationPath } from "../../utils/shareNotificationUtils";

export default function AssistantTaskNotificationItem({
    notification,
    router,
    setIsNotificationOpen,
    handleCancelRequest,
    handleDismiss,
    t,
}) {
    const { direction } = useContext(LanguageContext);
    const progress = notification.assistantProgress;
    const active = ["pending", "in_progress", "waiting"].includes(
        notification.status,
    );
    const needsAnswer = progress.waitingFor?.some((r) => !r.assistantId);
    const waitingNames = [
        ...new Set(
            (progress.waitingFor || [])
                .filter((r) => r.assistantId)
                .map((r) => r.name),
        ),
    ].join(", ");
    const status = needsAnswer
        ? t("assistants.progress.needsAnswer")
        : notification.status === "waiting" && waitingNames
          ? t("assistants.progress.waitingFor", { names: waitingNames })
          : progress.repliesReady
            ? t("assistants.progress.repliesReady")
            : t(`assistants.progress.${notification.status}`);
    const path = getNotificationNavigationPath(notification);
    const question = progress.waitingFor?.find(
        (r) => !r.assistantId && r.questionChatId,
    );
    const open = (destination) => {
        router.push(destination);
        setIsNotificationOpen?.(false);
    };
    return (
        <article
            dir={direction}
            data-request-id={notification._id}
            className="mb-2 rounded-xl border border-gray-200 bg-white p-3 text-start dark:border-gray-700 dark:bg-gray-800"
        >
            <div className="flex items-start gap-3">
                <ColleagueAvatar
                    entityId={progress.assistantId}
                    variant={
                        progress.kind === "personal"
                            ? "personal"
                            : progress.avatar
                    }
                    className="h-10 w-10"
                    animated={false}
                />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        <bdi>{progress.name}</bdi>
                    </p>
                    <h3 className="mt-0.5 break-words text-sm text-gray-600 dark:text-gray-300">
                        {progress.title || t("assistants.progress.task")}
                    </h3>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        {notification.status === "completed" ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : ["failed", "abandoned"].includes(
                              notification.status,
                          ) ? (
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        ) : (
                            <Clock className="h-4 w-4 shrink-0" />
                        )}
                        <span>{status}</span>
                    </p>
                    {progress.requests?.length > 0 && (
                        <details className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                            <summary className="min-h-10 cursor-pointer content-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
                                {t("assistants.progress.details")}
                            </summary>
                            <ul className="space-y-2 border-s border-gray-200 ps-3 dark:border-gray-600">
                                {progress.requests.map((request) => (
                                    <li
                                        key={request.messageId}
                                        className="break-words"
                                    >
                                        <span className="font-medium">
                                            <bdi>
                                                {request.name ||
                                                    t(
                                                        "assistants.progress.you",
                                                    )}
                                            </bdi>
                                        </span>
                                        {" · "}
                                        {t(
                                            `assistants.progress.${request.status}`,
                                        )}
                                        <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                                            {request.request}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2 dark:border-gray-700">
                {(question || path) && (
                    <button
                        type="button"
                        onClick={() =>
                            open(
                                question
                                    ? `/chat/${question.questionChatId}`
                                    : path,
                            )
                        }
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300 dark:hover:bg-sky-950"
                    >
                        <MessageCircle className="h-4 w-4" />
                        {t(
                            question
                                ? "assistants.progress.answer"
                                : progress.teamId
                                  ? "teams.open"
                                  : "assistants.progress.openChat",
                        )}
                    </button>
                )}
                {question && progress.teamId && (
                    <button
                        type="button"
                        onClick={() => open(path)}
                        className="min-h-10 rounded-md px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
                    >
                        {t("teams.open")}
                    </button>
                )}
                {active ? (
                    <button
                        type="button"
                        onClick={() => handleCancelRequest(notification._id)}
                        className="ms-auto min-h-10 rounded-md px-2 text-xs text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                        {t("assistants.progress.stopTask")}
                    </button>
                ) : (
                    handleDismiss && (
                        <button
                            type="button"
                            onClick={() =>
                                handleDismiss(notification._id, "task")
                            }
                            className="ms-auto min-h-10 rounded-md px-2 text-xs text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                            {t("Hide")}
                        </button>
                    )
                )}
            </div>
        </article>
    );
}
