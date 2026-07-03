// skills.js
// Skills system for Concierge chat - similar to Claude Code skills
// Skills provide specialized instructions that can be loaded into chat context on demand

import { APPLET_SDK_DOCUMENTATION } from "../content/appletSdkDocumentation.js";

// ============================================================================
// Applets skill — composed sections (SDK reference is shared with admin SDK Playground)
// ============================================================================

/** Intro through theme support; ends before canonical SDK documentation. */
const APPLETS_SKILL_HEAD = `# Applets Skill

## What Are Applets?

Applets are interactive HTML-based mini-applications the user builds in chat. Each applet is a **canvas record** (Mongo \`appletRecord\`) backed by a single HTML file in the user's workspace (\`workspacePath\`). Workspaces can host many applets — they're independent records, not a one-per-workspace feature.

- The **workspace HTML file** is the editable source of truth.
- The **applet record** tracks \`htmlVersions[]\` (saved checkpoints), \`publishedVersionIndex\`, and any app-store metadata.
- The **canvas preview** runs in the same sandboxed iframe used by the live \`/published/applets/{id}\` page, so what you see in canvas matches what gets published.

Editing the workspace file changes Draft only. It does **not** create an immutable version or change what the public link serves. Saving a version creates a checkpoint for review or later publishing. Publishing is a separate, explicit promotion of a saved version to live users.

## Canvas Applet Tools

When the canvas has an active applet, \`appletId\` defaults to it across applet management tools — you usually don't need to pass it.

For a brand new applet request, strongly prefer \`CreateApplet\` with \`prompt\`. It creates the workspace HTML file, registers the applet, opens the live streaming canvas preview, and automatically starts applet-specific metadata and card-image generation in the background. Only hand-build HTML first when the user specifically asks for a file-first workflow or when you already have a complete HTML file that needs registration.

| Tool | Use when |
|---|---|
| \`CreateApplet\` (\`prompt\`) | User wants a brand new applet, no applet exists yet, or user explicitly asks to start over from scratch. Opens a canvas tab with a live streaming preview, imports the result, and starts applet-specific metadata/card-image generation automatically. **The applet is already in the canvas when this returns — do NOT follow up with \`OpenCanvasFile\`, \`GenerateAppletMetadata\`, or \`GenerateAppletImage\` for routine initial creation.** |
| \`CreateApplet\` (\`workspacePath\`) | Import an existing HTML workspace file as a new applet and start applet-specific metadata/card-image generation automatically. **Also opens it in the canvas — do NOT follow up with \`OpenCanvasFile\`, \`GenerateAppletMetadata\`, or \`GenerateAppletImage\` for routine initial creation.** |
| \`ListApplets\` (no args) | List the user's applets. |
| \`GetAppletState\` | Primary inspection tool. Shows Draft path, saved versions, published version, directory/sidebar/app-store card metadata, and next action. |
| \`OpenAppletDraft\` | Open the current mutable Draft in canvas and return its \`workspacePath\`. Does not copy saved versions over Draft. |
| \`SaveAppletDraftAsVersion\` | Checkpoint mutable Draft as a new immutable version. Does not publish. |
| \`CopyAppletVersionToDraft\` (\`version\`) | Copy an immutable saved version into Draft so it can be edited. Does not create a new version number. |
| \`PublishAppletVersion { version }\` | Explicitly promote a saved version to the live/public link. Use only when the user asks to publish/ship/make live. |
| \`SetHomeApplet\` | Set the active or specified applet as the user's Home page. Home renders Draft, so publishing is not required for ordinary Home-only updates. For homepage launcher applets, save and publish the saved version first, then set Home. |
| \`UpdateAppletMetadata\` (\`name\`) | Rename the applet (also updates the open canvas tab). |
| \`UpdateAppletMetadata\` (\`appName\`, \`appSlug\`, \`appDescription\`, \`appIcon\`, \`appImageUrl\`, \`appImageLightUrl\`, \`appImageDarkUrl\`, \`appImageAlt\`, \`appBadgeLabel\`, \`appTags\`, \`appCategory\`, \`appMetadataGeneratedAt\`) | Add/update directory, card, and sidebar metadata without publishing. |
| \`GenerateAppletMetadata\` | Generate and apply applet card/sidebar metadata from the current applet HTML using Concierge's applet-specific metadata prompt. |
| \`GenerateAppletImage\` | Generate dark-mode applet card artwork first, apply it as the default image, then generate the light-mode image from the dark image as a reference and apply it when ready. Applet assets are stored under \`applets/assets/<appletId>\`. Use \`styleCues\` for additive palette, lighting, medium, mood, or composition guidance instead of replacing the whole prompt. Use this instead of \`CreateMedia\` for applet card images. |
| \`UpdateAppletMetadata\` (\`publishToAppStore\`) | Add/update/remove the public app-store listing. Publish the intended version first if the live version should change. |
| \`DeleteApplet\` | Delete the applet. Asks the user to confirm in a dialog. |
| \`GetCanvasState\` | Lightweight active canvas state without a screenshot. |
| \`InspectCanvas\` | Debug screenshot, applet console errors, and network failures. |

Advanced/rare tools still exist for cleanup and diagnostics: \`GetApplet\`, \`GetAppletVersionSource\`, \`DeleteAppletVersion\`, \`UnpublishApplet\`, \`UpdateAppletMetadata { workspacePath }\`, and \`UpdateAppletMetadata { clearSdkSuspension }\`.

## CRITICAL — Editing vs. Creating

**Default for existing applets: EDIT in place.** If an applet is already open in the canvas (or the user references one that exists), edit its workspace file. Do not call \`CreateApplet\` to make changes to that existing applet — it creates a separate applet instead of preserving the current one.

| Scenario | Approach |
|---|---|
| Change colors / styling / layout | Edit the Draft workspace file. Save only when the user wants a checkpoint. |
| Add a feature | Edit the Draft workspace file. Save only when the user wants a checkpoint. |
| Fix a bug | Edit the Draft workspace file. Save only when the user wants a checkpoint. |
| Small tweak (text, copy, etc.) | Edit the Draft workspace file. Save only when the user wants a checkpoint. |
| User asks to publish / ship / make live | Publish a specific saved version with \`PublishAppletVersion { version }\`. |
| User wants an existing applet to be the Home page | Use \`SetHomeApplet\`. Keep editing Draft for ordinary Home-only updates; publishing is separate. |
| User wants a homepage / launchpad / launcher applet that opens other applets | Create or update the launcher, wire app launches through \`ConciergeSDK.navigation.open(path)\` or \`ConciergeSDK.navigation.navigate(path)\` to \`/apps/[slug]\` or the canonical app route, save Draft as a version, publish that saved version for local use, then use \`SetHomeApplet\`. |
| User wants a brand new applet (none exists yet) | Strongly prefer \`CreateApplet\` with \`prompt\`. |
| User explicitly asks to start over / rebuild | \`CreateApplet\` with \`prompt\`. If an applet is already active, also pass \`createNew: true\` to confirm this is not an edit. |
| Register an existing HTML file as an applet | \`CreateApplet\` with \`workspacePath\`. |

## Editing Recipe — Draft, Save, Publish

Follow this order whenever you change an applet:

1. **Read Draft.** Use the workspace shell (\`cat <workspacePath>\`). \`workspacePath\` is in the HTML Canvas Context. For a non-active applet, call \`GetAppletState { appletId }\` or \`OpenAppletDraft { appletId }\` to discover its Draft path.
2. **Make targeted edits.** Write the modified HTML back to the same path with the workspace shell. Preserve everything outside the user's request — minimize your diff.
3. **Let preview refresh automatically.** The canvas follows the workspace file after tool runs. Do not call a refresh/sync tool.
4. **Save when needed.** \`SaveAppletDraftAsVersion\` checkpoints Draft as a new immutable version. Editing Draft alone does not create a version.
5. **Publish only when asked.** \`PublishAppletVersion { version }\` promotes a specific saved version to live users. Do not publish just because a new checkpoint exists; the currently published version may intentionally stay behind Draft/latest.
6. **Finish homepage launchers end-to-end.** If the user asked for a homepage, launchpad, or launcher applet that opens other applets, this is the exception to the ordinary Home-only flow: save Draft as a version, publish that saved version for local use, then set it as Home.
7. **Set as Home when asked.** \`SetHomeApplet\` makes the applet render at \`/home\` from Draft. For ordinary Home-only updates this is not publishing and does not change public links.
8. **Verify when needed.** Use \`GetAppletState\` for state; use \`InspectCanvas\` only for screenshots, console errors, or network failures.

## Homepage Launcher Applets

When the user asks for a homepage, launchpad, or launcher applet that opens other applets, treat it as a complete Home setup rather than only an HTML draft:

1. Build or edit the launcher applet.
2. Use \`ListApplets\` / \`GetAppletState\` to identify the target applet slugs or canonical app routes.
3. In the launcher HTML, route every launch action through \`ConciergeSDK.navigation.open(path)\` or \`ConciergeSDK.navigation.navigate(path)\` first. Use browser navigation only as a fallback when the SDK is unavailable.
4. Save Draft with \`SaveAppletDraftAsVersion\`.
5. Publish that saved version locally with \`PublishAppletVersion { version }\` unless the user explicitly says not to publish.
6. Set it as Home with \`SetHomeApplet\`.

**Common mistakes to avoid:**

- Calling \`CreateApplet\` to "edit" an existing applet → creates a separate applet instead of preserving the current one.
- Manually copying HTML out of \`ListApplets\` to restore a version → use \`CopyAppletVersionToDraft { version }\`; it owns the registry-to-Draft write.
- Calling old refresh/sync tools or workspace generator scripts immediately after \`CopyAppletVersionToDraft\` → can overwrite Draft with stale regenerated HTML. Copy already put the version into Draft.
- Publishing latest/Draft just because you saved a checkpoint → publish is user-intent gated; promote a specific saved version only when asked.
- Publishing just to update an ordinary Home applet → Home follows Draft after \`SetHomeApplet\`; publish only for public/live links. Homepage launcher applets are different: save, publish the saved version for local use, and set Home as part of initial setup.
- Building launcher buttons with \`href\` or \`window.location\` only → applet launchers should call \`ConciergeSDK.navigation.open(path)\` or \`ConciergeSDK.navigation.navigate(path)\` first, then fall back to browser navigation only if the SDK is unavailable.
- Deleting a whole applet just to remove one bad checkpoint → use \`DeleteAppletVersion { version }\`.
- Guessing a \`/workspace/files/global/...\` path for an applet → use the exact \`workspacePath\` from HTML Canvas Context or \`ListApplets\` instead; current file-backed applets normally live under \`/workspace/files/applets/...\`.
- Treating \`/published/applets/{id}\` as auto-following workspace edits → it serves only the published immutable version. Republish to update it.
- Outputting raw HTML in chat instead of writing to the workspace file → the user can't see it in the canvas.

## Architecture

- **Single HTML file** — each applet is one self-contained HTML document.
- **Sandboxed iframe** — \`allow-scripts allow-popups allow-forms allow-same-origin allow-downloads allow-presentation\`. Same sandbox in canvas preview and on \`/published/applets/{id}\`.
- **Tailwind CSS v4** — the browser build is auto-injected; use Tailwind utility classes freely.
- **Concierge Applet SDK** — auto-injected at runtime; platform functions live on the global \`ConciergeSDK\` object (see SDK section below).
- **Theme-aware** — applets receive the current theme (light/dark) and respond to theme changes.
- **Versioned by checkpoint** — versions are explicit (\`SaveAppletDraftAsVersion\`), not one-per-edit. Users can copy older versions back into Draft.
- **Publishable** — direct link via \`PublishAppletVersion\`, or to the app store via applet store publishing metadata.

## Media Generation, Transcription, and Subtitle Translation

For generated images, videos, music, or speech, use the Applet SDK media generation layer instead of generic agent chat. Load available models with \`ConciergeSDK.media.models()\`, start work with \`ConciergeSDK.media.create()\` or the convenience wrappers \`createImage()\`, \`createVideo()\`, \`createMusic()\`, and \`createSpeech()\`, then monitor with \`ConciergeSDK.tasks.wait(taskId)\` or \`ConciergeSDK.tasks.get(taskId)\`. Pass Media-page model settings through \`settings\`, \`modelSettings\`, or top-level shortcuts such as \`aspectRatio\`, \`duration\`, \`quality\`, \`lyrics\`, \`voiceName\`, and \`voiceDescription\`. Use completed task \`data.url\`/\`azureUrl\`/\`gcsUrl\`, \`hash\`, or \`blobPath\` as references for follow-up \`media.modify()\` or \`media.combine()\` calls.

For audio/video transcription or timed subtitles, use \`ConciergeSDK.media.transcribe\`, \`ConciergeSDK.media.translateSubtitles\`, and poll \`ConciergeSDK.tasks.get\`; never invent/sample output or use Web Speech. Pass local uploads as \`File\`/\`fileId\`; omit \`modelOption\` for server defaults: xAI + Gemini when enabled, Gemini for YouTube.

- Baseline UI: file/URL input, media preview, start, live progress/status, final transcript.
- Word timestamps: VTT + \`wordTimestamped: true\` + \`highlightWords: true\`; show per-word cue times or inline tags beside words.
- Timed output: sync VTT/SRT/word cues to audio/video playback; offer copy/download.
- Plain transcript/document translation: use \`executePrompt\`; use \`translateSubtitles\` for completed SRT/VTT.
- Keep task/job IDs in variables only; do not show them in the applet UI.
- Completed \`task.data\` may be a direct string; word-timed VTT may use per-word cues or inline tags.

## Data Persistence

Choose storage by ownership and size:

| Need | Use |
|---|---|
| Small private JSON for the current user only: preferences, filters, draft inputs, progress, selected IDs | \`ConciergeSDK.data\` |
| Small shared JSON every user of the applet should see: collaborative workspace state, shared settings, shared lightweight indexes | \`ConciergeSDK.sharedData\` |
| Shared durable files that belong to the applet itself: bundled source data, templates, fixtures, exported reports everyone should see | Applet files in the applet workspace/file system |
| Private durable files for the current user: uploaded transcripts, extracted VTT/SRT segments, search indexes, user-specific exports, large generated state | \`ConciergeSDK.files\` applet-user files |

\`ConciergeSDK.data\` is per applet and per current user. It stores each key independently, is last-write-wins, has no revision or restore history, and is only for small JSON state. Use \`data.get("key")\` to load one key or \`data.get()\` to load the merged object for compatibility. Keep each value under 2MB.

\`ConciergeSDK.sharedData\` is per applet and key, shared by all users of that applet. Call \`sharedData.get(key)\` and \`sharedData.set(key, value)\`; the SDK handles revision tokens and backups. \`sharedData.set(key, value)\` cannot clear non-empty shared state; use \`sharedData.reset(key, value)\` only for user-confirmed clear or reset actions. Use it for collaborative or shared workspace-style JSON, not for large blobs.

Large data does not belong in \`data\` or \`sharedData\`. Do not autosave large arrays, uploaded transcripts, extracted VTT/SRT segments, search indexes, media manifests, or other bulky datasets to JSON state. Store shared large assets as applet files. Store current-user large assets with \`ConciergeSDK.files\` applet-user files. IndexedDB/localStorage may be used as a browser-local cache or offline fallback, but not as the only durable copy of important data.

When bundling static applet assets beside a Draft workspace file, use relative paths from the applet HTML file's folder. For example, an applet at \`/workspace/files/applets/text-ai-launcher.html\` can reference \`assets/text-ai-launcher/banner.jpg\`, which resolves to \`/workspace/files/applets/assets/text-ai-launcher/banner.jpg\` in preview and Home. Do not guess \`/chat/assets/...\` or other route-relative URLs.

## HTML Structure

Always output a complete, well-structured HTML document:

- **Required:** Include \`<meta name="concierge-type" content="applet">\` in the head.
- **Forbidden:** Do NOT include \`<meta id="title">\`, \`<meta id="subhead">\`, or \`<meta id="featuredImage">\` tags — those are reserved for articles.

\`\`\`html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="concierge-type" content="applet">
    <title>My Applet</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <style type="text/tailwindcss">
        @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
    </style>
    <style>
        /* Use regular CSS here only when Tailwind utility classes are not enough. */
    </style>
</head>
<body>
    <!-- Your applet content -->
    <script>
        // Your JavaScript
    </script>
</body>
</html>
\`\`\`

## Theme Support

Applets MUST support both light and dark themes. The platform provides:

- \`window.CONCIERGE_THEME\` — current theme string: \`"light"\` or \`"dark"\`
- \`html[data-theme="dark"]\` attribute on the root element
- \`--prefers-color-scheme\` CSS custom property
- \`color-scheme\` CSS property is automatically set
- Theme change events via \`window.addEventListener('message', ...)\`

### How to handle themes:

**IMPORTANT:** To make Tailwind \`dark:\` utility classes work with the CDN build, you MUST include this style block in \`<head>\`:
\`\`\`html
<style type="text/tailwindcss">
    @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
</style>
\`\`\`
Without this, \`dark:\` classes will follow the OS system preference instead of the app's theme setting.

**CSS approach (preferred):**
\`\`\`html
<style type="text/tailwindcss">
    @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
</style>

<body class="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
    ...
</body>
\`\`\`

Or use regular CSS with the data-theme attribute:
\`\`\`css
html[data-theme="dark"] body {
    background: #111827;
    color: #f9fafb;
}
\`\`\`

**Icon dark mode:** For Lucide icons loaded as \`<img>\`, add the \`icon-invert\` class and include this CSS:
\`\`\`css
html[data-theme="dark"] .icon-invert { filter: invert(1) brightness(1.5); }
\`\`\`

**JavaScript approach:**
\`\`\`javascript
// Check current theme
const isDark = window.CONCIERGE_THEME === 'dark';

// Listen for theme changes
window.addEventListener('message', (event) => {
    if (event.data?.type === 'theme-change') {
        const newTheme = event.data.theme; // 'light' or 'dark'
        // Update your UI accordingly
    }
});

// Or listen for the custom event dispatched inside the sandbox:
document.addEventListener('concierge-theme-change', (event) => {
    const newTheme = event.detail?.theme;
});
\`\`\`
`;

const APPLETS_SKILL_LOCALE = `## Language and Direction (Arabic / English)

Applets MUST support both English and Arabic, matching the host Concierge app language. The platform provides:

- \`window.CONCIERGE_LANGUAGE\` — \`"en"\` or \`"ar"\`
- \`window.CONCIERGE_DIRECTION\` — \`"ltr"\` or \`"rtl"\`
- \`html[lang="ar"][dir="rtl"]\` on the sandbox root element
- \`ConciergeSDK.locale.get()\`, \`.getLanguage()\`, \`.getDirection()\`, \`.isRtl()\`
- Locale change events via \`locale-change\` postMessage or \`concierge-locale-change\` custom event

### How to handle language/direction:

**Tailwind logical properties (preferred for RTL):**
\`\`\`html
<div class="text-start ms-4 pe-2 border-s border-gray-300">
    <!-- text-start, ms/me, ps/pe, border-s/border-e adapt to dir -->
</div>
\`\`\`

**JavaScript approach:**
\`\`\`javascript
const { language, direction } = ConciergeSDK.locale.get();
const isArabic = language === 'ar';

document.addEventListener('concierge-locale-change', (event) => {
    const { language, direction } = event.detail || {};
    // Re-render labels, swap copy, reflow layout
});

window.addEventListener('message', (event) => {
    if (event.data?.type === 'locale-change') {
        const { language, direction } = event.data;
    }
});
\`\`\`

For translation applets, branch UI strings and default prompts on \`ConciergeSDK.locale.getLanguage()\`.
`;

const APPLETS_SKILL_URL_PARAMS = `## URL Parameters

When an applet is loaded directly or embedded in an iframe, query parameters on the applet page URL are available to the applet at runtime. For example, \`/apps/dmv-applet?team=team-alpha\` or:

\`\`\`html
<iframe src="https://your-concierge-host/apps/dmv-applet?team=team-alpha"></iframe>
\`\`\`

\`\`\`javascript
// Preferred: ConciergeSDK.params
const team = ConciergeSDK.params.get("team");

// Also available as window.APPLET_PARAMS
const params = window.APPLET_PARAMS || {};
const userId = params.userId;
\`\`\`
`;

const APPLETS_SKILL_AGENT_SUPPLEMENT = `## Applets skill — agent integration (supplement)

The **Concierge Applet SDK** section above is the canonical API reference (same Markdown as the admin SDK Playground).

### Rendering \`agent.chat\` results

\`response.result\` is **Markdown** (headings, lists, inline images, Mermaid, code blocks, links). In Concierge applets, prefer the native renderer bridge instead of shipping a separate Markdown library: write JSON into a \`<pre class="llm-output">\` element. The host sandbox replaces it with Concierge's chat Markdown renderer, including citation popovers when citations are present.

\`\`\`html
<pre id="output" class="llm-output"></pre>
<script>
async function askAgent() {
    const response = await ConciergeSDK.agent.chat({
        messages: [{ role: "user", content: "Summarize the latest context." }],
    });
    document.getElementById("output").textContent = JSON.stringify({
        markdown: response.result,
        citations: response.citations || [],
    });
}
</script>
\`\`\`

\`ConciergeSDK.models.executePrompt()\` and \`ConciergeSDK.workspace.prompts.run()\` use the same renderer bridge. Use \`response.result\` for agent/model calls, \`result.output\` for workspace prompts, and always pass \`citations: value.citations || []\`. \`ConciergeSDK.models.generate()\` is available only as a backward-compatible alias; prefer \`executePrompt()\` in new applets. Only use \`marked\`, \`markdown-it\`, or another renderer when the applet must work outside Concierge.

### source Q&A in applets

Use \`ConciergeSDK.sourceQa.query()\` when the applet needs source-grounded news retrieval and a complete answer payload. Use \`ConciergeSDK.sourceQa.stream()\` when the UI should show answer text as it arrives. \`query()\` uses the same streaming transport internally, but resolves only when final metadata arrives. Both return the same final shape:

\`\`\`js
{
    result: "Markdown answer with :cd_source[N] markers",
    citations: [/* source objects for citation popovers */],
    confidence: "high" | "medium" | "low" | null,
    coverage: {/* answerability / clarification state */},
    followUpQuestions: [/* suggested next source Q&A questions */],
    metadata: {/* parsed Cortex metadata */},
    resultData: {/* retrieval diagnostics: queryPlan, searchResults, searches, timings, coverage */},
    warnings: [],
    errors: []
}
\`\`\`

Use \`ConciergeSDK.sourceQa.initialQuestions({ language })\` for the applet's initial/home-screen suggested questions. It returns cached 18-question sets for \`"en"\` or \`"ar"\`; the server owns generation, TTL caching, exact Cortex answer-cache key registration, and bounded answer prewarming. Do not use \`agent.chat()\` to generate source Q&A starter questions, and do not prefetch the returned questions in applet code. When a user chooses one, submit it through \`sourceQa.query()\` or \`sourceQa.stream()\` like any other active user question.

\`\`\`js
const starters = await ConciergeSDK.sourceQa.initialQuestions({ language: "en" });
renderSuggestionSets(starters.sets || []);
\`\`\`

Render source Q&A answers through the native bridge exactly like agent answers:

\`\`\`html
<pre id="source-qa-output" class="llm-output"></pre>
<script>
function renderSourceQa(value) {
    document.getElementById("source-qa-output").textContent = JSON.stringify({
        markdown: value.result || "",
        citations: value.citations || [],
    });
}
</script>
\`\`\`

For a normal complete call:

\`\`\`js
const response = await ConciergeSDK.sourceQa.query({
    text: "What changed in the latest policy update?",
    contextInfo: {
        topic: "Policy updates",
        previousQuestion: "What was the earlier policy?",
        previousAnswer: "The earlier policy required manual review.",
        turns: [
            { role: "user", content: "What was the earlier policy?" },
            { role: "assistant", content: "The earlier policy required manual review." },
        ],
        notes: ["The next user question is a follow-up."],
    },
    followUpQuestionCount: 3,
});

renderSourceQa(response);
showConfidence(response.confidence);
showSuggestedQuestions(response.followUpQuestions || []);
\`\`\`

For streaming:

\`\`\`js
let streamedMarkdown = "";

const finalResponse = await ConciergeSDK.sourceQa.stream({
    text: "What are the main details from the latest update?",
    contextInfo: currentSourceQaContext,
    followUpQuestionCount: 3,
    onChunk(chunk) {
        streamedMarkdown += chunk;
        document.getElementById("source-qa-output").textContent = JSON.stringify({
            markdown: streamedMarkdown,
            citations: [],
        });
    },
});

// The final resolved value includes citations/confidence/coverage. Re-render with citations.
renderSourceQa(finalResponse);
showConfidence(finalResponse.confidence);
showSuggestedQuestions(finalResponse.followUpQuestions || []);
\`\`\`

Important source Q&A rules for generated applets:

- Keep the latest user question in \`text\`; pass prior conversation through \`contextInfo\`. Do not prepend old Q/A text to \`text\`.
- Prefer structured \`contextInfo\`: \`{ topic, previousQuestion, previousAnswer, turns, notes }\`.
- Do not pass the applet host locale as source Q&A \`language\` unless the user explicitly chooses an answer language. Omit \`language\` for the default \`auto\`; source Q&A infers from the latest question.
- Internet news fallback is on by default. Pass \`searchInternet: false\` only when the applet explicitly wants configured indexed sources only.
- Request suggested next questions with \`followUpQuestionCount\`; treat returned \`followUpQuestions\` as buttons/prompts the user may submit next, not as questions the app should answer itself.
- Do not prefetch source Q&A answers for suggested follow-up questions. source Q&A is a live retrieval pipeline; run it only for the user's active submitted question.
- Streaming may emit \`onUpdate("metadata", data)\` after retrieval/coverage completes and before answer text finishes. Use that to update source/confidence UI early; \`onChunk(chunk, eventData)\` also includes \`eventData.metadata\` after metadata is available.
- Use \`confidence\` as a coarse UI label only. Use \`coverage.clarificationRequired\` or \`coverage.answerableWithCaveat\` to decide whether to show clarification or caveat UI.
- Streaming only resolves after the final metadata arrives. If \`sourceQa.stream()\` rejects, show a normal error/retry state instead of rendering an empty-source answer.
- The SDK strips SSE framing; applet code should never display raw \`data:\`, \`progress\`, or \`complete\` strings.

### Entity agent

Calls use the Concierge entity agent (\`sys_entity_agent\`) with the full tool suite. Each call is **stateless** — pass the full \`messages\` array for multi-turn context.

### \`getAccessToken\` — OAuth UI errors

Besides SDK-documented error codes, OAuth may throw: \`POPUP_BLOCKED\`, \`OAUTH_CANCELLED\`, \`OAUTH_TIMEOUT\`, \`OAUTH_FAILED\`.

**Official REST docs** (for service integrations): Atlassian https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro · GitHub https://docs.github.com/en/rest · Slack https://api.slack.com/methods

**Jira JQL search in applets:** Legacy \`/rest/api/3/search\` was **removed** (410). Implement issue search with \`/rest/api/3/search/jql\` (\`GET\` or \`POST\` + JSON body). Reference: [Issue search API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/) · [CHANGELOG-2046](https://developer.atlassian.com/changelog/#CHANGE-2046).

### Agent capabilities

| Capability | What it does | Example prompt |
|---|---|---|
| **Image Generation** | Images from text, edits, variations | "Watercolor cat illustration" |
| **Video Generation** | Short video with audio | "Ocean waves clip" |
| **Web Search** | Search / browse | "Weather in Doha" |
| **Code Execution** | Python, Node, shell | "Factorial of 20 in Python" |
| **File Analysis** | User-uploaded files | "Summarize this CSV" |
| **File Management** | User file collection | "List my files" |
| **Image Viewing** | Uploaded images | "Describe this image" |
| **Mermaid** | Diagrams | "Login flowchart" |
| **Slides / infographics** | Visual decks | "Climate infographic" |
| **URL validation** | Reachability | "Is example.com up?" |
| **Cognitive search** | Semantic KB | "AI ethics articles" |

**Tips:** Natural-language prompts; descriptive image prompts; tools may chain in one call. **Limits:** ~120s per tool, ~500 budget units per request.
`;

const APPLETS_SKILL_CONTENT =
    APPLETS_SKILL_HEAD +
    "\n\n" +
    APPLETS_SKILL_LOCALE +
    "\n\n" +
    APPLETS_SKILL_URL_PARAMS +
    "\n\n" +
    APPLET_SDK_DOCUMENTATION +
    "\n\n" +
    APPLETS_SKILL_AGENT_SUPPLEMENT;

const APPLETS_SKILL_TAIL = `## Styling Guidelines

### Tailwind CSS
- Use TailwindCSS v4 browser build: \`<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>\`
- **Only use standard Tailwind CSS utility classes.** No plugins are available (no @tailwindcss/typography, @tailwindcss/forms, etc.). Do NOT use plugin classes like \`prose\`, \`form-input\`, \`form-select\`, \`aspect-w-*\`. Do NOT use abstract component classes like \`card\`, \`btn\`, \`badge\`, \`alert\` — these don't exist in Tailwind. Compose styles from individual utilities instead.
- **Put Tailwind utility classes directly on HTML elements. Do NOT use \`@apply\` or invent custom component classes for first-pass applets.** A bad \`@apply\` can prevent Tailwind from generating styles and leave the applet unstyled. If a style cannot be expressed with utilities, write plain CSS in a normal \`<style>\` block.

### Color Scheme
- **Primary:** sky-500 (sky-600 hover, sky-700 active)
- **Secondary:** gray-500
- **Success:** green-500
- **Warning:** yellow-500
- **Error:** red-500
- **Borders:** gray-300 (dark: gray-700)

### Component Recipes
- **Form elements (input/select/textarea):** \`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500\`
- **Buttons:** \`px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2\`
- **Page layout:** \`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\`
- **Cards:** \`bg-white rounded-lg shadow-md border border-gray-200 p-6\`
- **Corners:** \`rounded-md\`
- **Shadows:** \`shadow-md\` for subtle elevation
- **Hover states:** \`hover:bg-sky-50\`
- **Focus states:** \`focus:ring-2 focus:ring-sky-500\`

### Typography
- Headings: \`text-lg\` and proper heading hierarchy (h1-h6)
- Body text: \`text-base\`
- Captions/labels: \`text-sm\`

### Icons
- Use Lucide icons from the local route: \`<img src="/api/icons/icon-name" class="w-5 h-5" />\` (spinal-case names, e.g. \`/api/icons/house\`, \`/api/icons/bar-chart-2\`; use \`loader-circle\` not \`loader-2\`)
- Add \`icon-invert\` class for dark mode support
- Or use inline SVGs for better performance and theme support
- Or use emoji for simple icons

## Best Practices

### DO:
- **Always implement actual functionality** — never use placeholders, mock data, or TODO comments. Every UI component must be fully functional and ready for production use.
- **Thoroughly implement dark mode for EVERY element** — every background, text, border, input, placeholder, shadow, and SVG must have explicit dark mode styles. Do not rely on browser defaults — they will break. Test that ALL text is readable against its background in both light and dark themes. Common mistakes: forgetting dark variants on input fields, table cells, modal overlays, tooltips, dropdown menus, scrollbar tracks, and placeholder text. Use Tailwind \`dark:\` variants or \`html[data-theme="dark"]\` selectors
- **Support English and Arabic** — use \`ConciergeSDK.locale.getLanguage()\` for copy, prefer logical Tailwind properties (\`text-start\`, \`ms-*\`, \`pe-*\`, \`border-s\`) over hard-coded left/right, and listen for \`concierge-locale-change\` when switching language at runtime
- **Use Tailwind CSS directly in markup** — compose visual styling from standard utility classes on each element. Keep \`<style type="text/tailwindcss">\` only for the required \`@custom-variant dark\` declaration.
- **Make it responsive** — use Tailwind responsive classes (\`sm:\`, \`md:\`, \`lg:\`) with actual breakpoints
- **Add accessibility features** — ARIA labels, keyboard navigation, proper focus management
- **Implement form validation** — with real-time feedback where appropriate
- **Sanitize user inputs** — prevent XSS and other injection attacks
- **Keep it self-contained** — all HTML, CSS, and JS in one file
- **Use semantic HTML** — proper headings, sections, buttons, labels
- **Handle loading states** — show spinners/skeletons when fetching data
- **Debounce API calls** — especially data saves during user input
- **Use \`try/catch\`** — wrap all API calls in error handling
- **Provide empty states** — show helpful messages when there's no data yet
- **Use CDN libraries** — load external libraries from CDN (e.g., Chart.js, D3, etc.)
- **Set proper viewport meta** — already handled by the platform, but don't override it

### DON'T:
- **Don't use React/Vue/Angular** — stick to vanilla HTML/CSS/JS or lightweight libraries
- **Don't use ES modules** (import/export) — they don't work in the sandbox
- **Don't try to access parent window** — the sandbox restricts cross-frame access
- **Don't store secrets in applet state** — use platform service tokens or dedicated secret storage instead of \`data\` or \`sharedData\`.
- **Don't use \`localStorage\`** — use the Data API instead for persistence across sessions
- **Don't make the page scrollable unless needed** — the iframe auto-sizes to content height
- **Don't hardcode colors** — always use theme-aware styles
- **Don't use massive libraries** — keep applets lightweight and fast


## Applet File Format

An applet has a mutable Draft HTML file in the user's workspace, plus immutable saved versions in the Mongo applet record. \`CreateApplet\` handles both the file write and the record. To change an existing applet, edit the Draft workspace file; the canvas preview follows the file automatically. Call \`SaveAppletDraftAsVersion\` when the user wants a new immutable checkpoint without publishing. Call \`PublishAppletVersion { version }\` only when the user asks to promote a saved version to live users, or when completing a homepage launcher applet that should be saved, locally published, and set as Home. Do not output HTML in chat — the user sees the result in the canvas.

## Suggestions

When creating or updating an applet, you can suggest follow-up actions. These appear as clickable buttons in the workspace UI:

\`\`\`json
{
    "suggestions": [
        { "name": "Add dark mode", "uxDescription": "Enhance with dark theme support" },
        { "name": "Make responsive", "uxDescription": "Optimize for mobile devices" },
        { "name": "Add data persistence", "uxDescription": "Save user data between sessions" }
    ]
}
\`\`\`

## Publishing

Applets can be published in two ways. Publishing always points at an immutable saved version — never edit publish state by writing the file alone.

1. **Direct link** — \`/published/applets/{id}\`. Anyone with the link can use it.
   - Publish a saved version: \`PublishAppletVersion { version }\`.
   - Publishing current Draft without a version is supported for explicit "make this Draft live now" requests, but prefer saving first and publishing the resulting version number.
   - Unpublish: \`UnpublishApplet\` (clears the published version).
2. **App Store** — \`/apps/{slug}\`, with card metadata such as name, slug, icon, image, badge, tags, and description.
   - Query card/sidebar metadata with \`GetApplet\` or \`GetAppletState\` and read \`appMetadata\`.
   - Generate card/sidebar metadata with \`GenerateAppletMetadata\`, generate light/dark card artwork with \`GenerateAppletImage\`, or manually update fields with \`UpdateAppletMetadata { appName, appSlug, appDescription, appIcon, appImageUrl, appImageLightUrl, appImageDarkUrl, appImageAlt, appBadgeLabel, appTags, appCategory, appMetadataGeneratedAt }\`; these do not publish the applet.
   - Publish the intended version first with \`PublishAppletVersion { version }\` if the live version should change, then list/update the public app-store entry with \`UpdateAppletMetadata { publishToAppStore: true, appName, appSlug, appDescription }\`.
   - Remove from store: \`UpdateAppletMetadata { publishToAppStore: false }\`.

When publishing to the app store:
- App name must not conflict with built-in apps (Translate, Transcribe, Write, Workspaces, Images, Jira).
- Slug must be unique across all published apps.
- Include a clear description and an appropriate icon.

## Example: Simple Counter Applet

\`\`\`html
<!DOCTYPE html>
<html>
<head>
    <style type="text/tailwindcss">
        @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
    </style>
</head>
<body class="flex min-h-[200px] items-center justify-center bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
    <div class="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-6 text-6xl font-bold text-gray-900 dark:text-white" id="count">0</div>
        <div class="flex justify-center gap-3">
            <button class="rounded-lg bg-sky-500 px-6 py-2 font-medium text-white transition-colors hover:bg-sky-600 active:bg-sky-700" onclick="decrement()">-</button>
            <button class="rounded-lg bg-gray-400 px-6 py-2 font-medium text-white transition-colors hover:bg-gray-500" onclick="reset()">Reset</button>
            <button class="rounded-lg bg-sky-500 px-6 py-2 font-medium text-white transition-colors hover:bg-sky-600 active:bg-sky-700" onclick="increment()">+</button>
        </div>
    </div>
    <script>
        let count = 0;
        const el = document.getElementById('count');

        function increment() { el.textContent = ++count; }
        function decrement() { el.textContent = --count; }
        function reset() { count = 0; el.textContent = count; }
    </script>
</body>
</html>
\`\`\`
`;

const APPLETS_SKILL_BODY = APPLETS_SKILL_CONTENT + "\n\n" + APPLETS_SKILL_TAIL;

// ============================================================================
// Articles skill — composed sections (mirrors the applets pattern)
// ============================================================================

const ARTICLES_SKILL_BODY = `# Articles Skill

## What Are Articles?

Articles are HTML files at **\`/workspace/files/articles/<slug>.html\`** in the user's workspace. The file IS the article — there is no separate registry, no in-memory editor state, no Set* page tools. Every read and every mutation goes through the **workspace shell**. The canvas re-reads the file after each shell write, so the user sees your edits live.

- **The file is the source of truth.** If a field isn't in the file, it doesn't exist.
- **Mutations are file rewrites.** \`cat > path << 'HTMLEOF' ... HTMLEOF\` is the workhorse. Partial writes that drop the meta tags will break the editor.
- **The slug is the filename.** Pass a meaningful \`title\` to \`CreateArticle\` so you get \`world-cup-2026-recap.html\` instead of \`untitled-xyz.html\`.

## Workflow

| Goal | Steps |
|---|---|
| Start a new article | Call \`CreateArticle\` (returns \`workspacePath\`) → \`mkdir -p /workspace/files/articles\` (once) → \`cat > <workspacePath> << 'HTMLEOF' ... HTMLEOF\`. |
| Open an existing article | List \`/workspace/files/articles/\` (or use \`SearchFileCollection\`) → call \`OpenCanvasFile\` with the file. HTML files under that directory open in the article editor automatically. |
| Edit any part of an article | \`cat <workspacePath>\` to read the current contents → produce the updated HTML in your reasoning → rewrite the whole file with one \`cat > ... << 'HTMLEOF'\` call. |
| Verify visual layout | Call \`InspectCanvas\` for a rendered screenshot. |

**Don't:**

- Don't paste article HTML into the chat — the user can't see it that way.
- Don't write partial files (e.g. \`echo "<p>...</p>" >> file.html\`) — you'll corrupt the structure and lose the meta tags.
- Don't try to use \`SetTitle\`/\`SetContent\`/\`SetSubhead\`/\`SetFeaturedImage\`/\`InsertRawHtml\`/\`UpdateRawHtml\`/\`ReadFullContent\` — those tools no longer exist. The file is the API.
- Don't put \`<meta name="concierge-type" content="applet">\` in an article. That flips the renderer to applet mode.

## Article HTML Format

Every article file MUST use exactly this structure. Drop or rename a meta tag and the editor will misread the file.

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="concierge-type" content="article">
    <meta id="title" content="Your Article Title">
    <meta id="subhead" content="Optional subhead">
    <meta id="featuredImage" content="https://...">
    <title>Your Article Title</title>
</head>
<body>
<p>Body HTML — p, h2, h3, ul, ol, li, strong, em, blockquote, figure, a, etc.</p>
</body>
</html>
\`\`\`

- **\`<meta name="concierge-type" content="article">\`** — required. Tells Concierge the file is an article.
- **\`<meta id="title">\`** — the headline shown above the body in the editor.
- **\`<meta id="subhead">\`** — optional subtitle.
- **\`<meta id="featuredImage">\`** — optional hero image URL (empty string clears it).
- **Body** — plain article HTML. Embed rich blocks (charts, callouts, interactive widgets) as inline \`<div>\`/\`<section>\` blocks with their own \`<style>\` and \`<script>\`.

## Embedded HTML Widgets

You can drop self-contained HTML/CSS/JS blocks directly into the article body for rich content (charts, callout cards, interactive comparisons, etc.). They render alongside the prose.

**Requirements:**

- **Self-contained:** all CSS in a \`<style>\` block, all JS in a \`<script>\` block. CDN dependencies are OK; no build step.
- **Typography:** \`Roboto\` for headings, \`Georgia\` for body text, to match the article shell. Both are pre-loaded — use them directly.
- **Polished and interactive:** these ship in a published article. Rich design, hover states, real interactivity. No skeletons or placeholders.
- **Responsive:** mobile and desktop both must work. Use fluid units or media queries.

To replace a widget, just rewrite the file with the new widget HTML in place of the old one.

## Identifier Model

- **\`workspacePath\`** — \`/workspace/files/articles/<slug>.html\`. The only identifier you need to read or edit the article.
- **\`blobPath\`** / **\`fileHash\`** — surfaced for cloud-storage references. The user-save flow writes a copy to the cloud; you don't need these for editing.

The Article Canvas Context surfaces \`workspacePath\` whenever an article is open — that's your handle for every read/write.
`;

export const BUILT_IN_SKILLS = [
    {
        name: "applets",
        description:
            "Comprehensive guide for building, editing, and publishing Concierge applets. Load this skill when the user wants to create, modify, debug, or publish an applet, or when working in a workspace that has an applet.",
        builtIn: true,
        content: APPLETS_SKILL_BODY,
    },
    {
        name: "articles",
        description:
            "How to create, read, and edit Concierge articles. Articles are HTML files at /workspace/files/articles/<slug>.html — covers the workspace-shell editing workflow, the required article HTML format, embedded HTML widget rules, and common pitfalls. Load this skill whenever the user asks to write, edit, or style an article.",
        builtIn: true,
        content: ARTICLES_SKILL_BODY,
    },
];

export function getBuiltInSkill(name) {
    const normalizedName = String(name || "")
        .toLowerCase()
        .trim();
    return (
        BUILT_IN_SKILLS.find(
            (skill) => skill.name.toLowerCase() === normalizedName,
        ) || null
    );
}

export function buildRelevantSkillReferenceContext(name, reason = "") {
    const skill = getBuiltInSkill(name);
    if (!skill) {
        return "";
    }

    const reasonLine = reason ? `\nReason: ${reason}\n` : "\n";
    return `\n## Relevant Skill: ${skill.name}${reasonLine}\n- Description: ${skill.description}\n- Load this skill with \`LoadSkill("${skill.name}")\` before changing related files, using related platform APIs, or calling related management/publishing tools.\n- Keep detailed workflow and SDK surface area in the skill instead of guessing from memory.\n`;
}

// ============================================================================
// Skill Tool Generation
// ============================================================================

/**
 * Generates the LoadSkill client-side tool definition with a dynamic description
 * that lists all available skills (built-in + user-defined)
 * @param {Array} userSkills - Array of user-defined skills { name, description }
 * @returns {Object} Tool definition for the LoadSkill tool
 */
export function getLoadSkillTool(userSkills = []) {
    const allSkills = [
        ...BUILT_IN_SKILLS.map((s) => ({
            name: s.name,
            description: s.description,
        })),
        ...userSkills.map((s) => ({
            name: s.name,
            description: s.description,
        })),
    ];

    const skillList = allSkills
        .map((s) => `- **${s.name}**: ${s.description}`)
        .join("\n");

    const enBody = `Load a skill to get specialized instructions and best practices for a specific task. When you determine that a skill is relevant to the user's request, load it to get detailed guidance.

Available skills:
${skillList}

Call this tool with the skill name to load its full instructions into the conversation. You should follow the loaded skill's guidelines when performing the relevant task.`;

    const arBody = `حمّل مهارة للحصول على تعليمات مفصّلة وأفضل الممارسات لمهمة معيّنة. عندما ترى أن المهارة مناسبة لطلب المستخدم، حمّلها للحصول على التوجيه.

المهارات المتاحة (قد تبقى أسماءها أو أوصافها بالإنجليزية):
${skillList}

استدعِ الأداة باسم المهارة لتحميل التعليمات الكاملة. اتبع إرشادات المهارة عند التنفيذ.`;

    return {
        type: "function",
        icon: "📚",
        function: {
            name: "LoadSkill",
            description: enBody,
            descriptionAr: arBody,
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: `The name of the skill to load. Available: ${allSkills.map((s) => s.name).join(", ")}`,
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A brief message explaining why you're loading this skill",
                    },
                },
                required: ["name"],
            },
        },
    };
}

// ============================================================================
// Skill Loading
// ============================================================================

/**
 * Load a skill's content by name. Checks built-in skills first, then user skills via API.
 * @param {string} name - The skill name to load
 * @param {Object} [options]
 * @param {string} [options.userContextId] - User context ID for resolving workspace file paths
 * @returns {Promise<{success: boolean, data: object}>} The skill content or error
 */
export async function loadSkill(name, { userContextId } = {}) {
    if (!name) {
        // Return list of available skills
        return {
            success: true,
            data: {
                skills: BUILT_IN_SKILLS.map((s) => ({
                    name: s.name,
                    description: s.description,
                    builtIn: true,
                })),
                description:
                    "Here are the available skills. Call LoadSkill with a specific skill name to load its full content.",
            },
        };
    }

    const normalizedName = name.toLowerCase().trim();

    // Check built-in skills first
    const builtIn = getBuiltInSkill(normalizedName);

    if (builtIn) {
        return {
            success: true,
            data: {
                name: builtIn.name,
                description: builtIn.description,
                content: builtIn.content,
                builtIn: true,
                instructions: `Skill "${builtIn.name}" loaded successfully. Follow the instructions above when working on ${builtIn.name}-related tasks.`,
            },
        };
    }

    // Try to fetch user skill from API
    try {
        const response = await fetch(
            `/api/skills/${encodeURIComponent(normalizedName)}`,
        );
        if (response.ok) {
            const skill = await response.json();
            const skillDir = userContextId
                ? `/workspace/files/skills/${normalizedName}`
                : null;
            const skillMdPath = skillDir ? `${skillDir}/SKILL.md` : null;
            return {
                success: true,
                data: {
                    name: skill.name,
                    description: skill.description,
                    content: skill.content,
                    files: skill.files || [],
                    builtIn: false,
                    skillDirectory: skillDir,
                    skillMdPath,
                    instructions: `Skill "${skill.name}" loaded successfully. Follow the instructions above.${skillDir ? ` Skill files are at **${skillDir}/**. Main content: **${skillMdPath}**. You can read, edit, or add files to this directory using the workspace shell.` : ""}`,
                },
            };
        }
    } catch (error) {
        console.error("Error fetching user skill:", error);
    }

    return {
        success: false,
        data: {
            error: `Skill "${name}" not found. Available built-in skills: ${BUILT_IN_SKILLS.map((s) => s.name).join(", ")}`,
        },
    };
}
