/**
 * Canonical Concierge Applet SDK reference (Markdown).
 * Consumed by the admin SDK Playground docs tab and the built-in `applets` skill.
 * Keep in sync with `public/applet-sdk.js` behavior and version.
 */
export const APPLET_SDK_DOCUMENTATION = `# Concierge Applet SDK

**Version:** 1.12.0

The Concierge Applet SDK is automatically injected into every applet at runtime and exposed as the global \`ConciergeSDK\` object on \`window\`.

## Getting Started

The SDK is auto-injected — no manual setup required. To explicitly include it:

\`\`\`html
<script src="/applet-sdk.js"></script>
\`\`\`

Verify the SDK is loaded:

\`\`\`js
console.log(ConciergeSDK.version); // "1.12.0"
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
| \`ConciergeSDK.version\` | \`string\` | SDK version following semver. Currently \`"1.12.0"\`. |

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

#### \`ConciergeSDK.navigation.open(path, options)\`

Navigate the host Concierge app to another internal route. This changes the full Concierge page, not only the applet iframe, so a published applet can hand off to another applet or page.

\`ConciergeSDK.navigation.navigate(path, options)\` is an alias.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`path\` | \`string\` | Yes | Internal path beginning with \`/\`, such as \`"/apps/project-dashboard"\`. External URLs are rejected. |
| \`options.replace\` | \`boolean\` | No | Replace the current history entry instead of pushing a new one. Defaults to \`false\`. |

**Returns:** \`Promise<{ success: true, path: string, replace: boolean }>\`

**Example:**

\`\`\`js
await ConciergeSDK.navigation.open("/apps/project-dashboard");
await ConciergeSDK.navigation.open("/apps/project-dashboard?tab=summary", {
    replace: true,
});
\`\`\`

### Functions

#### \`ConciergeSDK.agent.chat(options)\`

Send messages to the AI agent and get a response. Each call is **scoped to the currently logged-in user** and runs through that user's personal agent when one is configured, so the agent can use tools and connectors available to that user. Applet data and files are still isolated per applet and per user; the applet author's private data is never shared with other users of the same applet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`options.messages\` | \`Array<{role, content}>\` | Yes | Conversation messages. At least one required. |
| \`options.systemPrompt\` | \`string\` | No | System prompt to set the agent's behavior. |
| \`options.model\` | \`string\` | No | Model override. Defaults to the platform default. |

**Returns:** \`Promise<{ result: string, citations: Array, metadata: Object, warnings: Array, errors: Array }>\`

For rich output inside Concierge, render \`result\` through the native sandbox bridge:

\`\`\`html
<pre id="output" class="llm-output"></pre>
\`\`\`

\`\`\`js
document.getElementById("output").textContent = JSON.stringify({
    markdown: response.result,
    citations: response.citations || [],
});
\`\`\`

The host app renders \`pre.llm-output\` JSON with Concierge's chat Markdown renderer. Extra tool metadata from Cortex is available on \`response.metadata\`.

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

#### \`ConciergeSDK.sourceQa.query(options)\`

Ask the source Q&A retrieval pathway and receive the complete Cortex result payload, including parsed retrieval diagnostics. \`query()\` uses the same streaming transport as \`stream()\` internally, but it resolves only after the final metadata arrives and does not expose partial chunks unless callback options are supplied.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`options.text\` | \`string\` | Yes | Question to answer. \`question\` is accepted as an alias. |
| \`options.contextInfo\` | \`string \\| object\` | No | Prior context for follow-up resolution. Keep the new user question in \`text\`; pass prior context here. Prefer \`{ topic, previousQuestion, previousAnswer, turns, notes }\`. |
| \`options.language\` | \`string\` | No | Response language label. Defaults to \`auto\`, so source Q&A infers the response language from the latest question. Only pass this when intentionally forcing output language. |
| \`options.maxSearchResults\` | \`number\` | No | Maximum sources to return to synthesis. Defaults to 12. |
| \`options.maxRefinementRounds\` | \`number\` | No | Override source Q&A refinement rounds. |
| \`options.searchInternet\` | \`boolean\` | No | Include the internet news fallback alongside indexed sources. Defaults to \`true\`. |
| \`options.maxInternetResults\` | \`number\` | No | Maximum internet fallback results per query. Defaults to 5. |
| \`options.followUpQuestionCount\` | \`number\` | No | Ask Cortex to return up to this many suggested next questions. Defaults to 0. |
| \`options.skipAnswerSynthesis\` | \`boolean\` | No | Return retrieval diagnostics without final synthesis. |
| \`options.stream\` | \`boolean\` | No | Stream answer chunks before resolving with the complete response. You can also call \`ConciergeSDK.sourceQa.stream(options)\` directly. |

**Returns:** \`Promise<{ result: string, citations: Array, followUpQuestions: Array, confidence: "high"|"medium"|"low"|null, coverage: Object|null, metadata: Object, resultData: Object, tool: Object, rawResultData: string|null, rawTool: string|null, warnings: Array, errors: Array }>\`

\`result\` contains \`:cd_source[N]\` citation markers. \`citations\` contains the cited source objects. \`confidence\` is a coarse answerability label. \`coverage\` contains structured coverage state such as whether a caveated answer is possible or clarification is required. \`followUpQuestions\` contains suggested next questions when requested. \`metadata\` / \`resultData\` include \`searchResults\`, \`queryPlan\`, \`coverage\`, \`searches\`, and \`timings\` when Cortex returns them. Internet fallback results are open-web news search results; configured trusted domains may be identified as first-party coverage, while other domains should be treated as external outlets.

Do not prefetch source Q&A answers for suggested follow-up questions. source Q&A performs live retrieval and synthesis; run it only for the user's active question. It is fine to render \`followUpQuestions\` as buttons, but clicking a button should start one fresh visible request.

Streaming calls may emit an early \`metadata\` update after retrieval and coverage complete, before answer text is finished. Use \`onUpdate("metadata", data)\` to update confidence/source UI early. After that point, \`onChunk(chunk, eventData)\` also includes \`eventData.metadata\` when early metadata is available. The final resolved response remains the authoritative complete payload.

\`ConciergeSDK.sourceQa.initialQuestions({ language })\` returns cached home-screen starter questions for \`"en"\` or \`"ar"\`. The server generates one 18-question set per language for the TTL, registers exact Cortex answer-cache keys for those questions, and starts bounded server-side answer prewarming. Use it for the initial/home-screen suggestions only; when the user selects one, call \`sourceQa.query()\` or \`sourceQa.stream()\` with the selected question as usual.

\`\`\`js
const starters = await ConciergeSDK.sourceQa.initialQuestions({ language: "en" });
renderSuggestionSets(starters.sets);
\`\`\`

\`\`\`js
const response = await ConciergeSDK.sourceQa.query({
    text: "What changed in the latest policy update?",
    contextInfo: {
        topic: "Policy updates",
        previousQuestion: "What was the earlier policy?",
        previousAnswer: "The earlier policy required manual review.",
    },
    searchInternet: true,
    followUpQuestionCount: 4,
});

document.getElementById("output").textContent = JSON.stringify({
    markdown: response.result,
    citations: response.citations || [],
    followUpQuestions: response.followUpQuestions || [],
});
console.log(response.resultData.coverage, response.resultData.searchResults);
\`\`\`

To stream the synthesis as it arrives:

\`\`\`js
const response = await ConciergeSDK.sourceQa.stream({
    text: "What are the main details from the latest update?",
    followUpQuestionCount: 3,
    onChunk(chunk, eventData) {
        document.getElementById("output").textContent += chunk;
        if (eventData.metadata) {
            renderConfidence(eventData.metadata.confidence);
        }
    },
    onUpdate(eventName, data) {
        if (eventName === "metadata") {
            renderSources(data.citations || []);
            renderConfidence(data.confidence);
            return;
        }
        console.log(eventName, data.progress);
    },
});

console.log(response.citations, response.confidence, response.coverage);
\`\`\`

#### \`ConciergeSDK.models.list()\`

List chat models that applets can use for direct model calls. Use this before showing a model picker or before sending a specific \`model\` to \`models.executePrompt()\`.

**Returns:** \`Promise<{ models: Array, defaultModel: string, reasoningEfforts: Array }>\`

Each model has:

| Field | Type | Description |
|-------|------|-------------|
| \`id\` / \`modelId\` | \`string\` | Cortex model identifier to pass to \`models.executePrompt()\`. |
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

#### \`ConciergeSDK.models.executePrompt(options)\`

\`ConciergeSDK.models.generate(options)\` is also supported as a backward-compatible alias.

Make a stateless direct model call without the user's personal agent, tools, connectors, or memory. This is best for translation, classification, extraction, rewriting, scoring, JSON generation, and other app-local tasks where agentic behavior is not needed.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`options.prompt\` | \`string\` | Yes* | Prompt text. Required unless \`messages\` is supplied. |
| \`options.messages\` | \`Array<{role, content}>\` | Yes* | Conversation messages. Required unless \`prompt\` is supplied. |
| \`options.systemPrompt\` | \`string\` | No | System prompt/instructions. |
| \`options.model\` | \`string\` | No | Model ID from \`models.list()\`. Defaults to the applet default model. |
| \`options.reasoningEffort\` | \`"none" \\| "low" \\| "medium" \\| "high"\` | No | Optional reasoning effort. Must be supported by the selected model. |

**Returns:** \`Promise<{ result: string, citations: Array, metadata: Object }>\`

\`\`\`js
const translation = await ConciergeSDK.models.executePrompt({
    prompt: "Translate to Arabic: Good morning",
    reasoningEffort: "low",
});
document.getElementById("output").textContent = JSON.stringify({
    markdown: translation.result,
    citations: translation.citations || [],
});
\`\`\`

\`\`\`js
const { defaultModel } = await ConciergeSDK.models.list();
const response = await ConciergeSDK.models.executePrompt({
    model: defaultModel,
    systemPrompt: "Return only valid JSON.",
    messages: [
        { role: "user", content: "Extract name and company from: Ada at Concierge" },
    ],
});
const data = JSON.parse(response.result);
\`\`\`

#### \`ConciergeSDK.media.transcribe(options)\`

Start transcription from \`{ url }\`, \`{ file }\`, or \`{ fileId }\`; local uploads should use \`File\`/\`fileId\`, not applet file content URLs. Returns \`{ taskId, jobId? }\`; poll with \`ConciergeSDK.tasks.get(taskId)\`.

Options: \`language\`, \`responseFormat\` (\`"vtt"\` default, \`"formatted"\`, \`"text"\`), \`wordTimestamped\`, \`highlightWords\`, \`maxWordsPerLine\`, \`maxLineWidth\`, \`maxLineCount\`, and optional \`modelOption\`. Omit \`modelOption\` for server defaults: xAI + Gemini when enabled, Gemini for YouTube.

Transcription applet baseline: file/URL input, media preview, start button, live progress/status while polling, and final transcript. For timed output, sync VTT/SRT/word cues to audio/video playback and offer copy/download.

For visible word timestamps, use \`responseFormat: "vtt"\`, \`wordTimestamped: true\`, and \`highlightWords: true\`; render per-word VTT cues or inline time tags beside each word. For SRT, transcribe as VTT and convert cues client-side.

#### \`ConciergeSDK.media.translateSubtitles(options)\`

Start subtitle translation for timed SRT/VTT text: \`{ text, to, format?, name? }\`. Use this for completed timed transcripts; use \`ConciergeSDK.models.executePrompt()\` for plain text/document translation. Returns \`{ taskId, jobId? }\`.

#### \`ConciergeSDK.media.models()\`

List media generation models available to applets. Each model includes \`id\`/\`modelId\`, \`name\`, \`provider\`, \`category\` (\`"image"\`, \`"video"\`, \`"audio"\`, \`"tts"\`, or \`"upscaling"\`), \`mediaDefaults\`, \`mediaControls\`, Media-page option families such as \`availableAspectRatios\`, \`availableImageSizes\`, \`availableResolutions\`, \`availableDurations\`, \`availableOutputFormats\`, conditional \`mediaDefaultOverrides\`, \`mediaInputModes\`, reference roles, and URL preferences. Use this before building a custom model/settings picker. Each \`mediaControls[]\` entry is the caller-facing schema for a model setting: use \`key\` as the setting name, \`aliases\` for equivalent setting keys, \`type\` to choose the control UI, \`options\` for valid select values, \`min\`/\`max\`/\`step\`/\`unit\` for numeric values, \`showWhen\`/\`hideWhen\` for conditional visibility, and \`mediaDefaults[key]\` as the initial value. \`mediaInputModes[]\` describes promptless or multimodal generation modes, including required reference counts and any required prompt/settings alternatives.

#### \`ConciergeSDK.media.create(options)\`

Start a media-generation task through the same background pipeline used by the Media page. Returns \`{ taskId, jobId? }\`; use \`ConciergeSDK.tasks.wait(taskId)\` or \`ConciergeSDK.tasks.get(taskId)\` to monitor completion. Completed media task data includes fields such as \`url\`, \`azureUrl\`, \`gcsUrl\`, \`hash\`, \`blobPath\`, \`type\`, \`model\`, and \`prompt\`.

Common options:

| Option | Description |
|--------|-------------|
| \`prompt\` | Prompt text. Required unless a reference-only model/action supports omitted prompts. |
| \`model\` | Media model ID from \`media.models()\`. If omitted, Concierge chooses the default matching \`outputType\`/\`mediaKind\`. |
| \`outputType\` | \`"image"\`, \`"video"\`, or \`"audio"\`. TTS models still output \`"audio"\`. |
| \`mediaKind\` | Optional category hint: \`"image"\`, \`"video"\`, \`"audio"\`, or \`"tts"\`. |
| \`settings\` | Full Media-page settings object, including \`settings.models[model]\`. |
| \`modelSettings\` | Per-model settings merged into \`settings.models[model]\`. |
| \`inputImages\`, \`inputVideos\`, \`inputAudio\` | References by public URL, applet \`fileId\`, applet file content URL, or a completed media task/data object with URL fields. |
| \`outputFolder\` | Optional destination folder under the user's media storage. |
| \`inputTags\` | Optional tags inherited onto the generated media item. |

Top-level shortcuts are also accepted for the Media-page controls and merged into the selected model settings: \`aspectRatio\`, \`duration\`, \`outputFormat\`, \`outputQuality\`, \`quality\`, \`negativePrompt\`, \`negative_prompt\`, \`numberResults\`, \`seed\`, \`optimizePrompt\`, \`generateAudio\`, \`forceInstrumental\`, \`processingType\`, \`scene\`, \`targetResolution\`, \`targetFps\`, \`enhanceModel\`, \`upscaleFactor\`, \`subjectDetection\`, \`faceEnhancement\`, \`faceEnhancementCreativity\`, \`faceEnhancementStrength\`, \`cutFirstSecond\`, \`noOp\`, \`resolution\`, \`cameraFixed\`, \`image_size\`, \`imageSize\`, \`width\`, \`height\`, \`size\`, \`lyrics\`, \`isInstrumental\`, \`lyricsOptimizer\`, \`audioFormat\`, \`sampleRate\`, \`bitrate\`, \`voiceName\`, \`speaker1Name\`, \`speaker1VoiceName\`, \`speaker2Name\`, \`speaker2VoiceName\`, \`mode\`, \`language\`, \`speaker\`, \`referenceText\`, \`styleInstruction\`, \`voiceDescription\`, \`voice\`, \`voiceScript\`, \`voiceLanguage\`, \`voicePrompt\`, \`videoPrompt\`, \`strengthNegativePrompt\`, \`disableSafetyFilter\`, \`disablePromptUpsampling\`, \`stability\`, \`similarityBoost\`, \`style\`, \`speed\`, \`previousText\`, \`nextText\`, \`languageCode\`, \`voiceId\`, \`customVoiceId\`, \`volume\`, \`pitch\`, \`emotion\`, \`channel\`, \`languageBoost\`, \`subtitleEnable\`, and \`englishNormalization\`.

\`\`\`js
const { models } = await ConciergeSDK.media.models();
const imageModel = models.find((model) => model.category === "image");
const started = await ConciergeSDK.media.createImage({
    model: imageModel.modelId,
    prompt: "A compact app card background for a finance calculator",
    aspectRatio: "16:9",
    quality: "high",
    outputFolder: "applets/assets/finance-calculator",
});
const task = await ConciergeSDK.tasks.wait(started.taskId);
const generatedUrl = task.data?.azureUrl || task.data?.url || task.data?.gcsUrl;
\`\`\`

Use \`ConciergeSDK.media.createImage()\`, \`createVideo()\`, \`createMusic()\`, and \`createSpeech()\` as convenience wrappers around \`create()\`. Use \`media.modify()\` or \`media.combine()\` when the applet is deriving new media from existing task results; both call the same \`create()\` pipeline with reference inputs.

#### \`ConciergeSDK.tasks.get(taskId)\`

Fetch task fields such as \`status\`, \`progress\`, \`statusText\`, \`data\`, \`error\`, and \`type\`. Completed \`task.data\` can be a direct string; word-timed VTT may use per-word cues or inline \`<u>\`/\`<c...>\` tags.

#### \`ConciergeSDK.tasks.wait(taskId, options)\`

Poll a task until it completes, fails, is cancelled, or is abandoned. Options: \`intervalMs\` (default \`2000\`), \`timeoutMs\` (default \`600000\`), and \`onProgress(task)\`. Returns the completed task. Failed terminal states throw an error with \`error.task\` attached.

#### \`ConciergeSDK.workspace.prompts.list()\`

List workspace prompts linked to this applet. This is available for applets migrated from legacy workspace applets. Applets without a linked workspace return a clear error.

**Returns:** \`Promise<{ workspaceId: string, prompts: Array }>\`

Each prompt includes:

| Field | Type | Description |
|-------|------|-------------|
| \`_id\` | \`string\` | Prompt ID to pass to \`workspace.prompts.run()\`. |
| \`title\` | \`string\` | Prompt title. |
| \`text\` | \`string\` | Prompt instructions. |
| \`llm\` | \`string|null\` | Configured model ID when set. |
| \`agentMode\` | \`boolean\` | Whether the prompt runs through the workspace agent pathway. |
| \`reasoningEffort\` | \`string|null\` | Optional reasoning effort. |

\`\`\`js
const { prompts } = await ConciergeSDK.workspace.prompts.list();
console.log(prompts.map((prompt) => prompt.title));
\`\`\`

#### \`ConciergeSDK.workspace.prompts.run(options)\`

Run a linked workspace prompt by prompt ID. The call preserves the legacy workspace prompt behavior, including workspace system prompt, prompt model, agent mode, reasoning effort, prompt-attached files, request files, and citations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`options.promptId\` | \`string\` | Yes | Prompt ID from \`workspace.prompts.list()\`. |
| \`options.input\` | \`string\` | No | User input for the prompt. |
| \`options.files\` | \`Array\` | No | Files to include with the run. |
| \`options.chatHistory\` | \`Array\` | No | Full conversation history when needed. |
| \`options.systemPrompt\` | \`string\` | No | Optional system prompt override when the workspace has no system prompt. |

**Returns:** \`Promise<{ output: string, citations: Array, metadata: Object }>\`

\`\`\`js
const result = await ConciergeSDK.workspace.prompts.run({
    promptId: "663f...",
    input: "Summarize this for the morning brief.",
});
document.getElementById("output").textContent = JSON.stringify({
    markdown: result.output,
    citations: result.citations || [],
});
\`\`\`

For rich output inside Concierge, render SDK Markdown through the native sandbox bridge:

\`\`\`html
<pre id="output" class="llm-output"></pre>
\`\`\`

Set that element's \`textContent\` to JSON with \`markdown\` (or \`output\`) and \`citations\`. The host app renders it with Concierge's chat Markdown renderer, including citation popovers. Use a third-party Markdown renderer only when the applet needs to run outside Concierge.

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

### Choosing Applet Storage

| Need | Use |
|------|-----|
| Small private JSON for the current user only, such as preferences, filters, draft inputs, progress, or selected IDs | \`ConciergeSDK.data\` |
| Small shared JSON every user of the applet should see, such as collaborative workspace state or shared settings | \`ConciergeSDK.sharedData\` |
| Shared durable files that belong to the applet itself, such as bundled source data, templates, fixtures, or exported reports everyone should see | Applet files in the applet workspace/file system |
| Private durable files for the current user, such as uploaded transcripts, extracted VTT/SRT segments, search indexes, user-specific exports, or large generated state | \`ConciergeSDK.files\` applet-user files |

Large data does not belong in \`data\` or \`sharedData\`. Store shared large assets as applet files. Store current-user large assets with \`ConciergeSDK.files\`. IndexedDB or localStorage can be a browser-local cache or offline fallback, but should not be the only durable copy of important data.

#### \`ConciergeSDK.data.get(key?)\`

Load one stored key or all key-value data for **this applet and the current user**. Persists across sessions.

**Returns:** \`Promise<any>\` when \`key\` is provided, or \`Promise<Object>\` for the merged key-value store when omitted. Missing single-key reads resolve to \`undefined\`.

**Requires:** \`<meta name="applet-id" content="<applet MongoDB id>">\` in the document (see **Applet ID** below).

#### \`ConciergeSDK.data.set(key, value)\`

Store one per-user key. Values must be JSON-serializable and small. Concierge stores each key independently and rejects individual values over 2MB. Use applet files or \`ConciergeSDK.files\` applet-user files for large uploaded transcripts, extracted segment arrays, media metadata, or other datasets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`key\` | \`string\` | Yes | Non-empty string. Avoid \`$\` prefix and dots in keys (MongoDB field rules). |
| \`value\` | \`any\` | Yes | Any JSON-serializable value. |

**Returns:** \`Promise<Object>\` — the **full** updated data object after this write.

\`\`\`js
const all = await ConciergeSDK.data.set("settings", { theme: "dark" });
console.log(all.settings.theme);

const settings = await ConciergeSDK.data.get("settings");
\`\`\`

#### \`ConciergeSDK.sharedData.get(key)\`

Load one revision-protected JSON value shared across users of the same applet. Use this for shared workspace state. Do not use \`ConciergeSDK.data\` for collaborative/shared state; \`data\` is intentionally per-current-user. Do not use \`sharedData\` for large blobs or bulky extracted datasets.

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

List applet-user files stored for this applet and the current user. Use this for private durable data that is too large for \`ConciergeSDK.data\`, such as uploaded transcripts, extracted segments, search indexes, and user-specific exports.

**Returns:** \`Promise<Array>\` — file metadata objects (e.g. \`originalName\`, \`size\`, \`mimeType\`, \`_id\`).

#### \`ConciergeSDK.files.upload(file)\`

Upload a browser \`File\` (from \`<input type="file">\` or \`new File(...)\`) to the current user's applet-user file store.

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

- **Stateless direct model calls**: \`models.executePrompt\` does not use the user's personal agent, tools, connectors, or memory. To maintain conversation context, pass the full message history in \`messages\`.
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
            // The host sandbox renders this with Concierge's Markdown/citation UI
            document.getElementById("output").textContent = JSON.stringify({
                markdown: response.result,
                citations: response.citations || [],
            });
        }
    </script>
    <button onclick="askAgent()">Ask Agent</button>
    <pre id="output" class="llm-output"></pre>
</body>
</html>
\`\`\`

## Guard Against Double-Loading

The SDK guards against being loaded twice. If \`window.ConciergeSDK\` already exists, the script is a no-op.
`;
