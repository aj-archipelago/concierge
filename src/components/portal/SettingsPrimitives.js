"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsCard({
    icon: Icon,
    title,
    description,
    children,
    className,
}) {
    const id = useId();
    return (
        <section
            aria-labelledby={title ? id : undefined}
            className={cn(
                "rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/80 sm:p-5",
                className,
            )}
        >
            {title && (
                <div className="mb-4 flex items-start gap-3">
                    {Icon && (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                    )}
                    <div className="min-w-0">
                        <h3
                            id={id}
                            className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                        >
                            {title}
                        </h3>
                        {description && (
                            <p className="mb-0 mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                                {description}
                            </p>
                        )}
                    </div>
                </div>
            )}
            {children}
        </section>
    );
}

export function SettingsChoice({
    selected,
    onClick,
    icon: Icon,
    label,
    children,
    lang,
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            className={cn(
                "min-h-12 min-w-0 rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900",
                selected
                    ? "border-sky-500 bg-sky-50/60 text-sky-800 shadow-sm dark:border-sky-400/70 dark:bg-sky-400/10 dark:text-sky-200"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-700/70",
            )}
        >
            {children}
            <span className="flex items-center gap-2.5">
                {Icon && (
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span lang={lang} className="flex-1 text-sm font-medium">
                    {label}
                </span>
                <span
                    aria-hidden="true"
                    className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        selected
                            ? "border-sky-600 bg-sky-600 text-white dark:border-sky-400 dark:bg-sky-400 dark:text-gray-950"
                            : "border-gray-300 dark:border-gray-500",
                    )}
                >
                    {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
            </span>
        </button>
    );
}

export function SettingsToggle({
    label,
    description,
    checked,
    onChange,
    disabled = false,
}) {
    const id = useId();
    return (
        <label
            className="flex min-h-12 cursor-pointer items-center justify-between gap-4"
            htmlFor={id}
        >
            <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                    {label}
                </span>
                {description && (
                    <span
                        id={`${id}-description`}
                        className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400"
                    >
                        {description}
                    </span>
                )}
            </span>
            <span className="relative flex h-10 w-11 shrink-0 items-center">
                <input
                    id={id}
                    type="checkbox"
                    role="switch"
                    checked={checked}
                    onChange={onChange}
                    disabled={disabled}
                    aria-describedby={
                        description ? `${id}-description` : undefined
                    }
                    className="peer sr-only"
                />
                <span
                    aria-hidden="true"
                    className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-sky-600 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 dark:bg-gray-600 dark:peer-checked:bg-sky-400 dark:peer-focus-visible:ring-offset-gray-800"
                />
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute start-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5 peer-disabled:opacity-50 dark:bg-gray-100 rtl:peer-checked:-translate-x-5 motion-reduce:transition-none"
                />
            </span>
        </label>
    );
}
