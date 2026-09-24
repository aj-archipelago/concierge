export const HOME_WIDGET_VISUAL_RULES = `
HOME WIDGET DESIGN CONTRACT:
Build a useful Home Screen widget with one clear purpose. It lives in a 320px-tall iframe, between 360px and 560px wide, and may be narrower on a phone. Keep its main action and useful content visible without page scrolling.

LAYOUT AND HIERARCHY:
- One calm full-bleed surface, 16–20px padding, consistent spacing, and one focal point. Avoid nested cards, decorative headers, taglines, badges and oversized product names.
- Use a system font with a restrained type scale: 13–14px for secondary labels, 16px for inputs and controls, 20–28px for the primary heading. A real data value can be 36–56px. Body weight 400–500; headings and selected controls 600–700. Do not make every string large and bold.
- The empty state should expose the useful action immediately. For a writing tool, make the story input the main area and show results only after generation. Do not reserve a large empty results panel. Omit generic Ready badges, instructional filler, publication disclaimers and boilerplate footers.
- Reduce content to fit. Essential controls must wrap or rearrange; never clip them, put them below the tile, or hide them in a horizontally scrolling strip. Use short labels that fit in full, including every dropdown option when selected. Touch controls should be at least 40px tall with visible keyboard focus.
- Use plain inline CSS with border-box sizing, min-width:0 on flexible children, and responsive grid/flex layouts. Do not depend on remote styles, web fonts, or scripts other than the Concierge SDK.
- Use color and content to express the subject while keeping spacing, type hierarchy and controls consistent with a quiet dashboard. A photo is optional when it improves the task, never required decoration. Do not use fake live facts, giant branded verbs, neon effects or arbitrary ornaments.

LIGHT AND DARK:
- Define complete light and dark palettes using html[data-theme="dark"]. Use prefers-color-scheme only under html:not([data-theme]). Keep the same layout in both themes.
- Text needs 4.5:1 contrast (3:1 for large text); include placeholders, selected/disabled controls and focus states. Do not put white text on pastel buttons. Use opaque surfaces for readable text over imagery.
- Empty, loading, error and result states retain the composition and fit the same tile.
`;

export const HOME_WIDGET_FORM_FACTOR_RULES = `${HOME_WIDGET_VISUAL_RULES}
ENGLISH AND ARABIC / RTL:
- Translate all interface strings, placeholders, labels and statuses using an en/ar dictionary. Get the language from ConciergeSDK.locale.getLanguage() or document.documentElement.lang. Read direction from ConciergeSDK.locale.getDirection() or document.documentElement.dir.
- Apply the initial language before first paint and listen for the document's concierge-locale-change event (event.detail.language/direction) to update the visible copy and direction in place.
- Use logical CSS: padding-inline, margin-inline, inset-inline-start/end, text-align:start, border-inline-start. Layout must mirror naturally; Arabic must not merely be English aligned to the right. Use dir=auto for user input and mixed-direction results.
- Accessible names and keyboard order must remain correct in each language.

FUNCTIONALITY:
- Preserve the original applet's real SDK behavior and bindings. The widget may expose a smaller focused workflow. Do not fake successful API results or replace the action with a decorative button.
- A preview runs without live data, media or account credentials; its fallback state must remain useful and readable. Handle SDK errors. Do not initialize an endless spinner while waiting for an optional background.
`;

export const HOME_WIDGET_IMAGERY_RULES = `
OPTIONAL IMAGERY (only when it helps the applet):
- Use ConciergeSDK.media.ensureImage({ key, prompt, aspectRatio }) for a generated background. Concierge owns caching, task persistence and deduplication across reloads and tabs. Do not implement a data.get/createImage/tasks.wait/data.set loop yourself.
- The key identifies one background for this applet and user. Use a stable literal such as "atmosphereUrl"; never use timestamps, random IDs, or a changing value as the key. Change it only when deliberately requesting different artwork.
- Reuse the returned URL as the full-bleed CSS background-image. A CSS gradient, blurred circles, funky SVG, or empty gray box is NOT an image. Do not invent image URLs.
- Keep readable fallback styling while loading and on error. Do not retry by calling createImage or changing the key if ensureImage fails.
- Required pattern (adapt the prompt to THIS applet):
\`\`\`js
(async () => {
  try {
    const surface = document.getElementById("widget-surface");
    const { url } = await ConciergeSDK.media.ensureImage({
      key: "atmosphereUrl",
      prompt: "Photorealistic full-bleed background matching this applet. No text, no UI, no logos.",
      aspectRatio: "16:9",
    });
    if (url && surface) {
      surface.style.backgroundImage = "url(" + JSON.stringify(url) + ")";
      surface.style.backgroundSize = "cover";
      surface.style.backgroundPosition = "center";
    }
  } catch (_) {
    // Keep the readable fallback. Concierge retains the task for later visits.
  }
})();
\`\`\`
`;

export const AUTOMATION_HOME_WIDGET_RULES = `${HOME_WIDGET_VISUAL_RULES}
- Render report copy in the requested language with the matching document dir. Use logical CSS for RTL. This report is static HTML: no SDK calls, scripts, interactive forms, or locale event handlers.
- widgetHtml keeps the same facts as html. Show a compact useful summary, not a shrunk article.`;

export const HOME_WIDGET_USER_REMINDER =
    "Build a calm, useful 320px-tall widget with readable hierarchy and visible controls at 360px and 560px widths. Translate its UI to Arabic and support RTL plus light/dark themes. Use the same spacing and controls across themes. Preserve real SDK behavior; handle empty, loading and error states.";

export const WIDGET_FROM_FULL_PROMPT = `Create a focused Home widget version of this applet. ${HOME_WIDGET_USER_REMINDER} Return a complete self-contained HTML document with plain inline CSS.`;
