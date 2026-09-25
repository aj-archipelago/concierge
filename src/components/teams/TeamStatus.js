"use client";
import { useTranslation } from "react-i18next";
export default function TeamStatus({ state }) {
    const { t } = useTranslation();
    const color = [
        "failed",
        "abandoned",
        "blocked",
        "needs_revision",
        "needs_answer",
    ].includes(state)
        ? "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
        : ["completed", "accepted", "answered"].includes(state)
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
          : "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200";
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${color}`}
        >
            <span
                className="h-1.5 w-1.5 rounded-full bg-current"
                aria-hidden="true"
            />
            {t(`teams.state.${state}`)}
        </span>
    );
}
