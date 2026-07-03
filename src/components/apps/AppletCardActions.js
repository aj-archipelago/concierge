"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Edit,
    Home,
    LayoutGrid,
    MoreVertical,
    PanelLeft,
    Share2,
    Trash2,
    Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ShareDialog from "@/components/share/ShareDialog";
import { useShareSettings } from "@/components/share/useShareSettings";
import { isShareActive } from "@/components/share/shareUtils";

export function useAppletCardInteractionLock(releaseDelay = 220) {
    const [isInteractionHeld, setIsInteractionHeld] = useState(false);
    const [suppressInteractionMotion, setSuppressInteractionMotion] =
        useState(false);
    const timeoutRef = useRef(null);
    const frameRef = useRef(null);

    const clearTimers = useCallback(() => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (frameRef.current) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
    }, []);

    const holdInteraction = useCallback(() => {
        if (typeof window === "undefined") return;
        clearTimers();
        setSuppressInteractionMotion(false);
        setIsInteractionHeld(true);

        timeoutRef.current = window.setTimeout(() => {
            setSuppressInteractionMotion(true);
            setIsInteractionHeld(false);
            frameRef.current = window.requestAnimationFrame(() => {
                setSuppressInteractionMotion(false);
                frameRef.current = null;
            });
            timeoutRef.current = null;
        }, releaseDelay);
    }, [clearTimers, releaseDelay]);

    useEffect(() => clearTimers, [clearTimers]);

    return {
        isInteractionHeld,
        suppressInteractionMotion,
        holdInteraction,
    };
}

function invokeHandler(handler, applet) {
    if (typeof handler !== "function") return;
    handler({ stopPropagation: () => {} }, applet);
}

export function AppletCardMenu({
    applet,
    direction = "ltr",
    open,
    onEditMetadata,
    onToggleHome,
    onToggleHomeDirectory,
    onToggleInstall,
    onDelete,
    onOpenChange,
    onActionStart,
}) {
    const { t } = useTranslation();
    const [shareOpen, setShareOpen] = useState(false);
    const canShare = Boolean(applet.canDelete && applet._id);
    const hasPreloadedShareState = typeof applet.isSharedOut === "boolean";
    const { data: shareData, isShared: fetchedIsShared } = useShareSettings(
        "applet",
        canShare ? applet._id : null,
        {
            enabled: canShare && (!hasPreloadedShareState || shareOpen),
        },
    );
    const isShared =
        shareData !== undefined
            ? isShareActive(shareData)
            : hasPreloadedShareState
              ? applet.isSharedOut
              : fetchedIsShared;

    const showEditMetadata =
        applet.type === "canvas" &&
        applet.canEditMetadata !== false &&
        typeof onEditMetadata === "function";
    const showHomeControls =
        applet.type === "canvas" &&
        typeof onToggleHome === "function" &&
        typeof onToggleHomeDirectory === "function";
    const showSidebarToggle =
        applet.type === "canvas" && Boolean(onToggleInstall);
    const showDelete = Boolean(applet.canDelete && onDelete);
    const hasMenu =
        showEditMetadata ||
        showHomeControls ||
        showSidebarToggle ||
        canShare ||
        showDelete;

    if (!hasMenu) return null;

    const runMenuAction = (handler) => {
        onActionStart?.();
        invokeHandler(handler, applet);
    };

    return (
        <>
            <DropdownMenu open={open} onOpenChange={onOpenChange}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/75 bg-white/[0.82] text-gray-800 shadow-md backdrop-blur transition hover:bg-white hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-sky-300/70 dark:border-white/30 dark:bg-gray-950/75 dark:text-white/90 dark:hover:bg-gray-950 dark:hover:text-white dark:focus:ring-white/70"
                        title={t("More actions")}
                        aria-label={t("More actions")}
                    >
                        <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align={direction === "rtl" ? "start" : "end"}
                >
                    {showEditMetadata && (
                        <DropdownMenuItem
                            onClick={() => runMenuAction(onEditMetadata)}
                            className="gap-2"
                        >
                            <Edit className="h-4 w-4" />
                            {t("Edit metadata")}
                        </DropdownMenuItem>
                    )}

                    {showHomeControls && (
                        <>
                            <DropdownMenuCheckboxItem
                                checked={Boolean(applet.isHome)}
                                onCheckedChange={() =>
                                    runMenuAction(onToggleHome)
                                }
                                className="gap-2"
                            >
                                <Home className="h-4 w-4" />
                                {applet.isHome
                                    ? t("Unset home applet")
                                    : t("Set as home applet")}
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                                checked={Boolean(applet.isHomeDirectory)}
                                onCheckedChange={() =>
                                    runMenuAction(onToggleHomeDirectory)
                                }
                                className="gap-2"
                            >
                                <LayoutGrid className="h-4 w-4" />
                                {applet.isHomeDirectory
                                    ? t("Remove from Home")
                                    : t("Add to Home")}
                            </DropdownMenuCheckboxItem>
                        </>
                    )}

                    {showSidebarToggle && (
                        <DropdownMenuCheckboxItem
                            checked={Boolean(applet.isInstalled)}
                            onCheckedChange={() =>
                                runMenuAction(onToggleInstall)
                            }
                            className="gap-2"
                        >
                            <PanelLeft className="h-4 w-4" />
                            {applet.isInstalled
                                ? t("Remove from sidebar")
                                : t("Add to sidebar")}
                        </DropdownMenuCheckboxItem>
                    )}

                    {canShare && (
                        <DropdownMenuItem
                            onClick={() => {
                                onActionStart?.();
                                setShareOpen(true);
                            }}
                            className="gap-2"
                        >
                            {isShared ? (
                                <Users className="h-4 w-4" />
                            ) : (
                                <Share2 className="h-4 w-4" />
                            )}
                            {isShared ? t("Shared") : t("Share")}
                        </DropdownMenuItem>
                    )}

                    {showDelete && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => runMenuAction(onDelete)}
                                className="gap-2 text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300"
                            >
                                <Trash2 className="h-4 w-4" />
                                {t("Delete applet")}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {canShare && (
                <ShareDialog
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                    entityType="applet"
                    entityId={applet._id}
                />
            )}
        </>
    );
}
