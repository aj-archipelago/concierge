"use client";

import React, {
    useContext,
    useState,
    useEffect,
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
    Puzzle,
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
import {
    generateFilteredSandboxHtml,
    normalizeAppletLocale,
    parseAppletParams,
} from "@/src/utils/themeUtils";
import CanvasAppletPublishDialog from "./CanvasAppletPublishDialog";
import CanvasAppletManageDialog from "./CanvasAppletManageDialog";

/**
 * SdkStatusBadge - Shows whether the Concierge Applet SDK script tag is present in the HTML.
 */
function SdkStatusBadge({ htmlContent }) {
    const { t } = useTranslation();
    const hasSDK = useMemo(
        () => htmlContent?.includes("applet-sdk.js") ?? false,
        [htmlContent],
    );

    if (!htmlContent) return null;

    return (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <Puzzle className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
            {hasSDK ? (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {t("Concierge SDK loaded") || "Concierge SDK loaded"}
                </span>
            ) : (
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                    {t("No SDK") || "No SDK"}
                </span>
            )}
        </div>
    );
}

const STREAMING_PREVIEW_IDLE_MS = 2500;
const STREAMING_PREVIEW_MAX_WAIT_MS = 5000;

function getLatestSavedVersionHtml(appletRecord) {
    const versions = Array.isArray(appletRecord?.htmlVersions)
        ? appletRecord.htmlVersions
        : [];
    const latestVersion = versions[versions.length - 1];
    return typeof latestVersion?.content === "string"
        ? latestVersion.content
        : null;
}

function useCommittedPreviewContent(content, { idleMs, maxWaitMs }) {
    const [displayContent, setDisplayContent] = useState(content);
    const committedContentRef = useRef(content);
    const pendingContentRef = useRef(content);
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
        if (idleMs <= 0 || maxWaitMs <= 0) {
            clearIdleTimeout();
            clearMaxTimeout();
            committedContentRef.current = content;
            setDisplayContent(content);
            lastCommitRef.current = Date.now();
            return;
        }

        pendingContentRef.current = content;
        if (content === committedContentRef.current) {
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
 * ThrottledPreview - Renders an iframe with buffered, deferred updates during streaming.
 * New HTML loads into a hidden iframe first, then swaps into view on load so the
 * preview does not flash blank while the browser reparses `srcDoc`.
 * Preview refreshes are committed after a short idle period or a max wait,
 * which avoids pulsing the canvas on every streamed chunk.
 */
function ThrottledPreview({ content, title, theme = "light" }) {
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
    const [frameContents, setFrameContents] = useState([
        displayContent || "",
        "",
    ]);
    const [visibleFrameIndex, setVisibleFrameIndex] = useState(0);
    const [loadingFrameIndex, setLoadingFrameIndex] = useState(null);
    const committedContentRef = useRef(displayContent || "");
    const frameContentsRef = useRef([displayContent || "", ""]);
    const visibleFrameIndexRef = useRef(0);
    const loadingFrameIndexRef = useRef(null);

    useEffect(() => {
        frameContentsRef.current = frameContents;
    }, [frameContents]);

    useEffect(() => {
        visibleFrameIndexRef.current = visibleFrameIndex;
    }, [visibleFrameIndex]);

    useEffect(() => {
        loadingFrameIndexRef.current = loadingFrameIndex;
    }, [loadingFrameIndex]);

    const wrapPreviewHtml = useCallback(
        (html) =>
            html
                ? generateFilteredSandboxHtml(html, theme, {
                      language: locale.language,
                      direction: locale.direction,
                      params: appletParams,
                  })
                : "",
        [theme, locale.language, locale.direction, appletParams],
    );

    useEffect(() => {
        const nextContent = displayContent || "";
        if (nextContent === committedContentRef.current) {
            return;
        }

        const nextFrameIndex = 1 - visibleFrameIndexRef.current;
        if (
            loadingFrameIndexRef.current === nextFrameIndex &&
            frameContentsRef.current[nextFrameIndex] === nextContent
        ) {
            return;
        }

        setLoadingFrameIndex(nextFrameIndex);
        setFrameContents((prev) => {
            const next = [...prev];
            next[nextFrameIndex] = nextContent;
            return next;
        });
    }, [displayContent]);

    const handleFrameLoad = useCallback((frameIndex) => {
        if (loadingFrameIndexRef.current !== frameIndex) {
            return;
        }

        const loadedContent = frameContentsRef.current[frameIndex] || "";
        committedContentRef.current = loadedContent;
        visibleFrameIndexRef.current = frameIndex;
        loadingFrameIndexRef.current = null;

        setVisibleFrameIndex(frameIndex);
        setLoadingFrameIndex(null);
        setFrameContents((prev) => {
            const next = [...prev];
            next[1 - frameIndex] = "";
            return next;
        });
    }, []);

    return (
        <div className="relative w-full h-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-950">
            {[0, 1].map((frameIndex) => {
                const frameContent = frameContents[frameIndex] || "";
                const isVisible = frameIndex === visibleFrameIndex;
                const isLoading = frameIndex === loadingFrameIndex;

                if (!frameContent && !isVisible && !isLoading) {
                    return null;
                }

                return (
                    <iframe
                        key={frameIndex}
                        title={isVisible ? title : `${title} buffered preview`}
                        srcDoc={wrapPreviewHtml(frameContent)}
                        onLoad={() => handleFrameLoad(frameIndex)}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-200 ${
                            isVisible
                                ? "opacity-100"
                                : "opacity-0 pointer-events-none"
                        }`}
                        aria-hidden={isVisible ? undefined : true}
                        scrolling="auto"
                    />
                );
            })}
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
        fullscreen = false,
        frameless = false,
    },
    ref,
) {
    if (isGenerating) {
        return (
            <ThrottledPreview content={content} title={title} theme={theme} />
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
        inlineContent: inlineHtml ?? undefined,
        isActive,
        emptyError: t("No URL provided") || "No URL provided",
    });

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
    const [selectedVersionIndex, setSelectedVersionIndex] = useState(null);

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
        }
    }, [isActive]);

    const isPublished = appletRecord?.publishedVersionIndex != null;

    const savedVersionCount = appletRecord?.htmlVersions?.length || 0;
    const pendingVersionCount =
        typeof initialContent?.appletVersionCount === "number"
            ? initialContent.appletVersionCount
            : 0;
    const versionCount = Math.max(savedVersionCount, pendingVersionCount);

    // Reset version pin when the applet itself changes — a stale pin into a
    // different version array would silently render the wrong content.
    useEffect(() => {
        setSelectedVersionIndex(null);
        setPendingSavedDraftHtml(null);
    }, [resolvedAppletId]);

    // Applet management tools can copy a saved version into Draft while the
    // user is still viewing that saved version. When Canvas receives that
    // Draft signal, follow Draft immediately instead of staying pinned.
    useEffect(() => {
        if (initialContent?.appletIsViewingDraft === true) {
            setSelectedVersionIndex(null);
        }
    }, [initialContent?.appletIsViewingDraft, initialContent?.htmlContent]);

    // If the applet record grows (new version saved), unpin so the canvas
    // snaps to the freshest content like it always has.
    const prevVersionCountRef = useRef(versionCount);
    const keepSavedVersionPinOnNextGrowRef = useRef(false);
    useEffect(() => {
        if (versionCount > prevVersionCountRef.current) {
            if (keepSavedVersionPinOnNextGrowRef.current) {
                keepSavedVersionPinOnNextGrowRef.current = false;
            } else {
                setSelectedVersionIndex(null);
            }
        }
        prevVersionCountRef.current = versionCount;
    }, [versionCount]);

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
    const isViewingDraft = activeVersionIndex == null;

    const handlePublish = useCallback(
        async (publishData) => {
            if (!resolvedAppletId || !displayHtml) return;
            setIsPublishing(true);
            try {
                const body = {
                    name: publishData.appletName,
                    publishToAppStore: publishData.publishToAppStore,
                };
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
            setPendingSavedDraftHtml(displayHtml);
            const nextAppletRecord = await refetchAppletRecord();
            const nextSavedVersionCount =
                nextAppletRecord?.htmlVersions?.length || 0;
            if (
                nextSavedVersionCount > 0 &&
                getLatestSavedVersionHtml(nextAppletRecord) === displayHtml
            ) {
                keepSavedVersionPinOnNextGrowRef.current = true;
                setSelectedVersionIndex(nextSavedVersionCount - 1);
            } else {
                setSelectedVersionIndex(null);
            }
            setEditedHtml(null);
        } catch (err) {
            console.error("Error saving applet version:", err);
        } finally {
            setIsPublishing(false);
        }
    }, [resolvedAppletId, displayHtml, refetchAppletRecord]);

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
            } else {
                setSelectedVersionIndex(null);
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
        tabId,
    ]);

    const canFullScreen = !isGenerating && !!displayHtml;
    const isChromeHidden =
        initialContent?.canvasChrome === "hidden" && !resolvedAppletId;
    const canPublish = !!resolvedAppletId && !isGenerating && !!displayHtml;
    const isAppletRecordPending =
        !!resolvedAppletId && !appletRecord && appletRecordStatus !== "settled";
    const canShowHeaderControls =
        !loading && !isGenerating && !!displayHtml && !isAppletRecordPending;
    const navigateToSavedVersion = useCallback((versionIndex) => {
        setSelectedVersionIndex(versionIndex);
    }, []);

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
                    ? () => setSelectedVersionIndex(null)
                    : activeVersionIndex != null &&
                        activeVersionIndex < versionCount - 1
                      ? () => setSelectedVersionIndex(activeVersionIndex + 1)
                      : null,
            onJumpToPublished:
                activeVersionIndex != null &&
                publishedVersionIndex != null &&
                publishedVersionIndex !== activeVersionIndex
                    ? () => setSelectedVersionIndex(publishedVersionIndex)
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
    ]);
    const shouldSaveDraftBeforePublish = isViewingDraft && hasLiveDraft;
    const canEditVersion =
        !!displayHtml &&
        !isGenerating &&
        !isRestoringVersion &&
        !isViewingDraft;
    const canDeleteCurrentVersion =
        !!resolvedAppletId &&
        !!displayHtml &&
        !isGenerating &&
        !isDeletingVersion &&
        (isViewingDraft || activeVersionIndex != null);
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
        const reportKey = JSON.stringify({
            activeVersionIndex,
            isViewingDraft,
        });
        if (lastReportedAppletViewRef.current === reportKey) return;
        lastReportedAppletViewRef.current = reportKey;
        onContentChange(tabId, {
            appletActiveVersionIndex: activeVersionIndex,
            appletActiveVersionNumber:
                activeVersionIndex == null ? null : activeVersionIndex + 1,
            appletIsViewingDraft: isViewingDraft,
        });
    }, [
        activeVersionIndex,
        isActive,
        isViewingDraft,
        onContentChange,
        resolvedAppletId,
        tabId,
    ]);

    if ((loading && !isGenerating) || error || htmlStatus === "error") {
        return (
            <TabContentLoader
                loading={loading && htmlStatus !== "error"}
                error={
                    htmlStatus === "error"
                        ? htmlError ||
                          t("Failed to generate applet. Please try again.")
                        : error
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
                    frameless={true}
                />
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
                        {canShowHeaderControls && resolvedAppletId && (
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
                        {canShowHeaderControls && resolvedAppletId && (
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
                            />
                            {isGenerating && (
                                <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-[1px] rounded-lg flex items-center justify-center z-10">
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="w-8 h-8 animate-spin text-sky-600 dark:text-sky-400" />
                                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                            {t("Generating applet...")}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent
                        value="code"
                        className="flex-1 m-0 min-h-0 overflow-hidden"
                    >
                        <SdkStatusBadge htmlContent={displayHtml} />
                        <div className="h-full min-h-[300px]">
                            <MonacoEditor
                                height="100%"
                                width="100%"
                                language="html"
                                theme={monacoTheme}
                                options={{
                                    fontSize: 12,
                                    readOnly: isGenerating || !isViewingDraft,
                                    wordWrap: "on",
                                    minimap: { enabled: false },
                                }}
                                value={displayHtml || ""}
                                onChange={
                                    isViewingDraft
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
        </div>
    );
}
