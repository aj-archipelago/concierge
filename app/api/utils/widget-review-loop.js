import { WIDGET_FROM_FULL_PROMPT } from "../../../src/utils/homeWidgetCraft.js";
import { reviewHtmlCitations } from "./html-citation-review.js";

export const WIDGET_REVIEW_VERSION = 2;
export const MAX_WIDGET_ATTEMPTS = 3;

/** Bounded author/preview/repair loop. Only a reviewed candidate can be saved. */
export async function buildReviewedWidget({ sourceHtml, generate, inspect }) {
    let currentHtml = sourceHtml;
    let prompt = WIDGET_FROM_FULL_PROMPT;
    let screenshot;
    for (let attempt = 1; attempt <= MAX_WIDGET_ATTEMPTS; attempt += 1) {
        const html = await generate({ prompt, currentHtml, screenshot });
        const visualReview = await inspect(html);
        const review = {
            ...visualReview,
            issues: [...visualReview.issues, ...reviewHtmlCitations(html)],
        };
        console.info("Widget preview reviewed", {
            attempt,
            issues: review.issues.length,
            codes: [...new Set(review.issues.map((issue) => issue.code))],
        });
        // Always give the author one visual inspection, even when geometry passes.
        if (attempt > 1 && review.issues.length === 0) return html;
        if (attempt === MAX_WIDGET_ATTEMPTS) {
            throw Object.assign(
                new Error("Widget did not pass its preview checks"),
                {
                    code: "WIDGET_QUALITY_FAILED",
                },
            );
        }
        currentHtml = html;
        screenshot = review.screenshot;
        prompt = `Review the attached contact sheet of this widget in English/LTR and Arabic/RTL, light and dark, at 360px and 560px wide (all 320px tall). Each panel is labeled.
Repair the complete HTML using the visual evidence and these measured failures:
${JSON.stringify(review.issues)}
Preserve the applet's purpose and SDK behavior. Check hierarchy, contrast, clipped or overlapping text, reachable controls, Arabic translation, mirrored layout, and quiet empty/loading/error states. Reduce content before shrinking typography. Do not put essential controls in hidden horizontal scrolling strips. Do not add decoration to fill space. Remove generic Ready badges, boilerplate footers and large empty result panels. For a writing tool, let the input occupy the useful space and reveal results only when there are results. Every dropdown option must fit when selected; use short labels.
The preview has no account data or network access; SDK calls are inert and generated imagery is unavailable. Its readable fallback must work. Do not replace real functionality with preview fixtures or fake live facts. If the design already works, return the same complete HTML. Return only the HTML document.`;
    }
    throw new Error("Widget review exhausted");
}
