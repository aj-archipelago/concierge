"use client";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import { useEffect, useState, useContext } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { useAddChat } from "../../app/queries/chats";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import { Loader2, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openCanvasAppletInChat } from "@/src/utils/openCanvasApplet";
import { isAppletEmbedMode } from "@/src/utils/appletChrome";
import { cn } from "@/lib/utils";

export default function PublishedAppletView({
    applet,
    app,
    meta = null,
    isLoading,
    error: appletError,
}) {
    const { theme } = useContext(ThemeContext);
    const { t } = useTranslation();
    const router = useRouter();
    const searchParams = useSearchParams();
    const dispatch = useDispatch();
    const addChat = useAddChat();
    const [error, setError] = useState(null);
    const [publishedHtml, setPublishedHtml] = useState(null);
    const [isCopying, setIsCopying] = useState(false);
    const [copyError, setCopyError] = useState(null);
    const canAdminCopy = meta?.canAdminCopy === true;
    const renderWithoutChrome = isAppletEmbedMode(searchParams);

    useEffect(() => {
        if (isLoading) return;

        if (appletError) {
            setError(
                "Failed to load applet. Please ensure that you have the correct link.",
            );
            return;
        }

        if (!applet) return;

        const apiRunnableHtml = applet.publishedHtml || applet.runtimeHtml;

        if (!apiRunnableHtml) {
            setError(t("This applet has no runnable version."));
            setPublishedHtml(null);
            return;
        }

        setError(null);
        setPublishedHtml(apiRunnableHtml);
    }, [applet, isLoading, appletError, t]);

    const handleCopyToAccount = async () => {
        if (!applet?._id || isCopying) return;

        setIsCopying(true);
        setCopyError(null);
        try {
            const response = await fetch(
                `/api/canvas-applets/${applet._id}/copy`,
                { method: "POST" },
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || t("Failed to copy applet"));
            }

            await openCanvasAppletInChat({
                appletId: payload._id,
                fallbackApplet: payload,
                addChat,
                dispatch,
                router,
                t,
            });
        } catch (copyErr) {
            console.error("Error copying applet:", copyErr);
            setCopyError(copyErr?.message || t("Failed to copy applet"));
        } finally {
            setIsCopying(false);
        }
    };

    if (isLoading) {
        return (
            <div
                className="flex h-screen items-center justify-center"
                role="status"
                aria-label={t("Loading applet...")}
            >
                <Loader2
                    className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full text-red-600 dark:text-red-400">
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "relative h-full w-full",
                renderWithoutChrome &&
                    "h-screen min-h-screen bg-white dark:bg-gray-900",
            )}
        >
            {!renderWithoutChrome && canAdminCopy && (
                <div className="absolute top-4 end-4 z-10 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleCopyToAccount}
                        disabled={isCopying}
                        aria-label={t("Copy to my account")}
                        aria-busy={isCopying}
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-violet-600 px-4 text-sm font-medium text-white shadow-lg transition-colors hover:bg-violet-700 disabled:opacity-50"
                        title={t("Copy to my account")}
                    >
                        {isCopying ? (
                            <Loader2
                                className="h-4 w-4 animate-spin"
                                aria-hidden="true"
                            />
                        ) : (
                            <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span className="hidden sm:inline">
                            {isCopying
                                ? t("Copying applet...")
                                : t("Copy to my account")}
                        </span>
                    </button>
                </div>
            )}

            {!renderWithoutChrome && copyError && (
                <div
                    role="alert"
                    aria-live="polite"
                    className="absolute top-16 end-4 z-10 max-w-xs rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-lg dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                >
                    {copyError}
                </div>
            )}

            <OutputSandbox
                key={applet?._id || app?._id || publishedHtml}
                content={publishedHtml}
                height="100%"
                theme={theme}
                autoResize={false}
            />
        </div>
    );
}
