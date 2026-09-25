"use client";

import { useEffect, useMemo, useState } from "react";
import {
    AppWindow,
    ArrowLeft,
    LayoutDashboard,
    Loader2,
    Puzzle,
    Sparkles,
    Zap,
} from "lucide-react";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import {
    appCatalogActionButtonClass,
    appCatalogPrimaryActionButtonClass,
} from "@/src/components/apps/AppCatalogCard";
import {
    mergePickerApplets,
    normalizeAppletPickerApplet,
    normalizeStoreAppsForPicker,
} from "@/src/components/apps/appPickerUtils";
import { useAutomations } from "@/src/hooks/useAutomations";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import HomeFullscreenDialog from "./HomeFullscreenDialog";
import { findExistingHomeAddMatches } from "./findExistingHomeAddMatches";

function getAppIcon(applet) {
    return applet?.icon && Icons[applet.icon] ? Icons[applet.icon] : AppWindow;
}

export default function HomeAddDialog({
    excludedAppletIds = [],
    excludedAutomationIds = [],
    disabled = false,
    isPending = false,
    onPickApplet,
    onPickAutomation,
    onCreateApplet,
    onCreateAutomation,
    onClose,
    t,
}) {
    const [prompt, setPrompt] = useState("");
    const [isClassifying, setIsClassifying] = useState(false);
    const [classifyError, setClassifyError] = useState("");
    const [placement, setPlacement] = useState(null);
    const [applets, setApplets] = useState([]);
    const [isLoadingApplets, setIsLoadingApplets] = useState(true);
    const { data: automationsData, isLoading: isLoadingAutomations } =
        useAutomations();

    useEffect(() => {
        const ac = new AbortController();
        setIsLoadingApplets(true);
        Promise.all([
            fetch("/api/canvas-applets", { signal: ac.signal })
                .then((res) => (res.ok ? res.json() : { applets: [] }))
                .catch(() => ({ applets: [] })),
            fetch("/api/apps", { signal: ac.signal })
                .then((res) => (res.ok ? res.json() : []))
                .catch(() => []),
        ])
            .then(([ownData, storeData]) => {
                const own = (
                    Array.isArray(ownData.applets) ? ownData.applets : []
                )
                    .map(normalizeAppletPickerApplet)
                    .filter(Boolean);
                const store = normalizeStoreAppsForPicker(storeData);
                setApplets(mergePickerApplets(own, store));
            })
            .finally(() => {
                if (!ac.signal.aborted) setIsLoadingApplets(false);
            });
        return () => ac.abort();
    }, []);

    const excludedAppletIdSet = useMemo(
        () => new Set(excludedAppletIds.map(String)),
        [excludedAppletIds],
    );
    const excludedAutomationIdSet = useMemo(
        () => new Set(excludedAutomationIds.map(String)),
        [excludedAutomationIds],
    );

    const availableApplets = useMemo(
        () =>
            applets.filter(
                (applet) => !excludedAppletIdSet.has(String(applet.appletId)),
            ),
        [applets, excludedAppletIdSet],
    );

    const availableAutomations = useMemo(() => {
        const list = Array.isArray(automationsData) ? automationsData : [];
        return list.filter(
            (automation) =>
                !excludedAutomationIdSet.has(String(automation._id)),
        );
    }, [automationsData, excludedAutomationIdSet]);

    const suggestedMatches = useMemo(
        () =>
            findExistingHomeAddMatches({
                prompt,
                applets,
                automations: Array.isArray(automationsData)
                    ? automationsData
                    : [],
                excludedAppletIds,
                excludedAutomationIds,
            }),
        [
            prompt,
            applets,
            automationsData,
            excludedAppletIds,
            excludedAutomationIds,
        ],
    );
    const suggestedMatchIds = useMemo(
        () =>
            new Set(
                suggestedMatches.map((match) => `${match.kind}:${match.id}`),
            ),
        [suggestedMatches],
    );

    const rankedApplets = useMemo(() => {
        const highlighted = [];
        const rest = [];
        availableApplets.forEach((applet) => {
            if (suggestedMatchIds.has(`applet:${applet.appletId}`)) {
                highlighted.push(applet);
            } else {
                rest.push(applet);
            }
        });
        return [...highlighted, ...rest];
    }, [availableApplets, suggestedMatchIds]);

    const rankedAutomations = useMemo(() => {
        const highlighted = [];
        const rest = [];
        availableAutomations.forEach((automation) => {
            if (suggestedMatchIds.has(`automation:${automation._id}`)) {
                highlighted.push(automation);
            } else {
                rest.push(automation);
            }
        });
        return [...highlighted, ...rest];
    }, [availableAutomations, suggestedMatchIds]);

    const busy = disabled || isPending || isClassifying;
    const canSubmitPrompt = Boolean(prompt.trim()) && !busy;

    const handleUseSuggestedMatch = (match) => {
        if (!match || match.alreadyOnHome || busy) return;
        if (match.kind === "automation") {
            onPickAutomation?.(match.item);
            return;
        }
        setPlacement({
            mode: "pick-applet",
            applet: match.item,
        });
    };

    const handlePickExistingApplet = (applet) => {
        if (!applet || busy) return;
        setPlacement({
            mode: "pick-applet",
            applet,
        });
    };

    const handleConfirmPlacement = (size) => {
        if (!placement || busy) return;
        const nextSize = size === "mini" ? "mini" : "large";
        if (placement.mode === "create-applet") {
            onClose();
            onCreateApplet?.(placement.prompt, { size: nextSize });
            return;
        }
        onPickApplet?.(placement.applet, { size: nextSize });
    };

    const handleCreateFromPrompt = async () => {
        const trimmed = prompt.trim();
        if (!trimmed || busy) return;

        setClassifyError("");
        setIsClassifying(true);
        try {
            const response = await fetch("/api/home/classify-add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: trimmed }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    body?.error || t("Failed to understand that request."),
                );
            }
            const kind = body?.classification?.kind;
            if (kind === "automation") {
                onCreateAutomation?.(trimmed);
            } else {
                setPlacement({
                    mode: "create-applet",
                    prompt: trimmed,
                });
            }
        } catch (error) {
            setClassifyError(
                error?.message || t("Failed to understand that request."),
            );
        } finally {
            setIsClassifying(false);
        }
    };

    return (
        <HomeFullscreenDialog
            compact
            title={t("Add to Home")}
            onClose={onClose}
        >
            {placement ? (
                <AppletPlacementStep
                    title={
                        placement.mode === "create-applet"
                            ? placement.prompt
                            : placement.applet?.name || t("Untitled")
                    }
                    onBack={() => setPlacement(null)}
                    onChoose={handleConfirmPlacement}
                    t={t}
                />
            ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
                    <section className="space-y-3">
                        <div>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {t("Describe what you'd like")}
                            </h3>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {t(
                                    "Describe an app you want to use or a task for a colleague to do.",
                                )}
                            </p>
                        </div>
                        <AutosizeTextarea
                            data-testid="home-add-prompt"
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder={t(
                                'e.g. "Daily news brief every morning" or "A translator for Arabic headlines"',
                            )}
                            minHeight={88}
                            maxHeight={180}
                            className="text-sm border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                            disabled={busy}
                            autoFocus
                        />
                        {classifyError ? (
                            <p className="text-xs text-red-600 dark:text-red-400">
                                {classifyError}
                            </p>
                        ) : null}
                        {suggestedMatches.length > 0 ? (
                            <div
                                data-testid="home-add-existing-suggestion"
                                className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-400/30 dark:bg-sky-400/[0.12]"
                            >
                                <p className="text-sm font-medium text-sky-950 dark:text-sky-50">
                                    {t("You already have something like this")}
                                </p>
                                <p className="text-xs text-sky-800 dark:text-sky-200">
                                    {t(
                                        "Use an existing match, or create a new one anyway.",
                                    )}
                                </p>
                                <ul className="space-y-1.5">
                                    {suggestedMatches.map((match) => {
                                        const Icon =
                                            match.kind === "automation"
                                                ? Zap
                                                : getAppIcon(match.item);
                                        const kindLabel =
                                            match.kind === "automation"
                                                ? t("Task")
                                                : t("App");
                                        return (
                                            <li
                                                key={`${match.kind}:${match.id}`}
                                                className="flex min-h-10 items-center gap-2 rounded-md bg-white/80 px-2 py-1.5 dark:bg-gray-900/60"
                                            >
                                                <Icon className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm text-gray-900 dark:text-gray-100">
                                                        {match.name ||
                                                            t("Untitled")}
                                                    </p>
                                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                                        {match.alreadyOnHome
                                                            ? t(
                                                                  "Already on your home page",
                                                              )
                                                            : kindLabel}
                                                    </p>
                                                </div>
                                                {match.alreadyOnHome ? null : (
                                                    <button
                                                        type="button"
                                                        data-testid={`home-add-use-existing-${match.kind}-${match.id}`}
                                                        className={cn(
                                                            appCatalogActionButtonClass,
                                                            appCatalogPrimaryActionButtonClass,
                                                            "shrink-0",
                                                        )}
                                                        disabled={busy}
                                                        onClick={() =>
                                                            handleUseSuggestedMatch(
                                                                match,
                                                            )
                                                        }
                                                    >
                                                        {t("Use existing")}
                                                    </button>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ) : null}
                        <div className="flex justify-end">
                            <button
                                type="button"
                                data-testid="home-add-create-from-prompt"
                                className={cn(
                                    appCatalogActionButtonClass,
                                    appCatalogPrimaryActionButtonClass,
                                )}
                                disabled={!canSubmitPrompt}
                                onClick={handleCreateFromPrompt}
                            >
                                {isClassifying ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Sparkles className="h-4 w-4" />
                                )}
                                {suggestedMatches.length > 0
                                    ? t("Create new")
                                    : t("Create")}
                            </button>
                        </div>
                    </section>

                    <div className="relative flex items-center gap-3">
                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                        <span className="text-xs uppercase text-gray-400 dark:text-gray-500">
                            {t("or")}
                        </span>
                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                    </div>

                    <section className="min-h-0 flex-1 space-y-3">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {t("Existing")}
                        </h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <ExistingColumn
                                title={t("Apps")}
                                icon={Puzzle}
                                isLoading={isLoadingApplets}
                                emptyLabel={t("No apps available")}
                                t={t}
                            >
                                {rankedApplets.map((applet) => {
                                    const Icon = getAppIcon(applet);
                                    return (
                                        <ExistingRow
                                            key={applet.appletId}
                                            icon={Icon}
                                            label={applet.name || t("Untitled")}
                                            highlighted={suggestedMatchIds.has(
                                                `applet:${applet.appletId}`,
                                            )}
                                            disabled={busy}
                                            onClick={() =>
                                                handlePickExistingApplet(applet)
                                            }
                                            testId={`home-add-existing-applet-${applet.appletId}`}
                                            t={t}
                                        />
                                    );
                                })}
                            </ExistingColumn>
                            <ExistingColumn
                                title={t("Tasks")}
                                icon={Zap}
                                isLoading={isLoadingAutomations}
                                emptyLabel={t("No tasks available")}
                                t={t}
                            >
                                {rankedAutomations.map((automation) => (
                                    <ExistingRow
                                        key={String(automation._id)}
                                        icon={Zap}
                                        label={automation.name || t("Untitled")}
                                        highlighted={suggestedMatchIds.has(
                                            `automation:${automation._id}`,
                                        )}
                                        disabled={busy}
                                        onClick={() =>
                                            onPickAutomation?.(automation)
                                        }
                                        testId={`home-add-existing-automation-${automation._id}`}
                                        t={t}
                                    />
                                ))}
                            </ExistingColumn>
                        </div>
                    </section>
                </div>
            )}
        </HomeFullscreenDialog>
    );
}

function AppletPlacementStep({ title, onBack, onChoose, t }) {
    return (
        <div
            data-testid="home-add-placement"
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
        >
            <button
                type="button"
                data-testid="home-add-placement-back"
                onClick={onBack}
                className="inline-flex min-h-10 w-fit items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-50"
            >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                {t("Back")}
            </button>
            <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t("How should this appear on Home?")}
                </h3>
                {title ? (
                    <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                        {title}
                    </p>
                ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PlacementChoice
                    testId="home-add-as-launch"
                    icon={AppWindow}
                    title={t("Shortcut")}
                    description={t("Open the app when you select it.")}
                    onClick={() => onChoose("mini")}
                />
                <PlacementChoice
                    testId="home-add-as-interactive"
                    icon={LayoutDashboard}
                    title={t("Use on Home")}
                    description={t("Use the app directly from your Home page.")}
                    onClick={() => onChoose("large")}
                />
            </div>
        </div>
    );
}

function PlacementChoice({ testId, icon: Icon, title, description, onClick }) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            className="flex min-h-[5.5rem] flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-4 text-start transition hover:border-sky-300 hover:bg-sky-50/70 focus:outline-none focus:ring-2 focus:ring-sky-300/70 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-sky-400/40 dark:hover:bg-sky-400/10 dark:focus:ring-sky-400/40"
        >
            <Icon className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {title}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
                {description}
            </span>
        </button>
    );
}

function ExistingColumn({
    title,
    icon: Icon,
    isLoading,
    emptyLabel,
    children,
    t,
}) {
    const items = Array.isArray(children) ? children : [children];
    const hasItems = items.filter(Boolean).length > 0;

    return (
        <div className="flex min-h-[12rem] flex-col rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
                <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {title}
                </span>
            </div>
            <div className="max-h-64 min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="sr-only">{t("Loading...")}</span>
                    </div>
                ) : !hasItems ? (
                    <p className="px-2 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                        {emptyLabel}
                    </p>
                ) : (
                    children
                )}
            </div>
        </div>
    );
}

function ExistingRow({
    icon: Icon,
    label,
    highlighted = false,
    disabled,
    onClick,
    testId,
    t,
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex w-full min-h-10 items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-gray-800 hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-800",
                highlighted &&
                    "bg-sky-50 ring-1 ring-sky-200 hover:bg-sky-100 dark:bg-sky-400/10 dark:ring-sky-400/30 dark:hover:bg-sky-400/20",
            )}
        >
            <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="shrink-0 text-xs text-sky-600 dark:text-sky-400">
                {t("Add")}
            </span>
        </button>
    );
}
