"use client";
import PageHeader from "../../layout/PageHeader";
import { HeaderAction, HeaderTabs } from "../../layout/HeaderControls";
import usePageDialogNavigation from "../../hooks/usePageDialogNavigation";
import { useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import axios from "axios";
import {
    Plus,
    Clock3,
    ListChecks,
    ArrowLeft,
    MessageSquare,
    Pause,
    Play,
    Archive,
    Pencil,
    ArrowUpRight,
    Loader2,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AuthContext } from "../../App";
import { useCurrentEntityTarget } from "../../contexts/CurrentEntityContext";
import EntityOptions from "./EntityOptions";
import AssistantDirectory from "./AssistantDirectory";
import AssistantResources from "./AssistantResources";
import { MemoryEditorContent } from "../MemoryEditor";
import { LanguageContext } from "../../contexts/LanguageProvider";
import {
    useColleagues,
    useSaveColleague,
    useAssistant,
} from "../../hooks/useColleagues";
import { useColleagueUpdates } from "../../hooks/useColleagueUpdates";
import { isAutomationUnread } from "../../utils/automationsUnread";
import { automationBelongsToColleague } from "../../utils/automationColleagues";
import ColleagueAutomations from "./ColleagueAutomations";
import CreateAutomationDialog from "../automations/CreateAutomationDialog";
import ColleagueAvatar, {
    AVATARS,
    getEntityWispVariant,
} from "./ColleagueAvatar";

const EMPTY = { name: "", description: "", instructions: "", avatar: "orbit" };
export default function ColleaguesPage() {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const [detailTab, setDetailTab] = useState("tasks");
    const { direction } = useContext(LanguageContext);
    const router = useRouter();
    const search = useSearchParams();
    const pathname = usePathname();
    const requestedView = search.get("view");
    const explicitView = ["recent", "tasks", "team"].includes(requestedView)
        ? requestedView
        : requestedView === "updates"
          ? "recent"
          : search.get("automation") || search.get("edit")
            ? "tasks"
            : search.get("entity") || search.get("tab")
              ? "team"
              : null;
    const dialogs = usePageDialogNavigation();
    const navigate = (changes) => {
        if (dialogs.view) dialogs.close({ traverse: false });
        const params = new URLSearchParams(search.toString());
        params.delete("dialog");
        params.delete("dialogItem");
        Object.entries(changes).forEach(([key, value]) =>
            value ? params.set(key, value) : params.delete(key),
        );
        router.push(`${pathname}?${params}`, { scroll: false });
    };
    const {
        data: colleagues = [],
        isLoading,
        error: loadError,
    } = useColleagues();
    const {
        automationsQuery: {
            data: tasks = [],
            isLoading: tasksLoading,
            error: tasksError,
        },
        lastViewedAt,
        readReceipts,
        markRead,
        unreadCount,
        hasUnreadUpdates,
        isLoading: updatesLoading,
    } = useColleagueUpdates();
    const { data: taskAssistants = [] } = useColleagues({
        ids: [
            ...new Set(
                [
                    user?.personalEntityId,
                    search.get("assignee"),
                    ...tasks.map((task) => task.entityId),
                ].filter(Boolean),
            ),
        ],
        limit: 100,
        status: "all",
    });
    const taskDirectory = [
        ...new Map(
            [...colleagues, ...taskAssistants].map((assistant) => [
                assistant.id,
                assistant,
            ]),
        ).values(),
    ];
    const view =
        explicitView ||
        (hasUnreadUpdates ? "recent" : updatesLoading ? null : "team");
    useEffect(() => {
        if (explicitView || !view) return;
        // Pin the landing view so reading an update or a background refresh
        // doesn't change tabs underneath the user.
        const params = new URLSearchParams(search.toString());
        params.set("view", view);
        router.replace(`${pathname}?${params}`, { scroll: false });
    }, [explicitView, view, search, pathname, router]);
    const save = useSaveColleague();
    const [selectedId, setSelectedId] = useState(search.get("entity") || "");
    const { data: selectedAssistant, isLoading: selectedLoading } =
        useAssistant(selectedId);
    const { data: dialogAssistant } = useAssistant(
        dialogs.itemId !== "new" ? dialogs.itemId : null,
    );
    const [form, setFormState] = useState(null);
    const setForm = (next) => {
        draftVersion.current++;
        setFormState(next);
        if (!next) dialogs.close();
        else if (dialogs.view !== "assistant")
            dialogs.open("assistant", next.id || "new");
    };
    useEffect(() => {
        if (dialogs.view !== "assistant") return;
        setFormState((previous) => {
            if (previous && (previous.id || "new") === dialogs.itemId)
                return previous;
            return dialogs.itemId === "new"
                ? { ...EMPTY }
                : dialogAssistant || null;
        });
    }, [dialogs.view, dialogs.itemId, dialogAssistant]);
    const taskOpen = dialogs.view === "task";
    const setTaskOpen = (open) =>
        open ? dialogs.open("task") : dialogs.close();
    const showArchived = search.get("archived") === "1";
    const [error, setError] = useState("");
    const [chatBusy, setChatBusy] = useState(false);
    const [draftBusy, setDraftBusy] = useState(false);
    const draftVersion = useRef(0);
    useEffect(() => {
        draftVersion.current++;
    }, [dialogs.view, dialogs.itemId]);

    const selected = selectedAssistant;
    const surfaceRef = useRef(null);
    useEffect(() => {
        if (view !== "team" || dialogs.view) return;
        surfaceRef.current?.scrollIntoView?.({ block: "start" });
        surfaceRef.current?.focus({ preventScroll: true });
    }, [view, selectedId, isLoading, dialogs.view]);
    useCurrentEntityTarget(view === "team" ? selected?.id : undefined);
    useEffect(() => {
        setSelectedId(search.get("entity") || "");
        if (
            ["tasks", "options", "memory", "materials"].includes(
                search.get("tab"),
            )
        )
            setDetailTab(search.get("tab"));
    }, [search]);
    const assignedTasks = tasks.filter((task) =>
        automationBelongsToColleague(task, selected),
    );
    const reportError = (err) =>
        setError(
            err?.response?.data?.error || err.message || t("colleagues.error"),
        );
    async function openChat() {
        setChatBusy(true);
        setError("");
        try {
            const { data } = await axios.post(
                `/api/colleagues/${selected.id}/chat`,
                {},
            );
            router.push(`/chat/${data.chatId}`);
        } catch (err) {
            reportError(err);
        } finally {
            setChatBusy(false);
        }
    }
    async function changeStatus(status) {
        setError("");
        try {
            await save.mutateAsync({ id: selected.id, status });
        } catch (err) {
            reportError(err);
        }
    }
    async function draftAssistant() {
        const version = ++draftVersion.current;
        setDraftBusy(true);
        setError("");
        try {
            const { data } = await axios.post("/api/colleagues/draft", {
                purpose: form.description,
                current: JSON.stringify({
                    name: form.name,
                    instructions: form.instructions,
                }),
            });
            if (draftVersion.current === version)
                setFormState((previous) =>
                    previous ? { ...previous, ...data } : previous,
                );
        } catch (err) {
            if (draftVersion.current === version) reportError(err);
        } finally {
            setDraftBusy(false);
        }
    }
    async function submit(event) {
        event.preventDefault();
        setError("");
        try {
            const colleague = await save.mutateAsync({
                id: form.id,
                name: form.name,
                description: form.description,
                instructions: form.instructions,
                ...(form.kind === "personal" ? {} : { avatar: form.avatar }),
            });
            setSelectedId(colleague.id);
            setFormState(null);
            navigate({ view: "team", entity: colleague.id });
        } catch (err) {
            reportError(err);
        }
    }
    return (
        <main
            ref={surfaceRef}
            tabIndex={-1}
            dir={direction}
            className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-8 text-gray-900 outline-none dark:text-gray-100"
        >
            <PageHeader title={t("colleagues.title")}>
                <HeaderTabs
                    label={t("colleagues.views")}
                    value={view}
                    items={["recent", "tasks", "team"].map((item) => ({
                        value: item,
                        label: t(
                            item === "tasks"
                                ? "colleagues.allTasks"
                                : `colleagues.${item}`,
                        ),
                        icon:
                            item === "recent"
                                ? Clock3
                                : item === "tasks"
                                  ? ListChecks
                                  : Users,
                        badge:
                            item === "recent" && unreadCount > 0 ? (
                                <span
                                    className="rounded-full bg-sky-600 px-1.5 text-[11px] leading-5 text-white dark:bg-sky-400 dark:text-gray-950"
                                    aria-label={t(
                                        "colleagues.newUpdatesCount",
                                        { count: unreadCount },
                                    )}
                                >
                                    {unreadCount}
                                </span>
                            ) : null,
                    }))}
                    onChange={(item) =>
                        navigate({
                            view: item,
                            entity: null,
                            tab: null,
                            automation: null,
                            edit: null,
                            assignee: null,
                        })
                    }
                />
                {view === "team" && !selected && (
                    <>
                        <HeaderAction
                            icon={Plus}
                            label={t("colleagues.create")}
                            variant="default"
                            onClick={() => {
                                setError("");
                                setForm({ ...EMPTY });
                            }}
                        />
                        <HeaderAction
                            icon={Archive}
                            label={t("colleagues.showArchived")}
                            variant={showArchived ? "secondary" : "ghost"}
                            aria-pressed={showArchived}
                            onClick={() =>
                                navigate({
                                    archived: showArchived ? null : "1",
                                })
                            }
                        />
                    </>
                )}
                {view && view !== "team" && !search.get("automation") && (
                    <HeaderAction
                        icon={Plus}
                        label={t("colleagues.giveTask")}
                        variant="default"
                        onClick={() => setTaskOpen(true)}
                    />
                )}
            </PageHeader>
            {(error || loadError) && (
                <p
                    role="alert"
                    className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200"
                >
                    {error || t("colleagues.error")}
                </p>
            )}
            {!view ? (
                <div role="status" className="flex items-center gap-2 py-12">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t("Loading...")}
                </div>
            ) : view !== "team" ? (
                <ColleagueAutomations
                    automations={tasks}
                    colleagues={taskDirectory}
                    isLoading={tasksLoading || isLoading}
                    error={tasksError}
                    lastViewedAt={lastViewedAt}
                    readReceipts={readReceipts}
                    markRead={markRead}
                    view={view}
                    onCreate={() => setTaskOpen(true)}
                />
            ) : isLoading ? (
                <div role="status" className="flex items-center gap-2 py-12">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t("Loading...")}
                </div>
            ) : (
                <>
                    {!colleagues.length && !selectedId ? (
                        <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 sm:p-12 dark:border-gray-700 dark:bg-gray-900">
                            <div className="mb-6 flex gap-3">
                                {AVATARS.slice(0, 3).map((avatar) => (
                                    <ColleagueAvatar
                                        key={avatar}
                                        variant={avatar}
                                    />
                                ))}
                            </div>
                            <h2 className="text-xl font-medium">
                                {t("colleagues.emptyTitle")}
                            </h2>
                            <p className="mt-2 max-w-lg text-sm leading-6 text-gray-600 dark:text-gray-400">
                                {t("colleagues.emptyText")}
                            </p>
                            <div className="mt-6 flex flex-wrap gap-2">
                                {["research", "editor", "analyst"].map(
                                    (role) => (
                                        <Button
                                            key={role}
                                            variant="outline"
                                            className="min-h-10"
                                            onClick={() =>
                                                setForm({
                                                    ...EMPTY,
                                                    description: t(
                                                        `colleagues.${role}`,
                                                    ),
                                                    instructions: t(
                                                        `colleagues.${role}Instructions`,
                                                    ),
                                                    avatar:
                                                        role === "editor"
                                                            ? "sprout"
                                                            : role === "analyst"
                                                              ? "prism"
                                                              : "orbit",
                                                })
                                            }
                                        >
                                            {t(`colleagues.${role}`)}
                                            <Plus className="ms-2 h-4 w-4" />
                                        </Button>
                                    ),
                                )}
                            </div>
                        </section>
                    ) : (
                        <div className="space-y-6 pt-4">
                            {selected && (
                                <Button
                                    variant="ghost"
                                    className="min-h-10"
                                    onClick={() =>
                                        navigate({ entity: null, tab: null })
                                    }
                                >
                                    <ArrowLeft
                                        className={`me-2 h-4 w-4 ${direction === "rtl" ? "rotate-180" : ""}`}
                                    />
                                    {t("colleagues.backToTeam")}
                                </Button>
                            )}
                            {!selected && !selectedLoading && (
                                <AssistantDirectory
                                    remote
                                    includeArchived={showArchived}
                                    assistants={colleagues}
                                    onSelect={(colleague) => {
                                        setSelectedId(colleague.id);
                                        navigate({
                                            view: "team",
                                            entity: colleague.id,
                                        });
                                    }}
                                    unreadCount={(colleague) =>
                                        tasks.filter(
                                            (task) =>
                                                automationBelongsToColleague(
                                                    task,
                                                    colleague,
                                                ) &&
                                                isAutomationUnread(
                                                    task,
                                                    lastViewedAt,
                                                    readReceipts,
                                                ),
                                        ).length
                                    }
                                />
                            )}
                            {selected && (
                                <section className="min-w-0 space-y-6 rounded-2xl border border-gray-200 bg-white p-5 sm:p-7 dark:border-gray-700 dark:bg-gray-900">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-4">
                                            <ColleagueAvatar
                                                entityId={selected.id}
                                                variant={getEntityWispVariant(
                                                    selected,
                                                )}
                                                className="h-16 w-16"
                                            />
                                            <div className="min-w-0">
                                                <h2 className="break-words text-2xl font-semibold">
                                                    {selected.name}
                                                </h2>
                                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                                    {selected.description ||
                                                        t("colleagues.ready")}
                                                </p>
                                            </div>
                                        </div>
                                        {selected.editable !== false && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-10 w-10 shrink-0"
                                                aria-label={t(
                                                    "colleagues.edit",
                                                )}
                                                onClick={() =>
                                                    setForm({ ...selected })
                                                }
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            className="min-h-10"
                                            onClick={openChat}
                                            disabled={
                                                chatBusy ||
                                                selected.status === "archived"
                                            }
                                        >
                                            {chatBusy ? (
                                                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <MessageSquare className="me-2 h-4 w-4" />
                                            )}
                                            {t("colleagues.chat")}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="min-h-10"
                                            onClick={() => setTaskOpen(true)}
                                            disabled={
                                                selected.status === "archived"
                                            }
                                        >
                                            <Plus className="me-2 h-4 w-4" />
                                            {t("colleagues.giveTask")}
                                        </Button>
                                        {detailTab === "options" &&
                                            selected.kind === "colleague" &&
                                            selected.isOwner === true && (
                                                <Button
                                                    variant="ghost"
                                                    className="min-h-10"
                                                    disabled={save.isPending}
                                                    onClick={() =>
                                                        changeStatus(
                                                            selected.status ===
                                                                "active"
                                                                ? "paused"
                                                                : "active",
                                                        )
                                                    }
                                                >
                                                    {selected.status ===
                                                    "active" ? (
                                                        <Pause className="me-2 h-4 w-4" />
                                                    ) : (
                                                        <Play className="me-2 h-4 w-4" />
                                                    )}
                                                    {t(
                                                        selected.status ===
                                                            "active"
                                                            ? "colleagues.pause"
                                                            : "colleagues.resume",
                                                    )}
                                                </Button>
                                            )}
                                    </div>
                                    {selected.status !== "active" && (
                                        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                            {t(
                                                selected.status === "paused"
                                                    ? "colleagues.pauseNote"
                                                    : "colleagues.archiveNote",
                                            )}
                                        </p>
                                    )}
                                    {detailTab === "options" && (
                                        <div>
                                            <h3 className="text-sm font-semibold">
                                                {t("colleagues.instructions")}
                                            </h3>
                                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600 dark:text-gray-400">
                                                {selected.instructions ||
                                                    t(
                                                        "colleagues.noInstructions",
                                                    )}
                                            </p>
                                        </div>
                                    )}
                                    <div
                                        role="tablist"
                                        aria-label={t("colleagues.details")}
                                        className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700"
                                    >
                                        {[
                                            "tasks",
                                            "options",
                                            "memory",
                                            ...(selected.materialsContext
                                                ? ["materials"]
                                                : []),
                                        ].map((tab) => (
                                            <button
                                                key={tab}
                                                type="button"
                                                role="tab"
                                                aria-selected={
                                                    detailTab === tab
                                                }
                                                onClick={() => {
                                                    setDetailTab(tab);
                                                    navigate({
                                                        view: "team",
                                                        entity: selected.id,
                                                        tab,
                                                    });
                                                }}
                                                className={`min-h-10 px-4 text-sm ${detailTab === tab ? "border-b-2 border-sky-500 text-sky-700 dark:text-sky-300" : "text-gray-600 dark:text-gray-400"}`}
                                            >
                                                {t(`colleagues.${tab}`)}
                                            </button>
                                        ))}
                                    </div>
                                    {detailTab === "materials" &&
                                        selected.materialsContext && (
                                            <AssistantResources
                                                key={selected.id}
                                                assistant={selected}
                                            />
                                        )}
                                    {detailTab === "options" && (
                                        <EntityOptions
                                            key={selected.id}
                                            entity={selected}
                                        />
                                    )}
                                    {detailTab === "memory" && (
                                        <div className="space-y-4">
                                            <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
                                                {t(
                                                    selected.kind === "personal"
                                                        ? "colleagues.personalMemoryNote"
                                                        : "colleagues.separateMemoryNote",
                                                )}
                                            </p>
                                            {selected.useMemory !== false &&
                                            selected.memoryContextId &&
                                            user ? (
                                                <MemoryEditorContent
                                                    key={selected.id}
                                                    user={{
                                                        ...user,
                                                        contextId:
                                                            selected.memoryContextId,
                                                    }}
                                                    aiName={selected.name}
                                                    onSaved={() => {}}
                                                    onClose={() =>
                                                        setDetailTab("options")
                                                    }
                                                />
                                            ) : (
                                                <p>
                                                    {t(
                                                        "colleagues.memoryUnavailable",
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {detailTab === "tasks" && (
                                        <div className="pt-1">
                                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                <h3 className="font-semibold">
                                                    {t("colleagues.tasks")}
                                                </h3>
                                                <Button
                                                    variant="link"
                                                    className="min-h-10 px-0"
                                                    onClick={() =>
                                                        navigate({
                                                            view: "tasks",
                                                            assignee:
                                                                selected.id,
                                                            automation: null,
                                                            edit: null,
                                                        })
                                                    }
                                                >
                                                    {t("colleagues.allTasks")}
                                                    <ArrowUpRight className="ms-1 h-4 w-4" />
                                                </Button>
                                            </div>
                                            {!assignedTasks.length ? (
                                                <p className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                                    {t("colleagues.noTasks")}
                                                </p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {assignedTasks.map(
                                                        (task) => (
                                                            <li key={task._id}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        navigate(
                                                                            {
                                                                                view: "tasks",
                                                                                assignee:
                                                                                    selected.id,
                                                                                automation:
                                                                                    task._id,
                                                                                edit: null,
                                                                            },
                                                                        )
                                                                    }
                                                                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-gray-50 p-3 text-start hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
                                                                >
                                                                    <span className="min-w-0">
                                                                        <span className="block break-words text-sm font-medium">
                                                                            {
                                                                                task.name
                                                                            }
                                                                        </span>
                                                                        {isAutomationUnread(
                                                                            task,
                                                                            lastViewedAt,
                                                                            readReceipts,
                                                                        ) && (
                                                                            <span className="mt-1 block text-xs font-semibold text-sky-700 dark:text-sky-300">
                                                                                {t(
                                                                                    "New automation result",
                                                                                )}
                                                                            </span>
                                                                        )}
                                                                        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                                                                            {t(
                                                                                task
                                                                                    .schedule
                                                                                    ?.frequency ===
                                                                                    "files"
                                                                                    ? "colleagues.fileTrigger"
                                                                                    : task.enabled
                                                                                      ? "colleagues.scheduled"
                                                                                      : "colleagues.manual",
                                                                            )}
                                                                        </span>
                                                                    </span>
                                                                    <ArrowUpRight className="h-4 w-4 shrink-0" />
                                                                </button>
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                    {detailTab === "options" &&
                                        selected.directory && (
                                            <div className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                                                <Users className="mt-0.5 h-4 w-4 shrink-0" />
                                                <span>
                                                    {t(
                                                        "colleagues.workspaceNote",
                                                    )}
                                                    <code
                                                        className="mt-1 block break-all"
                                                        dir="ltr"
                                                    >
                                                        {selected.directory}
                                                    </code>
                                                </span>
                                            </div>
                                        )}
                                    {detailTab === "options" &&
                                        selected.kind === "colleague" &&
                                        selected.isOwner === true &&
                                        selected.status !== "archived" && (
                                            <Button
                                                variant="ghost"
                                                className="min-h-10 text-gray-500 dark:text-gray-400"
                                                disabled={save.isPending}
                                                onClick={() =>
                                                    changeStatus("archived")
                                                }
                                            >
                                                <Archive className="me-2 h-4 w-4" />
                                                {t("colleagues.archive")}
                                            </Button>
                                        )}
                                </section>
                            )}
                        </div>
                    )}
                </>
            )}
            <Dialog
                open={dialogs.view === "assistant" && Boolean(form)}
                onOpenChange={(open) => {
                    if (!open) setForm(null);
                }}
            >
                <DialogContent
                    dir={direction}
                    className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-xl"
                >
                    <DialogHeader>
                        <DialogTitle>
                            {t(
                                form?.id
                                    ? "colleagues.edit"
                                    : "colleagues.create",
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            {t("colleagues.formIntro")}
                        </DialogDescription>
                    </DialogHeader>
                    {form && (
                        <form onSubmit={submit} className="space-y-4">
                            <fieldset>
                                <legend className="mb-2 text-sm font-medium">
                                    {t("colleagues.portrait")}
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                    {form.kind === "personal" ? (
                                        <div className="flex items-center gap-3">
                                            <ColleagueAvatar
                                                variant="personal"
                                                className="h-24 w-24"
                                            />
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                {t(
                                                    "colleagues.personalPortrait",
                                                )}
                                            </p>
                                        </div>
                                    ) : (
                                        AVATARS.map((avatar) => (
                                            <button
                                                key={avatar}
                                                type="button"
                                                aria-label={t(
                                                    `colleagues.avatar.${avatar}`,
                                                )}
                                                aria-pressed={
                                                    form.avatar === avatar
                                                }
                                                onClick={() =>
                                                    setForm({ ...form, avatar })
                                                }
                                                className={`rounded-2xl p-1 ${form.avatar === avatar ? "ring-2 ring-sky-500 dark:ring-sky-400" : ""}`}
                                            >
                                                <ColleagueAvatar
                                                    entityId={form.id}
                                                    variant={avatar}
                                                    className="h-10 w-10"
                                                />
                                            </button>
                                        ))
                                    )}
                                </div>
                            </fieldset>
                            <label className="block space-y-1.5 text-sm">
                                <span>{t("assistantDirectory.purpose")}</span>
                                <Textarea
                                    autoFocus
                                    rows={3}
                                    maxLength={500}
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            description: e.target.value,
                                        })
                                    }
                                    placeholder={t(
                                        "colleagues.rolePlaceholder",
                                    )}
                                />
                            </label>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={draftBusy || !form.description.trim()}
                                onClick={draftAssistant}
                            >
                                {draftBusy && (
                                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                )}
                                {t("assistantDirectory.draft")}
                            </Button>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t("assistantDirectory.draftHelp")}
                            </p>
                            <label className="block space-y-1.5 text-sm">
                                <span>{t("Name")}</span>
                                <Input
                                    required
                                    maxLength={80}
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            name: e.target.value,
                                        })
                                    }
                                    placeholder={t(
                                        "colleagues.namePlaceholder",
                                    )}
                                />
                            </label>
                            <label className="block space-y-1.5 text-sm">
                                <span>{t("colleagues.instructions")}</span>
                                <Textarea
                                    rows={6}
                                    maxLength={12000}
                                    value={form.instructions}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            instructions: e.target.value,
                                        })
                                    }
                                    placeholder={t(
                                        "colleagues.instructionsPlaceholder",
                                    )}
                                />
                            </label>
                            {error && (
                                <p
                                    role="alert"
                                    className="text-sm text-red-700 dark:text-red-300"
                                >
                                    {error}
                                </p>
                            )}
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setForm(null)}
                                >
                                    {t("Cancel")}
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={
                                        !form.name.trim() ||
                                        save.isPending ||
                                        draftBusy
                                    }
                                >
                                    {save.isPending && (
                                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                    )}
                                    {t("Save")}
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
            <CreateAutomationDialog
                open={taskOpen}
                onOpenChange={setTaskOpen}
                entityId={
                    (view === "team" ? selected?.id : search.get("assignee")) ||
                    null
                }
                onCreated={(task, { customize }) =>
                    navigate({
                        view: "tasks",
                        assignee: null,
                        entity: null,
                        tab: null,
                        automation: task._id,
                        edit: customize ? "1" : null,
                    })
                }
            />
        </main>
    );
}
