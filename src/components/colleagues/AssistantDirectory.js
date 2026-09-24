"use client";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAssistantDirectory } from "../../hooks/useColleagues";
import { Input } from "@/components/ui/input";
import ColleagueAvatar, { getEntityWispVariant } from "./ColleagueAvatar";
import AssistantList, { ASSISTANT_COLUMNS } from "./AssistantList";
import { LanguageContext } from "../../contexts/LanguageProvider";
import {
    useAgentModels,
    resolveAgentModelForSend,
} from "../../../app/queries/modelMetadata";

const DEFAULT_CONTROLS = {
    query: "",
    status: "all",
    access: "all",
    sort: "name",
    descending: false,
};
const SELECT_CLASS =
    "h-10 min-w-0 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

export function assistantDirectoryLayout(count, mode = "auto") {
    if (mode === "list" || (mode === "auto" && count > 18)) return "list";
    return count <= 6 ? "large" : "compact";
}
export default function AssistantDirectory({
    assistants = [],
    remote = false,
    includeArchived = false,
    onSelect,
    unreadCount = () => 0,
}) {
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext);
    const { data: models = [], redirects } = useAgentModels();
    const [mode, setMode] = useState("auto");
    const [controls, setControls] = useState(DEFAULT_CONTROLS);
    const [offset, setOffset] = useState(0);
    const [query, setQuery] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => {
            setQuery(controls.query);
            setOffset(0);
        }, 200);
        return () => clearTimeout(timer);
    }, [controls.query]);
    const serverSort = ["name", "description", "status"].includes(controls.sort)
        ? controls.sort
        : "name";
    const directory = useAssistantDirectory({
        enabled: remote,
        query,
        offset,
        limit: 50,
        status:
            controls.status === "all" && !includeArchived
                ? undefined
                : controls.status,
        access: controls.access,
        sort: serverSort,
        descending: controls.descending,
    });
    const entries = remote ? directory.data?.colleagues || [] : assistants;
    const total = remote ? directory.data?.total || 0 : assistants.length;
    useEffect(() => {
        try {
            const saved = localStorage.getItem("assistant-directory-view");
            if (["auto", "cards", "list"].includes(saved)) setMode(saved);
            const stored = JSON.parse(
                sessionStorage.getItem("assistant-directory-controls"),
            );
            if (stored)
                setControls({
                    query: typeof stored.query === "string" ? stored.query : "",
                    status: ["all", "active", "paused", "archived"].includes(
                        stored.status,
                    )
                        ? stored.status
                        : "all",
                    access: ["all", "mine", "shared", "public"].includes(
                        stored.access,
                    )
                        ? stored.access
                        : "all",
                    sort: ASSISTANT_COLUMNS.some(
                        (column) => column.key === stored.sort,
                    )
                        ? stored.sort
                        : "name",
                    descending: stored.descending === true,
                });
        } catch {
            /* Storage is optional. */
        }
    }, []);
    const updateControls = (changes) => {
        const next = { ...controls, ...changes };
        setControls(next);
        setOffset(0);
        try {
            sessionStorage.setItem(
                "assistant-directory-controls",
                JSON.stringify(next),
            );
        } catch {
            /* Storage is optional. */
        }
    };
    const layout = assistantDirectoryLayout(
        remote ? Math.max(total, assistants.length) : total,
        mode,
    );
    const modelLabels = new Map(
        models.map((model) => [
            model.modelId,
            t(model.displayName || model.modelId),
        ]),
    );
    const rows = entries.map((assistant) => {
        const mine =
            assistant.kind === "personal" ||
            (assistant.isOwner !== false && assistant.kind !== "shared");
        const publicAssistant = assistant.visibility === "public";
        const modelId = models.length
            ? resolveAgentModelForSend(
                  assistant.model,
                  models,
                  redirects,
                  "cortex-agent-chat",
              )
            : assistant.model;
        return {
            assistant,
            mine,
            publicAssistant,
            name: assistant.name,
            description: assistant.description || "",
            model:
                modelLabels.get(modelId) ||
                modelId ||
                t("assistantDirectory.default"),
            status: t(`colleagues.${assistant.status || "active"}`),
            access: t(
                `assistantDirectory.${mine ? "mine" : publicAssistant ? "publicAccess" : "sharedAccess"}`,
            ),
            unread: unreadCount(assistant),
        };
    });
    const search = controls.query.trim().toLocaleLowerCase();
    const visible = remote
        ? rows
        : rows.filter(
              (row) =>
                  (controls.status === "all" ||
                      (row.assistant.status || "active") === controls.status) &&
                  (controls.access === "all" ||
                      (controls.access === "mine" && row.mine) ||
                      (controls.access === "shared" &&
                          !row.mine &&
                          !row.publicAssistant) ||
                      (controls.access === "public" && row.publicAssistant)) &&
                  [
                      row.name,
                      row.description,
                      row.model,
                      row.assistant.model || "",
                      row.status,
                      row.access,
                  ]
                      .join(" ")
                      .toLocaleLowerCase()
                      .includes(search),
          );
    return (
        <div dir={direction} className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="min-w-0 flex-1 basis-48"
                    aria-label={t("assistantDirectory.search")}
                    placeholder={t("assistantDirectory.search")}
                    value={controls.query}
                    onChange={(e) => updateControls({ query: e.target.value })}
                />
                <select
                    aria-label={t("assistantDirectory.status")}
                    className={SELECT_CLASS}
                    value={controls.status}
                    onChange={(e) => updateControls({ status: e.target.value })}
                >
                    <option value="all">
                        {t("assistantDirectory.allStatuses")}
                    </option>
                    {[
                        "active",
                        "paused",
                        ...(remote ||
                        entries.some((a) => a.status === "archived") ||
                        controls.status === "archived"
                            ? ["archived"]
                            : []),
                    ].map((value) => (
                        <option key={value} value={value}>
                            {t(`colleagues.${value}`)}
                        </option>
                    ))}
                </select>
                <select
                    aria-label={t("assistantDirectory.role")}
                    className={SELECT_CLASS}
                    value={controls.access}
                    onChange={(e) => updateControls({ access: e.target.value })}
                >
                    <option value="all">
                        {t("assistantDirectory.allAccess")}
                    </option>
                    <option value="mine">{t("assistantDirectory.mine")}</option>
                    <option value="shared">
                        {t("assistantDirectory.sharedAccess")}
                    </option>
                    <option value="public">
                        {t("assistantDirectory.publicAccess")}
                    </option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                    <span>{t("assistantDirectory.view")}</span>
                    <select
                        value={mode}
                        onChange={(e) => {
                            setMode(e.target.value);
                            try {
                                localStorage.setItem(
                                    "assistant-directory-view",
                                    e.target.value,
                                );
                            } catch {
                                /* Storage is optional. */
                            }
                        }}
                        className={SELECT_CLASS}
                    >
                        {["auto", "cards", "list"].map((value) => (
                            <option key={value} value={value}>
                                {t(`assistantDirectory.${value}`)}
                            </option>
                        ))}
                    </select>
                </label>
                {(controls.query ||
                    controls.status !== "all" ||
                    controls.access !== "all") && (
                    <button
                        type="button"
                        className="min-h-10 px-2 text-sm text-sky-700 hover:underline dark:text-sky-300"
                        onClick={() =>
                            updateControls({
                                query: "",
                                status: "all",
                                access: "all",
                            })
                        }
                    >
                        {t("assistantDirectory.clearFilters")}
                    </button>
                )}
            </div>
            {!visible.length && !directory.isLoading && !directory.error && (
                <p
                    role="status"
                    className="py-6 text-sm text-gray-600 dark:text-gray-400"
                >
                    {t("assistantDirectory.noMatches")}
                </p>
            )}
            <nav
                aria-label={t("colleagues.team")}
                data-layout={layout}
                className={
                    layout === "list"
                        ? "min-w-0"
                        : `grid gap-4 sm:grid-cols-2 ${layout === "large" ? "lg:grid-cols-3" : "lg:grid-cols-4"}`
                }
            >
                {layout === "list" ? (
                    <AssistantList
                        rows={visible}
                        serverSorted={remote}
                        sortableKeys={
                            remote
                                ? ["name", "description", "status"]
                                : undefined
                        }
                        sort={remote ? serverSort : controls.sort}
                        descending={controls.descending}
                        onSort={(sort) =>
                            updateControls({
                                sort,
                                descending:
                                    sort === controls.sort
                                        ? !controls.descending
                                        : sort === "unread",
                            })
                        }
                        onSelect={onSelect}
                    />
                ) : (
                    visible.map(({ assistant, unread }) => (
                        <button
                            type="button"
                            key={assistant.id}
                            onClick={() => onSelect(assistant)}
                            className={`flex min-h-12 min-w-0 gap-4 border border-gray-200 bg-white text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 ${layout === "large" ? "flex-col items-center rounded-3xl px-5 py-8 text-center" : "flex-col items-start rounded-2xl p-4 text-start"}`}
                        >
                            <ColleagueAvatar
                                entityId={assistant.id}
                                variant={getEntityWispVariant(assistant)}
                                className={`shrink-0 ${layout === "large" ? "h-24 w-24" : "h-12 w-12"}`}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="break-words font-medium">
                                    {assistant.name}
                                </p>
                                <p className="mt-1 line-clamp-2 break-words text-sm text-gray-600 dark:text-gray-400">
                                    {assistant.description ||
                                        t("colleagues.ready")}
                                </p>
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    {t(`colleagues.${assistant.status}`)}
                                    {assistant.visibility === "public"
                                        ? ` · ${t("assistantDirectory.public")}`
                                        : assistant.isOwner === false &&
                                            assistant.kind === "colleague"
                                          ? ` · ${t("colleagues.sharedLabel")}`
                                          : ""}
                                </p>
                                {unread > 0 && (
                                    <p className="mt-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
                                        {t("colleagues.newResultsCount", {
                                            count: unread,
                                        })}
                                    </p>
                                )}
                            </div>
                        </button>
                    ))
                )}
            </nav>
            {!remote && visible.length > 0 && (
                <p
                    role="status"
                    aria-live="polite"
                    className="text-xs text-gray-500 dark:text-gray-400"
                >
                    {t("assistantDirectory.showing", {
                        visible: visible.length,
                        total: assistants.length,
                    })}
                </p>
            )}
            {remote && (
                <div
                    className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-300"
                    aria-live="polite"
                >
                    <span>
                        {directory.isLoading
                            ? t("assistantDirectory.loading")
                            : directory.error
                              ? t("colleagues.error")
                              : t("assistantDirectory.range", {
                                    from: total ? offset + 1 : 0,
                                    to: Math.min(
                                        offset + entries.length,
                                        total,
                                    ),
                                    total,
                                })}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="min-h-10 rounded-md border border-gray-300 px-3 disabled:opacity-40 dark:border-gray-600"
                            disabled={!offset || directory.isFetching}
                            onClick={() => setOffset(Math.max(0, offset - 50))}
                        >
                            {t("assistantDirectory.previous")}
                        </button>
                        <button
                            type="button"
                            className="min-h-10 rounded-md border border-gray-300 px-3 disabled:opacity-40 dark:border-gray-600"
                            disabled={
                                directory.data?.nextOffset == null ||
                                directory.isFetching
                            }
                            onClick={() => setOffset(directory.data.nextOffset)}
                        >
                            {t("assistantDirectory.next")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
