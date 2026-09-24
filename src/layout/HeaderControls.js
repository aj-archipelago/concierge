"use client";

import { forwardRef, useContext } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguageContext } from "../contexts/LanguageProvider";

export const HeaderAction = forwardRef(function HeaderAction(
    {
        icon: Icon,
        iconClassName,
        label,
        variant = "outline",
        className,
        children,
        href,
        ...props
    },
    ref,
) {
    const content = (
        <>
            {Icon && (
                <Icon
                    className={cn("h-4 w-4 shrink-0", iconClassName)}
                    aria-hidden="true"
                />
            )}
            {label && (
                <span className={Icon ? "hidden sm:inline" : undefined}>
                    {label}
                </span>
            )}
            {children}
        </>
    );
    return (
        <Button
            ref={ref}
            asChild={Boolean(href)}
            type={href ? undefined : "button"}
            variant={variant}
            title={label}
            aria-label={label}
            className={cn(
                "h-10 min-h-10 shrink-0 gap-2 rounded-lg px-3 text-sm font-medium shadow-none",
                Icon && "w-10 px-0 sm:w-auto sm:px-3",
                className,
            )}
            {...props}
        >
            {href ? <Link href={href}>{content}</Link> : content}
        </Button>
    );
});

export function HeaderTabs({ label, value, items, onChange }) {
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    return (
        <nav
            aria-label={label}
            dir={direction}
            data-header-tabs
            className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto"
        >
            {items.map(
                (
                    { value: itemValue, label: itemLabel, icon: Icon, badge },
                    index,
                ) => (
                    <button
                        key={itemValue}
                        type="button"
                        aria-pressed={value === itemValue}
                        title={itemLabel}
                        aria-label={itemLabel}
                        onClick={() => onChange(itemValue)}
                        onKeyDown={(event) => {
                            const nextKey =
                                direction === "rtl"
                                    ? "ArrowLeft"
                                    : "ArrowRight";
                            const previousKey =
                                direction === "rtl"
                                    ? "ArrowRight"
                                    : "ArrowLeft";
                            if (
                                ![nextKey, previousKey, "Home", "End"].includes(
                                    event.key,
                                )
                            )
                                return;
                            event.preventDefault();
                            const nextIndex =
                                event.key === "Home"
                                    ? 0
                                    : event.key === "End"
                                      ? items.length - 1
                                      : (index +
                                            (event.key === nextKey ? 1 : -1) +
                                            items.length) %
                                        items.length;
                            const buttons =
                                event.currentTarget.parentElement.querySelectorAll(
                                    "button",
                                );
                            buttons[nextIndex]?.focus();
                            onChange(items[nextIndex].value);
                        }}
                        className={cn(
                            "inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:px-3",
                            value === itemValue
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200"
                                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700",
                        )}
                    >
                        {Icon && (
                            <Icon
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                            />
                        )}
                        <span className={Icon ? "hidden sm:inline" : undefined}>
                            {itemLabel}
                        </span>
                        {badge}
                    </button>
                ),
            )}
        </nav>
    );
}
