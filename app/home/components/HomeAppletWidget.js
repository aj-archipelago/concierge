"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import { cn } from "@/lib/utils";
import {
    fetchAppletRuntimeHtml,
    loadOrCreateWidgetHtml,
} from "./generateAppletHtml";
import HomeFullscreenDialog from "./HomeFullscreenDialog";

export default function HomeAppletWidget({
    applet,
    isEditing = false,
    isPending = false,
    reloadToken = 0,
    className,
    menu,
    onOpen,
}) {
    const { t } = useTranslation();
    const { theme } = useContext(ThemeContext) || {};
    const appletId = applet?.appletId ? String(applet.appletId) : null;
    const title = applet?.name || t("Untitled app");
    const [html, setHtml] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(Boolean(appletId));
    const [isGenerating, setIsGenerating] = useState(false);
    const [retryAttempt, setRetryAttempt] = useState(0);
    const retryRequested = useRef(false);
    const [fullscreen, setFullscreen] = useState(false);
    const openApp = () => (onOpen ? onOpen() : setFullscreen(true));

    useEffect(() => {
        if (!appletId) {
            setHtml(null);
            setError(null);
            setIsLoading(false);
            setIsGenerating(false);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        setIsGenerating(false);
        setError(null);
        const retry = retryRequested.current;
        retryRequested.current = false;
        loadOrCreateWidgetHtml(appletId, t, {
            retry,
            onGenerating: () => {
                if (!cancelled) setIsGenerating(true);
            },
        })
            .then((runtimeHtml) => {
                if (!cancelled) {
                    setHtml(runtimeHtml);
                    setIsLoading(false);
                    setIsGenerating(false);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err);
                    setHtml(null);
                    setIsLoading(false);
                    setIsGenerating(false);
                }
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- copy changes must not start another preparation
    }, [appletId, reloadToken, retryAttempt]);

    useEffect(() => {
        if (isEditing) setFullscreen(false);
    }, [isEditing]);

    return (
        <div
            data-testid="home-applet-widget"
            data-applet-id={appletId || undefined}
            aria-label={title}
            className={cn(
                "relative flex h-full min-h-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800",
                isPending && "opacity-60",
                isEditing && "pointer-events-none",
                className,
            )}
        >
            <div
                data-testid="home-card-toolbar"
                className={cn(
                    "flex min-h-14 shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-1 dark:border-gray-700",
                    isEditing && "ps-10 pe-28",
                )}
            >
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {title}
                </h3>
                {!isEditing && (
                    <>
                        <button
                            type="button"
                            data-testid="home-applet-widget-fullscreen"
                            onClick={openApp}
                            disabled={isPending || !appletId}
                            title={t("Open app")}
                            aria-label={t("Open app")}
                            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                            <Maximize2 className="h-4 w-4" aria-hidden="true" />
                            {t("Open")}
                        </button>
                        {menu}
                    </>
                )}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-b-2xl">
                {isLoading ? (
                    <div
                        role="status"
                        className="flex h-full min-h-48 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                        <Loader2
                            className="h-5 w-5 animate-spin"
                            aria-hidden="true"
                        />
                        <p className="font-medium text-gray-700 dark:text-gray-200">
                            {t(
                                isGenerating
                                    ? "Getting {{name}} ready…"
                                    : "Loading {{name}}…",
                                { name: title },
                            )}
                        </p>
                        {isGenerating && (
                            <p>
                                {t(
                                    "You can keep using Home. This may take a few minutes.",
                                )}
                            </p>
                        )}
                    </div>
                ) : error ? (
                    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-gray-600 dark:text-gray-300">
                        <p role="alert">
                            {t("Couldn't load this app. Please try again.")}
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                retryRequested.current = true;
                                setRetryAttempt((attempt) => attempt + 1);
                            }}
                            className="min-h-10 rounded-lg border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-600 dark:hover:bg-gray-700"
                        >
                            {t("Retry")}
                        </button>
                    </div>
                ) : !fullscreen && html ? (
                    <OutputSandbox
                        content={html}
                        height="100%"
                        theme={theme || "light"}
                        autoResize={false}
                    />
                ) : null}
            </div>
            {fullscreen && (
                <HomeAppletViewer
                    applet={applet}
                    onClose={() => setFullscreen(false)}
                />
            )}
        </div>
    );
}

export function HomeAppletViewer({ applet, onClose }) {
    const { t } = useTranslation();
    const { theme } = useContext(ThemeContext) || {};
    const [html, setHtml] = useState(null);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    const title = applet?.name || t("Untitled app");
    const appletId = applet?.appletId;
    useEffect(() => {
        let cancelled = false;
        setError(false);
        setHtml(null);
        fetchAppletRuntimeHtml(appletId)
            .then((content) => {
                if (!cancelled) setHtml(content);
            })
            .catch(() => {
                if (!cancelled) setError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [appletId, retry]);
    return (
        <HomeFullscreenDialog
            title={title}
            onClose={onClose}
            testId="home-applet-widget-fullscreen-overlay"
        >
            {error ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
                    <p role="alert">
                        {t("Couldn't load this app. Please try again.")}
                    </p>
                    <button
                        type="button"
                        className="min-h-10 rounded-lg border border-gray-300 px-4 dark:border-gray-600"
                        onClick={() => setRetry((value) => value + 1)}
                    >
                        {t("Retry")}
                    </button>
                </div>
            ) : html ? (
                <OutputSandbox
                    content={html}
                    height="100%"
                    theme={theme || "light"}
                    autoResize={false}
                />
            ) : (
                <div
                    role="status"
                    className="flex h-full items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400"
                >
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t("Loading {{name}}…", { name: title })}
                </div>
            )}
        </HomeFullscreenDialog>
    );
}
