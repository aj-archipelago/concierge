"use client";

import React, {
    useContext,
    useState,
    useEffect,
    useLayoutEffect,
    useRef,
    useMemo,
    useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import {
    ArrowUpCircle,
    ChevronLeft,
    ChevronRight,
    Expand,
    Globe,
    GlobeLock,
    Loader2,
    Pencil,
    Settings,
    Trash2,
    X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MonacoEditor from "@monaco-editor/react";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import { useContentLoader } from "./useContentLoader";
import { TabContentLoader } from "./TabContentLoader";
import { injectAppletIdMeta } from "@/src/utils/appletHtmlUtils";
import {
    setActiveAppletSandbox,
    clearActiveAppletSandbox,
} from "@/src/utils/activeAppletSandbox";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import ShareButton from "@/components/share/ShareButton";
import AppletMetadataDialog from "@/src/components/apps/AppletMetadataDialog";
import {
    extractHtmlStructure,
    filterDarkClasses,
    generateFilteredSandboxHtml,
    normalizeAppletLocale,
    parseAppletParams,
} from "@/src/utils/themeUtils";
import CanvasAppletPublishDialog from "./CanvasAppletPublishDialog";
import CanvasAppletManageDialog from "./CanvasAppletManageDialog";

const STREAMING_PREVIEW_IDLE_MS = 2500;
const STREAMING_PREVIEW_MAX_WAIT_MS = 5000;
const useClientLayoutEffect =
    typeof window === "undefined" ? useEffect : useLayoutEffect;

function getPreviewableStreamingContent(content) {
    const text = String(content || "");
    const isStructuralHtml = /^\s*(?:<!doctype|<html|<head)/i.test(text);
    if (
        isStructuralHtml &&
        /<head(?:\s|>)/i.test(text) &&
        !/<body(?:\s|>)/i.test(text)
    ) {
        return "";
    }
    return content;
}

function getLatestSavedVersionHtml(appletRecord) {
    const versions = Array.isArray(appletRecord?.htmlVersions)
        ? appletRecord.htmlVersions
        : [];
    const latestVersion = versions[versions.length - 1];
    return typeof latestVersion?.content === "string"
        ? latestVersion.content
        : null;
}

function getInitialSelectedVersionIndex({
    activeVersionIndex,
    activeVersionNumber,
    isViewingDraft,
    versionCount,
}) {
    if (isViewingDraft !== false) return null;
    if (Number.isInteger(activeVersionIndex)) {
        return clampVersionIndex(activeVersionIndex, versionCount);
    }
    if (Number.isInteger(activeVersionNumber)) {
        return clampVersionIndex(activeVersionNumber - 1, versionCount);
    }
    return versionCount > 0 ? versionCount - 1 : null;
}

function clampVersionIndex(index, versionCount) {
    if (!Number.isInteger(index) || versionCount <= 0) return null;
    return Math.min(Math.max(0, index), versionCount - 1);
}

function getWorkspaceDocumentUrl(workspacePath) {
    if (
        typeof workspacePath !== "string" ||
        !workspacePath.startsWith("/workspace/files/")
    ) {
        return null;
    }
    return workspacePath.split(/[?#]/)[0] || null;
}

function getWorkspaceBaseHref(workspacePath) {
    const documentUrl = getWorkspaceDocumentUrl(workspacePath);
    return documentUrl || null;
}

function useCommittedPreviewContent(content, { idleMs, maxWaitMs }) {
    const initialContent = getPreviewableStreamingContent(content);
    const [displayContent, setDisplayContent] = useState(initialContent);
    const committedContentRef = useRef(initialContent);
    const pendingContentRef = useRef(initialContent);
    const idleTimeoutRef = useRef(null);
    const maxTimeoutRef = useRef(null);
    const lastCommitRef = useRef(Date.now());

    const clearIdleTimeout = useCallback(() => {
        if (idleTimeoutRef.current) {
            clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = null;
        }
    }, []);

    const clearMaxTimeout = useCallback(() => {
        if (maxTimeoutRef.current) {
            clearTimeout(maxTimeoutRef.current);
            maxTimeoutRef.current = null;
        }
    }, []);

    const commitPendingContent = useCallback(() => {
        clearIdleTimeout();
        clearMaxTimeout();

        const nextContent = pendingContentRef.current;
        if (nextContent === committedContentRef.current) {
            return;
        }

        committedContentRef.current = nextContent;
        lastCommitRef.current = Date.now();
        setDisplayContent(nextContent);
    }, [clearIdleTimeout, clearMaxTimeout]);

    useEffect(() => {
        const previewableContent = getPreviewableStreamingContent(content);

        if (idleMs <= 0 || maxWaitMs <= 0) {
            clearIdleTimeout();
            clearMaxTimeout();
            committedContentRef.current = previewableContent;
            setDisplayContent(previewableContent);
            lastCommitRef.current = Date.now();
            return;
        }

        pendingContentRef.current = previewableContent;
        if (previewableContent === committedContentRef.current) {
            clearIdleTimeout();
            clearMaxTimeout();
            return;
        }

        clearIdleTimeout();
        idleTimeoutRef.current = setTimeout(commitPendingContent, idleMs);

        if (!maxTimeoutRef.current) {
            const elapsedSinceCommit = Date.now() - lastCommitRef.current;
            const maxWaitRemaining = Math.max(
                maxWaitMs - elapsedSinceCommit,
                0,
            );
            if (maxWaitRemaining === 0) {
                commitPendingContent();
            } else {
                maxTimeoutRef.current = setTimeout(
                    commitPendingContent,
                    maxWaitRemaining,
                );
            }
        }

        return () => {
            clearIdleTimeout();
        };
    }, [
        content,
        idleMs,
        maxWaitMs,
        clearIdleTimeout,
        clearMaxTimeout,
        commitPendingContent,
    ]);

    useEffect(
        () => () => {
            clearIdleTimeout();
            clearMaxTimeout();
        },
        [clearIdleTimeout, clearMaxTimeout],
    );

    return displayContent;
}

/**
 * ThrottledPreview - Renders one stable iframe with buffered updates during streaming.
 * After the first document load, streamed HTML patches the body in place so the
 * preview does not flash blank or reset its scrollbars on every chunk.
 * Preview refreshes are committed after a short idle period or a max wait,
 * which avoids pulsing the canvas on every streamed chunk.
 */
function ThrottledPreview({
    content,
    title,
    theme = "light",
    baseHref = null,
}) {
    const { language, direction } = useContext(LanguageContext) || {};
    const locale = useMemo(() => {
        const normalized = normalizeAppletLocale(language);
        if (direction === "rtl" || direction === "ltr") {
            return { ...normalized, direction };
        }
        return normalized;
    }, [language, direction]);
    const searchParams = useSearchParams();
    const search = searchParams.toString();
    const appletParams = useMemo(
        () => parseAppletParams(search ? `?${search}` : ""),
        [search],
    );
    const displayContent = useCommittedPreviewContent(content, {
        idleMs: STREAMING_PREVIEW_IDLE_MS,
        maxWaitMs: STREAMING_PREVIEW_MAX_WAIT_MS,
    });
    const iframeRef = useRef(null);
    const committedContentRef = useRef("");
    const committedHeadContentRef = useRef("");
    const committedPreviewKeyRef = useRef("");
    const hasLoadedFrameRef = useRef(false);
    const previewKey = useMemo(
        () =>
            JSON.stringify({
                theme,
                language: locale.language,
                direction: locale.direction,
                params: appletParams,
            }),
        [theme, locale.language, locale.direction, appletParams],
    );

    const wrapPreviewHtml = useCallback(
        (html) =>
            html
                ? generateFilteredSandboxHtml(html, theme, {
                      language: locale.language,
                      direction: locale.direction,
                      params: appletParams,
                      baseHref,
                  })
                : "",
        [theme, locale.language, locale.direction, appletParams, baseHref],
    );

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const nextContent = displayContent || "";
        const frameWindow = iframe.contentWindow;
        const frameDoc = iframe.contentDocument || frameWindow?.document;
        if (!nextContent) {
            if (hasLoadedFrameRef.current && frameDoc?.body) {
                frameDoc.body.innerHTML = "";
                committedContentRef.current = "";
            }
            return;
        }

        const previewChanged = previewKey !== committedPreviewKeyRef.current;
        if (nextContent === committedContentRef.current && !previewChanged) {
            return;
        }

        const { headContent, bodyContent } = extractHtmlStructure(nextContent);
        const shouldPatchBody =
            hasLoadedFrameRef.current &&
            !previewChanged &&
            headContent === committedHeadContentRef.current;
        const scrollTop =
            frameWindow?.scrollY ??
            frameDoc?.documentElement?.scrollTop ??
            frameDoc?.body?.scrollTop ??
            0;

        if (shouldPatchBody && frameDoc?.body) {
            frameDoc.body.innerHTML = filterDarkClasses(bodyContent, theme);
            committedContentRef.current = nextContent;

            requestAnimationFrame(() => {
                try {
                    frameWindow?.scrollTo(0, scrollTop);
                } catch {
                    // Ignore inaccessible frame scroll state.
                }
            });
            return;
        }

        const wrappedHtml = wrapPreviewHtml(nextContent);
        const markLoaded = () => {
            hasLoadedFrameRef.current = true;
            committedContentRef.current = nextContent;
            committedHeadContentRef.current = headContent;
            committedPreviewKeyRef.current = previewKey;
        };

        iframe.onload = markLoaded;
        if (frameDoc) {
            frameDoc.open();
            frameDoc.write(wrappedHtml);
            frameDoc.close();
            markLoaded();
        } else {
            iframe.srcdoc = wrappedHtml;
        }
    }, [displayContent, previewKey, theme, wrapPreviewHtml]);

    return (
        <div className="relative w-full h-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-950">
            <iframe
                ref={iframeRef}
                title={title}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                className="absolute inset-0 w-full h-full border-0 bg-white"
                scrolling="auto"
            />
        </div>
    );
}

function GeneratingAppletOverlay() {
    const { t } = useTranslation();
    return (
        <div
            className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/60 backdrop-blur-[1px] dark:bg-gray-900/60"
            data-testid="generating-applet-overlay"
        >
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600 dark:text-sky-400" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {t("Generating applet...")}
                </span>
            </div>
        </div>
    );
}

const PreviewFrame = React.forwardRef(function PreviewFrame(
    {
        content,
        title,
        isGenerating,
        frameKey,
        theme,
        workspacePath = null,
        fullscreen = false,
        frameless = false,
    },
    ref,
) {
    const baseHref = getWorkspaceBaseHref(workspacePath);
    const documentUrl = getWorkspaceDocumentUrl(workspacePath);

    if (isGenerating) {
        return (
            <ThrottledPreview
                content={content}
                title={title}
                theme={theme}
                baseHref={baseHref}
            />
        );
    }

    // Route through the same sandbox the published /applet page uses so the
    // canvas preview matches the deployed render exactly (theme, dark: class
    // filtering, Tailwind script, SDK injection — all shared via OutputSandbox).
    return (
        <div
            className={
                frameless
                    ? "w-full h-full overflow-auto bg-white dark:bg-gray-800"
                    : "w-full h-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-auto bg-white dark:bg-gray-800"
            }
            data-applet-preview={fullscreen ? "fullscreen" : "inline"}
        >
            <OutputSandbox
                ref={ref}
                key={fullscreen ? undefined : frameKey}
                content={content}
                theme={theme}
                height="100%"
                autoResize={false}
                baseHref={baseHref}
                documentUrl={documentUrl}
            />
        </div>
    );
});

/**
 * HtmlPreviewTabContent - Read-only HTML preview for non-article HTML files.
 * Fetches HTML from url and displays it in a sandboxed iframe.
 *
 * @param {string} tabId - Unique tab identifier
 * @param {object} initialContent - { url, title, filename }
 * @param {boolean} isActive - Whether this tab is currently active
 */
export default function HtmlPreviewTabContent({
    tabId,
    initialContent,
    isActive,
    onContentChange,
    onCloseCanvas,
}) {
    const { t } = useTranslation();
    const url = initialContent?.url;
    const inlineHtml = initialContent?.htmlContent;
    const htmlStatus = initialContent?.htmlStatus; // 'copying' | 'syncing' | 'generating' | 'error' | 'live' | null
    const htmlError = initialContent?.htmlError;
    const title =
        initialContent?.title || initialContent?.filename || t("HTML Preview");

    const isGenerating = htmlStatus === "generating";
    const shouldLoadDraftFromUrl = !!(
        initialContent?.appletId &&
        url &&
        !inlineHtml
    );
    const fetchOptions = useMemo(
        () => (initialContent?.appletId ? { cache: "no-store" } : undefined),
        [initialContent?.appletId],
    );

    // After a page refresh, the blob URL is stripped from persisted canvas state
    // (see stripCanvasPersistContent in chatSlice.js). When we see an appletId
    // but no url or inlineHtml, re-validate access via the API before loading.
    const [isRevalidating, setIsRevalidating] = useState(
        !!(
            initialContent?.appletId &&
            !initialContent?.url &&
            !initialContent?.htmlContent &&
            initialContent?.htmlStatus !== "error"
        ),
    );

    const { theme } = useContext(ThemeContext);
    const { direction: layoutDirection = "ltr" } =
        useContext(LanguageContext) || {};
    const monacoTheme = theme === "dark" ? "vs-dark" : "vs";

    const {
        loading,
        error,
        content: rawHtmlContent,
        contentKey,
        retry: loadHtml,
    } = useContentLoader({
        url,
        inlineContent: shouldLoadDraftFromUrl ? undefined : inlineHtml,
        isActive,
        emptyError: isRevalidating
            ? null
            : t("No URL provided") || "No URL provided",
        fetchOptions,
        reloadKey: shouldLoadDraftFromUrl ? inlineHtml : undefined,
    });
    const loadError = isGenerating || isRevalidating ? null : error;

    useEffect(() => {
        const appletId = initialContent?.appletId;
        if (
            !appletId ||
            initialContent?.url ||
            initialContent?.htmlContent ||
            initialContent?.htmlStatus === "error"
        ) {
            return;
        }
        fetch(`/api/canvas-applets/${appletId}`)
            .then(async (res) => {
                if (!res.ok) {
                    onContentChange?.(tabId, {
                        htmlStatus: "error",
                        htmlError:
                            t("This applet is no longer shared with you.") ||
                            "This applet is no longer shared with you.",
                    });
                    return;
                }
                const applet = await res.json();
                if (applet.filePath) {
                    onContentChange?.(tabId, { url: applet.filePath });
                } else {
                    onContentChange?.(tabId, {
                        htmlStatus: "error",
                        htmlError:
                            t("This applet could not be loaded.") ||
                            "This applet could not be loaded.",
                    });
                }
            })
            .catch(() => {
                onContentChange?.(tabId, {
                    htmlStatus: "error",
                    htmlError:
                        t("Failed to load applet.") || "Failed to load applet.",
                });
            })
            .finally(() => setIsRevalidating(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount — re-validation is a one-shot check

    // Stamp the applet-id meta tag so the iframe knows its identity. The SDK
    // script and full sandbox wrapper come from OutputSandbox (same path the
    // published /applet route uses), so we don't inject the SDK ourselves.
    const htmlContent = useMemo(
        () =>
            injectAppletIdMeta(
                rawHtmlContent,
                initialContent?.appletId || null,
            ),
        [rawHtmlContent, initialContent?.appletId],
    );

    // Track user edits to the code tab — null means "not edited yet"
    const [editedHtml, setEditedHtml] = useState(null);

    // Ref to the inline (non-fullscreen) sandbox so the driver client-side
    // tools can reach into the applet iframe. The fullscreen preview is a
    // separate iframe and is intentionally not registered.
    const sandboxRef = useRef(null);

    // Pin to a specific htmlVersions[i] when set; null = follow the freshest
    // content that came down through `htmlContent`.
    const [selectedVersionIndex, setSelectedVersionIndexState] = useState(null);
    const selectedVersionIndexRef = useRef(null);
    const localViewChangeRef = useRef(false);
    const setSelectedVersionIndex = useCallback((nextIndexOrUpdater) => {
        const nextIndex =
            typeof nextIndexOrUpdater === "function"
                ? nextIndexOrUpdater(selectedVersionIndexRef.current)
                : nextIndexOrUpdater;
        if (selectedVersionIndexRef.current === nextIndex) return;
        selectedVersionIndexRef.current = nextIndex;
        setSelectedVersionIndexState(nextIndex);
    }, []);
    const setSelectedVersionIndexIfChanged = setSelectedVersionIndex;

    // Reset edits when new content loads (e.g., different applet or regeneration)
    useEffect(() => {
        setEditedHtml(null);
    }, [htmlContent]);

    const handleCodeChange = useCallback((value) => {
        setEditedHtml(value ?? "");
    }, []);

    // --- Canvas applet record (v2) ---
    // Resolve applet ID from initialContent prop or from <meta name="applet-id"> in the HTML
    const resolvedAppletId = useMemo(() => {
        if (initialContent?.appletId) return initialContent.appletId;
        if (rawHtmlContent) {
            const match = rawHtmlContent.match(
                /<meta\s+name=["']applet-id["']\s+content=["']([^"']+)["']/i,
            );
            return match ? match[1] : null;
        }
        return null;
    }, [initialContent?.appletId, rawHtmlContent]);

    // Register the inline sandbox iframe with the active-applet registry so
    // the chat driver tools (ClickAppletElement, FillAppletField, etc.) can
    // reach its DOM. Re-runs when the active tab or applet identity changes;
    // contentKey forces a re-register when the iframe is recreated for a
    // fresh load. Cleanup clears the entry so a closed/swapped applet does
    // not leave a stale reference behind.
    useEffect(() => {
        if (!isActive || !resolvedAppletId) return undefined;
        const iframe = sandboxRef.current?.iframe;
        if (!iframe) return undefined;
        setActiveAppletSandbox(resolvedAppletId, iframe);
        return () => clearActiveAppletSandbox(resolvedAppletId);
    }, [isActive, resolvedAppletId, contentKey]);

    const [appletRecord, setAppletRecord] = useState(null);
    const [appletRecordStatus, setAppletRecordStatus] = useState("idle");
    const [isPublishing, setIsPublishing] = useState(false);
    const [showPublishDialog, setShowPublishDialog] = useState(false);
    const [showManageDialog, setShowManageDialog] = useState(false);
    const [showMetadataDialog, setShowMetadataDialog] = useState(false);
    const [showFullscreenPreview, setShowFullscreenPreview] = useState(false);
    const [pendingDeleteTarget, setPendingDeleteTarget] = useState(null);
    const [isDeletingVersion, setIsDeletingVersion] = useState(false);
    const [isRestoringVersion, setIsRestoringVersion] = useState(false);
    const [pendingSavedDraftHtml, setPendingSavedDraftHtml] = useState(null);

    const refetchAppletRecord = useCallback(async () => {
        if (!resolvedAppletId) return;
        try {
            const params = new URLSearchParams({ t: String(Date.now()) });
            const res = await fetch(
                `/api/canvas-applets/${resolvedAppletId}?${params}`,
                { cache: "no-store" },
            );
            if (res.ok) {
                const nextAppletRecord = await res.json();
                setAppletRecord(nextAppletRecord);
                return nextAppletRecord;
            }
        } catch {
            // ignore fetch errors
        }
        return null;
    }, [resolvedAppletId]);

    useEffect(() => {
        if (!resolvedAppletId) {
            setAppletRecord(null);
            setAppletRecordStatus("idle");
            return;
        }
        let cancelled = false;
        const fetchRecord = async () => {
            setAppletRecordStatus("loading");
            try {
                const res = await fetch(
                    `/api/canvas-applets/${resolvedAppletId}`,
                );
                if (res.ok && !cancelled) {
                    setAppletRecord(await res.json());
                }
            } catch {
                // ignore fetch errors
            } finally {
                if (!cancelled) {
                    setAppletRecordStatus("settled");
                }
            }
        };
        fetchRecord();
        return () => {
            cancelled = true;
        };
    }, [resolvedAppletId]);

    // When Draft HTML changes or an applet management tool saves/publishes, the
    // applet record on the server may have new version state. Re-fetch so the
    // version dropdown / publish state stays current without a browser refresh.
    const initialAppletFetchRef = useRef(true);
    useEffect(() => {
        if (initialAppletFetchRef.current) {
            initialAppletFetchRef.current = false;
            return;
        }
        if (!resolvedAppletId) return;
        refetchAppletRecord();
    }, [rawHtmlContent, resolvedAppletId, refetchAppletRecord]);

    useEffect(() => {
        if (!resolvedAppletId || !initialContent?.appletVersionKey) return;
        refetchAppletRecord();
    }, [
        initialContent?.appletVersionKey,
        resolvedAppletId,
        refetchAppletRecord,
    ]);

    useEffect(() => {
        if (!resolvedAppletId || !isActive) return undefined;

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                refetchAppletRecord();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, [isActive, resolvedAppletId, refetchAppletRecord]);

    useEffect(() => {
        if (!showFullscreenPreview) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setShowFullscreenPreview(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [showFullscreenPreview]);

    useEffect(() => {
        if (!isActive) {
            setShowFullscreenPreview(false);
            setShowMetadataDialog(false);
        }
    }, [isActive]);

    const isPublished = appletRecord?.publishedVersionIndex != null;

    const savedVersionCount = appletRecord?.htmlVersions?.length || 0;
    const pendingVersionCount =
        typeof initialContent?.appletVersionCount === "number"
            ? initialContent.appletVersionCount
            : 0;
    const versionCount = Math.max(savedVersionCount, pendingVersionCount);
    const externalSelectedVersionIndex = useMemo(
        () =>
            getInitialSelectedVersionIndex({
                activeVersionIndex: initialContent?.appletActiveVersionIndex,
                activeVersionNumber: initialContent?.appletActiveVersionNumber,
                isViewingDraft: initialContent?.appletIsViewingDraft,
                versionCount,
            }),
        [
            initialContent?.appletActiveVersionIndex,
            initialContent?.appletActiveVersionNumber,
            initialContent?.appletIsViewingDraft,
            versionCount,
        ],
    );

    // Reset version pin when the applet itself changes — a stale pin into a
    // different version array would silently render the wrong content.
    useClientLayoutEffect(() => {
        localViewChangeRef.current = false;
        setSelectedVersionIndexIfChanged(null);
        setPendingSavedDraftHtml(null);
        setShowMetadataDialog(false);
    }, [resolvedAppletId, setSelectedVersionIndexIfChanged]);

    const prevVersionCountRef = useRef(versionCount);
    const keepSavedVersionPinOnNextGrowRef = useRef(false);

    // Applet management tools can copy a saved version into Draft while the
    // user is still viewing that saved version. When Canvas receives a fresh
    // Draft body, follow Draft immediately instead of staying pinned.
    useClientLayoutEffect(() => {
        if (initialContent?.appletIsViewingDraft === true) {
            localViewChangeRef.current = false;
            if (keepSavedVersionPinOnNextGrowRef.current) return;
            setSelectedVersionIndexIfChanged(null);
        }
    }, [
        initialContent?.appletIsViewingDraft,
        initialContent?.htmlContent,
        setSelectedVersionIndexIfChanged,
    ]);

    useClientLayoutEffect(() => {
        if (initialContent?.appletIsViewingDraft !== false) return;
        localViewChangeRef.current = false;
        if (externalSelectedVersionIndex != null) {
            setSelectedVersionIndexIfChanged(externalSelectedVersionIndex);
        }
    }, [
        initialContent?.appletIsViewingDraft,
        externalSelectedVersionIndex,
        setSelectedVersionIndexIfChanged,
    ]);

    // If the applet record grows (new version saved), unpin so the canvas
    // snaps to the freshest content like it always has.
    useClientLayoutEffect(() => {
        if (versionCount > prevVersionCountRef.current) {
            if (initialContent?.appletIsViewingDraft === false) {
                // The canvas was opened on an explicit saved-version view.
            } else if (keepSavedVersionPinOnNextGrowRef.current) {
                keepSavedVersionPinOnNextGrowRef.current = false;
            } else {
                setSelectedVersionIndexIfChanged(null);
            }
        }
        prevVersionCountRef.current = versionCount;
    }, [
        initialContent?.appletIsViewingDraft,
        setSelectedVersionIndexIfChanged,
        versionCount,
    ]);

    const selectedVersionContent = useMemo(() => {
        if (selectedVersionIndex == null) return null;
        return (
            appletRecord?.htmlVersions?.[selectedVersionIndex]?.content || null
        );
    }, [appletRecord, selectedVersionIndex]);
    const latestSavedVersionContent = useMemo(() => {
        if (!savedVersionCount) return null;
        return (
            appletRecord?.htmlVersions?.[savedVersionCount - 1]?.content || null
        );
    }, [appletRecord, savedVersionCount]);
    const pendingSavedVersionIndex =
        pendingSavedDraftHtml && versionCount > 0 ? versionCount - 1 : null;
    const isPendingSavedVersionSelected =
        selectedVersionIndex != null &&
        pendingSavedVersionIndex === selectedVersionIndex &&
        pendingSavedDraftHtml != null;
    const displaySelectedVersionContent = isPendingSavedVersionSelected
        ? selectedVersionContent || pendingSavedDraftHtml
        : selectedVersionContent;

    useEffect(() => {
        if (!pendingSavedDraftHtml) return;
        if (
            savedVersionCount >= versionCount &&
            latestSavedVersionContent === pendingSavedDraftHtml
        ) {
            setPendingSavedDraftHtml(null);
        }
    }, [
        latestSavedVersionContent,
        pendingSavedDraftHtml,
        savedVersionCount,
        versionCount,
    ]);

    useEffect(() => {
        if (
            !initialContent?.appletVersionKey ||
            !htmlContent ||
            pendingVersionCount <= savedVersionCount
        ) {
            return;
        }
        setPendingSavedDraftHtml(htmlContent);
    }, [
        htmlContent,
        initialContent?.appletVersionKey,
        pendingVersionCount,
        savedVersionCount,
    ]);

    // A selected saved version wins while browsing history. Draft edits stay
    // buffered so the user can return to Draft from the latest saved version.
    const baseDisplayHtml = displaySelectedVersionContent ?? htmlContent;
    const draftDisplayHtml = editedHtml ?? htmlContent;
    const displayHtml =
        selectedVersionIndex != null
            ? displaySelectedVersionContent
            : draftDisplayHtml;
    const previewWorkspacePath =
        appletRecord?.workspacePath || initialContent?.workspacePath || null;
    const hasEditedDraft = !!draftDisplayHtml && editedHtml != null;
    const hasGeneratedDraft =
        savedVersionCount === versionCount &&
        !!htmlContent &&
        (!latestSavedVersionContent ||
            htmlContent !== latestSavedVersionContent);
    const hasLiveDraft = hasEditedDraft || hasGeneratedDraft;
    const isShowingLiveContent =
        hasEditedDraft || (selectedVersionIndex == null && hasGeneratedDraft);

    const activeVersionIndex =
        selectedVersionIndex != null
            ? selectedVersionIndex
            : hasEditedDraft
              ? null
              : isShowingLiveContent
                ? null
                : versionCount > 0
                  ? versionCount - 1
                  : null;
    const publishedVersionIndex = appletRecord?.publishedVersionIndex ?? null;
    const isViewingPublishedVersion =
        publishedVersionIndex != null &&
        activeVersionIndex === publishedVersionIndex;
    const hasUnpublishedChanges = isPublished && !isViewingPublishedVersion;
    const isViewingDraft = selectedVersionIndex == null;

    const handlePublish = useCallback(
        async (publishData) => {
            if (!resolvedAppletId || !displayHtml) return;
            setIsPublishing(true);
            try {
                const body = {
                    name: publishData.appletName,
                    publishToAppStore: publishData.publishToAppStore === true,
                };
                if (!publishData.publishToAppStore) {
                    if (publishData.publishViaLink === true) {
                        body.publishViaLink = true;
                    } else if (Array.isArray(publishData.publishRecipients)) {
                        body.publishRecipients = publishData.publishRecipients;
                    }
                }
                if (activeVersionIndex != null) {
                    body.publishVersion = activeVersionIndex + 1;
                } else {
                    body.publish = true;
                    body.html = displayHtml;
                }
                if (publishData.publishToAppStore) {
                    body.appName = publishData.appName;
                    body.appSlug = publishData.appSlug;
                    body.appDescription = publishData.appDescription;
                    body.appIcon = publishData.appIcon;
                }
                const res = await fetch(
                    `/api/canvas-applets/${resolvedAppletId}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    },
                );
                if (res.ok) {
                    await refetchAppletRecord();
                    setShowPublishDialog(false);
                } else {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to publish");
                }
            } catch (err) {
                console.error("Error publishing applet:", err);
                throw err;
            } finally {
                setIsPublishing(false);
            }
        },
        [
            resolvedAppletId,
            displayHtml,
            activeVersionIndex,
            refetchAppletRecord,
        ],
    );

    const handleEditVersion = useCallback(async () => {
        if (!resolvedAppletId || activeVersionIndex == null) return;
        const draftHtml = baseDisplayHtml ?? "";
        setIsRestoringVersion(true);
        try {
            const res = await fetch(`/api/canvas-applets/${resolvedAppletId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    restoreVersion: activeVersionIndex + 1,
                }),
            });
            if (!res.ok) {
                let message = "Failed to copy applet version to Draft";
                try {
                    const data = await res.json();
                    message = data.error || message;
                } catch {
                    // Keep fallback.
                }
                throw new Error(message);
            }
            const nextAppletRecord = await res.json();
            setAppletRecord(nextAppletRecord);
            setEditedHtml(draftHtml);
            setSelectedVersionIndex(null);
            onContentChange?.(tabId, {
                htmlContent: draftHtml,
                workspacePath:
                    nextAppletRecord?.workspacePath ||
                    initialContent?.workspacePath,
                appletActiveVersionIndex: null,
                appletActiveVersionNumber: null,
                appletIsViewingDraft: true,
            });
        } catch (err) {
            console.error("Error copying applet version to Draft:", err);
        } finally {
            setIsRestoringVersion(false);
        }
    }, [
        activeVersionIndex,
        baseDisplayHtml,
        initialContent?.workspacePath,
        onContentChange,
        resolvedAppletId,
        setSelectedVersionIndex,
        tabId,
    ]);

    const handleUnpublish = useCallback(async () => {
        if (!resolvedAppletId) return;
        setIsPublishing(true);
        try {
            const res = await fetch(`/api/canvas-applets/${resolvedAppletId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ unpublish: true }),
            });
            if (res.ok) {
                await refetchAppletRecord();
                setShowManageDialog(false);
            }
        } catch (err) {
            console.error("Error unpublishing applet:", err);
        } finally {
            setIsPublishing(false);
        }
    }, [resolvedAppletId, refetchAppletRecord]);

    const handleMetadataSaved = useCallback(
        async (updatedApplet) => {
            if (updatedApplet?._id) {
                setAppletRecord(updatedApplet);
                const nextTitle =
                    updatedApplet.app?.name || updatedApplet.name || null;
                if (nextTitle) {
                    onContentChange?.(tabId, { title: nextTitle });
                }
            } else {
                await refetchAppletRecord();
            }
        },
        [onContentChange, refetchAppletRecord, tabId],
    );

    const handleSaveDraftVersion = useCallback(async () => {
        if (!resolvedAppletId || !displayHtml) return;
        setIsPublishing(true);
        try {
            const res = await fetch(`/api/canvas-applets/${resolvedAppletId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    html: displayHtml,
                    saveVersion: true,
                }),
            });
            if (!res.ok) {
                let message = "Failed to save applet version";
                try {
                    const data = await res.json();
                    message = data.error || message;
                } catch {
                    // Keep fallback.
                }
                throw new Error(message);
            }
            keepSavedVersionPinOnNextGrowRef.current = true;
            setPendingSavedDraftHtml(displayHtml);
            const nextAppletRecord = await refetchAppletRecord();
            const nextSavedVersionCount =
                nextAppletRecord?.htmlVersions?.length || 0;
            if (
                nextSavedVersionCount > 0 &&
                getLatestSavedVersionHtml(nextAppletRecord) === displayHtml
            ) {
                setSelectedVersionIndex(nextSavedVersionCount - 1);
            } else {
                keepSavedVersionPinOnNextGrowRef.current = false;
                setSelectedVersionIndex(null);
            }
            setEditedHtml(null);
        } catch (err) {
            console.error("Error saving applet version:", err);
        } finally {
            setIsPublishing(false);
        }
    }, [
        displayHtml,
        refetchAppletRecord,
        resolvedAppletId,
        setSelectedVersionIndex,
    ]);

    const handleRequestDeleteCurrentVersion = useCallback(() => {
        if (!resolvedAppletId) return;
        if (isViewingDraft) {
            setPendingDeleteTarget({ type: "draft" });
            return;
        }
        if (activeVersionIndex != null) {
            setPendingDeleteTarget({
                type: "version",
                version: activeVersionIndex + 1,
            });
        }
    }, [activeVersionIndex, isViewingDraft, resolvedAppletId]);

    const handleConfirmDeleteCurrentVersion = useCallback(async () => {
        if (!resolvedAppletId || !pendingDeleteTarget) return;
        setIsDeletingVersion(true);
        try {
            const body =
                pendingDeleteTarget.type === "version"
                    ? { deleteVersion: pendingDeleteTarget.version }
                    : { clearDraft: true };
            const res = await fetch(`/api/canvas-applets/${resolvedAppletId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                let message =
                    pendingDeleteTarget.type === "version"
                        ? "Failed to delete applet version"
                        : "Failed to clear applet Draft";
                try {
                    const data = await res.json();
                    message = data.error || message;
                } catch {
                    // Keep fallback.
                }
                throw new Error(message);
            }
            const nextAppletRecord = await res.json();
            setAppletRecord(nextAppletRecord);
            const nextSavedVersionCount =
                nextAppletRecord?.htmlVersions?.length || 0;
            setEditedHtml(null);
            const nextActiveVersionIndex =
                nextSavedVersionCount > 0 ? nextSavedVersionCount - 1 : null;
            if (pendingDeleteTarget.type === "draft") {
                onContentChange?.(tabId, {
                    htmlContent:
                        getLatestSavedVersionHtml(nextAppletRecord) ?? "",
                    workspacePath:
                        nextAppletRecord?.workspacePath ||
                        initialContent?.workspacePath,
                    appletActiveVersionIndex: nextActiveVersionIndex,
                    appletActiveVersionNumber:
                        nextActiveVersionIndex == null
                            ? null
                            : nextActiveVersionIndex + 1,
                    appletIsViewingDraft: nextActiveVersionIndex == null,
                });
            }
            if (nextSavedVersionCount > 0) {
                const nextVersionIndex =
                    pendingDeleteTarget.type === "version"
                        ? Math.min(
                              pendingDeleteTarget.version - 1,
                              nextSavedVersionCount - 1,
                          )
                        : nextSavedVersionCount - 1;
                setSelectedVersionIndex(nextVersionIndex);
                if (pendingDeleteTarget.type === "version") {
                    onContentChange?.(tabId, {
                        appletActiveVersionIndex: nextVersionIndex,
                        appletActiveVersionNumber: nextVersionIndex + 1,
                        appletIsViewingDraft: false,
                    });
                }
            } else {
                setSelectedVersionIndex(null);
                if (pendingDeleteTarget.type === "version") {
                    onContentChange?.(tabId, {
                        appletActiveVersionIndex: null,
                        appletActiveVersionNumber: null,
                        appletIsViewingDraft: true,
                    });
                }
            }
            setPendingDeleteTarget(null);
        } catch (err) {
            console.error("Error deleting applet version:", err);
        } finally {
            setIsDeletingVersion(false);
        }
    }, [
        initialContent?.workspacePath,
        onContentChange,
        pendingDeleteTarget,
        resolvedAppletId,
        setSelectedVersionIndex,
        tabId,
    ]);

    const canFullScreen = !isGenerating && !!displayHtml;
    const isChromeHidden =
        initialContent?.canvasChrome === "hidden" && !resolvedAppletId;
    const isAppletRecordPending =
        !!resolvedAppletId && !appletRecord && appletRecordStatus !== "settled";
    const canShowHeaderControls =
        !loading && !isGenerating && !!displayHtml && !isAppletRecordPending;
    const canEditAppletMetadata =
        !!appletRecord &&
        (appletRecord.isOwner === true || appletRecord.shareRole === "editor");
    const canPublish =
        !!resolvedAppletId &&
        !isGenerating &&
        !!displayHtml &&
        canEditAppletMetadata;
    const navigateToSavedVersion = useCallback(
        (versionIndex) => {
            localViewChangeRef.current = true;
            setSelectedVersionIndex(versionIndex);
        },
        [setSelectedVersionIndex],
    );
    const navigateToDraft = useCallback(() => {
        localViewChangeRef.current = true;
        setSelectedVersionIndex(null);
    }, [setSelectedVersionIndex]);

    const versionBrowser = useMemo(() => {
        if (!resolvedAppletId) return null;
        return {
            total: versionCount,
            activeIndex: activeVersionIndex,
            isLive: activeVersionIndex == null,
            publishedIndex: publishedVersionIndex,
            onPrev:
                activeVersionIndex == null
                    ? savedVersionCount > 0
                        ? () =>
                              navigateToSavedVersion(
                                  selectedVersionIndex ??
                                      Math.max(0, savedVersionCount - 1),
                              )
                        : null
                    : activeVersionIndex > 0
                      ? () => navigateToSavedVersion(activeVersionIndex - 1)
                      : null,
            onNext:
                activeVersionIndex != null &&
                hasLiveDraft &&
                activeVersionIndex === savedVersionCount - 1
                    ? navigateToDraft
                    : activeVersionIndex != null &&
                        activeVersionIndex < versionCount - 1
                      ? () => navigateToSavedVersion(activeVersionIndex + 1)
                      : null,
            onJumpToPublished:
                activeVersionIndex != null &&
                publishedVersionIndex != null &&
                publishedVersionIndex !== activeVersionIndex
                    ? () => navigateToSavedVersion(publishedVersionIndex)
                    : null,
        };
    }, [
        resolvedAppletId,
        versionCount,
        activeVersionIndex,
        publishedVersionIndex,
        hasLiveDraft,
        savedVersionCount,
        selectedVersionIndex,
        navigateToSavedVersion,
        navigateToDraft,
    ]);
    const shouldSaveDraftBeforePublish = isViewingDraft && hasLiveDraft;
    const canEditVersion =
        !!displayHtml &&
        !isGenerating &&
        !isRestoringVersion &&
        !isViewingDraft &&
        canEditAppletMetadata;
    const canDeleteCurrentVersion =
        !!resolvedAppletId &&
        !!displayHtml &&
        !isGenerating &&
        !isDeletingVersion &&
        (isViewingDraft || activeVersionIndex != null) &&
        canEditAppletMetadata;
    const deleteDialogTitle =
        pendingDeleteTarget?.type === "version"
            ? t("Delete version?") || "Delete version?"
            : t("Clear Draft?") || "Clear Draft?";
    const deleteDialogDescription =
        pendingDeleteTarget?.type === "version"
            ? t(
                  "Deleting this saved version cannot be undone. Later versions will be renumbered.",
              ) ||
              "Deleting this saved version cannot be undone. Later versions will be renumbered."
            : t(
                  "Clearing Draft discards the current Draft and restores the latest saved version when one exists.",
              ) ||
              "Clearing Draft discards the current Draft and restores the latest saved version when one exists.";
    const deleteDialogActionLabel =
        pendingDeleteTarget?.type === "version"
            ? t("Delete") || "Delete"
            : t("Clear Draft") || "Clear Draft";

    const lastReportedAppletViewRef = useRef(null);
    useEffect(() => {
        if (!isActive || !resolvedAppletId || !onContentChange) return;
        const waitingForIncomingSavedVersion =
            !localViewChangeRef.current &&
            initialContent?.appletIsViewingDraft === false &&
            externalSelectedVersionIndex != null &&
            selectedVersionIndex !== externalSelectedVersionIndex;
        if (waitingForIncomingSavedVersion) return;

        const reportKey = JSON.stringify({
            activeVersionIndex,
            isViewingDraft,
        });
        if (lastReportedAppletViewRef.current === reportKey) return;
        lastReportedAppletViewRef.current = reportKey;
        onContentChange(tabId, {
            appletActiveVersionIndex: isViewingDraft
                ? null
                : activeVersionIndex,
            appletActiveVersionNumber:
                isViewingDraft || activeVersionIndex == null
                    ? null
                    : activeVersionIndex + 1,
            appletIsViewingDraft: isViewingDraft,
        });
    }, [
        activeVersionIndex,
        externalSelectedVersionIndex,
        initialContent?.appletIsViewingDraft,
        isActive,
        isViewingDraft,
        onContentChange,
        resolvedAppletId,
        selectedVersionIndex,
        tabId,
    ]);

    if (
        isRevalidating ||
        (loading && !isGenerating) ||
        loadError ||
        htmlStatus === "error"
    ) {
        return (
            <TabContentLoader
                loading={isRevalidating || (loading && htmlStatus !== "error")}
                error={
                    htmlStatus === "error"
                        ? htmlError ||
                          t("Failed to generate applet. Please try again.")
                        : loadError
                }
                onRetry={htmlStatus === "error" ? undefined : loadHtml}
                loadingLabel={t("Loading...") || "Loading..."}
                retryLabel={t("Retry") || "Retry"}
            />
        );
    }

    if (!displayHtml && !isGenerating) {
        return null;
    }

    if (isChromeHidden) {
        return (
            <div className="group/html-preview relative flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-gray-800">
                <PreviewFrame
                    ref={sandboxRef}
                    content={displayHtml}
                    title={title}
                    isGenerating={isGenerating}
                    frameKey={editedHtml ? undefined : contentKey}
                    theme={theme}
                    workspacePath={previewWorkspacePath}
                    frameless={true}
                />
                {isGenerating && <GeneratingAppletOverlay />}
                <div className="pointer-events-none absolute end-3 top-3 z-20 flex items-center gap-2 opacity-0 transition-opacity group-hover/html-preview:opacity-100 group-focus-within/html-preview:opacity-100">
                    <Button
                        type="button"
                        onClick={() => setShowFullscreenPreview(true)}
                        variant="ghost"
                        size="icon"
                        className="pointer-events-auto h-9 w-9 rounded-full bg-black/70 text-white hover:bg-black/85 hover:text-white dark:bg-black/70 dark:text-white dark:hover:bg-black/85"
                        title={t("Full Screen") || "Full Screen"}
                        aria-label={t("Full Screen") || "Full Screen"}
                    >
                        <Expand className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        onClick={onCloseCanvas}
                        variant="ghost"
                        size="icon"
                        className="pointer-events-auto h-9 w-9 rounded-full bg-black/70 text-white hover:bg-black/85 hover:text-white dark:bg-black/70 dark:text-white dark:hover:bg-black/85"
                        title={t("Close canvas") || "Close canvas"}
                        aria-label={t("Close canvas") || "Close canvas"}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {showFullscreenPreview && (
                    <div
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-3 sm:p-6"
                        onClick={() => setShowFullscreenPreview(false)}
                        role="dialog"
                        aria-modal="true"
                        aria-label={
                            t("Full screen applet preview") ||
                            "Full screen applet preview"
                        }
                    >
                        <div
                            className="relative h-full w-full overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => setShowFullscreenPreview(false)}
                                className="absolute end-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/85"
                                aria-label={
                                    t("Close full screen preview") ||
                                    "Close full screen preview"
                                }
                            >
                                <X className="h-5 w-5" />
                            </button>
                            <div className="h-full w-full bg-gray-100 p-0 dark:bg-gray-950">
                                <PreviewFrame
                                    content={displayHtml}
                                    title={`${title} fullscreen`}
                                    isGenerating={isGenerating}
                                    theme={theme}
                                    workspacePath={previewWorkspacePath}
                                    fullscreen={true}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <Tabs
                defaultValue="preview"
                className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
                <div
                    dir={layoutDirection}
                    className="flex-shrink-0 mb-4 border-b border-gray-200 dark:border-gray-700 flex w-full min-w-0 flex-wrap sm:flex-nowrap items-center justify-between gap-2"
                >
                    <TabsList className="bg-transparent h-auto p-0 gap-0 w-fit min-w-0 flex-shrink-0">
                        <TabsTrigger
                            value="preview"
                            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-sky-600 dark:data-[state=active]:border-sky-400 rounded-none px-2 sm:px-4 py-2 border-b-2 border-transparent"
                        >
                            {t("Preview") || "Preview"}
                        </TabsTrigger>
                        <TabsTrigger
                            value="code"
                            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-sky-600 dark:data-[state=active]:border-sky-400 rounded-none px-2 sm:px-4 py-2 border-b-2 border-transparent"
                        >
                            {t("Code") || "Code"}
                        </TabsTrigger>
                    </TabsList>
                    <div className="ms-auto flex min-w-0 select-none items-center justify-end gap-1 overflow-x-auto pe-1 sm:gap-2">
                        {canShowHeaderControls && versionBrowser && (
                            <div className="grid flex-shrink-0 select-none grid-cols-[2rem_4.25rem_2rem] items-center gap-1 text-xs sm:grid-cols-[2rem_4.75rem_2rem]">
                                <Button
                                    onClick={versionBrowser.onPrev}
                                    disabled={!versionBrowser.onPrev}
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 justify-self-center"
                                    title={
                                        t("Previous version") ||
                                        "Previous version"
                                    }
                                >
                                    <ChevronLeft className="w-4 h-4 rtl:scale-x-[-1]" />
                                </Button>
                                {versionBrowser.onJumpToPublished ? (
                                    <button
                                        type="button"
                                        onClick={
                                            versionBrowser.onJumpToPublished
                                        }
                                        className="h-8 w-full inline-flex items-center justify-center text-gray-700 dark:text-gray-200 hover:text-sky-600 dark:hover:text-sky-400 whitespace-nowrap tabular-nums"
                                        title={
                                            t("Jump to published version") ||
                                            "Jump to published version"
                                        }
                                    >
                                        {versionBrowser.isLive
                                            ? t("Draft") || "Draft"
                                            : `v${versionBrowser.activeIndex + 1}/${versionBrowser.total}`}
                                    </button>
                                ) : (
                                    <span
                                        className={`h-8 w-full inline-flex items-center justify-center whitespace-nowrap tabular-nums ${
                                            versionBrowser.isLive
                                                ? "text-amber-700 dark:text-amber-300"
                                                : versionBrowser.publishedIndex ===
                                                    versionBrowser.activeIndex
                                                  ? "text-gray-700 dark:text-gray-200 font-medium"
                                                  : "text-gray-700 dark:text-gray-200"
                                        }`}
                                    >
                                        {versionBrowser.isLive
                                            ? t("Draft") || "Draft"
                                            : `v${versionBrowser.activeIndex + 1}/${versionBrowser.total}`}
                                    </span>
                                )}
                                <Button
                                    onClick={versionBrowser.onNext}
                                    disabled={!versionBrowser.onNext}
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 justify-self-center"
                                    title={t("Next version") || "Next version"}
                                >
                                    <ChevronRight className="w-4 h-4 rtl:scale-x-[-1]" />
                                </Button>
                            </div>
                        )}
                        {canShowHeaderControls &&
                            resolvedAppletId &&
                            appletRecord?.isOwner === true && (
                                <ShareButton
                                    entityType="applet"
                                    entityId={resolvedAppletId}
                                    variant="ghost"
                                    size="icon"
                                    showLabel={false}
                                    className="h-8 w-8"
                                    label={t("Share") || "Share"}
                                />
                            )}
                        {canShowHeaderControls && canEditAppletMetadata && (
                            <Button
                                onClick={() => setShowMetadataDialog(true)}
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-700 hover:bg-sky-50 hover:text-sky-700 dark:text-gray-200 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
                                title={t("Edit metadata") || "Edit metadata"}
                                aria-label={
                                    t("Edit metadata") || "Edit metadata"
                                }
                            >
                                <Settings className="w-4 h-4" />
                            </Button>
                        )}
                        {canShowHeaderControls && canFullScreen && (
                            <Button
                                onClick={() => setShowFullscreenPreview(true)}
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title={t("Full Screen") || "Full Screen"}
                                aria-label={t("Full Screen") || "Full Screen"}
                            >
                                <Expand className="w-4 h-4" />
                            </Button>
                        )}
                        {canShowHeaderControls &&
                            resolvedAppletId &&
                            canEditAppletMetadata && (
                                <Button
                                    onClick={handleEditVersion}
                                    disabled={!canEditVersion}
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-700 hover:bg-sky-50 hover:text-sky-700 disabled:text-gray-400 disabled:hover:bg-transparent dark:text-gray-200 dark:hover:bg-sky-950/40 dark:hover:text-sky-300 dark:disabled:text-gray-500"
                                    title={
                                        t("Edit this version") ||
                                        "Edit this version"
                                    }
                                    aria-label={
                                        t("Edit this version") ||
                                        "Edit this version"
                                    }
                                >
                                    {isRestoringVersion ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Pencil className="w-4 h-4" />
                                    )}
                                </Button>
                            )}
                        {canShowHeaderControls &&
                            resolvedAppletId &&
                            canEditAppletMetadata && (
                                <Button
                                    onClick={handleRequestDeleteCurrentVersion}
                                    disabled={!canDeleteCurrentVersion}
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-700 hover:bg-red-50 hover:text-red-700 disabled:text-gray-400 disabled:hover:bg-transparent dark:text-gray-200 dark:hover:bg-red-950/40 dark:hover:text-red-300 dark:disabled:text-gray-500"
                                    title={
                                        isViewingDraft
                                            ? t("Clear Draft") || "Clear Draft"
                                            : t("Delete version") ||
                                              "Delete version"
                                    }
                                    aria-label={
                                        isViewingDraft
                                            ? t("Clear Draft") || "Clear Draft"
                                            : t("Delete version") ||
                                              "Delete version"
                                    }
                                >
                                    {isDeletingVersion ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="w-4 h-4" />
                                    )}
                                </Button>
                            )}
                        {canShowHeaderControls &&
                            canPublish &&
                            (shouldSaveDraftBeforePublish ? (
                                <Button
                                    onClick={handleSaveDraftVersion}
                                    disabled={isPublishing}
                                    variant="default"
                                    size="sm"
                                    className="flex items-center justify-center gap-2 h-8 w-8 px-0 lg:w-auto lg:min-w-[8.25rem] lg:px-3 bg-sky-600 hover:bg-sky-700 text-white dark:bg-sky-500 dark:hover:bg-sky-600"
                                    aria-label={t("Save") || "Save"}
                                >
                                    {isPublishing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <ArrowUpCircle className="w-4 h-4" />
                                    )}
                                    <span className="hidden lg:inline">
                                        {t("Save") || "Save"}
                                    </span>
                                </Button>
                            ) : isPublished && !hasUnpublishedChanges ? (
                                <Button
                                    onClick={() => setShowManageDialog(true)}
                                    variant="ghost"
                                    size="sm"
                                    className="flex items-center justify-center gap-2 h-8 w-8 px-0 lg:w-auto lg:min-w-[8.25rem] lg:px-3 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                    aria-label={t("Published") || "Published"}
                                >
                                    <Globe className="w-4 h-4" />
                                    <span className="hidden lg:inline">
                                        {t("Published") || "Published"}
                                    </span>
                                    <Settings className="hidden lg:block w-3 h-3 opacity-60" />
                                </Button>
                            ) : isPublished ? (
                                <Button
                                    onClick={() => setShowPublishDialog(true)}
                                    disabled={isPublishing}
                                    variant="ghost"
                                    size="sm"
                                    className="flex items-center justify-center gap-2 h-8 w-8 px-0 lg:w-auto lg:min-w-[8.25rem] lg:px-3 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                                    title={
                                        t("Publish this version") ||
                                        "Publish this version"
                                    }
                                    aria-label={t("Republish") || "Republish"}
                                >
                                    {isPublishing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <ArrowUpCircle className="w-4 h-4" />
                                    )}
                                    <span className="hidden lg:inline">
                                        {t("Republish") || "Republish"}
                                    </span>
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => setShowPublishDialog(true)}
                                    disabled={isPublishing}
                                    variant="default"
                                    size="sm"
                                    className="flex items-center justify-center gap-2 h-8 w-8 px-0 lg:w-auto lg:min-w-[8.25rem] lg:px-3 bg-sky-600 hover:bg-sky-700 text-white dark:bg-sky-500 dark:hover:bg-sky-600"
                                    aria-label={t("Publish") || "Publish"}
                                >
                                    {isPublishing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <GlobeLock className="w-4 h-4" />
                                    )}
                                    <span className="hidden lg:inline">
                                        {t("Publish") || "Publish"}
                                    </span>
                                </Button>
                            ))}
                    </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <TabsContent
                        value="preview"
                        className="flex-1 m-0 min-h-0 overflow-auto p-4 bg-white dark:bg-gray-800"
                    >
                        <div className="relative w-full h-full min-h-0">
                            <PreviewFrame
                                ref={sandboxRef}
                                content={displayHtml}
                                title={title}
                                isGenerating={isGenerating}
                                frameKey={editedHtml ? undefined : contentKey}
                                theme={theme}
                                workspacePath={previewWorkspacePath}
                            />
                            {isGenerating && <GeneratingAppletOverlay />}
                        </div>
                    </TabsContent>
                    <TabsContent
                        value="code"
                        className="flex-1 m-0 min-h-0 overflow-hidden"
                    >
                        <div className="h-full min-h-[300px]">
                            <MonacoEditor
                                height="100%"
                                width="100%"
                                language="html"
                                theme={monacoTheme}
                                options={{
                                    fontSize: 12,
                                    readOnly:
                                        isGenerating ||
                                        !isViewingDraft ||
                                        !canEditAppletMetadata,
                                    wordWrap: "on",
                                    minimap: { enabled: false },
                                }}
                                value={displayHtml || ""}
                                onChange={
                                    isViewingDraft && canEditAppletMetadata
                                        ? handleCodeChange
                                        : undefined
                                }
                            />
                        </div>
                    </TabsContent>
                </div>
            </Tabs>

            {showFullscreenPreview && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-3 sm:p-6"
                    onClick={() => setShowFullscreenPreview(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label={
                        t("Full screen applet preview") ||
                        "Full screen applet preview"
                    }
                >
                    <div
                        className="relative w-full h-full bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setShowFullscreenPreview(false)}
                            className="absolute end-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-colors hover:bg-black/85"
                            aria-label={
                                t("Close full screen preview") ||
                                "Close full screen preview"
                            }
                        >
                            <X className="h-5 w-5" />
                        </button>
                        <div className="w-full h-full p-0 sm:p-0 bg-gray-100 dark:bg-gray-950">
                            <PreviewFrame
                                content={displayHtml}
                                title={`${title} fullscreen`}
                                isGenerating={isGenerating}
                                theme={theme}
                                workspacePath={previewWorkspacePath}
                                fullscreen={true}
                            />
                        </div>
                    </div>
                </div>
            )}

            <AlertDialog
                open={!!pendingDeleteTarget}
                onOpenChange={(open) => {
                    if (!open && !isDeletingVersion) {
                        setPendingDeleteTarget(null);
                    }
                }}
            >
                <AlertDialogContent dir={layoutDirection}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteDialogDescription}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingVersion}>
                            {t("Cancel") || "Cancel"}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDeleteCurrentVersion}
                            disabled={isDeletingVersion}
                            className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                        >
                            {isDeletingVersion
                                ? t("Deleting...") || "Deleting..."
                                : deleteDialogActionLabel}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Publish / Update dialog */}
            <CanvasAppletPublishDialog
                isOpen={showPublishDialog}
                onClose={() => setShowPublishDialog(false)}
                onConfirm={handlePublish}
                isPending={isPublishing}
                appletRecord={appletRecord}
                isUpdate={isPublished && hasUnpublishedChanges}
            />

            {/* Manage published applet dialog */}
            <CanvasAppletManageDialog
                isOpen={showManageDialog}
                onClose={() => setShowManageDialog(false)}
                onUnpublish={handleUnpublish}
                appletRecord={appletRecord}
                onAppUpdated={refetchAppletRecord}
                isPending={isPublishing}
            />

            <AppletMetadataDialog
                applet={appletRecord}
                isOpen={showMetadataDialog}
                onClose={() => setShowMetadataDialog(false)}
                onSaved={handleMetadataSaved}
            />
        </div>
    );
}
