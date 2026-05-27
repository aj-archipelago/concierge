// activeAppletSandbox.js
// Tracks the applet iframe that's currently visible in the canvas so that
// client-side driver tools (ClickAppletElement, FillAppletField, etc.) can
// reach into its DOM. The OutputSandbox uses `allow-same-origin`, so the
// parent window can call into `iframe.contentDocument` / `contentWindow`
// directly — no postMessage bridge is needed for DOM operations.
//
// Console and network capture already live in /public/applet-sdk.js and
// respond to `__APPLET_INSPECT_REQUEST__` postMessages; `inspectApplet`
// below is a thin parent-side caller for that protocol.

let activeEntry = null;

export function setActiveAppletSandbox(appletId, iframe) {
    if (!appletId || !iframe) return;
    activeEntry = { appletId: String(appletId), iframe };
}

export function clearActiveAppletSandbox(appletId) {
    if (!activeEntry) return;
    if (appletId && String(appletId) !== activeEntry.appletId) return;
    activeEntry = null;
}

export function getActiveAppletSandbox() {
    if (!activeEntry?.iframe || !activeEntry.iframe.isConnected) {
        return null;
    }
    return activeEntry;
}

export function getActiveAppletDocument() {
    const entry = getActiveAppletSandbox();
    try {
        return entry?.iframe?.contentDocument || null;
    } catch {
        return null;
    }
}

export function getActiveAppletWindow() {
    const entry = getActiveAppletSandbox();
    try {
        return entry?.iframe?.contentWindow || null;
    } catch {
        return null;
    }
}

export function requireActiveAppletDocument() {
    const doc = getActiveAppletDocument();
    if (!doc) {
        throw new Error(
            "No applet is currently open in the canvas. Open one first (CreateApplet or OpenCanvasFile on an applet HTML file) before calling driver tools.",
        );
    }
    return doc;
}

// Calls the SDK's existing __APPLET_INSPECT_REQUEST__ protocol and resolves
// with { consoleEntries, networkRequests }. The SDK is auto-injected by
// OutputSandbox into every applet (and into the published /applet route),
// so this works in canvas previews as well as fullscreen.
export async function inspectApplet({ clear = false, timeoutMs = 2000 } = {}) {
    const win = getActiveAppletWindow();
    if (!win) {
        throw new Error(
            "No applet is currently open in the canvas. Open one first before reading its console.",
        );
    }

    const requestId = `inspect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const expectedOrigin = window.location.origin;

    return new Promise((resolve, reject) => {
        let settled = false;
        const onMessage = (event) => {
            // Same-origin iframe — reject anything claiming a different origin
            // even if event.source matches, so a compromised/navigated iframe
            // can't spoof an inspect response from another origin.
            if (event.source !== win) return;
            if (event.origin && event.origin !== expectedOrigin) return;
            const data = event.data;
            if (
                !data ||
                data.type !== "__APPLET_INSPECT_RESPONSE__" ||
                data.requestId !== requestId
            ) {
                return;
            }
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(data.data || { consoleEntries: [], networkRequests: [] });
        };

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            reject(
                new Error(
                    `Applet inspect request timed out after ${timeoutMs}ms (SDK not loaded in this applet?)`,
                ),
            );
        }, timeoutMs);

        window.addEventListener("message", onMessage);

        try {
            win.postMessage(
                {
                    type: "__APPLET_INSPECT_REQUEST__",
                    requestId,
                    clear,
                },
                window.location.origin,
            );
        } catch (error) {
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            reject(error);
        }
    });
}
