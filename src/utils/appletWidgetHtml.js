import { v4 as uuidv4 } from "uuid";
import { WIDGET_FROM_FULL_PROMPT } from "./homeWidgetCraft.js";
import { readAppletGenerationStream } from "./readAppletGenerationStream.js";

export { WIDGET_FROM_FULL_PROMPT };

/** Stream `/api/generate-applet` and return the final HTML string. */
export async function generateAppletHtmlFromPrompt(
    prompt,
    t,
    { formFactor, currentHtml, screenshot } = {},
) {
    const genRes = await fetch("/api/generate-applet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            prompt: String(prompt || "").trim(),
            ...(formFactor ? { formFactor } : {}),
            ...(currentHtml ? { currentHtml } : {}),
            ...(screenshot ? { screenshot } : {}),
        }),
    });
    return readAppletGenerationStream(genRes, t);
}

export async function fetchAppletRuntimeHtml(appletId, { variant } = {}) {
    const url =
        variant === "widget"
            ? `/api/canvas-applets/${appletId}/runtime?variant=widget`
            : `/api/canvas-applets/${appletId}/runtime`;
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const error = new Error(body?.error || "Failed to load applets");
        error.code = body?.code;
        error.status = res.status;
        throw error;
    }
    const runtimeHtml = body?.applet?.runtimeHtml;
    if (!runtimeHtml) {
        const error = new Error("No applet was generated");
        error.status = 404;
        throw error;
    }
    return runtimeHtml;
}

export async function saveAppletWidgetHtml(appletId, widgetHtml, t) {
    const res = await fetch(`/api/canvas-applets/${appletId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetHtml }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 403) {
            throw new Error(
                t("Only the applet owner can change its widget version."),
            );
        }
        throw new Error(body?.error || t("Failed to save applet"));
    }
    return body;
}

export async function regenerateWidgetHtml(appletId, t) {
    return withWidgetSlot(() => requestWidget(appletId, t, true, true));
}

const widgetLoads = new Map();
const widgetWaiters = [];
let activeWidgetLoads = 0;

async function withWidgetSlot(operation) {
    if (activeWidgetLoads >= 2)
        await new Promise((resolve) => widgetWaiters.push(resolve));
    else activeWidgetLoads += 1;
    try {
        return await operation();
    } finally {
        const next = widgetWaiters.shift();
        if (next) next();
        else activeWidgetLoads -= 1;
    }
}

function widgetError(code, t) {
    const messages = {
        WIDGET_QUALITY_FAILED:
            "The widget still has layout or accessibility problems. Please retry to build a new version.",
        WIDGET_SAVE_FAILED:
            "Your widget could not be saved. Retry to save it without generating it again.",
        WIDGET_SOURCE_CHANGED:
            "This applet changed while its widget was being prepared. Please retry.",
        WIDGET_INTERRUPTED: "Widget preparation was interrupted. Please retry.",
    };
    const error = new Error(
        t(messages[code] || "Widget preparation failed. Please retry."),
    );
    error.code = code;
    return error;
}

async function requestWidget(appletId, t, retry, regenerate = false) {
    const deadline = Date.now() + 16 * 60 * 1000;
    const regenerationId = regenerate ? uuidv4() : undefined;
    let networkFailures = 0;
    while (Date.now() < deadline) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12 * 60 * 1000);
        let response;
        try {
            response = await fetch(`/api/canvas-applets/${appletId}/widget`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ retry, regenerate, regenerationId }),
                signal: controller.signal,
            });
        } catch {
            if (++networkFailures >= 3)
                throw widgetError("WIDGET_INTERRUPTED", t);
        } finally {
            // One click authorizes one retry. Follow-up polls never request another generation.
            retry = false;
            clearTimeout(timer);
        }
        if (response) {
            const body = await response.json();
            if (!response.ok) throw widgetError(body.code, t);
            if (body.status === "ready" && body.html) return body.html;
            if (body.status === "failed") throw widgetError(body.code, t);
            if (!["running", "queued"].includes(body.status))
                throw widgetError("WIDGET_UNAVAILABLE", t);
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw widgetError("WIDGET_INTERRUPTED", t);
}

export async function loadOrCreateWidgetHtml(
    appletId,
    t,
    { onGenerating, retry = false } = {},
) {
    try {
        // Recheck permission and saved content for every caller, even when work
        // is shared. Do not retain private HTML across account changes.
        return await fetchAppletRuntimeHtml(appletId, { variant: "widget" });
    } catch (err) {
        if (err?.code !== "WIDGET_MISSING") throw err;
    }
    onGenerating?.();
    let pending = widgetLoads.get(appletId);
    if (!pending) {
        pending = withWidgetSlot(() =>
            requestWidget(appletId, t, retry),
        ).finally(() => widgetLoads.delete(appletId));
        widgetLoads.set(appletId, pending);
    }
    return pending;
}
