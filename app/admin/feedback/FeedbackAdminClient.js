"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useTranslation } from "react-i18next";
import {
    CheckCircle2,
    ExternalLink,
    Image as ImageIcon,
    Loader2,
    MessageSquareText,
    RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import { QUERIES } from "@/src/graphql";
import { isArabicText } from "@/src/utils/languageDetection";

const FILTERS = [
    { id: "open", label: "admin_feedback_filter_open" },
    { id: "resolved", label: "admin_feedback_filter_resolved" },
    { id: "all", label: "admin_feedback_filter_all" },
];

const CATEGORY_LABELS = {
    bug: "feedback_category_bug",
    idea: "feedback_category_idea",
    question: "feedback_category_question",
    other: "feedback_category_other",
};

const TRANSLATION_LANGUAGE_NAMES = {
    ar: "Arabic",
    en: "English",
};

function getUiLanguage(language) {
    return language?.startsWith("ar") ? "ar" : "en";
}

function getFeedbackLanguage(feedback) {
    return isArabicText(feedback?.message) ? "ar" : "en";
}

function itemMatchesStatus(item, status) {
    return status === "all" || item.status === status;
}

function formatDate(value, language = "en") {
    if (!value) return "";
    return new Intl.DateTimeFormat(language?.startsWith("ar") ? "ar" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function getSubmitter(feedback) {
    return (
        feedback.userName ||
        feedback.user?.name ||
        feedback.username ||
        feedback.user?.username ||
        null
    );
}

export default function FeedbackAdminClient({
    initialFeedback,
    initialCounts,
    initialStatus,
    initialSelected,
}) {
    const apolloClient = useApolloClient();
    const { t, i18n } = useTranslation();
    const language = getUiLanguage(i18n.language || "en");
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const [feedback, setFeedback] = useState(initialFeedback || []);
    const [counts, setCounts] = useState(initialCounts || {});
    const [status, setStatus] = useState(initialStatus || "open");
    const [selectedId, setSelectedId] = useState(
        initialSelected?._id || initialFeedback?.[0]?._id || null,
    );
    const [loading, setLoading] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);
    const [error, setError] = useState(null);
    const [translations, setTranslations] = useState({});
    const translationRequestsRef = useRef(new Set());
    const [showOriginal, setShowOriginal] = useState({});

    const selected = useMemo(() => {
        return (
            feedback.find((item) => item._id === selectedId) ||
            (initialSelected?._id === selectedId &&
            itemMatchesStatus(initialSelected, status)
                ? initialSelected
                : null) ||
            feedback[0] ||
            null
        );
    }, [feedback, initialSelected, selectedId, status]);

    const getTranslationKey = (item) => `${item._id}:${language}`;

    const getMessageDisplay = (item) => {
        if (!item?.message) {
            return {
                text: "",
                canTranslate: false,
                isTranslated: false,
                isLoading: false,
            };
        }

        const feedbackLanguage = getFeedbackLanguage(item);
        const canTranslate =
            feedbackLanguage !== language &&
            !!TRANSLATION_LANGUAGE_NAMES[language];
        const key = getTranslationKey(item);
        const cached = translations[key];
        const originalVisible = !!showOriginal[key];

        if (
            !canTranslate ||
            !cached ||
            cached.status !== "done" ||
            originalVisible
        ) {
            return {
                text: item.message,
                canTranslate,
                hasTranslation: canTranslate && cached?.status === "done",
                isTranslated: false,
                isLoading: canTranslate && cached?.status === "loading",
                key,
            };
        }

        return {
            text: cached.text,
            canTranslate,
            hasTranslation: true,
            isTranslated: true,
            isLoading: false,
            key,
        };
    };

    useEffect(() => {
        const candidates = [...feedback];
        if (selected && !candidates.some((item) => item._id === selected._id)) {
            candidates.push(selected);
        }

        const pending = candidates.filter((item) => {
            if (!item?.message || getFeedbackLanguage(item) === language) {
                return false;
            }
            const key = `${item._id}:${language}`;
            return !translationRequestsRef.current.has(key);
        });

        if (!pending.length || !TRANSLATION_LANGUAGE_NAMES[language]) {
            return undefined;
        }

        setTranslations((current) => {
            const next = { ...current };
            pending.forEach((item) => {
                const key = `${item._id}:${language}`;
                translationRequestsRef.current.add(key);
                next[key] = { status: "loading" };
            });
            return next;
        });

        pending.forEach((item) => {
            const key = `${item._id}:${language}`;
            apolloClient
                .query({
                    query: QUERIES.TRANSLATE,
                    variables: {
                        text: item.message,
                        to: TRANSLATION_LANGUAGE_NAMES[language],
                        model: "oai-gpt55",
                    },
                })
                .then((response) => {
                    const translatedText =
                        response.data?.translate?.result?.trim();
                    setTranslations((current) => ({
                        ...current,
                        [key]: translatedText
                            ? { status: "done", text: translatedText }
                            : { status: "error" },
                    }));
                })
                .catch(() => {
                    setTranslations((current) => ({
                        ...current,
                        [key]: { status: "error" },
                    }));
                });
        });
    }, [apolloClient, feedback, language, selected]);

    useEffect(() => {
        const params = new URLSearchParams();
        params.set("status", status);
        if (selectedId) params.set("selected", selectedId);

        async function loadFeedback() {
            try {
                setLoading(true);
                setError(null);
                const response = await fetch(
                    `/api/admin/feedback?${params.toString()}`,
                );
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error || t("admin_feedback_load_failed"),
                    );
                }

                const nextFeedback = data.feedback || [];
                setFeedback(nextFeedback);
                setCounts(data.counts || {});

                if (
                    data.selectedFeedback &&
                    itemMatchesStatus(data.selectedFeedback, status) &&
                    !nextFeedback.some(
                        (item) => item._id === data.selectedFeedback._id,
                    )
                ) {
                    setFeedback([data.selectedFeedback, ...nextFeedback]);
                    setSelectedId(data.selectedFeedback._id);
                } else if (
                    !nextFeedback.some((item) => item._id === selectedId)
                ) {
                    setSelectedId(nextFeedback[0]?._id || null);
                }
            } catch (err) {
                setError(err.message || t("admin_feedback_load_failed"));
            } finally {
                setLoading(false);
            }
        }

        loadFeedback();
    }, [selectedId, status, t]);

    const updateStatus = async (item, nextStatus) => {
        try {
            setUpdatingId(item._id);
            setError(null);
            const response = await fetch(`/api/admin/feedback/${item._id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ status: nextStatus }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || t("admin_feedback_update_failed"),
                );
            }

            const nextItems = itemMatchesStatus(data.feedback, status)
                ? feedback.map((current) =>
                      current._id === item._id ? data.feedback : current,
                  )
                : feedback.filter((current) => current._id !== item._id);

            setFeedback(nextItems);

            if (
                selectedId === item._id &&
                !itemMatchesStatus(data.feedback, status)
            ) {
                setSelectedId(nextItems[0]?._id || null);
            }
            setCounts((current) => ({
                ...current,
                [item.status]: Math.max((current[item.status] || 1) - 1, 0),
                [nextStatus]: (current[nextStatus] || 0) + 1,
            }));
        } catch (err) {
            setError(err.message || t("admin_feedback_update_failed"));
        } finally {
            setUpdatingId(null);
        }
    };

    const renderTranslationMarker = (messageDisplay, interactive = true) => {
        if (messageDisplay.isLoading) {
            return (
                <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                    {t("admin_feedback_translating")}
                </span>
            );
        }

        if (!messageDisplay.hasTranslation) {
            return null;
        }

        if (!interactive) {
            return (
                <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                    {messageDisplay.isTranslated
                        ? t("admin_feedback_translated")
                        : t("admin_feedback_original")}
                </span>
            );
        }

        return (
            <button
                type="button"
                className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-900/70 dark:hover:text-sky-200"
                onClick={(event) => {
                    event.stopPropagation();
                    setShowOriginal((current) => ({
                        ...current,
                        [messageDisplay.key]: messageDisplay.isTranslated,
                    }));
                }}
            >
                {messageDisplay.isTranslated
                    ? t("admin_feedback_translated_show_original")
                    : t("admin_feedback_show_translated")}
            </button>
        );
    };

    const selectedMessageDisplay = selected
        ? getMessageDisplay(selected)
        : null;

    return (
        <div dir={direction} className="px-4 py-2 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                        {t("admin_feedback_title")}
                    </h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        {t("admin_feedback_description")}
                    </p>
                </div>
                <div className="flex overflow-x-auto rounded-md border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
                    {FILTERS.map((filter) => (
                        <button
                            key={filter.id}
                            type="button"
                            onClick={() => setStatus(filter.id)}
                            className={cn(
                                "h-10 whitespace-nowrap rounded px-3 text-sm font-medium text-gray-600 transition-colors dark:text-gray-300",
                                status === filter.id
                                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                                    : "hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                            )}
                        >
                            {t(filter.label)}
                            {filter.id !== "all" ? (
                                <span className="ms-2 text-xs opacity-70">
                                    {counts[filter.id] || 0}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
            </div>

            {error ? (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            ) : null}

            <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
                <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-700">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {status === "all"
                                ? t("admin_feedback_all_feedback")
                                : t("admin_feedback_status_feedback", {
                                      status: t(
                                          status === "resolved"
                                              ? "admin_feedback_status_resolved"
                                              : "admin_feedback_status_open",
                                      ),
                                  })}
                        </div>
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
                        ) : null}
                    </div>
                    <div className="max-h-[520px] overflow-y-auto">
                        {feedback.length ? (
                            feedback.map((item) => {
                                const messageDisplay = getMessageDisplay(item);

                                return (
                                    <button
                                        key={item._id}
                                        type="button"
                                        onClick={() => setSelectedId(item._id)}
                                        className={cn(
                                            "block w-full border-b border-gray-100 px-4 py-3 text-start transition-colors dark:border-gray-800",
                                            selected?._id === item._id
                                                ? "bg-sky-50 dark:bg-sky-950/30"
                                                : "hover:bg-gray-50 dark:hover:bg-gray-800/70",
                                        )}
                                    >
                                        <div className="mb-2 flex items-center gap-2">
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                                {t(
                                                    CATEGORY_LABELS[
                                                        item.category
                                                    ] ||
                                                        "admin_feedback_feedback",
                                                )}
                                            </span>
                                            {item.screenshotUrl ? (
                                                <ImageIcon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                                            ) : null}
                                            {item.source === "agent" ? (
                                                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                                    {t(
                                                        "admin_feedback_source_agent",
                                                    )}
                                                </span>
                                            ) : null}
                                            <span className="ms-auto text-xs text-gray-500 dark:text-gray-400">
                                                {formatDate(
                                                    item.createdAt,
                                                    language,
                                                )}
                                            </span>
                                        </div>
                                        <div className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {messageDisplay.text}
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                                            <span>
                                                {getSubmitter(item) ||
                                                    t(
                                                        "admin_feedback_unknown_user",
                                                    )}
                                            </span>
                                            {renderTranslationMarker(
                                                messageDisplay,
                                                false,
                                            )}
                                        </div>
                                    </button>
                                );
                            })
                        ) : (
                            <div className="flex h-48 flex-col items-center justify-center px-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                <MessageSquareText className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                                {t("admin_feedback_empty")}
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    {selected ? (
                        <div className="flex h-full flex-col">
                            <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                                {t(
                                                    CATEGORY_LABELS[
                                                        selected.category
                                                    ] ||
                                                        "admin_feedback_feedback",
                                                )}
                                            </span>
                                            <span
                                                className={cn(
                                                    "rounded-full px-2.5 py-1 text-xs font-medium",
                                                    selected.status ===
                                                        "resolved"
                                                        ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                                                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                                                )}
                                            >
                                                {t(
                                                    selected.status ===
                                                        "resolved"
                                                        ? "admin_feedback_status_resolved"
                                                        : "admin_feedback_status_open",
                                                )}
                                            </span>
                                            {selected.source === "agent" ? (
                                                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                                    {t(
                                                        "admin_feedback_source_agent",
                                                    )}
                                                </span>
                                            ) : null}
                                        </div>
                                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                            {getSubmitter(selected) ||
                                                t(
                                                    "admin_feedback_unknown_user",
                                                )}
                                        </h2>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {t("admin_feedback_submitted", {
                                                date: formatDate(
                                                    selected.createdAt,
                                                    language,
                                                ),
                                            })}
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant={
                                            selected.status === "resolved"
                                                ? "outline"
                                                : "default"
                                        }
                                        onClick={() =>
                                            updateStatus(
                                                selected,
                                                selected.status === "resolved"
                                                    ? "open"
                                                    : "resolved",
                                            )
                                        }
                                        disabled={updatingId === selected._id}
                                        className="min-h-10 gap-2"
                                    >
                                        {updatingId === selected._id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : selected.status === "resolved" ? (
                                            <RotateCcw className="h-4 w-4" />
                                        ) : (
                                            <CheckCircle2 className="h-4 w-4" />
                                        )}
                                        {selected.status === "resolved"
                                            ? t("admin_feedback_reopen")
                                            : t("admin_feedback_mark_resolved")}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-6 overflow-y-auto p-4 sm:p-6">
                                <section>
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {t("Message")}
                                        </h3>
                                        {selectedMessageDisplay
                                            ? renderTranslationMarker(
                                                  selectedMessageDisplay,
                                              )
                                            : null}
                                    </div>
                                    <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                                        {selectedMessageDisplay?.text ||
                                            selected.message}
                                    </div>
                                </section>

                                <section className="grid gap-3 text-sm sm:grid-cols-2">
                                    <div>
                                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            {t("Username")}
                                        </div>
                                        <div className="mt-1 text-gray-900 dark:text-gray-100">
                                            {selected.username ||
                                                selected.user?.username ||
                                                t(
                                                    "admin_feedback_unknown_user",
                                                )}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            {t("admin_feedback_resolved")}
                                        </div>
                                        <div className="mt-1 text-gray-900 dark:text-gray-100">
                                            {selected.resolvedAt
                                                ? t(
                                                      "admin_feedback_resolved_by",
                                                      {
                                                          date: formatDate(
                                                              selected.resolvedAt,
                                                              language,
                                                          ),
                                                          user:
                                                              getSubmitter({
                                                                  user: selected.resolvedBy,
                                                              }) ||
                                                              t(
                                                                  "admin_feedback_unknown_user",
                                                              ),
                                                      },
                                                  )
                                                : t(
                                                      "admin_feedback_not_resolved",
                                                  )}
                                        </div>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            {t("admin_feedback_page")}
                                        </div>
                                        {selected.pageUrl ? (
                                            <a
                                                href={selected.pageUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-1 inline-flex items-center gap-1 break-all text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
                                            >
                                                {selected.pageUrl}
                                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                            </a>
                                        ) : (
                                            <div className="mt-1 text-gray-900 dark:text-gray-100">
                                                {t(
                                                    "admin_feedback_not_included",
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {selected.screenshotUrl ? (
                                    <section>
                                        <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {t("Screenshot")}
                                        </h3>
                                        <a
                                            href={selected.screenshotUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                                        >
                                            <img
                                                src={selected.screenshotUrl}
                                                alt=""
                                                className="max-h-[520px] w-full object-contain"
                                            />
                                        </a>
                                    </section>
                                ) : null}

                                {selected.userAgent ? (
                                    <section>
                                        <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {t("admin_feedback_browser")}
                                        </h3>
                                        <div className="break-all rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                            {selected.userAgent}
                                        </div>
                                    </section>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            <MessageSquareText className="mb-2 h-10 w-10 text-gray-300 dark:text-gray-600" />
                            {t("admin_feedback_select")}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
