/**
 * Canonical Concierge Applet SDK reference (Markdown).
 * Consumed by the admin SDK Playground docs tab and the built-in `applets` skill.
 * Keep in sync with `public/applet-sdk.js` behavior and version.
 */
export const APPLET_SDK_DOCUMENTATION = `# Concierge Applet SDK

**Version:** 1.8.0

The Concierge Applet SDK is automatically injected into every applet at runtime and exposed as the global \`ConciergeSDK\` object on \`window\`.

## Getting Started

The SDK is auto-injected — no manual setup required. To explicitly include it:

\`\`\`html
<script src="/applet-sdk.js"></script>
\`\`\`

Verify the SDK is loaded:

\`\`\`js
console.log(ConciergeSDK.version); // "1.8.0"
\`\`\`

## URL Parameters

Query parameters on the applet page URL are injected at runtime. This supports direct navigation and iframe embeds:

\`\`\`html
<iframe src="https://your-concierge-host/apps/my-applet?team=team-alpha"></iframe>
\`\`\`

\`\`\`js
const team = ConciergeSDK.params.get("team");
const allParams = ConciergeSDK.params.getAll();
// window.APPLET_PARAMS is also set with the same values
\`\`\`

Concierge-internal query keys (such as \`openChat\`) are excluded from applet params.

## API Reference

### Properties

| Property | Type | Description |
|----------|------|-------------|
| \`ConciergeSDK.version\` | \`string\` | SDK version following semver. Currently \`"1.8.0"\`. |

#### \`ConciergeSDK.locale.get()\`

Read the current applet UI language and text direction from the host Concierge app.

**Returns:** \`{ language: "en" | "ar", direction: "ltr" | "rtl" }\`

#### \`ConciergeSDK.locale.getLanguage()\`

**Returns:** \`"en"\` or \`"ar"\`

#### \`ConciergeSDK.locale.getDirection()\`

**Returns:** \`"ltr"\` or \`"rtl"\`

#### \`ConciergeSDK.locale.isRtl()\`

**Returns:** \`boolean\`

**Example:**

\`\`\`js
const { language, direction } = ConciergeSDK.locale.get();
document.documentElement.dir = direction;

document.addEventListener("concierge-locale-change", (event) => {
    const next = event.detail;
    // Update labels / layout when the user switches Arabic ↔ English
});
\`\`\`

#### \`ConciergeSDK.params.get(name)\`

Read a URL query parameter passed to the applet page (direct URL or iframe \`src\`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`name\` | \`string\` | Yes | Parameter name (e.g. \`"team"\`). |

**Returns:** \`string | undefined\`

#### \`ConciergeSDK.params.getAll()\`

Read all URL query parameters as a plain object. Concierge-internal keys are excluded.

**Returns:** \`Record<string, string>\`

**Example:**

\`\`\`js
const team = ConciergeSDK.params.get("team"); // e.g. "team-alpha"
\`\`\`

### Functions

#### \`ConciergeSDK.agent.chat(options)\`

Send messages to the AI agent and get a response. Each call is **scoped to the currently logged-in user** and runs through that user's personal agent when one is configured, so the agent can use tools and connectors available to that user. Applet data and files are still isolated per applet and per user; the applet author's private data is never shared with other users of the same applet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`options.messages\` | \`Array<{role, content}>\` | Yes | Conversation messages. At least one required. |
| \`options.systemPrompt\` | \`string\` | No | System prompt to set the agent's behavior. |
| \`options.model\` | \`string\` | No | Model override. Defaults to the platform default. |

**Returns:** \`Promise<{ result: string, warnings: Array, errors: Array }>\`

**Examples:**

\`\`\`js
// Simple question
const response = await ConciergeSDK.agent.chat({
    messages: [{ role: "user", content: "What is the capital of France?" }],
});
console.log(response.result); // "The capital of France is Paris."
\`\`\`

\`\`\`js
// With system prompt
const translation = await ConciergeSDK.agent.chat({
    messages: [{ role: "user", content: "Good morning" }],
    systemPrompt: "Translate all user messages to Arabic. Return only the translation.",
});
console.log(translation.result);
\`\`\`

\`\`\`js
// Multi-turn conversation (pass full history)
const response = await ConciergeSDK.agent.chat({
    messages: [
        { role: "user", content: "My name is Sarah" },
        { role: "assistant", content: "Nice to meet you, Sarah!" },
        { role: "user", content: "What is my name?" },
    ],
});
\`\`\`

#### \`ConciergeSDK.models.list()\`

List chat models that applets can use for direct model calls. Use this before showing a model picker or before sending a specific \`model\` to \`models.generate()\`.

**Returns:** \`Promise<{ models: Array, defaultModel: string, reasoningEfforts: Array }>\`

Each model has:

| Field | Type | Description |
|-------|------|-------------|
| \`id\` / \`modelId\` | \`string\` | Cortex model identifier to pass to \`models.generate()\`. |
| \`name\` | \`string\` | Display name. |
| \`provider\` | \`string|null\` | Model provider when known. |
| \`category\` | \`"chat"\` | Model category. |
| \`isDefault\` | \`boolean\` | Whether this is the default applet model. |
| \`isModelGroup\` | \`boolean\` | Whether the ID represents a model group/alias. |
| \`supportsReasoningEffort\` | \`boolean\` | Whether \`reasoningEffort\` can be set. |
| \`reasoningEfforts\` | \`Array<string>\` | Supported values such as \`"none"\`, \`"low"\`, \`"medium"\`, and \`"high"\`. |

\`\`\`js
const { models, defaultModel } = await ConciergeSDK.models.list();
const defaultInfo = models.find((model) => model.id === defaultModel);
console.log(defaultInfo.name);
\`\`\`

#### \`ConciergeSDK.models.generate(options)\`

Make a stateless direct model call without the user's personal agent, tools, connectors, or memory. This is best for translation, classification, extraction, rewriting, scoring, JSON generation, and other app-local tasks where agentic behavior is not needed.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`options.prompt\` | \`string\` | Yes* | Prompt text. Required unless \`messages\` is supplied. |
| \`options.messages\` | \`Array<{role, content}>\` | Yes* | Conversation messages. Required unless \`prompt\` is supplied. |
| \`options.systemPrompt\` | \`string\` | No | System prompt/instructions. |
| \`options.model\` | \`string\` | No | Model ID from \`models.list()\`. Defaults to the applet default model. |
| \`options.reasoningEffort\` | \`"none" \\| "low" \\| "medium" \\| "high"\` | No | Optional reasoning effort. Must be supported by the selected model. |

**Returns:** \`Promise<{ result: string }>\`

\`\`\`js
const translation = await ConciergeSDK.models.generate({
    prompt: "Translate to Arabic: Good morning",
    reasoningEffort: "low",
});
console.log(translation.result);
\`\`\`

\`\`\`js
const { defaultModel } = await ConciergeSDK.models.list();
const response = await ConciergeSDK.models.generate({
    model: defaultModel,
    systemPrompt: "Return only valid JSON.",
    messages: [
        { role: "user", content: "Extract name and company from: Ada at Concierge" },
    ],
});
const data = JSON.parse(response.result);
\`\`\`

#### \`ConciergeSDK.services.getAccessToken(options)\`

Get an OAuth access token for a connected external service. Use this to call external APIs (Jira, GitHub, Slack) directly from your applet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`options.service\` | \`"atlassian" \\| "github" \\| "slack"\` | Yes | The service to get a token for. |

**Returns:** \`Promise<{ token: string, service: string, expiresAt: number|null, metadata: Object }>\`

- \`token\`: The Authorization header value (e.g. \`"Bearer ..."\`)
- \`metadata\`: Service-specific fields (e.g. \`{ cloudId, baseUrl }\` for Atlassian)

**Jira Cloud — issue search (do not use removed APIs):** Prefix paths with \`metadata.baseUrl\` (e.g. \`https://api.atlassian.com/ex/jira/{cloudId}\`). To search issues with JQL, use **enhanced JQL search** — \`GET\` or \`POST\` \`/rest/api/3/search/jql\` — not legacy \`/rest/api/3/search\` (that family was **removed** and returns **410**). Prefer \`POST\` with a JSON body when JQL is long. Official reference: [Issue search (Jira Cloud REST API v3)](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/). Migration and removal details: [Atlassian developer changelog — CHANGE-2046](https://developer.atlassian.com/changelog/#CHANGE-2046).

**Error codes:** \`SERVICE_NOT_CONNECTED\`, \`TOKEN_EXPIRED\`, \`NO_TOKEN\`, \`POPUP_BLOCKED\`, \`OAUTH_TIMEOUT\`, \`OAUTH_CANCELLED\`, \`OAUTH_FAILED\`

**Examples:**

\`\`\`js
// Fetch Jira issues (enhanced JQL search — not /rest/api/3/search)
const jira = await ConciergeSDK.services.getAccessToken({ service: "atlassian" });
const response = await fetch(jira.metadata.baseUrl + "/rest/api/3/search/jql", {
    method: "POST",
    headers: {
        Authorization: jira.token,
        Accept: "application/json",
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        jql: "assignee = currentUser() ORDER BY updated DESC",
        maxResults: 25,
        fields: ["summary", "status", "assignee"],
    }),
});
const data = await response.json();
\`\`\`

\`\`\`js
// Fetch GitHub repos
const gh = await ConciergeSDK.services.getAccessToken({ service: "github" });
const repos = await fetch("https://api.github.com/user/repos", {
    headers: { Authorization: gh.token },
});
\`\`\`

\`\`\`js
// Handle not-connected gracefully
try {
    const slack = await ConciergeSDK.services.getAccessToken({ service: "slack" });
    // use slack.token ...
} catch (err) {
    if (err.code === "SERVICE_NOT_CONNECTED") {
        alert("Please connect Slack first in your settings.");
    }
}
\`\`\`

#### \`ConciergeSDK.data.get()\`

Load all stored key-value data for **this applet and the current user**. Persists across sessions.

**Returns:** \`Promise<Object>\` — merged key-value store, or \`{}\` if empty.

**Requires:** \`<meta name="applet-id" content="<applet MongoDB id>">\` in the document (see **Applet ID** below).

#### \`ConciergeSDK.data.set(key, value)\`

Store one key. Values must be JSON-serializable.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`key\` | \`string\` | Yes | Non-empty string. Avoid \`$\` prefix and dots in keys (MongoDB field rules). |
| \`value\` | \`any\` | Yes | Any JSON-serializable value. |

**Returns:** \`Promise<Object>\` — the **full** updated data object after this write.

\`\`\`js
const all = await ConciergeSDK.data.set("settings", { theme: "dark" });
console.log(all.settings.theme);
\`\`\`

#### \`ConciergeSDK.sharedData.get(key)\`

Load one revision-protected value shared across users of the same applet. Use this for shared workspace state. Do not use \`ConciergeSDK.data\` for collaborative/shared state; \`data\` is intentionally per-current-user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`key\` | \`string\` | Yes | Non-empty shared data key. |

**Returns:** \`Promise<{ found: boolean, value: object, revision: string | null, key: string | null }>\`

\`\`\`js
const loaded = await ConciergeSDK.sharedData.get("workspace");

if (loaded.found) {
    renderWorkspace(loaded.value);
} else {
    showCreateWorkspaceButton();
}
\`\`\`

#### \`ConciergeSDK.sharedData.set(key, value)\`

Create or replace one shared workspace value. Missing keys are created automatically. Existing values are backed up before replacement. If this browser tab loaded the value first with \`sharedData.get()\`, the SDK sends the last seen revision automatically so stale clients get a conflict instead of silently overwriting newer data. \`set()\` cannot clear a non-empty shared value; use \`reset()\` for a user-confirmed clear or reset.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`key\` | \`string\` | Yes | Non-empty shared data key. |
| \`value\` | \`object\` | Yes | JSON-serializable object to store. |

\`\`\`js
await ConciergeSDK.sharedData.set("workspace", initialWorkspace);

await ConciergeSDK.sharedData.set("workspace", nextWorkspace);
\`\`\`

#### \`ConciergeSDK.sharedData.reset(key, value)\`

Clear or reset shared data through the explicit reset path. Use this only for user-confirmed reset actions. Reset also creates a recovery snapshot first.

**Returns:** \`Promise<{ success: boolean, value: object, revision: string }>\`

#### \`ConciergeSDK.sharedData.backups(key)\`

List recent recovery snapshots for a shared data key.

**Returns:** \`Promise<Array>\`

#### \`ConciergeSDK.sharedData.restore(key, backupId)\`

Restore a recovery snapshot. You can pass either \`backupId\` or \`revision\`. Restoring also creates a backup of the state being replaced.

**Returns:** \`Promise<{ success: boolean, value: object, revision: string }>\`

#### \`ConciergeSDK.files.list()\`

List files stored for this applet and user.

**Returns:** \`Promise<Array>\` — file metadata objects (e.g. \`originalName\`, \`size\`, \`mimeType\`, \`_id\`).

#### \`ConciergeSDK.files.upload(file)\`

Upload a browser \`File\` (from \`<input type="file">\` or \`new File(...)\`).

**Returns:** \`Promise<{ file: Object, files: Array }>\`

#### \`ConciergeSDK.files.getContentUrl(fileId)\`

Build the **relative URL** to fetch raw file bytes (e.g. for \`<img src>\` or \`fetch\`). Synchronous.

| Parameter | Type | Description |
|-----------|------|-------------|
| \`fileId\` | \`string\` | The file document’s \`_id\` from \`list()\` or \`upload()\`. |

**Returns:** \`string\` — path like \`/api/canvas-applets/<appletId>/files/<fileId>/content\`

#### \`ConciergeSDK.files.delete(filename)\`

Remove a file by its **stored filename** (not necessarily the original display name — use the value returned by the API / \`list()\`).

**Returns:** \`Promise<{ files: Array }>\` — remaining files list.

### Applet ID (\`<meta name="applet-id">\`)

\`data\` and \`files\` require a registered canvas applet. Add a meta tag in \`<head>\`:

\`\`\`html
<meta name="applet-id" content="YOUR_APPLET_MONGO_ID">
\`\`\`

Replace \`YOUR_APPLET_MONGO_ID\` with your applet’s \`_id\` from the Applets UI or from saved applet HTML. Without this tag, the SDK throws: \`No applet-id meta tag found\`.

In the **SDK Playground**, set the same value in the template’s meta tag so data/file API calls resolve to your applet.

### Important Notes

- **Stateless direct model calls**: \`models.generate\` does not use the user's personal agent, tools, connectors, or memory. To maintain conversation context, pass the full message history in \`messages\`.
- **Agent chat context**: \`agent.chat\` also does NOT persist memory between calls. To maintain conversation context, pass the full message history in \`messages\`.
- **User-isolated**: Each user gets their own applet data/file context. The applet author's data is never exposed to other users.
- **Personal agent tools**: \`agent.chat\` runs as the currently logged-in user's agent and may use that user's available tools/connectors. Tool access still depends on the user's normal permissions and connection state.
- **SDK safety limits**: Concierge rate-limits and concurrency-limits applet SDK APIs. The SDK automatically backs off and retries limited AI and read calls, but service-token, write, upload, and delete calls surface the error without retrying. Avoid tight render loops, recursive prefetch, and unbounded timers. Repeated limit violations temporarily suspend SDK access for the applet for about 15 minutes; after fixing the applet, clear the suspension with \`UpdateAppletMetadata { clearSdkSuspension: true }\` or wait for it to expire.

---

## Applet Architecture

- Applets are **single-file HTML documents** rendered in sandboxed iframes.
- **Tailwind CSS v4** is automatically injected via the browser CDN.
- The SDK is injected into \`<head>\` (preferred), before \`</body>\`, or prepended as a fallback.
- Applets support **light/dark mode** via the \`data-theme\` attribute on \`<html>\`.
- Applets support **English/Arabic** via \`lang\` / \`dir\` on \`<html>\` and \`ConciergeSDK.locale\`.

## Minimal Applet Template

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="concierge-type" content="applet">
    <!-- Optional: required for ConciergeSDK.data / ConciergeSDK.files -->
    <meta name="applet-id" content="YOUR_APPLET_MONGO_ID">
    <title>My Applet</title>
</head>
<body>
    <h1>Hello World</h1>
    <script>
        // SDK is auto-injected — ConciergeSDK is available globally
        console.log("SDK version:", ConciergeSDK.version);

        // Call the AI agent
        async function askAgent() {
            const response = await ConciergeSDK.agent.chat({
                messages: [{ role: "user", content: "Say hello!" }],
            });
            // Note: response.result is Markdown — use a Markdown renderer for rich formatting
            document.getElementById("output").textContent = response.result;
        }
    </script>
    <button onclick="askAgent()">Ask Agent</button>
    <pre id="output"></pre>
</body>
</html>
\`\`\`

## Guard Against Double-Loading

The SDK guards against being loaded twice. If \`window.ConciergeSDK\` already exists, the script is a no-op.
`;
