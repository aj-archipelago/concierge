"use client";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

export default function WeeklyBudgetControl({
    apiKeyId,
    budget,
    defaultWeeklyUsd,
    ready,
    onSaved,
    compact = false,
}) {
    const { t, i18n } = useTranslation();
    const cap = budget ? budget.weeklyUsd : defaultWeeklyUsd;
    const [amount, setAmount] = useState(String(cap ?? ""));
    const [unlimited, setUnlimited] = useState(cap === null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(false);
    const [open, setOpen] = useState(false);
    const [saved, setSaved] = useState(false);
    const formId = useId();
    const money = (value) =>
        new Intl.NumberFormat(
            i18n?.resolvedLanguage || i18n?.language || "en",
            { style: "currency", currency: "USD" },
        ).format(value);
    useEffect(() => {
        if (open) return;
        setAmount(String(cap ?? ""));
        setUnlimited(cap === null);
    }, [cap, open]);
    if (!/^[a-f0-9]{12}$/.test(apiKeyId || "")) return <span>—</span>;
    async function save(event) {
        event.preventDefault();
        if (
            !unlimited &&
            (!amount.trim() ||
                !Number.isFinite(Number(amount)) ||
                Number(amount) < 0 ||
                Number(amount) > 1_000_000 ||
                Math.abs(
                    Number(amount) * 100 - Math.round(Number(amount) * 100),
                ) >= 0.000001)
        ) {
            setError(true);
            return;
        }
        setSaving(true);
        setError(false);
        setSaved(false);
        try {
            const response = await fetch("/api/admin/usage/limits", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    apiKeyId,
                    weeklyUsd: unlimited ? null : Number(amount),
                }),
            });
            if (!response.ok) throw new Error("Save failed");
            setOpen(false);
            setSaved(true);
            // The write succeeded even if a subsequent snapshot refresh fails.
            await Promise.resolve(
                onSaved?.(apiKeyId, unlimited ? null : Number(amount)),
            ).catch(() => {});
        } catch {
            setError(true);
        } finally {
            setSaving(false);
        }
    }
    return (
        <div className="w-full min-w-0 max-w-sm text-start text-sm">
            {!compact &&
                (ready ? (
                    <>
                        <div>
                            {t("usageDashboard.weeklySpend", {
                                spend:
                                    budget?.spentUsd == null
                                        ? "—"
                                        : money(budget.spentUsd),
                                cap:
                                    cap === null
                                        ? t("usageDashboard.unlimited")
                                        : money(cap),
                            })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {budget?.resetAt
                                ? t("usageDashboard.resetsAt", {
                                      date: new Date(
                                          budget.resetAt,
                                      ).toLocaleString(),
                                  })
                                : t("usageDashboard.startsOnRequest")}
                        </div>
                        {budget?.fallbackRequests > 0 && (
                            <div className="text-xs text-amber-800 dark:text-amber-200">
                                {t("usageDashboard.budgetFallbacks", {
                                    count: budget.fallbackRequests,
                                })}
                            </div>
                        )}
                    </>
                ) : (
                    <span>—</span>
                ))}
            <button
                type="button"
                disabled={!ready || saving}
                aria-expanded={open}
                aria-controls={formId}
                onClick={() => {
                    setOpen((value) => !value);
                    setError(false);
                    setSaved(false);
                }}
                className="min-h-10 underline text-blue-700 dark:text-blue-300 disabled:opacity-50"
            >
                {t("usageDashboard.editCap")}
            </button>
            {open && (
                <form
                    id={formId}
                    onSubmit={save}
                    className="space-y-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-3"
                >
                    <label className="block">
                        {t("usageDashboard.weeklyCapUsd")}
                        <input
                            aria-label={t("usageDashboard.weeklyCapUsd")}
                            type="number"
                            min="0"
                            max="1000000"
                            step="0.01"
                            required={!unlimited}
                            disabled={unlimited || saving}
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            className="block min-h-10 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2"
                        />
                    </label>
                    <label className="flex min-h-10 items-center gap-2">
                        <input
                            type="checkbox"
                            checked={unlimited}
                            disabled={saving}
                            onChange={(event) =>
                                setUnlimited(event.target.checked)
                            }
                        />
                        {t("usageDashboard.unlimited")}
                    </label>
                    <p className="text-xs text-muted-foreground">
                        {t("usageDashboard.capEditNote")}
                    </p>
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                            setAmount(String(defaultWeeklyUsd));
                            setUnlimited(false);
                        }}
                        className="min-h-10 text-blue-700 underline dark:text-blue-300 disabled:opacity-50"
                    >
                        {t("usageDashboard.useDefault", {
                            cap: money(defaultWeeklyUsd),
                        })}
                    </button>
                    {error && (
                        <p
                            role="alert"
                            className="text-red-700 dark:text-red-300"
                        >
                            {t("usageDashboard.saveError")}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="min-h-10 rounded bg-blue-700 dark:bg-blue-600 text-white px-3 disabled:opacity-50"
                        >
                            {t(
                                saving
                                    ? "usageDashboard.saving"
                                    : "usageDashboard.save",
                            )}
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                                setOpen(false);
                                setError(false);
                            }}
                            className="min-h-10 rounded border border-gray-300 px-3 text-gray-800 dark:border-gray-600 dark:text-gray-100 disabled:opacity-50"
                        >
                            {t("usageDashboard.cancel")}
                        </button>
                    </div>
                </form>
            )}
            {saved && (
                <p
                    role="status"
                    className="text-xs text-emerald-800 dark:text-emerald-200"
                >
                    {t("usageDashboard.capSaved")}
                </p>
            )}
        </div>
    );
}
