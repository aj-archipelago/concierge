"use client";

import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import classNames from "../../../app/utils/class-names";
import { ThemeContext } from "../../contexts/ThemeProvider";

const AUTOMATION_HTML_CSP =
    "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data: https:;";

const automationHtmlCache = new Map();

export function clearAutomationHtmlCache() {
    automationHtmlCache.clear();
}

function isCacheableTaskId(taskId) {
    return taskId && taskId !== "latest";
}

function getAutomationHtmlCacheKey(automationId, taskId, theme, cacheVersion) {
    if (!automationId || !isCacheableTaskId(taskId)) return null;
    return `${automationId}:${taskId}:${theme || "light"}:${cacheVersion || "current"}`;
}

function withAutomationHtmlCsp(html) {
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${AUTOMATION_HTML_CSP}">`;
    const htmlWithoutGeneratedCsp = html.replace(
        /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(["']?)\s*Content-Security-Policy\s*\1)[^>]*>/gi,
        "",
    );

    if (/<head(\s[^>]*)?>/i.test(htmlWithoutGeneratedCsp)) {
        return htmlWithoutGeneratedCsp.replace(
            /<head(\s[^>]*)?>/i,
            (match) => `${match}${cspMeta}`,
        );
    }
    return `${cspMeta}${htmlWithoutGeneratedCsp}`;
}

async function fetchAutomationHtml(src, cacheKey) {
    if (cacheKey) {
        const cached = automationHtmlCache.get(cacheKey);
        if (cached?.html) return cached.html;
        if (cached?.promise) return cached.promise;
    }

    const promise = fetch(src, { credentials: "include" })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(
                    `Failed to load automation HTML (${response.status})`,
                );
            }
            return withAutomationHtmlCsp(await response.text());
        })
        .then((html) => {
            if (cacheKey) {
                automationHtmlCache.set(cacheKey, { html });
            }
            return html;
        })
        .catch((error) => {
            if (cacheKey) {
                const cached = automationHtmlCache.get(cacheKey);
                if (cached?.promise === promise) {
                    automationHtmlCache.delete(cacheKey);
                }
            }
            throw error;
        });

    if (cacheKey) {
        automationHtmlCache.set(cacheKey, { promise });
    }

    return promise;
}

// Builds the proxied URL for an automation's HTML output. `taskId` defaults to
// "latest" so the frame always shows the newest run unless a specific run is
// requested.
export function automationHtmlSrc(automationId, taskId = "latest") {
    if (!automationId || !taskId) return null;
    return `/api/automations/${encodeURIComponent(
        automationId,
    )}/runs/${encodeURIComponent(taskId)}/html`;
}

export default function AutomationHtmlFrame({
    automationId,
    taskId = "latest",
    title,
    className,
    sandbox = "",
    cacheVersion,
}) {
    const { t } = useTranslation();
    const { theme = "light" } = useContext(ThemeContext) || {};
    const src = automationHtmlSrc(automationId, taskId);
    const cacheKey = getAutomationHtmlCacheKey(
        automationId,
        taskId,
        theme,
        cacheVersion,
    );
    const [html, setHtml] = useState("");
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setIsLoaded(false);
        setError("");

        if (!src) {
            setHtml("");
            return undefined;
        }

        fetchAutomationHtml(src, cacheKey)
            .then((nextHtml) => {
                if (!cancelled) {
                    setHtml(nextHtml);
                }
            })
            .catch((loadError) => {
                if (!cancelled) {
                    setHtml("");
                    setError(loadError.message);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [cacheKey, src]);

    if (!src) return null;

    const isLoading = !error && (!html || !isLoaded);
    const frameKey = cacheKey || src;

    return (
        <div
            className={classNames(
                "relative overflow-hidden rounded bg-white dark:bg-gray-900",
                className || "min-h-64",
            )}
        >
            {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white dark:bg-gray-900">
                    <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-500 dark:text-gray-400" />
                        {t("Loading automation content...")}
                    </div>
                </div>
            )}
            {error ? (
                <div className="flex h-full min-h-48 items-center justify-center p-4 text-sm text-red-600 dark:text-red-300">
                    {t("Failed to load automation content.")}
                </div>
            ) : html ? (
                <iframe
                    key={frameKey}
                    title={title || t("Automation HTML output")}
                    srcDoc={html}
                    sandbox={sandbox}
                    onLoad={() => setIsLoaded(true)}
                    className={classNames(
                        "h-full w-full border-0 bg-transparent transition-opacity duration-150",
                        isLoaded ? "opacity-100" : "opacity-0",
                    )}
                />
            ) : null}
        </div>
    );
}
