"use client";

import { ChevronDown } from "lucide-react";
import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../contexts/LanguageProvider";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import classNames from "../../app/utils/class-names";
import { cn } from "@/lib/utils";

function formatSidebarRunDate(iso, locale = undefined) {
    if (!iso) {
        return "—";
    }
    try {
        return new Date(iso).toLocaleString(locale, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return "—";
    }
}

export default function AutomationNavigationItem({
    subItem,
    pathname,
    router,
    isCollapsed,
}) {
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext) || {};

    const slug = subItem.slug;
    const basePath = `/automations/${slug}/runs/`;
    const latestHref = `${basePath}latest`;

    const recentRuns = useMemo(
        () => subItem.recentRuns || [],
        [subItem.recentRuns],
    );

    const isActiveRoute = pathname.startsWith(basePath);

    const latestRunLine = useMemo(() => {
        const run = recentRuns[0];
        if (!run) {
            return t("No runs yet.");
        }
        const dateStr = formatSidebarRunDate(run.createdAt);
        const body = run.preview || run.status || t("No output yet.");
        return `${dateStr} · ${body}`;
    }, [recentRuns, t]);

    const olderRuns = recentRuns.slice(1);

    const handleNavigate = (href) => {
        if (href) {
            router.push(href);
        }
    };

    return (
        <li
            className={classNames(
                "group flex items-stretch rounded-md my-0.5",
                isActiveRoute
                    ? "bg-gray-100 dark:bg-gray-700"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700",
            )}
            dir={direction}
        >
            <button
                type="button"
                title={latestRunLine}
                className={classNames(
                    "flex min-h-11 min-w-0 flex-1 flex-col gap-0.5 py-2 ps-4 pe-1 text-start text-xs cursor-pointer rounded-md border-0 bg-transparent leading-snug font-normal text-gray-700 dark:text-gray-200",
                    isCollapsed && "pe-3",
                )}
                onClick={() => handleNavigate(latestHref)}
            >
                <span
                    className={cn(
                        "truncate font-semibold text-gray-900 dark:text-gray-100",
                        isCollapsed && "opacity-90 group-hover:opacity-100",
                    )}
                >
                    {subItem.name}
                </span>
                <span
                    className={cn(
                        "truncate text-[11px] leading-4 text-gray-500 dark:text-gray-400",
                        isCollapsed && "hidden group-hover:inline",
                    )}
                    aria-hidden={isCollapsed ? true : undefined}
                >
                    {latestRunLine}
                </span>
            </button>
            {olderRuns.length > 0 ? (
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={t("Prior runs")}
                            className={classNames(
                                "shrink-0 flex items-center px-2 me-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-md bg-transparent border-0",
                                isCollapsed
                                    ? "invisible group-hover:visible"
                                    : "text-gray-500 opacity-70 hover:opacity-100",
                            )}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ChevronDown className="h-4 w-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align={direction === "rtl" ? "end" : "start"}
                        className="max-w-[min(100vw-2rem,20rem)]"
                    >
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                            {t("Prior runs")}
                        </DropdownMenuLabel>
                        {olderRuns.map((run) => {
                            const row = `${formatSidebarRunDate(run.createdAt)} · ${run.preview || run.status}`;
                            const taskPath = `${basePath}${run.taskId}`;
                            const isSel = pathname === taskPath;
                            return (
                                <DropdownMenuItem
                                    key={run.taskId}
                                    className={cn(
                                        "cursor-pointer whitespace-normal break-words",
                                        isSel && "bg-accent",
                                    )}
                                    onClick={() => router.push(taskPath)}
                                >
                                    <span className="text-xs">{row}</span>
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </li>
    );
}
