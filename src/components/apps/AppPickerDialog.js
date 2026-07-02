"use client";

import * as Icons from "lucide-react";
import { AppWindow, Check, Loader2, Plus, X } from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import AppCatalogCard, {
    AppCatalogBadge,
    appCatalogDangerActionButtonClass,
    appCatalogIconButtonClass,
} from "@/src/components/apps/AppCatalogCard";
import AppCatalogSearchInput from "@/src/components/apps/AppCatalogSearchInput";
import { filterApps } from "@/src/components/apps/appCatalogUtils";

const EMPTY_ITEMS = [];

function getIcon(name) {
    return name && Icons[name] ? Icons[name] : AppWindow;
}

function formatUpdatedAt(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function PickerSection({ title, children }) {
    return (
        <section className="space-y-3">
            <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
                    {title}
                </h3>
            </div>
            <div className="space-y-2">{children}</div>
        </section>
    );
}

function EmptyPickerState({ label }) {
    return (
        <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {label}
        </div>
    );
}

function PickerToggle({ isSelected, label, onClick, disabled }) {
    const { t } = useTranslation();

    return (
        <button
            type="button"
            className={cn(
                appCatalogIconButtonClass,
                isSelected
                    ? appCatalogDangerActionButtonClass
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/60 dark:hover:text-emerald-200",
            )}
            onClick={onClick}
            disabled={disabled}
            aria-pressed={isSelected}
            aria-label={`${isSelected ? t("Remove") : t("Add")} ${label}`}
        >
            {isSelected ? (
                <X className="h-4 w-4" />
            ) : (
                <Plus className="h-4 w-4" />
            )}
        </button>
    );
}

function sameIds(first, second) {
    return (
        first.length === second.length &&
        first.every((value, index) => value === second[index])
    );
}

export default function AppPickerDialog({
    title,
    applets = EMPTY_ITEMS,
    builtInApps = EMPTY_ITEMS,
    includeBuiltIns = false,
    isLoadingApplets = false,
    isLoadingBuiltIns = false,
    pendingKey = null,
    onCommit,
    onClose,
}) {
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const isLoading =
        isLoadingApplets || (includeBuiltIns && isLoadingBuiltIns);
    const isCommitting = pendingKey === "commit";
    const [selectedAppletIds, setSelectedAppletIds] = useState([]);
    const [selectedBuiltInIds, setSelectedBuiltInIds] = useState([]);
    const [filterText, setFilterText] = useState("");

    useEffect(() => {
        const availableIds = new Set(
            applets.map((applet) => String(applet.appletId || applet._id)),
        );
        setSelectedAppletIds((currentIds) => {
            const nextIds = currentIds.filter((id) => availableIds.has(id));
            return sameIds(currentIds, nextIds) ? currentIds : nextIds;
        });
    }, [applets]);

    useEffect(() => {
        const availableIds = new Set(builtInApps.map((app) => String(app._id)));
        setSelectedBuiltInIds((currentIds) => {
            const nextIds = currentIds.filter((id) => availableIds.has(id));
            return sameIds(currentIds, nextIds) ? currentIds : nextIds;
        });
    }, [builtInApps]);

    const selectedApplets = useMemo(
        () =>
            applets.filter((applet) =>
                selectedAppletIds.includes(
                    String(applet.appletId || applet._id),
                ),
            ),
        [applets, selectedAppletIds],
    );
    const selectedBuiltIns = useMemo(
        () =>
            builtInApps.filter((app) =>
                selectedBuiltInIds.includes(String(app._id)),
            ),
        [builtInApps, selectedBuiltInIds],
    );
    const normalizedFilterText = filterText.trim().toLowerCase();
    const filteredBuiltInApps = useMemo(() => {
        return filterApps(builtInApps, normalizedFilterText, {
            translate: t,
        });
    }, [builtInApps, normalizedFilterText, t]);
    const filteredApplets = useMemo(() => {
        return filterApps(applets, normalizedFilterText);
    }, [applets, normalizedFilterText]);
    const selectedCount = selectedApplets.length + selectedBuiltIns.length;
    const isPickerDisabled = Boolean(pendingKey);

    const toggleSelected = (setCurrentIds, id) => {
        setCurrentIds((currentIds) =>
            currentIds.includes(id)
                ? currentIds.filter((currentId) => currentId !== id)
                : [...currentIds, id],
        );
    };

    const commitSelection = () => {
        if (isPickerDisabled || !selectedCount) return;
        onCommit?.({
            applets: selectedApplets,
            builtInApps: selectedBuiltIns,
        });
    };

    return (
        <div
            data-testid="app-picker-dialog"
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/50 p-2 dark:bg-black/70 sm:items-center sm:p-4"
            dir={direction}
        >
            <div
                data-testid="app-picker-panel"
                className="flex max-h-[calc(100vh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
            >
                <div className="flex min-h-14 shrink-0 items-center border-b border-gray-200 px-4 dark:border-gray-700">
                    <h2 className="text-base font-semibold text-gray-950 dark:text-gray-50">
                        {title}
                    </h2>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex min-h-24 items-center justify-center">
                            <Loader2 className="h-7 w-7 animate-spin text-sky-600 dark:text-sky-400" />
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <AppCatalogSearchInput
                                type="search"
                                placeholder={t("Filter applets")}
                                label={t("Filter applets")}
                                value={filterText}
                                onChange={(event) =>
                                    setFilterText(event.target.value)
                                }
                                className="border-gray-200 text-gray-900 focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800"
                            />
                            {includeBuiltIns && (
                                <PickerSection title={t("Built-in tools")}>
                                    {filteredBuiltInApps.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                            {filteredBuiltInApps.map((app) => {
                                                const appId = String(app._id);
                                                const isSelected =
                                                    selectedBuiltInIds.includes(
                                                        appId,
                                                    );
                                                const Icon = getIcon(app.icon);
                                                const appName = t(app.name);
                                                return (
                                                    <AppCatalogCard
                                                        key={appId}
                                                        icon={Icon}
                                                        title={appName}
                                                        titleAttribute={appName}
                                                        badge={
                                                            isSelected ? (
                                                                <AppCatalogBadge
                                                                    icon={Check}
                                                                    tone="emerald"
                                                                >
                                                                    {t("Added")}
                                                                </AppCatalogBadge>
                                                            ) : null
                                                        }
                                                        description={
                                                            app.description
                                                                ? t(
                                                                      app.description,
                                                                  )
                                                                : null
                                                        }
                                                        density="compact"
                                                        isHighlighted={
                                                            isSelected
                                                        }
                                                        disableHover
                                                        imageActions={
                                                            <PickerToggle
                                                                isSelected={
                                                                    isSelected
                                                                }
                                                                label={appName}
                                                                onClick={() =>
                                                                    toggleSelected(
                                                                        setSelectedBuiltInIds,
                                                                        appId,
                                                                    )
                                                                }
                                                                disabled={
                                                                    isPickerDisabled
                                                                }
                                                            />
                                                        }
                                                        imageActionsAlwaysVisible
                                                        onClick={
                                                            isPickerDisabled
                                                                ? undefined
                                                                : () =>
                                                                      toggleSelected(
                                                                          setSelectedBuiltInIds,
                                                                          appId,
                                                                      )
                                                        }
                                                    />
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <EmptyPickerState
                                            label={t(
                                                "No built-in apps available to add",
                                            )}
                                        />
                                    )}
                                </PickerSection>
                            )}

                            <PickerSection title={t("Applets")}>
                                {filteredApplets.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {filteredApplets.map((applet) => {
                                            const appletId = String(
                                                applet.appletId || applet._id,
                                            );
                                            const isSelected =
                                                selectedAppletIds.includes(
                                                    appletId,
                                                );
                                            const Icon = getIcon(applet.icon);
                                            const updatedAt = formatUpdatedAt(
                                                applet.updatedAt,
                                            );
                                            return (
                                                <AppCatalogCard
                                                    key={appletId}
                                                    icon={Icon}
                                                    title={applet.name}
                                                    titleAttribute={applet.name}
                                                    badge={
                                                        isSelected ? (
                                                            <AppCatalogBadge
                                                                icon={Check}
                                                                tone="emerald"
                                                            >
                                                                {t("Added")}
                                                            </AppCatalogBadge>
                                                        ) : null
                                                    }
                                                    imageUrl={applet.imageUrl}
                                                    imageLightUrl={
                                                        applet.imageLightUrl
                                                    }
                                                    imageDarkUrl={
                                                        applet.imageDarkUrl
                                                    }
                                                    imageBadge={
                                                        applet.badgeLabel ||
                                                        applet.category
                                                    }
                                                    chips={[
                                                        applet.category,
                                                        ...(Array.isArray(
                                                            applet.tags,
                                                        )
                                                            ? applet.tags
                                                            : []),
                                                    ]}
                                                    description={
                                                        applet.description
                                                    }
                                                    footer={
                                                        updatedAt ? (
                                                            <span className="truncate">
                                                                {t("Updated")}{" "}
                                                                {updatedAt}
                                                            </span>
                                                        ) : null
                                                    }
                                                    imageOverlayVariant="app-library"
                                                    isHighlighted={isSelected}
                                                    density="compact"
                                                    disableHover
                                                    imageActions={
                                                        <PickerToggle
                                                            isSelected={
                                                                isSelected
                                                            }
                                                            label={applet.name}
                                                            onClick={() =>
                                                                toggleSelected(
                                                                    setSelectedAppletIds,
                                                                    appletId,
                                                                )
                                                            }
                                                            disabled={
                                                                isPickerDisabled
                                                            }
                                                        />
                                                    }
                                                    imageActionsAlwaysVisible
                                                    onClick={
                                                        isPickerDisabled
                                                            ? undefined
                                                            : () =>
                                                                  toggleSelected(
                                                                      setSelectedAppletIds,
                                                                      appletId,
                                                                  )
                                                    }
                                                />
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <EmptyPickerState
                                        label={t("No applets available to add")}
                                    />
                                )}
                            </PickerSection>
                        </div>
                    )}
                </div>
                <DialogFooter className="min-h-14 shrink-0 gap-3 border-t border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/60 sm:items-center sm:justify-between sm:space-x-0">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {t("{{count}} selected", {
                            count: selectedCount,
                        })}
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                        <Button
                            type="button"
                            data-testid="app-picker-cancel-button"
                            variant="outline"
                            onClick={onClose}
                            disabled={isPickerDisabled}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            type="button"
                            data-testid="app-picker-add-button"
                            onClick={commitSelection}
                            disabled={isPickerDisabled || !selectedCount}
                            aria-busy={isCommitting}
                        >
                            {isCommitting && (
                                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            )}
                            {t("Add")}
                        </Button>
                    </div>
                </DialogFooter>
            </div>
        </div>
    );
}
