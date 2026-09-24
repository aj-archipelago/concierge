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
];

const MAX_SIDE = 720;
const JPEG_QUALITY = 0.7;

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
        for (let i = 0; i < limit; i += 1) {
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
                // Skip SVG internals and other unreadable nodes.
            }
        }
    } catch {
        // html2canvas may still succeed without inlining.
    }
}

function resolveCaptureTarget({ iframe, container } = {}) {
    try {
        const doc = iframe?.contentDocument;
        if (doc?.documentElement) return doc.documentElement;
        if (doc?.body) return doc.body;
    } catch {
        // Cross-origin iframe — fall back to the host container.
    }
    return container || null;
}

export function scaleForWidgetScreenshot(width, height) {
    if (!width || !height) return 1;
    return Math.min(1, MAX_SIDE / width, MAX_SIDE / height);
}

/**
 * Capture the live widget preview as a JPEG data URL.
 * Returns null when capture is unavailable so generation can continue.
 */
export async function captureWidgetPreview({ iframe, container } = {}) {
    const target = resolveCaptureTarget({ iframe, container });
    if (!target || typeof document === "undefined") return null;

    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(target, {
        useCORS: true,
        scale: 1,
        logging: false,
        backgroundColor: "#ffffff",
        onclone: (_clonedDoc, clonedElement) => {
            if (clonedElement) {
                inlineComputedColors(target, clonedElement);
            }
        },
    });

    const scale = scaleForWidgetScreenshot(canvas.width, canvas.height);
    let output = canvas;
    if (scale < 1) {
        output = document.createElement("canvas");
        output.width = Math.max(1, Math.floor(canvas.width * scale));
        output.height = Math.max(1, Math.floor(canvas.height * scale));
        const context = output.getContext("2d");
        context.drawImage(canvas, 0, 0, output.width, output.height);
    }

    const dataUrl = output.toDataURL("image/jpeg", JPEG_QUALITY);
    return typeof dataUrl === "string" && dataUrl.startsWith("data:image/")
        ? dataUrl
        : null;
}
