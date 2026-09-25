import { chromium } from "playwright";
import sharp from "sharp";
import {
    widgetPreviewDocument,
    WIDGET_PREVIEW_ORIGIN,
    WIDGET_TAILWIND_URL,
} from "./widget-preview-document.js";
import { measureWidgetPreview } from "./widget-preview-measure.js";

let tailwind;
async function tailwindSource() {
    if (!tailwind) {
        tailwind = fetch(WIDGET_TAILWIND_URL, {
            signal: AbortSignal.timeout(10000),
            redirect: "error",
        })
            .then(async (response) => {
                if (!response.ok)
                    throw new Error("Widget preview stylesheet unavailable");
                const source = await response.text();
                if (source.length > 1000000)
                    throw new Error("Widget preview stylesheet too large");
                return source;
            })
            .catch((error) => {
                tailwind = null;
                throw error;
            });
    }
    return tailwind;
}

export const WIDGET_PREVIEW_VARIANTS = ["en", "ar"].flatMap((language) =>
    ["light", "dark"].flatMap((theme) =>
        [360, 560].map((width) => ({
            language,
            direction: language === "ar" ? "rtl" : "ltr",
            theme,
            width,
        })),
    ),
);

/** No app cookies, storage, permissions or network are exposed to candidate JS. */
export async function renderWidgetPreview(html) {
    if (typeof html !== "string" || html.length > 200000)
        throw new Error("Invalid widget preview source");
    const cssRuntime = await tailwindSource();
    const browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        timeout: 10000,
    });
    const timer = setTimeout(() => browser.close().catch(() => {}), 60000);
    try {
        const issues = [];
        const panels = [];
        for (const [index, variant] of WIDGET_PREVIEW_VARIANTS.entries()) {
            const context = await browser.newContext({
                viewport: { width: variant.width, height: 320 },
                colorScheme: variant.theme,
                locale: variant.language,
                serviceWorkers: "block",
                acceptDownloads: false,
            });
            try {
                const page = await context.newPage();
                const errors = [];
                page.on("pageerror", (error) => {
                    if (
                        !error.message.includes(
                            "Preview: live action unavailable",
                        )
                    )
                        errors.push(error.message.slice(0, 180));
                });
                page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));
                // Only the first document and one fixed, trusted asset exist.
                let served = false;
                await context.route("**/*", (route) => {
                    const request = route.request();
                    if (
                        !served &&
                        request.isNavigationRequest() &&
                        request.url() === `${WIDGET_PREVIEW_ORIGIN}/` &&
                        request.frame() === page.mainFrame()
                    ) {
                        served = true;
                        return route.fulfill({
                            contentType: "text/html",
                            body: widgetPreviewDocument(html, variant),
                        });
                    }
                    if (request.url() === WIDGET_TAILWIND_URL)
                        return route.fulfill({
                            contentType: "application/javascript",
                            body: cssRuntime,
                        });
                    return route.abort();
                });
                await page.goto(WIDGET_PREVIEW_ORIGIN, {
                    waitUntil: "load",
                    timeout: 5000,
                });
                await page.evaluate(async () => {
                    await document.fonts.ready;
                    await new Promise((resolve) =>
                        requestAnimationFrame(() =>
                            requestAnimationFrame(resolve),
                        ),
                    );
                });
                const result = await page.evaluate(
                    measureWidgetPreview,
                    variant,
                );
                const label = `${variant.language.toUpperCase()} / ${variant.direction.toUpperCase()} · ${variant.theme} · ${variant.width}×320`;
                issues.push(
                    ...result.issues.map((issue) => ({
                        variant: label,
                        ...issue,
                    })),
                    ...errors.map((detail) => ({
                        variant: label,
                        code: "script-error",
                        detail,
                    })),
                );
                // Tab once to verify a keyboard target is available when controls exist.
                if (
                    await page
                        .locator(
                            "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]",
                        )
                        .count()
                ) {
                    await page.keyboard.press("Tab");
                    if (
                        !(await page.evaluate(
                            () => document.activeElement !== document.body,
                        ))
                    )
                        issues.push({
                            variant: label,
                            code: "keyboard",
                            detail: "No focusable control on Tab",
                        });
                }
                const png = await page.screenshot({
                    type: "png",
                    animations: "disabled",
                    timeout: 5000,
                });
                const x = (index % 2) * 360,
                    y = Math.floor(index / 2) * 350;
                const header = Buffer.from(
                    `<svg width="${variant.width}" height="30"><rect width="${variant.width}" height="30" fill="#e5e7eb"/><text x="12" y="21" font-family="sans-serif" font-size="16" fill="#111827">${label}</text></svg>`,
                );
                panels.push(
                    { input: header, left: x, top: y },
                    { input: png, left: x, top: y + 30 },
                );
            } finally {
                await context.close();
            }
        }
        const contact = await sharp({
            create: {
                width: 920,
                height: 1400,
                channels: 3,
                background: "#cbd5e1",
            },
        })
            .composite(panels)
            .jpeg({ quality: 75 })
            .toBuffer();
        return {
            issues,
            screenshot: `data:image/jpeg;base64,${contact.toString("base64")}`,
        };
    } finally {
        clearTimeout(timer);
        await browser.close();
    }
}
