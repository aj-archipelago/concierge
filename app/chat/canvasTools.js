// canvasTools.js
// Canvas-wide client-side tool handlers

/**
 * Contextual tool definitions for the canvas.
 * Available whenever the canvas has active content (article, image, HTML, etc.)
 */
export const CANVAS_CONTEXTUAL_TOOLS = [
    {
        type: "function",
        icon: "🔍",
        function: {
            name: "InspectCanvas",
            description:
                "Inspect what's currently in the canvas: content type (applet, article, image, or empty), a screenshot, and runtime debug info. For applets, also returns console errors/warnings, network failures, and whether the workspace file is in sync with the live preview. Use this whenever you need to see, debug, or confirm the state of the canvas — e.g. 'what does my canvas show', 'why isn't my applet working', or to verify an edit took effect.",
            descriptionAr:
                "افحص محتوى اللوحة: النوع (تطبيق/مقال/صورة/فارغة)، لقطة شاشة، ومعلومات تشغيل. للتطبيقات: أخطاء/تحذيرات الـ console وطلبات الشبكة وما إذا كان ملف المساحة متوافقاً مع المعاينة. استخدم عند «ماذا تظهر اللوحة؟» أو «لماذا لا يعمل التطبيق؟» أو التحقق من تعديل.",
            parameters: {
                type: "object",
                properties: {
                    includeScreenshot: {
                        type: "boolean",
                        description:
                            "Default true. Set false to skip the screenshot when you only need text-based info (faster, smaller response).",
                    },
                    clearLogs: {
                        type: "boolean",
                        description:
                            "Default false. If true and an applet is active, clear captured console/network logs after reading. Useful before reproducing an issue.",
                    },
                    screenshotDetail: {
                        type: "string",
                        enum: ["standard", "high"],
                        description:
                            "Default standard. Use high only when small text or fine visual details are necessary.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about inspecting the canvas",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🧭",
        function: {
            name: "GetCanvasState",
            description:
                "Return a lightweight state summary for the active canvas tab without taking a screenshot. Use this to discover whether the canvas is showing an article, applet Draft, generic HTML, image, or empty state, and to get the active workspacePath/appletId/file identity before managing state. Use InspectCanvas only when you need screenshot/runtime diagnostics.",
            descriptionAr:
                "أعد ملخصاً خفيفاً لحالة تبويب اللوحة النشط دون لقطة شاشة.",
            parameters: {
                type: "object",
                properties: {
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about reading canvas state",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
];

// CSS properties that can contain color values (oklch, lab, etc.)
// html2canvas doesn't support modern color functions, so we inline
// browser-computed values (always rgb/rgba) before capture.
const COLOR_PROPERTIES = [
    "color",
    "background-color",
    "background-image",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "outline-color",
    "text-decoration-color",
    "box-shadow",
    "text-shadow",
    "caret-color",
    "accent-color",
    "column-rule-color",
];

const STANDARD_INSPECT_SCREENSHOT_LIMITS = Object.freeze({
    maxSide: 960,
    maxPixels: 420_000,
    jpegQuality: 0.58,
});
const HARD_INSPECT_SCREENSHOT_LIMITS = Object.freeze({
    maxSide: 1600,
    maxPixels: 1_000_000,
});
const HIGH_INSPECT_SCREENSHOT_LIMITS = Object.freeze({
    maxSide: HARD_INSPECT_SCREENSHOT_LIMITS.maxSide,
    maxPixels: HARD_INSPECT_SCREENSHOT_LIMITS.maxPixels,
    jpegQuality: 0.72,
});

function getScreenshotLimits(detail = "standard") {
    const requested =
        detail === "high"
            ? HIGH_INSPECT_SCREENSHOT_LIMITS
            : STANDARD_INSPECT_SCREENSHOT_LIMITS;
    return {
        ...requested,
        maxSide: Math.min(
            requested.maxSide,
            HARD_INSPECT_SCREENSHOT_LIMITS.maxSide,
        ),
        maxPixels: Math.min(
            requested.maxPixels,
            HARD_INSPECT_SCREENSHOT_LIMITS.maxPixels,
        ),
    };
}

export function getInspectScreenshotScale(width, height, detail = "standard") {
    if (!width || !height) return 1;

    const limits = getScreenshotLimits(detail);
    return Math.min(
        1,
        limits.maxSide / width,
        limits.maxSide / height,
        Math.sqrt(limits.maxPixels / (width * height)),
    );
}

/**
 * Pre-process a cloned DOM tree to replace unsupported CSS color functions
 * (oklch, oklab, lab, lch, color()) with browser-computed rgb equivalents.
 * Called from html2canvas onclone callback.
 */
function inlineComputedColors(sourceElement, clonedElement) {
    try {
        const sourceWin = sourceElement.ownerDocument.defaultView || window;
        const origElements = [
            sourceElement,
            ...sourceElement.querySelectorAll("*"),
        ];
        const cloneElements = [
            clonedElement,
            ...clonedElement.querySelectorAll("*"),
        ];

        const limit = Math.min(origElements.length, cloneElements.length);
        for (let i = 0; i < limit; i++) {
            try {
                const computed = sourceWin.getComputedStyle(origElements[i]);
                for (const prop of COLOR_PROPERTIES) {
                    const val = computed.getPropertyValue(prop);
                    if (val && val !== "none" && val !== "initial") {
                        cloneElements[i].style.setProperty(
                            prop,
                            val,
                            "important",
                        );
                    }
                }
            } catch {
                // Skip elements that can't be computed (e.g. SVG internals)
            }
        }
    } catch {
        // Non-fatal: html2canvas may still succeed if no oklch is present
    }

    // Safety net: strip any remaining oklch/oklab/lab/lch from <style> elements
    try {
        const clonedDoc = clonedElement.ownerDocument;
        clonedDoc.querySelectorAll("style").forEach((style) => {
            if (/oklch|oklab|lab\(|lch\(|color\(/i.test(style.textContent)) {
                style.textContent = style.textContent.replace(
                    /(?:oklch|oklab|lab|lch|color)\([^)]*(?:\([^)]*\))*[^)]*\)/gi,
                    "inherit",
                );
            }
        });
    } catch {
        // Non-fatal
    }
}

function shouldRetrySnapshotWithForeignObject(error) {
    const message = String(error?.message || "");
    return /unsupported color function/i.test(message);
}

async function renderCanvasSnapshot(html2canvas, targetElement, options) {
    try {
        return await html2canvas(targetElement, options);
    } catch (error) {
        if (!shouldRetrySnapshotWithForeignObject(error)) {
            throw error;
        }

        return html2canvas(targetElement, {
            ...options,
            foreignObjectRendering: true,
        });
    }
}

async function captureScreenshot(
    activeElement,
    contentType,
    detail = "standard",
) {
    let targetElement = activeElement;

    // For HTML/applet content, prefer capturing the iframe body when accessible
    if (contentType === "html") {
        const iframe = activeElement.querySelector("iframe");
        if (iframe) {
            try {
                const iframeBody = iframe.contentDocument?.body;
                if (iframeBody) {
                    targetElement = iframeBody;
                }
            } catch {
                // Cross-origin or inaccessible iframe — fall back to container
            }
        }
    }

    const html2canvas = (await import("html2canvas")).default;
    const canvas = await renderCanvasSnapshot(html2canvas, targetElement, {
        useCORS: true,
        scale: 1,
        logging: false,
        backgroundColor: "#ffffff",
        onclone: (_clonedDoc, clonedElement) => {
            if (clonedElement) {
                inlineComputedColors(targetElement, clonedElement);
            }
        },
    });

    let outputCanvas = canvas;
    const limits = getScreenshotLimits(detail);
    const scale = getInspectScreenshotScale(
        canvas.width,
        canvas.height,
        detail,
    );
    const wasResized = scale < 1;
    if (wasResized) {
        outputCanvas = document.createElement("canvas");
        outputCanvas.width = Math.max(1, Math.floor(canvas.width * scale));
        outputCanvas.height = Math.max(1, Math.floor(canvas.height * scale));
        const context = outputCanvas.getContext("2d");
        context.drawImage(
            canvas,
            0,
            0,
            outputCanvas.width,
            outputCanvas.height,
        );
    }

    const base64Data = outputCanvas.toDataURL("image/jpeg", limits.jpegQuality);
    const mimeType = "image/jpeg";
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, "");

    return {
        mimeType,
        base64,
        width: outputCanvas.width,
        height: outputCanvas.height,
        screenshotDetail: detail,
        compressed: true,
        originalWidth: wasResized ? canvas.width : undefined,
        originalHeight: wasResized ? canvas.height : undefined,
    };
}

async function captureAppletInspect(activeElement, { clear = false } = {}) {
    const iframe = activeElement.querySelector("iframe");
    if (!iframe || !iframe.contentWindow) {
        return null;
    }

    return new Promise((resolve) => {
        const requestId =
            "inspect_" +
            Date.now() +
            "_" +
            Math.random().toString(36).slice(2, 9);

        const timeout = setTimeout(() => {
            window.removeEventListener("message", onMessage);
            resolve(null);
        }, 3000);

        function onMessage(event) {
            if (
                !event.data ||
                event.data.type !== "__APPLET_INSPECT_RESPONSE__" ||
                event.data.requestId !== requestId ||
                event.source !== iframe.contentWindow
            ) {
                return;
            }
            clearTimeout(timeout);
            window.removeEventListener("message", onMessage);
            resolve(event.data.data);
        }

        window.addEventListener("message", onMessage);
        iframe.contentWindow.postMessage(
            {
                type: "__APPLET_INSPECT_REQUEST__",
                requestId,
                clear,
            },
            "*",
        );
    });
}

async function readWorkspaceHtmlSafe(entityId, workspacePath) {
    if (!entityId || !workspacePath) return null;
    try {
        const params = new URLSearchParams({ entityId, path: workspacePath });
        const res = await fetch(`/api/workspace/file?${params}`);
        if (!res.ok) return null;
        return await res.text();
    } catch {
        return null;
    }
}

async function fetchAppletCanvasInfo(appletId) {
    if (!appletId) return null;
    try {
        const response = await fetch(
            `/api/canvas-applets/${encodeURIComponent(appletId)}`,
        );
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

async function hydrateActiveAppletCanvasTab({
    appletId,
    appletRecord = null,
    activeTabId,
    current,
    tabContent,
    dispatch,
}) {
    if (!appletId) return current;

    const applet = appletRecord || (await fetchAppletCanvasInfo(appletId));
    if (!applet) return current;

    const metadata = {
        appletId,
        title: applet.name || current?.name || tabContent.title || "Applet",
        filename:
            applet.name || tabContent.filename || current?.name || "Applet",
        workspacePath: applet.workspacePath || current?.workspacePath || null,
        fileHash: applet.fileHash || tabContent.fileHash || null,
        blobPath: applet.fileBlobPath || tabContent.blobPath || null,
        url: applet.filePath || tabContent.url || null,
    };

    if (dispatch && activeTabId) {
        const { updateCanvasTab } = await import("../../src/stores/chatSlice");
        dispatch(
            updateCanvasTab({
                tabId: activeTabId,
                content: metadata,
            }),
        );
    }

    return {
        ...(current || {}),
        id: appletId,
        name: metadata.title,
        workspacePath: metadata.workspacePath,
        fileHash: metadata.fileHash,
        fileBlobPath: metadata.blobPath,
        filePath: metadata.url,
    };
}

/**
 * Handler for InspectCanvas tool
 * Returns content-type-aware information about what's in the canvas:
 * screenshot, applet console/network logs, staleness, current article info, etc.
 */
export async function handleInspectCanvas(toolInfo, context) {
    const args = toolInfo.toolArgs || toolInfo;
    const { userMessage } = args;
    const includeScreenshot = args.includeScreenshot !== false;
    const screenshotDetail =
        args.screenshotDetail === "high" ? "high" : "standard";
    const clearLogs = !!args.clearLogs;
    const { dispatch, getActiveTabContent, getActiveTabId, getEntityId } =
        context || {};

    try {
        const activeTabId = getActiveTabId ? getActiveTabId() : null;
        let activeElement = null;
        if (activeTabId) {
            activeElement = document.querySelector(
                `[data-tab-id="${activeTabId}"]`,
            );
        }
        if (!activeElement) {
            activeElement = document.querySelector(
                '[data-tab-id][data-active="true"]',
            );
        }

        const tabContent = getActiveTabContent
            ? getActiveTabContent() || {}
            : {};
        const tabType = tabContent.type || null;

        // Discriminate content type
        let contentType = "empty";
        let current = null;
        if (activeElement) {
            if (tabType === "article") {
                contentType = "article";
                current = {
                    id: tabContent.fileHash || null,
                    title: tabContent.title || tabContent.headline || null,
                    workspacePath: tabContent.workspacePath || null,
                    filename: tabContent.filename || null,
                };
            } else if (tabType === "image") {
                contentType = "image";
                current = {
                    url: tabContent.url || null,
                    title: tabContent.title || null,
                    filename: tabContent.filename || null,
                    fileHash: tabContent.fileHash || null,
                };
            } else if (tabType === "html") {
                if (tabContent.appletId) {
                    contentType = "applet";
                    current = {
                        id: tabContent.appletId,
                        name:
                            tabContent.title || tabContent.filename || "Applet",
                        workspacePath: tabContent.workspacePath || null,
                    };
                } else {
                    contentType = "html";
                    current = {
                        title: tabContent.title || null,
                        workspacePath: tabContent.workspacePath || null,
                    };
                }
            } else {
                contentType = tabType || "unknown";
                current = {
                    title: tabContent.title || null,
                };
            }
        }

        if (contentType === "applet" && current?.id && !current.workspacePath) {
            current = await hydrateActiveAppletCanvasTab({
                appletId: current.id,
                activeTabId,
                current,
                tabContent,
                dispatch,
            });
        }

        const data = {
            contentType,
            current,
        };

        // Applet-only: console + network + staleness check
        if (contentType === "applet" && activeElement) {
            const inspectData = await captureAppletInspect(activeElement, {
                clear: clearLogs,
            });
            if (inspectData) {
                data.consoleEntries = inspectData.consoleEntries || [];
                data.networkRequests = inspectData.networkRequests || [];
            } else {
                data.consoleEntries = [];
                data.networkRequests = [];
            }

            const entityId = getEntityId ? getEntityId() : null;
            const workspacePath = current?.workspacePath || null;
            const loadedHtml = tabContent.htmlContent || null;
            if (workspacePath && loadedHtml) {
                const fileHtml = await readWorkspaceHtmlSafe(
                    entityId,
                    workspacePath,
                );
                if (fileHtml != null) {
                    data.isStale = fileHtml !== loadedHtml;
                } else {
                    data.isStale = null;
                }
            } else {
                data.isStale = null;
            }
        }

        // Screenshot (optional)
        if (includeScreenshot && activeElement) {
            try {
                const shot = await captureScreenshot(
                    activeElement,
                    tabType || "unknown",
                    screenshotDetail,
                );
                data.screenshot = {
                    type: "image",
                    mimeType: shot.mimeType,
                    base64: shot.base64,
                    width: shot.width,
                    height: shot.height,
                    screenshotDetail: shot.screenshotDetail,
                    compressed: shot.compressed,
                    originalWidth: shot.originalWidth,
                    originalHeight: shot.originalHeight,
                };
            } catch (e) {
                data.screenshotError = e.message;
            }
        }

        // Build a description tailored to content type
        const parts = [];
        if (contentType === "empty") {
            parts.push("Canvas is empty or closed.");
        } else if (contentType === "applet") {
            parts.push(
                `Applet "${current.name}" (id: ${current.id}) is in the canvas.`,
            );
            if (current.workspacePath) {
                parts.push(`Workspace file: ${current.workspacePath}.`);
            }
            if (data.isStale === true) {
                parts.push(
                    "Workspace file differs from the live preview. The canvas should refresh automatically after workspace writes; if this persists, treat it as a canvas refresh bug rather than an agent workflow step.",
                );
            } else if (data.isStale === false) {
                parts.push("Workspace file matches the live preview.");
            }
            const errorCount = (data.consoleEntries || []).filter(
                (e) => e.level === "error",
            ).length;
            const warnCount = (data.consoleEntries || []).filter(
                (e) => e.level === "warn",
            ).length;
            const failedNet = (data.networkRequests || []).filter(
                (r) => r.error || (r.status && r.status >= 400),
            ).length;
            const debugBits = [];
            if (errorCount) debugBits.push(`${errorCount} console error(s)`);
            if (warnCount) debugBits.push(`${warnCount} warning(s)`);
            if (failedNet) debugBits.push(`${failedNet} failed request(s)`);
            if (debugBits.length) {
                parts.push(`Debug: ${debugBits.join(", ")}.`);
            } else if (data.consoleEntries) {
                parts.push("No console errors or failed requests.");
            }
            if (clearLogs) parts.push("Logs cleared after reading.");
        } else if (contentType === "article") {
            parts.push(
                `Article "${current.title || current.filename || "Untitled"}" is in the canvas editor.`,
            );
            if (current.workspacePath) {
                parts.push(`Workspace file: ${current.workspacePath}.`);
            }
        } else if (contentType === "image") {
            parts.push(
                `Image "${current.title || current.filename || "Untitled"}" is in the canvas.`,
            );
        } else {
            parts.push(
                `Canvas content of type "${contentType}" is active${current?.title ? ` ("${current.title}")` : ""}.`,
            );
        }
        if (data.screenshot) {
            parts.push(
                `Captured ${data.screenshot.width}x${data.screenshot.height} screenshot.`,
            );
        }
        if (userMessage) parts.push(userMessage);

        data.description = parts.join(" ");

        return { success: true, data };
    } catch (error) {
        throw new Error(`Failed to inspect canvas: ${error.message}`);
    }
}

export async function handleGetCanvasState(toolInfo, context) {
    const activeTabId = context?.getActiveTabId
        ? context.getActiveTabId()
        : null;
    const current = context?.getActiveTabContent
        ? context.getActiveTabContent() || {}
        : {};
    const rawType = current?.type || "empty";
    const contentType =
        rawType === "html" && current?.appletId
            ? "applet"
            : rawType === "story"
              ? "article"
              : rawType;

    return {
        success: true,
        data: {
            activeTabId,
            contentType,
            current: {
                title: current?.title || current?.filename || null,
                workspacePath: current?.workspacePath || null,
                appletId: current?.appletId || null,
                fileHash: current?.fileHash || null,
                blobPath: current?.blobPath || null,
                url: current?.url || null,
            },
            description:
                contentType === "empty"
                    ? "Canvas is empty or closed."
                    : `Canvas is showing ${contentType}${current?.workspacePath ? ` at ${current.workspacePath}` : ""}.`,
        },
    };
}

/**
 * Contextual tool definitions for HTML canvas
 * Only available when an HTML preview is active in the canvas
 */
export const HTML_CONTEXTUAL_TOOLS = [];

/**
 * Tool handlers mapping
 * Maps tool names (lowercase) to their handler functions
 */
export const CANVAS_TOOL_HANDLERS = {
    getcanvasstate: handleGetCanvasState,
    inspectcanvas: handleInspectCanvas,
};

export const HTML_TOOL_HANDLERS = {};
