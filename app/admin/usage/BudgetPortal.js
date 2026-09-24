"use client";

import { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ArrowUpRight,
    Clock3,
    Download,
    Search,
    ShieldAlert,
    WalletCards,
} from "lucide-react";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";
import WeeklyBudgetControl from "./WeeklyBudgetControl";
import {
    buildBudgetRows,
    budgetCsv,
    filterBudgetRows,
    summarizeBudgets,
} from "./budgetMetrics";

const STATUS_STYLES = {
    exhausted: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
    blocked:
        "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    near: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    within: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    unlimited: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    waiting:
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    notStarted:
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
const PAGE_SIZE = 25;
const inputStyle =
    "min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export default function BudgetPortal({
    limits,
    keyMappings,
    usage,
    error,
    labelsError,
    loading,
    refreshing,
    onRefresh,
    onSaved,
    onInspect,
}) {
    const { t, i18n } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext);
    const locale = i18n?.resolvedLanguage || i18n?.language || "en";
    const money = (value) =>
        value == null
            ? "—"
            : new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 2,
              }).format(value);
    const date = (value) =>
        value
            ? new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
              }).format(new Date(value))
            : "—";
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [sort, setSort] = useState("attention");
    const [page, setPage] = useState(0);
    const rows = useMemo(
        () =>
            buildBudgetRows({
                budgets: limits?.budgets,
                keyMappings,
                usage,
                defaultWeeklyUsd: limits?.defaultWeeklyUsd,
            }),
        [limits, keyMappings, usage],
    );
    const summary = useMemo(() => summarizeBudgets(rows), [rows]);
    const filtered = useMemo(
        () => filterBudgetRows(rows, { search, filter, sort }),
        [rows, search, filter, sort],
    );
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pages - 1);
    const visible = filtered.slice(
        currentPage * PAGE_SIZE,
        (currentPage + 1) * PAGE_SIZE,
    );
    const ready = Boolean(limits) && !error;
    function exportBudgets() {
        const url = URL.createObjectURL(
            new Blob(["\uFEFF", budgetCsv(filtered)], {
                type: "text/csv;charset=utf-8",
            }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `weekly-budgets-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <section
            dir={direction}
            aria-label={t("usageDashboard.budgetControl")}
            className="space-y-5 text-start"
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
                        {t("usageDashboard.budgetControl")}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {t("usageDashboard.budgetDefault", {
                            cap:
                                limits?.defaultWeeklyUsd == null
                                    ? t("usageDashboard.unlimited")
                                    : money(limits.defaultWeeklyUsd),
                        })}
                    </p>
                </div>
                <div
                    className="text-sm text-slate-500 dark:text-slate-400"
                    role="status"
                >
                    {refreshing
                        ? t("usageDashboard.refreshing")
                        : limits?.generatedAt
                          ? t("usageDashboard.policyReadAt", {
                                date: date(limits.generatedAt),
                            })
                          : t("usageDashboard.loadingBudgets")}
                </div>
            </div>

            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                >
                    <p>{t("usageDashboard.budgetReadError")}</p>
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={refreshing}
                        className="mt-1 min-h-10 font-semibold underline disabled:opacity-50"
                    >
                        {t("usageDashboard.refresh")}
                    </button>
                </div>
            )}
            {labelsError && (
                <p
                    role="status"
                    className="text-sm text-amber-800 dark:text-amber-200"
                >
                    {t("usageDashboard.labelsError")}
                </p>
            )}
            {limits?.truncated && (
                <p
                    role="alert"
                    className="text-sm text-amber-800 dark:text-amber-200"
                >
                    {t("usageDashboard.truncatedBudgets")}
                </p>
            )}

            {loading && !limits ? (
                <div
                    role="status"
                    className="rounded-xl border border-slate-200 p-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
                >
                    {t("usageDashboard.loadingBudgets")}
                </div>
            ) : (
                limits && (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {[
                                {
                                    title: "recordedBudgetSpend",
                                    value: summary.snapshots
                                        ? money(summary.recordedSpend)
                                        : "—",
                                    note: t("usageDashboard.snapshotCoverage", {
                                        count: summary.snapshots,
                                        total: rows.length,
                                    }),
                                    Icon: WalletCards,
                                },
                                {
                                    title: "attentionKeys",
                                    value: summary.attention,
                                    note: t("usageDashboard.attentionNote"),
                                    Icon: ShieldAlert,
                                },
                                {
                                    title: "limitedKeys",
                                    value: summary.limited,
                                    note: t("usageDashboard.unlimitedKeys", {
                                        count: summary.unlimited,
                                    }),
                                    Icon: WalletCards,
                                },
                                {
                                    title: "waitingSnapshots",
                                    value: summary.waiting,
                                    note: t("usageDashboard.snapshotNote"),
                                    Icon: Clock3,
                                },
                            ].map(({ title, value, note, Icon }) => (
                                <div
                                    key={title}
                                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                                >
                                    <div className="flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
                                        <span>
                                            {t(`usageDashboard.${title}`)}
                                        </span>
                                        <Icon
                                            className="h-4 w-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                    </div>
                                    <div className="mt-3 text-3xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">
                                        {value}
                                    </div>
                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                        {note}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
                                <label className="relative min-w-0 flex-1 basis-56">
                                    <Search
                                        className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-slate-500 dark:text-slate-400"
                                        aria-hidden="true"
                                    />
                                    <input
                                        type="search"
                                        aria-label={t(
                                            "usageDashboard.searchKeys",
                                        )}
                                        placeholder={t(
                                            "usageDashboard.searchKeys",
                                        )}
                                        value={search}
                                        onChange={(event) => {
                                            setSearch(event.target.value);
                                            setPage(0);
                                        }}
                                        className={`${inputStyle} w-full ps-9`}
                                    />
                                </label>
                                <select
                                    aria-label={t("usageDashboard.filterKeys")}
                                    value={filter}
                                    onChange={(event) => {
                                        setFilter(event.target.value);
                                        setPage(0);
                                    }}
                                    className={`${inputStyle} min-w-36 flex-1 pe-9 sm:flex-none`}
                                    style={{
                                        backgroundPosition:
                                            direction === "rtl"
                                                ? "left 0.5rem center"
                                                : undefined,
                                    }}
                                >
                                    {[
                                        "all",
                                        "attention",
                                        "limited",
                                        "unlimited",
                                    ].map((value) => (
                                        <option key={value} value={value}>
                                            {t(
                                                `usageDashboard.filter.${value}`,
                                            )}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    aria-label={t("usageDashboard.sortKeys")}
                                    value={sort}
                                    onChange={(event) => {
                                        setSort(event.target.value);
                                        setPage(0);
                                    }}
                                    className={`${inputStyle} min-w-36 flex-1 pe-9 sm:flex-none`}
                                    style={{
                                        backgroundPosition:
                                            direction === "rtl"
                                                ? "left 0.5rem center"
                                                : undefined,
                                    }}
                                >
                                    {["attention", "spend", "name"].map(
                                        (value) => (
                                            <option key={value} value={value}>
                                                {t(
                                                    `usageDashboard.sort.${value}`,
                                                )}
                                            </option>
                                        ),
                                    )}
                                </select>
                                <button
                                    type="button"
                                    onClick={exportBudgets}
                                    disabled={!ready || !filtered.length}
                                    className={`${inputStyle} inline-flex items-center justify-center gap-2 disabled:opacity-50`}
                                >
                                    <Download
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                    />
                                    {t("usageDashboard.exportBudgets")}
                                </button>
                            </div>

                            <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                {visible.map((row) => (
                                    <article
                                        key={row.id}
                                        aria-label={row.label}
                                        className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-start"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="break-words font-medium text-slate-950 dark:text-slate-50">
                                                    {row.label}
                                                </h3>
                                                <span
                                                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[row.status]}`}
                                                >
                                                    {t(
                                                        `usageDashboard.status.${row.status}`,
                                                    )}
                                                </span>
                                            </div>
                                            {row.label !== row.id && (
                                                <div className="mt-1 text-start font-mono text-xs text-slate-500 dark:text-slate-400">
                                                    <bdi dir="ltr">
                                                        {row.id}
                                                    </bdi>
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onInspect(row.id)
                                                }
                                                className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-300"
                                            >
                                                {t(
                                                    "usageDashboard.viewActivity",
                                                )}
                                                <ArrowUpRight
                                                    className="h-4 w-4"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </div>
                                        <div className="min-w-0 space-y-2">
                                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                                <span className="text-lg font-semibold tabular-nums text-slate-950 dark:text-slate-50">
                                                    {money(row.spent)}
                                                </span>
                                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                                    {row.cap === null
                                                        ? t(
                                                              "usageDashboard.unlimited",
                                                          )
                                                        : t(
                                                              "usageDashboard.ofCap",
                                                              {
                                                                  cap: money(
                                                                      row.cap,
                                                                  ),
                                                              },
                                                          )}
                                                </span>
                                            </div>
                                            {row.percent != null && (
                                                <div
                                                    role="progressbar"
                                                    aria-label={t(
                                                        "usageDashboard.budgetUsed",
                                                        { key: row.label },
                                                    )}
                                                    aria-valuemin={0}
                                                    aria-valuemax={100}
                                                    aria-valuenow={Math.min(
                                                        100,
                                                        Math.round(row.percent),
                                                    )}
                                                    aria-valuetext={t(
                                                        "usageDashboard.usedPercent",
                                                        {
                                                            percent: Math.round(
                                                                row.percent,
                                                            ),
                                                        },
                                                    )}
                                                    className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                                                >
                                                    <div
                                                        style={{
                                                            width: `${Math.min(100, Math.max(0, row.percent))}%`,
                                                        }}
                                                        className={`h-full rounded-full ${row.status === "exhausted" ? "bg-red-600 dark:bg-red-400" : row.status === "near" ? "bg-amber-500 dark:bg-amber-400" : "bg-blue-600 dark:bg-blue-400"}`}
                                                    />
                                                </div>
                                            )}
                                            <p className="text-xs text-slate-600 dark:text-slate-400">
                                                {row.remaining != null
                                                    ? t(
                                                          "usageDashboard.remainingBudget",
                                                          {
                                                              amount: money(
                                                                  row.remaining,
                                                              ),
                                                          },
                                                      )
                                                    : row.cap === null
                                                      ? t(
                                                            "usageDashboard.noCap",
                                                        )
                                                      : t(
                                                            "usageDashboard.noSnapshot",
                                                        )}
                                            </p>
                                            {(row.budget?.snapshotAt ||
                                                row.cap === null) && (
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    {row.budget?.snapshotAt
                                                        ? t(
                                                              "usageDashboard.snapshotAt",
                                                              {
                                                                  date: date(
                                                                      row.budget
                                                                          .snapshotAt,
                                                                  ),
                                                              },
                                                          )
                                                        : t(
                                                              "usageDashboard.noSnapshot",
                                                          )}
                                                </p>
                                            )}
                                            {row.budget?.fallbackRequests >
                                                0 && (
                                                <p className="text-xs text-amber-800 dark:text-amber-200">
                                                    {t(
                                                        "usageDashboard.budgetFallbacks",
                                                        {
                                                            count: row.budget
                                                                .fallbackRequests,
                                                        },
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                        <div className="min-w-0 space-y-1 lg:border-s lg:border-slate-200 lg:ps-4 lg:dark:border-slate-700">
                                            <p className="text-xs text-slate-600 dark:text-slate-400">
                                                {row.budget?.resetAt
                                                    ? t(
                                                          "usageDashboard.resetsAt",
                                                          {
                                                              date: date(
                                                                  row.budget
                                                                      .resetAt,
                                                              ),
                                                          },
                                                      )
                                                    : t(
                                                          "usageDashboard.startsOnRequest",
                                                      )}
                                            </p>
                                            <WeeklyBudgetControl
                                                apiKeyId={row.id}
                                                budget={row.budget}
                                                defaultWeeklyUsd={
                                                    limits.defaultWeeklyUsd
                                                }
                                                ready={ready}
                                                onSaved={onSaved}
                                                compact
                                            />
                                        </div>
                                    </article>
                                ))}
                                {!visible.length && (
                                    <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                        {t(
                                            rows.length
                                                ? "usageDashboard.noMatchingKeys"
                                                : "usageDashboard.noKnownKeys",
                                        )}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                                <p>
                                    {t("usageDashboard.keyCount", {
                                        count: filtered.length,
                                    })}
                                </p>
                                {pages > 1 && (
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            disabled={currentPage === 0}
                                            onClick={() =>
                                                setPage(currentPage - 1)
                                            }
                                            className={`${inputStyle} disabled:opacity-50`}
                                        >
                                            {t("usageDashboard.previous")}
                                        </button>
                                        <span>
                                            {t("usageDashboard.pageCount", {
                                                page: currentPage + 1,
                                                total: pages,
                                            })}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={currentPage + 1 >= pages}
                                            onClick={() =>
                                                setPage(currentPage + 1)
                                            }
                                            className={`${inputStyle} disabled:opacity-50`}
                                        >
                                            {t("usageDashboard.next")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <details className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                            <summary className="min-h-10 cursor-pointer font-medium text-slate-800 dark:text-slate-200">
                                {t("usageDashboard.howBudgetsWork")}
                            </summary>
                            <p className="mt-2">
                                {t("usageDashboard.budgetExplanation")}
                            </p>
                            <p className="mt-2">
                                {t("usageDashboard.snapshotCaveat")}
                            </p>
                            <p className="mt-2">
                                {t("usageDashboard.revocationNote")}
                            </p>
                        </details>
                    </>
                )
            )}
        </section>
    );
}
