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

Editing the workspace file alone changes Draft only. It does **not** create an immutable version or change what the public link serves. Saving a version and publishing are explicit applet management actions.

## Canvas Applet Tools

When the canvas has an active applet, \`appletId\` defaults to it across applet management tools — you usually don't need to pass it.

For a brand new applet request, strongly prefer \`CreateApplet\` with \`prompt\`. It creates the workspace HTML file, registers the applet, and opens the live streaming canvas preview. Only hand-build HTML first when the user specifically asks for a file-first workflow or when you already have a complete HTML file that needs registration.

| Tool | Use when |
|---|---|
| \`CreateApplet\` (\`prompt\`) | User wants a brand new applet, no applet exists yet, or user explicitly asks to start over from scratch. Opens a canvas tab with a live streaming preview and imports the result. **The applet is already in the canvas when this returns — do NOT follow up with \`OpenCanvasFile\`.** |
| \`CreateApplet\` (\`workspacePath\`) | Import an existing HTML workspace file as a new applet. **Also opens it in the canvas — do NOT follow up with \`OpenCanvasFile\`.** |
| \`ListApplets\` (no args) | List the user's applets. |
| \`GetApplet\` (\`appletId\`) | Inspect one applet's metadata, Draft path, version list, publish state, and app-store state. Does not return saved version HTML. |
| \`GetAppletState\` | Inspect Draft, saved versions, published version, app-store state, and recommended next action. |
| \`OpenAppletDraft\` | Open the current mutable Draft in canvas and return its \`workspacePath\`. Does not copy saved versions over Draft. |
| \`GetAppletVersionSource\` (\`version\`) | Inspect storage/source metadata for an immutable saved version without returning the full HTML and without changing Draft. |
| \`SaveAppletDraftAsVersion\` | Snapshot the mutable Draft workspace HTML as a new immutable version. Does not publish. |
| \`CopyAppletVersionToDraft\` (\`version\`) | Copy an immutable saved version into Draft so it can be edited. Does not create a new version number. |
| \`PublishAppletVersion\` (\`version\`) | Publish an immutable saved version. |
| \`PublishAppletVersion\` (no \`version\`) | Snapshot Draft if needed, then publish that immutable version. |
| \`DeleteAppletVersion\` (\`version\`) | Delete an accidental saved checkpoint. Asks for confirmation; never deletes Draft or the applet. |
| \`UnpublishApplet\` | Clear the directly published version. |
| \`UpdateAppletMetadata\` (\`name\`) | Rename the applet (also updates the open canvas tab). |
| \`UpdateAppletMetadata\` (\`workspacePath\`) | Relink the applet to a different workspace HTML file. |
| \`UpdateAppletMetadata\` (\`publishToAppStore\`, \`appName\`, \`appSlug\`, \`appDescription\`) | Publish to \`/apps/<slug>\` (auto-publishes the version). |
| \`UpdateAppletMetadata\` (\`clearSdkSuspension\`) | Clear a temporary SDK suspension after fixing runaway applet code. |
| \`DeleteApplet\` | Delete the applet. Asks the user to confirm in a dialog. |
| \`GetCanvasState\` | Lightweight active canvas state without a screenshot. |
| \`InspectCanvas\` | Debug screenshot, applet console errors, and network failures. |

## CRITICAL — Editing vs. Creating

**Default for existing applets: EDIT in place.** If an applet is already open in the canvas (or the user references one that exists), edit its workspace file. Do not call \`CreateApplet\` to make changes to that existing applet — it creates a separate applet instead of preserving the current one.

| Scenario | Approach |
|---|---|
| Change colors / styling / layout | Edit the Draft workspace file. Save only when the user wants a checkpoint. |
| Add a feature | Edit the Draft workspace file. Save only when the user wants a checkpoint. |
| Fix a bug | Edit the Draft workspace file. Save only when the user wants a checkpoint. |
| Small tweak (text, copy, etc.) | Edit the Draft workspace file. Save only when the user wants a checkpoint. |
| User wants a brand new applet (none exists yet) | Strongly prefer \`CreateApplet\` with \`prompt\`. |
| User explicitly asks to start over / rebuild | \`CreateApplet\` with \`prompt\`. If an applet is already active, also pass \`createNew: true\` to confirm this is not an edit. |
| Register an existing HTML file as an applet | \`CreateApplet\` with \`workspacePath\`. |

## Editing Recipe — Draft, Save, Publish

Follow this order whenever you change an applet:

1. **Read Draft.** Use the workspace shell (\`cat <workspacePath>\`). \`workspacePath\` is in the HTML Canvas Context. For a non-active applet, call \`GetAppletState { appletId }\` or \`OpenAppletDraft { appletId }\` to discover its Draft path.
2. **Make targeted edits.** Write the modified HTML back to the same path with the workspace shell. Preserve everything outside the user's request — minimize your diff.
3. **Let preview refresh automatically.** The canvas follows the workspace file after tool runs. Do not call a refresh/sync tool.
4. **Save when needed.** \`SaveAppletDraftAsVersion\` snapshots Draft as a new immutable version. Editing Draft alone does not create a version.
5. **Publish when the user asks to.** \`PublishAppletVersion { version }\` publishes an existing immutable version. \`PublishAppletVersion\` with no version snapshots Draft first when needed, then publishes the resulting version.
6. **Verify when needed.** Use \`GetAppletState\` for state; use \`InspectCanvas\` only for screenshots, console errors, or network failures.

**Common mistakes to avoid:**

- Calling \`CreateApplet\` to "edit" an existing applet → creates a separate applet instead of preserving the current one.
- Manually copying HTML out of \`ListApplets\` to restore a version → use \`CopyAppletVersionToDraft { version }\`; it owns the registry-to-Draft write.
- Calling old refresh/sync tools or workspace generator scripts immediately after \`CopyAppletVersionToDraft\` → can overwrite Draft with stale regenerated HTML. Copy already put the version into Draft.
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
- **Versioned by checkpoint** — versions are explicit (\`SaveAppletDraftAsVersion\`, or \`PublishAppletVersion\` when publishing Draft), not one-per-edit. Users can copy older versions back into Draft.
- **Publishable** — direct link via \`PublishAppletVersion\`, or to the app store via applet store publishing metadata.

## Data Persistence

Choose the smallest persistence API that matches the workflow:

| Need | Use |
|---|---|
| Private preferences, filters, draft inputs, or progress for the current user only | \`ConciergeSDK.data\` |
| Shared applet workspace state that every user of the applet should see | \`ConciergeSDK.sharedData\` |

\`ConciergeSDK.data\` is per applet and per current user. It is last-write-wins and has no revision or restore history.

\`ConciergeSDK.sharedData\` is per applet and key. Call \`sharedData.get(key)\` and \`sharedData.set(key, value)\`; the SDK handles revision tokens and backups. \`sharedData.set(key, value)\` cannot clear non-empty shared state; use \`sharedData.reset(key, value)\` only for user-confirmed clear or reset actions. Use it for collaborative or shared workspace-style applets.

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

\`response.result\` is **Markdown** (headings, lists, inline images, Mermaid, code blocks, links). Use \`marked\`, \`markdown-it\`, or similar — never append as plain text.

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

An applet has a mutable Draft HTML file in the user's workspace, plus immutable saved versions in the Mongo applet record. \`CreateApplet\` handles both the file write and the record. To change an existing applet, edit the Draft workspace file; the canvas preview follows the file automatically. Call \`SaveAppletDraftAsVersion\` only when the user wants a new immutable checkpoint, and \`PublishAppletVersion\` when the user wants to ship a saved version. Do not output HTML in chat — the user sees the result in the canvas.

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
   - Publish Draft: \`PublishAppletVersion\` (saves Draft as a version first if needed).
   - Unpublish: \`UnpublishApplet\` (clears the published version).
2. **App Store** — \`/apps/{slug}\`, with a name, slug, icon, and description.
   - Publish a version first with \`PublishAppletVersion\`, then update app-store metadata with \`UpdateAppletMetadata { publishToAppStore: true, appName, appSlug, appDescription }\`.
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
    const builtIn = BUILT_IN_SKILLS.find(
        (s) => s.name.toLowerCase() === normalizedName,
    );

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
