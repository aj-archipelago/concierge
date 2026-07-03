"use client";

import { useContext, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
    Bot,
    Globe,
    LayoutGrid,
    MessageSquare,
    Users,
    Workflow,
} from "lucide-react";

import ShareButton from "@/components/share/ShareButton";
import { ownedSharesQueryKey } from "@/components/share/shareUtils";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { cn } from "@/lib/utils";

const ENTITY_META = {
    chat: {
        icon: MessageSquare,
        labelKey: "portal_sharing_type_chat",
    },
    workspace: {
        icon: LayoutGrid,
        labelKey: "portal_sharing_type_workspace",
    },
    applet: {
        icon: Bot,
        labelKey: "portal_sharing_type_applet",
    },
    automation: {
        icon: Workflow,
        labelKey: "portal_sharing_type_automation",
    },
    article: {
        icon: Globe,
        labelKey: "portal_sharing_type_article",
    },
};

const FILTER_ALL = "all";

function formatShareSummary(item, t) {
    const parts = [];
    if (item.link?.enabled) {
        parts.push(
            item.link.role === "editor"
                ? t("portal_sharing_link_editor")
                : t("portal_sharing_link_viewer"),
        );
    }
    if (item.recipientCount > 0) {
        parts.push(
            t("portal_sharing_people_count", { count: item.recipientCount }),
        );
    }
    return parts.join(" · ");
}

function SharingListItem({ item, t, direction }) {
    const meta = ENTITY_META[item.entityType] || ENTITY_META.chat;
    const Icon = meta.icon;
    const summary = formatShareSummary(item, t);

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-50 dark:bg-sky-900/30">
                    <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {item.title}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {t(meta.labelKey)}
                        </span>
                    </div>
                    {summary ? (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {summary}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {item.url ? (
                    <Link
                        href={item.url}
                        className="inline-flex min-h-10 items-center rounded-md border border-gray-200 px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/50"
                    >
                        {t("portal_sharing_open")}
                    </Link>
                ) : null}
                <ShareButton
                    entityType={item.entityType}
                    entityId={item.entityId}
                    legacyShared={item.legacyShared}
                    label={t("Share")}
                    showLabel
                    className="min-h-10"
                />
            </div>
        </div>
    );
}

export default function SharingSection() {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [filter, setFilter] = useState(FILTER_ALL);

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ownedSharesQueryKey(),
        queryFn: async () => {
            const { data } = await axios.get("/api/shares");
            return data;
        },
        staleTime: 30_000,
    });

    const items = useMemo(() => data?.items ?? [], [data?.items]);

    const counts = useMemo(() => {
        const byType = items.reduce((acc, item) => {
            acc[item.entityType] = (acc[item.entityType] || 0) + 1;
            return acc;
        }, {});
        return { all: items.length, ...byType };
    }, [items]);

    const visibleItems = useMemo(() => {
        if (filter === FILTER_ALL) return items;
        return items.filter((item) => item.entityType === filter);
    }, [filter, items]);

    const filterOptions = [
        { id: FILTER_ALL, labelKey: "portal_sharing_filter_all" },
        ...Object.entries(ENTITY_META).map(([id, meta]) => ({
            id,
            labelKey: meta.labelKey,
        })),
    ].filter((option) => option.id === FILTER_ALL || counts[option.id] > 0);

    return (
        <div dir={direction} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-start">
                {t("portal_sharing_description")}
            </p>

            {items.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {filterOptions.map(({ id, labelKey }) => {
                        const active = filter === id;
                        const count = counts[id] || 0;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setFilter(id)}
                                className={cn(
                                    "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                                    active
                                        ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700/50",
                                )}
                            >
                                <span>{t(labelKey)}</span>
                                <span className="rounded-full bg-white/80 px-1.5 text-xs dark:bg-gray-900/40">
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : null}

            {isLoading ? (
                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {t("portal_sharing_loading")}
                </div>
            ) : isError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20">
                    <p className="text-sm text-red-700 dark:text-red-300">
                        {t("portal_sharing_error")}
                    </p>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        className="mt-3 text-sm font-medium text-red-700 underline dark:text-red-300"
                    >
                        {t("Retry")}
                    </button>
                </div>
            ) : visibleItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center dark:border-gray-700">
                    <Users className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {t("portal_sharing_empty_title")}
                    </p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {t("portal_sharing_empty_description")}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {visibleItems.map((item) => (
                        <SharingListItem
                            key={`${item.entityType}:${item.entityId}`}
                            item={item}
                            t={t}
                            direction={direction}
                        />
                    ))}
                </div>
            )}

            {items.length > 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
                    <Globe className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-start">{t("portal_sharing_hint")}</p>
                </div>
            ) : null}
        </div>
    );
}
