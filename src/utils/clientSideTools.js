// clientSideTools.js
// Definitions for tools that are executed client-side by concierge
// These tools require access to MongoDB or other concierge-specific resources

import { v4 as uuidv4 } from "uuid";
import { AVAILABLE_PAGES, validatePath } from "./pageRoutes";
import { loadSkill } from "./skills";
import {
    launchAppletGeneration,
    registerCanvasAppletFromWorkspaceFile,
} from "./appletGeneration";
import {
    getActiveAppletSandbox,
    inspectApplet,
    requireActiveAppletDocument,
} from "./activeAppletSandbox";
import { MCP_PRESETS } from "./mcpPresets";
import config from "../../config";
import { uploadFileToMediaHelper } from "./fileUploadUtils";
import { createUserGlobalStorageTarget } from "./storageTargets";
import {
    SKILL_DESCRIPTION_MAX_LENGTH,
    splitSkillSummaryDescription,
} from "./skillDescriptionLimits";

// Route-based tool exclusions
// Maps route patterns to arrays of tool names that should be excluded on those routes
const ROUTE_TOOL_EXCLUSIONS = {
    // Note: applet management tools are contextual chat tools, not global
};

// Driver tools that exercise a running applet. Only useful — and only sensible
// to include in the model's tool list — when an applet is open in the canvas.
// Including them otherwise both pollutes the prompt and risks the model
// calling them with no target available.
const APPLET_DRIVER_TOOL_NAMES = new Set([
    "ClickAppletElement",
    "FillAppletField",
    "QueryAppletDom",
    "WaitForAppletElement",
    "ReadAppletConsole",
    "GetAppletPageSnapshot",
]);

/**
 * Filters client-side tools based on the current route and canvas state
 * @param {string} pathname - The current pathname (e.g., '/workspaces')
 * @param {Array} tools - Array of tool definitions to filter
 * @param {Object|null} canvasContent - Canvas content state (null when canvas is closed)
 * @returns {Array} Filtered array of tools
 */
export function filterToolsByRoute(pathname, tools, canvasContent = null) {
    if (!pathname || !tools) {
        return tools || [];
    }

    // Find matching exclusion rules
    const excludedToolNames = new Set();

    for (const [routePattern, toolNames] of Object.entries(
        ROUTE_TOOL_EXCLUSIONS,
    )) {
        // Check if pathname matches the route pattern exactly or is a subroute
        // For '/workspaces' or '/applets', exclude on both the listing page and all subroutes
        if (
            pathname === routePattern ||
            pathname.startsWith(routePattern + "/")
        ) {
            toolNames.forEach((toolName) => excludedToolNames.add(toolName));
        }
    }

    // Filter out CloseCanvas tool if canvas is not open
    // Canvas is considered open when canvasContent is not null
    if (!canvasContent) {
        excludedToolNames.add("CloseCanvas");
    }

    // Applet driver tools only make sense when an applet is mounted in the
    // canvas; otherwise they pollute the model's tool list and would fail at
    // call time anyway. Detect by canvasContent.appletId (set in chatSlice
    // openCanvas reducer for applet HTML tabs).
    if (!canvasContent?.appletId) {
        APPLET_DRIVER_TOOL_NAMES.forEach((name) => excludedToolNames.add(name));
    }

    // Filter out excluded tools
    if (excludedToolNames.size === 0) {
        return tools;
    }

    return tools.filter((tool) => {
        const toolName = tool.function?.name || tool.name;
        return !excludedToolNames.has(toolName);
    });
}

const NAVIGATE_FOOTER_EN = `For dynamic pages with IDs (like specific chats, prompt collections/workspaces, or published apps), provide the full path with the actual ID/slug. Note: Applets are workspaces, so use /workspaces/:id instead of /applets/:id.`;

const NAVIGATE_FOOTER_AR = `للصفحات الديناميكية (محادثات، مساحات عمل، تطبيقات منشورة)، أرسل المسار كاملاً مع المعرّف أو الـ slug الفعلي. ملاحظة: التطبيقات المصغّرة مرتبطة بمساحات العمل، فاستخدم /workspaces/:id بدلاً من /applets/:id.`;

const NAVIGATE_INTRO_EN = `Navigate the user to any page in Concierge. Use this tool when the user asks to go to a specific page or section of the app (e.g., 'take me to the media page', 'go to my notifications', 'show me the home page').`;

const NAVIGATE_INTRO_AR = `انقل المستخدم إلى أي صفحة في Concierge. استخدم هذه الأداة عندما يطلب الانتقال إلى صفحة أو قسم في التطبيق.`;

const SUBMIT_FEEDBACK_DESC_EN = `Submit product feedback to the Concierge team. This tool is always available. Use it proactively when you notice the user is stuck, a workflow is confusing, something appears broken, or the user explicitly reports an issue or idea. Keep the message concrete and include what happened, where it happened, and any useful reproduction context. If you already have a relevant image URL or image data URL available, attach it. Do not capture the user's screen and do not use this for ordinary task progress updates.`;

const SUBMIT_FEEDBACK_DESC_AR = `أرسل ملاحظات عن المنتج إلى فريق Concierge. هذه الأداة متاحة دائماً. استخدمها بشكل استباقي عندما تلاحظ أن المستخدم عالق، أو أن سير العمل مربك، أو أن شيئاً يبدو معطلاً، أو عندما يذكر المستخدم مشكلة أو فكرة. اجعل الرسالة محددة وتتضمن ما حدث وأين حدث وأي سياق يساعد على إعادة الإنتاج. إذا كان لديك رابط صورة أو بيانات صورة جاهزة وذات صلة، فأرفقها. لا تلتقط شاشة المستخدم ولا تستخدمها لتحديثات التقدم العادية.`;

function buildNavigateAvailablePagesLines(isAr) {
    return AVAILABLE_PAGES.map((page) => {
        const adminBadge = page.adminOnly
            ? isAr
                ? " [للمسؤول فقط]"
                : " [Admin only]"
            : "";
        const paramMatch = page.path.match(/\[(.*?)\]/);
        const paramName = paramMatch ? paramMatch[1] : "parameter";
        const dynamicNote = page.dynamic
            ? isAr
                ? ` (يتطلب ${paramName})`
                : ` (requires ${paramName})`
            : "";
        const desc = isAr
            ? page.descriptionAr || page.description
            : page.description;
        return `- ${page.path}${dynamicNote} — ${desc}${adminBadge}`;
    }).join("\n");
}

/**
 * Global Navigate client tool (used in CLIENT_SIDE_TOOLS and tests).
 */
export function getNavigateClientSideTool() {
    return {
        type: "function",
        icon: "🧭",
        function: {
            name: "Navigate",
            description: `${NAVIGATE_INTRO_EN}

Available pages:
${buildNavigateAvailablePagesLines(false)}

${NAVIGATE_FOOTER_EN}`,
            descriptionAr: `${NAVIGATE_INTRO_AR}

الصفحات المتاحة:
${buildNavigateAvailablePagesLines(true)}

${NAVIGATE_FOOTER_AR}`,
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "The path to navigate to. Must start with '/'. Examples: '/home', '/chat', '/media', '/workspaces/507f1f77bcf86cd799439011', '/apps/my-app-slug'. Do NOT include the domain. Note: Applets are workspaces, so use /workspaces/:id instead of /applets/:id.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message to notify the user about the navigation",
                    },
                },
                required: ["path", "userMessage"],
            },
        },
    };
}

export const CLIENT_SIDE_TOOLS = [
    getNavigateClientSideTool(),
    {
        type: "function",
        icon: "💬",
        function: {
            name: "SubmitFeedback",
            description: SUBMIT_FEEDBACK_DESC_EN,
            descriptionAr: SUBMIT_FEEDBACK_DESC_AR,
            parameters: {
                type: "object",
                properties: {
                    message: {
                        type: "string",
                        description:
                            "Concrete feedback for the Concierge team. Include what happened, why it was difficult, and any useful context.",
                    },
                    category: {
                        type: "string",
                        enum: ["bug", "idea", "question", "other"],
                        description:
                            "Feedback category. Use bug for broken behavior, idea for improvements, question for unclear workflows, and other only when none fit.",
                    },
                    imageUrl: {
                        type: "string",
                        description:
                            "Optional existing image URL to attach when the agent already has relevant visual evidence.",
                    },
                    imageDataUrl: {
                        type: "string",
                        description:
                            "Optional PNG, JPEG, GIF, or WebP data URL to upload and attach when the agent already has relevant visual evidence.",
                    },
                    pageUrl: {
                        type: "string",
                        description:
                            "Optional page URL where the issue happened. Defaults to the current browser URL.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "Short user-facing note explaining that feedback is being submitted.",
                    },
                },
                required: ["message"],
            },
        },
    },
    {
        type: "function",
        icon: "🖼️",
        function: {
            name: "OpenCanvasFile",
            description:
                "Open a workspace HTML file or file reference in the canvas. Articles under /workspace/files/articles/ open in the article editor. Applet files open the matching registered applet; if applet metadata is missing, the existing workspace HTML file is imported as an applet and opened. Generic HTML opens in a preview tab. This tool only opens/materializes canvas state; edit content with the workspace shell.",
            descriptionAr:
                "افتح ملف HTML في اللوحة بجانب نافذة المحادثة. يقبل fileRef أو workspacePath/path أو blobPath أو الرابط أو fileHash/hash من نتائج مجموعة الملفات. ملفات HTML المحفوظة بوسم 'article' أو 'story' أو المخزنة تحت مسار 'articles/' تفتح في محرر المقالات. ملفات تطبيقات HTML الصغيرة تفتح التطبيق المطابق عند وجوده؛ وإذا لم تكن بيانات التطبيق موجودة بعد، يسجل Concierge ملف HTML الموجود في مساحة العمل كتطبيق جديد ويفتحه. ملفات HTML العامة تفتح في تبويب المعاينة.",
            parameters: {
                type: "object",
                properties: {
                    fileRef: {
                        type: "string",
                        description:
                            "Flexible file reference to open: workspacePath like /workspace/files/applets/name.html, blobPath like applets/name.html, URL, filename, or legacy hash.",
                    },
                    workspacePath: {
                        type: "string",
                        description:
                            "Workspace HTML path to open, such as /workspace/files/applets/name.html or /workspace/files/articles/name.html.",
                    },
                    path: {
                        type: "string",
                        description:
                            "Alias for workspacePath when it points to a /workspace/files/... HTML file.",
                    },
                    fileHash: {
                        type: "string",
                        description:
                            "The hash of the file to open (from ListFileCollection or SearchFileCollection results)",
                    },
                    hash: {
                        type: "string",
                        description: "Alias for fileHash.",
                    },
                    blobPath: {
                        type: "string",
                        description:
                            "The blob path of the file (from file collection results). Preferred over fileHash when available.",
                    },
                    url: {
                        type: "string",
                        description:
                            "The URL of the file to open (from file collection results). Required for fetching file content.",
                    },
                    tags: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Optional: Tags associated with the file (from file collection results). Used to determine how to open the file.",
                    },
                    mimeType: {
                        type: "string",
                        description:
                            "Optional: MIME type of the file (e.g., 'text/html', 'image/png', 'application/pdf'). Used to determine how to open the file.",
                    },
                    filename: {
                        type: "string",
                        description:
                            "Optional: Filename of the file (for user-friendly messages)",
                    },
                    hideCanvasChrome: {
                        type: "boolean",
                        description:
                            "Optional and only valid for generic non-applet, non-article HTML files. Defaults to true for generic HTML, opening it as an immersive canvas preview with tabs and menu controls hidden. Pass false to show the normal canvas chrome.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message that describes what you're doing with this tool",
                    },
                },
            },
        },
    },
    {
        type: "function",
        icon: "📝",
        function: {
            name: "CreateArticle",
            description:
                "Create/materialize a new article workspace path and open it in the canvas article editor. Use this when the user asks to write a new story, create a new article, start writing, or open a blank document. The tool returns a workspacePath; write the article HTML to that path using the workspace shell. The canvas follows the workspace file automatically. Pass a `title` whenever you have any sense of the topic so the workspace filename is human-friendly.",
            descriptionAr:
                "افتح اللوحة مع محرر مقال/قصة جديد ويولّد مسار ملف في مساحة العمل. يُنشئ ملفاً جديداً في اللوحة ليكتب المستخدم مقالاً. استخدمها عند طلب «مقال جديد» أو «ابدأ الكتابة». تُرجع الأداة مسار الملف — اكتب HTML المقال إلى هذا المسار بأداة الـ shell للمساحة وستتحدّث اللوحة تلقائياً. مرّر `title` متى كان لديك أي فكرة عن الموضوع ليكون اسم الملف في المساحة مفهوماً.",
            parameters: {
                type: "object",
                properties: {
                    title: {
                        type: "string",
                        description:
                            "Optional working title or topic for the article. Used to generate a friendly workspace filename (e.g. 'World Cup 2026 Recap' → 'world-cup-2026-recap.html'). If omitted, falls back to a generic untitled-article name.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message that describes what you're doing with this tool",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "❌",
        function: {
            name: "CloseCanvas",
            description:
                "Close the canvas (right side of the chat window). Use this tool when the user asks to close the canvas, hide the canvas, close the editor, or dismiss the side panel. This will hide the canvas and clear its content.",
            descriptionAr:
                "أغلق اللوحة (لوحة بجانب الدردشة). استخدمها عند طلب إغلاق اللوحة أو إخفائها أو إغلاق المحرر. يخفي اللوحة ويُفريغ محتواها.",
            parameters: {
                type: "object",
                properties: {
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message that describes what you're doing with this tool",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "⚡",
        function: {
            name: "CreateApplet",
            description:
                "Create a new file-backed applet. For a brand new applet request, strongly prefer prompt to generate a new interactive HTML applet with a live streaming preview. Use workspacePath only to import/register an existing complete HTML workspace file as a new applet. Use exactly one of prompt or workspacePath. You may also provide name to control the applet name. Do not use this tool to edit an already-registered applet; edit its Draft workspace file with the workspace shell, then call SaveAppletDraftAsVersion when the user wants a version checkpoint. If an applet is already active and you intentionally want a separate new applet, pass createNew: true.",
            descriptionAr:
                "أنشئ تطبيقاً مصغّراً مرتبطاً بملف. إمّا عبر prompt لتوليد HTML تفاعلي جديد مع معاينة مباشرة، أو عبر workspacePath لتسجيل ملف HTML موجود في المساحة. استخدم prompt أو workspacePath (واحد فقط). يمكن name للاسم. لا تُحدّث تطبيقاً مسجّلاً مسبقاً — لذلك لديك أدوات التحديث.",
            parameters: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description:
                            "Use this to generate a brand new applet from scratch. Provide a detailed description of the applet's features, layout, functionality, and design requirements.",
                    },
                    workspacePath: {
                        type: "string",
                        description:
                            "Use this instead of prompt to register an existing HTML workspace file as a new applet, for example /workspace/files/applets/my-applet.html.",
                    },
                    name: {
                        type: "string",
                        description:
                            "Optional applet name override. If omitted, a name will be derived from the prompt or the workspace filename.",
                    },
                    createNew: {
                        type: ["boolean", "string"],
                        description:
                            'When an applet is already active, set to true or "createNew" only if the user explicitly wants a separate new applet instead of editing the current one.',
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining what applet you're generating",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🛠️",
        function: {
            name: "CreateSkill",
            description:
                "Create a new user skill with specialized instructions that can be loaded into chat context. Skills are markdown documents that provide detailed guidance for specific tasks. Use this tool when the user asks to create, save, or define a new skill. The tool returns the workspace file paths for the skill directory and SKILL.md file. After creation, you can read or edit SKILL.md and place additional supporting files in the skill directory using the workspace shell (e.g., example configs, templates, reference docs).",
            descriptionAr:
                "أنشئ مهارة مستخدم جديدة بتعليمات تُحمّل في سياق الدردشة. المهارات بصيغة Markdown. استخدمها عند «إنشاء مهارة». تُرجع مسارات مجلد المهارة وملف SKILL.md. بعد الإنشاء يمكنك تعديل SKILL.md وإضافة ملفات داعمة عبر shell المساحة.",
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description:
                            "Unique skill name. Must be lowercase alphanumeric with hyphens only (e.g., 'my-skill', 'code-review'). Max 64 characters.",
                    },
                    description: {
                        type: "string",
                        description: `A short summary the AI uses to decide when to load this skill. Maximum ${SKILL_DESCRIPTION_MAX_LENGTH} characters stored in the catalog; longer text can be inlined at the top of SKILL.md automatically when missing details would lose important context.`,
                    },
                    content: {
                        type: "string",
                        description:
                            "The full skill content in Markdown format. This should contain detailed instructions, guidelines, examples, and best practices for the skill's domain.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining what skill you're creating",
                    },
                },
                required: ["name", "description", "content", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "✏️",
        function: {
            name: "EditSkill",
            description:
                "Update an existing user skill's description or content. Use this tool when the user asks to edit, update, modify, or change an existing skill. You can update the description, the content, or both. Cannot rename skills — delete and recreate instead. The tool returns the workspace file paths for the skill directory and SKILL.md file. You can also directly read or edit SKILL.md and manage supporting files in the skill directory using the workspace shell.",
            descriptionAr:
                "حدّث وصف محتوى مهارة مستخدم قائمة. لا يمكن تغيير الاسم — لذلك احذف وأعد الإنشاء. تُرجع مسارات المجلد و SKILL.md. يمكنك تعديل الملفات عبر shell المساحة.",
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description:
                            "The name of the existing skill to update.",
                    },
                    description: {
                        type: "string",
                        description: `Updated short summary (max ${SKILL_DESCRIPTION_MAX_LENGTH} characters stored; overflow is prepended to the top of SKILL.md when needed). Omit to keep the current description.`,
                    },
                    content: {
                        type: "string",
                        description:
                            "Updated skill content in Markdown format. Omit to keep the current content.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining what you're updating",
                    },
                },
                required: ["name", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🤖",
        function: {
            name: "ListAutomations",
            description:
                "List the user's automations, including schedule, enabled state, HTML output settings, latest run pointers, and next run time. Use this before editing or running automations if the user has not provided an exact automation id or slug.",
            descriptionAr:
                "اعرض أتمتات المستخدم، بما في ذلك الجدول وحالة التفعيل وإعدادات HTML وآخر تشغيل ووقت التشغيل التالي. استخدمها قبل التعديل أو التشغيل إن لم يحدد المستخدم معرّف الأتمتة.",
            parameters: {
                type: "object",
                properties: {
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining that you're listing automations",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "📖",
        function: {
            name: "ReadAutomation",
            description:
                "Read one automation by id or slug, including its AUTOMATION.md content and supporting file list. Use this before making changes so you preserve existing instructions and configuration.",
            descriptionAr:
                "اقرأ أتمتة واحدة بالمعرّف أو الاسم المختصر، بما في ذلك محتوى AUTOMATION.md وقائمة الملفات الداعمة. استخدمها قبل التعديل للحفاظ على التعليمات والإعدادات الحالية.",
            parameters: {
                type: "object",
                properties: {
                    idOrSlug: {
                        type: "string",
                        description:
                            "The automation id or slug, for example 'weekly-digest'.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining what automation you're reading",
                    },
                },
                required: ["idOrSlug", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🧩",
        function: {
            name: "CreateAutomation",
            description:
                "Create a new scheduled AI automation. Automations are skill-like workspaces with a main AUTOMATION.md file, optional supporting files, schedules, run history, and optional HTML output. Supporting files are not uploaded by this tool; after creation, use the returned automationDirectory path to add files via the workspace shell if needed.",
            descriptionAr:
                "أنشئ أتمتة ذكاء اصطناعي مجدولة. الأتمتات تشبه المهارات ولها ملف AUTOMATION.md وملفات داعمة اختيارية وجدول وسجل تشغيل ومخرجات HTML اختيارية. لا ترفع هذه الأداة الملفات الداعمة؛ استخدم مسار automationDirectory لإضافة الملفات عبر shell عند الحاجة.",
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Display name for the automation.",
                    },
                    slug: {
                        type: "string",
                        description:
                            "Optional unique slug. Lowercase letters, numbers, and hyphens only. If omitted, it is derived from name.",
                    },
                    description: {
                        type: "string",
                        description:
                            "Short description of what the automation does.",
                    },
                    content: {
                        type: "string",
                        description:
                            "Full AUTOMATION.md Markdown instructions. Include what to do, what files or inputs to use, and the desired output format.",
                    },
                    enabled: {
                        type: "boolean",
                        description:
                            "Whether scheduled execution should be enabled immediately.",
                    },
                    schedule: {
                        type: "object",
                        description:
                            "Schedule object. frequency is one of manual, hourly, daily, weekly. Optional fields: interval, time as HH:mm, times as HH:mm[], dayOfWeek 0-6, daysOfWeek 0-6[], hourlyMode 'interval' or 'clock', and minute 0-59 for clock-aligned hourly runs.",
                    },
                    timezone: {
                        type: "string",
                        description:
                            "IANA timezone, for example 'Asia/Riyadh' or 'America/New_York'. Defaults to UTC if omitted.",
                    },
                    producesHtml: {
                        type: "boolean",
                        description:
                            "Whether runs should produce a stored HTML document.",
                    },
                    pinnedToSidebar: {
                        type: "boolean",
                        description:
                            "For HTML-producing automations, whether to pin the latest result in the sidebar.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining what automation you're creating",
                    },
                },
                required: ["name", "description", "content", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🛠️",
        function: {
            name: "UpdateAutomation",
            description:
                "Update an existing automation's configuration or AUTOMATION.md content. Use ReadAutomation first unless the user supplied exact replacement content. Omitted fields are preserved. Use this to enable/disable schedules, change cadence, toggle HTML output, or pin/unpin from the sidebar.",
            descriptionAr:
                "حدّث إعدادات أتمتة موجودة أو محتوى AUTOMATION.md. استخدم ReadAutomation أولاً ما لم يزوّد المستخدم محتوى بديلاً كاملاً. الحقول غير المرسلة تبقى كما هي.",
            parameters: {
                type: "object",
                properties: {
                    idOrSlug: {
                        type: "string",
                        description: "The automation id or slug to update.",
                    },
                    name: {
                        type: "string",
                        description: "Updated display name.",
                    },
                    description: {
                        type: "string",
                        description: "Updated short description.",
                    },
                    content: {
                        type: "string",
                        description:
                            "Updated full AUTOMATION.md content. Omit to keep existing content.",
                    },
                    enabled: {
                        type: "boolean",
                        description: "Updated enabled state.",
                    },
                    schedule: {
                        type: "object",
                        description:
                            "Updated schedule object. frequency is one of manual, hourly, daily, weekly. Supports times[], daysOfWeek[], hourlyMode, and minute.",
                    },
                    timezone: {
                        type: "string",
                        description: "Updated IANA timezone.",
                    },
                    producesHtml: {
                        type: "boolean",
                        description:
                            "Whether future runs should produce HTML output.",
                    },
                    pinnedToSidebar: {
                        type: "boolean",
                        description:
                            "Whether the latest HTML output should be pinned in the sidebar.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining what you're updating",
                    },
                },
                required: ["idOrSlug", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "▶️",
        function: {
            name: "RunAutomation",
            description:
                "Start a manual run of an automation through the existing Concierge task worker pipeline. Returns a task id that can be used to inspect run status and output.",
            descriptionAr:
                "ابدأ تشغيلًا يدويًا لأتمتة عبر نظام مهام Concierge. تُرجع معرّف مهمة يمكن استخدامه لمتابعة الحالة والمخرجات.",
            parameters: {
                type: "object",
                properties: {
                    idOrSlug: {
                        type: "string",
                        description: "The automation id or slug to run.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining what automation you're running",
                    },
                },
                required: ["idOrSlug", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🗑️",
        function: {
            name: "DeleteAutomation",
            description:
                "Delete an automation and its stored files. Use only when the user clearly asks to delete an automation.",
            descriptionAr:
                "احذف أتمتة وملفاتها المخزنة. استخدمها فقط عندما يطلب المستخدم حذف الأتمتة بوضوح.",
            parameters: {
                type: "object",
                properties: {
                    idOrSlug: {
                        type: "string",
                        description: "The automation id or slug to delete.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining what automation you're deleting",
                    },
                },
                required: ["idOrSlug", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🖱️",
        function: {
            name: "ClickAppletElement",
            description:
                "Click an element inside the applet currently open in the canvas, so you can exercise its UI like a user would. Use this to drive flows the user described (e.g. 'try the submit button', 'open the settings menu'). Combine with QueryAppletDom or GetAppletPageSnapshot first if you do not already know a good selector. After clicking, use ReadAppletConsole or GetAppletPageSnapshot to see what happened. Only available when an applet is open in the canvas.",
            descriptionAr:
                "انقر على عنصر داخل التطبيق المفتوح حالياً في اللوحة لمحاكاة تفاعل المستخدم. استخدمها لتجربة المسارات التي طلبها المستخدم (مثل «جرّب زر الإرسال»). استخدم QueryAppletDom أو GetAppletPageSnapshot أولاً لمعرفة محدد جيد، ثم ReadAppletConsole أو GetAppletPageSnapshot لرؤية النتيجة. تتوفر فقط عند فتح تطبيق في اللوحة.",
            parameters: {
                type: "object",
                properties: {
                    selector: {
                        type: "string",
                        description:
                            "CSS selector for the target element (e.g. 'button.submit', '#login', '[data-testid=\"save\"]').",
                    },
                    text: {
                        type: "string",
                        description:
                            "Optional. If multiple elements match the selector, pick the first whose visible text contains this string (case-insensitive). Useful for disambiguating buttons by label.",
                    },
                    nth: {
                        type: "integer",
                        description:
                            "Optional 0-based index when the selector matches multiple elements. Ignored if `text` is provided. Defaults to 0.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "Short user-facing note explaining what you are clicking and why.",
                    },
                },
                required: ["selector", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "⌨️",
        function: {
            name: "FillAppletField",
            description:
                "Set the value of an input, textarea, select, or contenteditable element in the applet currently open in the canvas, dispatching the input+change events that React/Vue/vanilla handlers listen for. Use this to fill out forms before clicking submit, or to exercise validation. Only available when an applet is open in the canvas.",
            descriptionAr:
                "عيّن قيمة حقل input أو textarea أو select أو عنصر contenteditable في التطبيق المفتوح، مع إطلاق أحداث input+change ليلتقطها React/Vue/JS العادي. استخدمها لتعبئة النماذج قبل الإرسال أو لاختبار التحقق. تتوفر فقط عند فتح تطبيق في اللوحة.",
            parameters: {
                type: "object",
                properties: {
                    selector: {
                        type: "string",
                        description:
                            "CSS selector for the target field (e.g. 'input[name=\"email\"]', '#message', 'textarea').",
                    },
                    value: {
                        type: "string",
                        description:
                            "The value to set. For checkboxes/radios, pass 'true' or 'false'. For selects, pass the option value (or visible text if the option value matches).",
                    },
                    nth: {
                        type: "integer",
                        description:
                            "Optional 0-based index when the selector matches multiple fields. Defaults to 0.",
                    },
                    submit: {
                        type: "boolean",
                        description:
                            "If true and the field is inside a <form>, submits the form after setting the value. Defaults to false.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "Short user-facing note explaining what you are filling and why.",
                    },
                },
                required: ["selector", "value", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🔎",
        function: {
            name: "QueryAppletDom",
            description:
                "Run a CSS selector against the applet currently open in the canvas and return a structured summary of the matches (tag, visible text, key attributes, value if it is a form field, bounding-box visibility). Use this to discover the right selector before ClickAppletElement or FillAppletField, or to assert something rendered correctly after an action. Only available when an applet is open in the canvas.",
            descriptionAr:
                "نفّذ محدد CSS على التطبيق المفتوح وأعد ملخصاً منظماً للنتائج (الوسم، النص الظاهر، أهم الخصائص، القيمة إن كان حقلاً، حالة الظهور). استخدمها لاكتشاف المحدد الصحيح قبل ClickAppletElement أو FillAppletField، أو للتأكد من ظهور شيء بعد إجراء. تتوفر فقط عند فتح تطبيق في اللوحة.",
            parameters: {
                type: "object",
                properties: {
                    selector: {
                        type: "string",
                        description:
                            "CSS selector to evaluate (e.g. 'button', '[role=\"dialog\"] input', '.error-message').",
                    },
                    limit: {
                        type: "integer",
                        description:
                            "Maximum number of matches to return details for. Defaults to 10, capped at 50.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "Short user-facing note explaining what you are inspecting.",
                    },
                },
                required: ["selector", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "⏱️",
        function: {
            name: "WaitForAppletElement",
            description:
                "Poll the applet currently open in the canvas until a CSS selector matches at least one element (or, if `gone: true`, until no element matches). Use this between an action and the next assertion when the applet does async work (network calls, animations, route changes). Only available when an applet is open in the canvas.",
            descriptionAr:
                "انتظر داخل التطبيق المفتوح حتى يطابق محدد CSS عنصراً واحداً على الأقل (أو حتى يختفي إذا كانت gone=true). استخدمها بين الإجراء والتأكد عندما يقوم التطبيق بعمل غير متزامن (طلبات شبكة، حركات، تنقّل). تتوفر فقط عند فتح تطبيق في اللوحة.",
            parameters: {
                type: "object",
                properties: {
                    selector: {
                        type: "string",
                        description: "CSS selector to wait for.",
                    },
                    gone: {
                        type: "boolean",
                        description:
                            "If true, wait for the selector to STOP matching (e.g. a loading spinner to disappear). Defaults to false.",
                    },
                    timeoutMs: {
                        type: "integer",
                        description:
                            "How long to wait before giving up. Defaults to 5000ms; capped at 15000ms.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "Short user-facing note explaining what you are waiting for.",
                    },
                },
                required: ["selector", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🪵",
        function: {
            name: "ReadAppletConsole",
            description:
                "Read recent console.{log,info,warn,error} entries, uncaught errors, and failing network requests captured from the applet currently open in the canvas. Use this after exercising the applet to diagnose what went wrong, or to confirm an action succeeded. Pass `clear: true` to wipe the buffer first so the next read shows only events from the next action. Only available when an applet is open in the canvas.",
            descriptionAr:
                "اقرأ آخر مدخلات console.{log,info,warn,error} والأخطاء غير الملتقطة وطلبات الشبكة الفاشلة من التطبيق المفتوح. استخدمها بعد التجربة لتشخيص ما حدث أو للتأكد من نجاح إجراء. مرّر clear=true لمسح المخزن أولاً ليعرض القراءة التالية أحداث الإجراء التالي فقط. تتوفر فقط عند فتح تطبيق في اللوحة.",
            parameters: {
                type: "object",
                properties: {
                    clear: {
                        type: "boolean",
                        description:
                            "If true, clears the SDK's console + network buffer AFTER reading, so the next call only shows newer entries. Defaults to false.",
                    },
                    levels: {
                        type: "array",
                        items: {
                            type: "string",
                            enum: ["log", "info", "warn", "error"],
                        },
                        description:
                            "Optional filter — only return console entries of these levels. Defaults to all four.",
                    },
                    limit: {
                        type: "integer",
                        description:
                            "Maximum number of console entries to return (most recent first). Defaults to 50, capped at 200.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "Short user-facing note explaining what you are checking the console for.",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "📋",
        function: {
            name: "GetAppletPageSnapshot",
            description:
                "Get a one-shot summary of the applet currently open in the canvas: page title, URL/hash, an outline of headings and buttons, current values of form fields, and the most recent console errors. Use this to orient yourself before taking actions, or as a cheap 'what does the user see right now?' check. Only available when an applet is open in the canvas.",
            descriptionAr:
                "احصل على ملخص فوري للتطبيق المفتوح في اللوحة: عنوان الصفحة، الرابط/الـ hash، مخطط العناوين والأزرار، قيم حقول النماذج، وآخر أخطاء console. استخدمها للتعرّف على الحالة قبل التصرف أو كفحص سريع لما يراه المستخدم. تتوفر فقط عند فتح تطبيق في اللوحة.",
            parameters: {
                type: "object",
                properties: {
                    includeText: {
                        type: "boolean",
                        description:
                            "If true, include a truncated dump of visible body text (~2000 chars). Defaults to false to keep the response compact.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "Short user-facing note explaining why you are snapshotting the applet.",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🌐",
        function: {
            name: "ViewAutomationHtml",
            description:
                "Navigate the user to an automation's rendered HTML output. Use taskId 'latest' to open the latest successful HTML output, or a specific run task id to view a historical result.",
            descriptionAr:
                "انقل المستخدم إلى مخرجات HTML المعروضة لأتمتة. استخدم taskId بالقيمة latest لفتح أحدث نتيجة، أو معرّف مهمة محدد لنتيجة قديمة.",
            parameters: {
                type: "object",
                properties: {
                    idOrSlug: {
                        type: "string",
                        description:
                            "The automation id or slug whose HTML output should be opened.",
                    },
                    taskId: {
                        type: "string",
                        description:
                            "The run task id to open, or 'latest'. Defaults to 'latest'.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message explaining what HTML result you're opening",
                    },
                },
                required: ["idOrSlug", "userMessage"],
            },
        },
    },
];

// MIME type mapping for file extensions
// Used by OpenCanvasFile tool to infer MIME type from filename
const MIME_TYPE_MAP = {
    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
    // HTML
    html: "text/html",
    htm: "text/html",
    // Other common types
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
};

function getWorkspacePathFromBlobPath(blobPath) {
    if (!blobPath || typeof blobPath !== "string") return null;
    return `/workspace/files/${blobPath.replace(/^\/+/, "")}`;
}

function getBlobPathFromWorkspacePath(workspacePath) {
    if (
        !workspacePath ||
        typeof workspacePath !== "string" ||
        !workspacePath.startsWith("/workspace/files/")
    ) {
        return null;
    }

    return workspacePath.slice("/workspace/files/".length).replace(/^\/+/, "");
}

function getBlobPathFromUrl(url) {
    if (!url || typeof url !== "string") return null;

    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split("/").filter(Boolean);
        if (segments.length < 2) return null;
        return segments.slice(1).join("/");
    } catch {
        return null;
    }
}

function getFilenameFromRef(ref) {
    if (!ref || typeof ref !== "string") return null;

    try {
        const parsed = new URL(ref);
        const segments = parsed.pathname.split("/").filter(Boolean);
        return decodeURIComponent(segments.at(-1) || "") || null;
    } catch {
        const cleaned = ref.split("?")[0].replace(/\/+$/, "");
        return (
            decodeURIComponent(
                cleaned.split("/").filter(Boolean).at(-1) || "",
            ) || null
        );
    }
}

async function readWorkspaceHtmlForCanvas(workspacePath) {
    if (!workspacePath) return null;

    const params = new URLSearchParams({ path: workspacePath });
    const response = await fetch(`/api/workspace/file?${params}`);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch HTML from workspace (${response.status})`,
        );
    }

    const html = await response.text();
    if (!html) {
        throw new Error("Empty file content from workspace");
    }

    return html;
}

function looksLikeUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
}

function normalizeOpenCanvasFileArgs(toolInfo) {
    const args = toolInfo.toolArgs || toolInfo.args || toolInfo || {};
    const fileRef =
        args.fileRef ||
        args.file ||
        args.reference ||
        args.workspacePath ||
        args.path ||
        null;
    const rawPath = args.workspacePath || args.path || fileRef;
    const workspacePath =
        typeof rawPath === "string" && rawPath.startsWith("/workspace/files/")
            ? rawPath
            : null;
    const url = args.url || (looksLikeUrl(fileRef) ? fileRef : null);
    const blobPath =
        args.blobPath ||
        getBlobPathFromWorkspacePath(workspacePath) ||
        getBlobPathFromUrl(url) ||
        (typeof fileRef === "string" &&
        !looksLikeUrl(fileRef) &&
        !fileRef.startsWith("/workspace/files/") &&
        fileRef.includes("/")
            ? fileRef.replace(/^\/+/, "")
            : null);
    const fileHash = args.fileHash || args.hash || null;
    const filename =
        args.filename ||
        getFilenameFromRef(workspacePath) ||
        getFilenameFromRef(blobPath) ||
        getFilenameFromRef(url) ||
        getFilenameFromRef(fileRef) ||
        "file";

    return {
        fileHash,
        blobPath,
        fileUrl: url,
        workspacePath: workspacePath || getWorkspacePathFromBlobPath(blobPath),
        tags: args.tags || [],
        mimeType: args.mimeType || "",
        filename,
        hideCanvasChrome: args.hideCanvasChrome !== false,
        userMessage: args.userMessage,
        name: args.name,
    };
}

export async function resolveCanvasAppletForFile({
    fileHash,
    blobPath,
    workspacePath: providedWorkspacePath,
    filename,
}) {
    try {
        const response = await fetch("/api/canvas-applets");
        if (!response.ok) return null;
        const data = await response.json();
        const applets = Array.isArray(data?.applets) ? data.applets : [];
        const workspacePath =
            providedWorkspacePath || getWorkspacePathFromBlobPath(blobPath);

        return (
            applets.find((applet) => {
                const id = applet?._id;
                if (!id) return false;
                return (
                    (fileHash && applet.fileHash === fileHash) ||
                    (blobPath && applet.fileBlobPath === blobPath) ||
                    (workspacePath && applet.workspacePath === workspacePath) ||
                    (filename && applet.fileBlobPath === filename)
                );
            }) || null
        );
    } catch (error) {
        console.warn("OpenCanvasFile: failed to resolve applet file", error);
        return null;
    }
}

// Helper function to wait for streaming to complete using event-driven approach (no polling!)
function waitForStreamingCompletion(context) {
    const { isStreaming, queryClient, chatId } = context || {};

    // If we don't have the necessary context, return a promise that resolves quickly
    if (!queryClient || !chatId) {
        console.log(
            "[Navigate Tool] No queryClient or chatId available, proceeding immediately",
        );
        return Promise.resolve();
    }

    // If not streaming, navigate immediately
    if (!isStreaming) {
        console.log(
            "[Navigate Tool] Not currently streaming, proceeding immediately",
        );
        return Promise.resolve();
    }

    console.log(
        "[Navigate Tool] Streaming in progress, waiting for completion event...",
    );

    // Return a promise that resolves when streaming completes
    // We watch the query cache for when the chat data updates and streaming is complete
    return new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                console.warn(
                    "[Navigate Tool] Timeout waiting for stream completion (10s) - proceeding anyway",
                );
                cleanup();
                resolve();
            }
        }, 10000); // 10 second safety timeout

        const handleComplete = () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.log(
                    "[Navigate Tool] Stream completion detected, proceeding with navigation",
                );
                cleanup();
                // Small delay to ensure refetch has completed
                setTimeout(() => resolve(), 300);
            }
        };

        // Listen for the custom event dispatched when streaming completes
        const handleStreamComplete = (e) => {
            if (e.detail?.chatId === String(chatId)) {
                handleComplete();
            }
        };
        window.addEventListener("streamComplete", handleStreamComplete);

        // Also watch query cache as a fallback for when chat data updates and streaming completes
        // The useStreamingMessages hook refetches when "complete" is received, which updates the cache
        const unwatch = queryClient.getQueryCache().subscribe((event) => {
            if (resolved) return;

            // Check if this is an update to our chat query
            const query = event?.query;
            if (
                query?.queryKey?.[0] === "chat" &&
                query?.queryKey?.[1] === String(chatId)
            ) {
                const chatData = query.state?.data;
                if (chatData) {
                    // Check if streaming has completed:
                    // 1. isChatLoading should be false
                    // 2. No messages should have isStreaming flag
                    if (!chatData.isChatLoading) {
                        const messages = chatData.messages || [];
                        const hasStreamingMessage = messages.some(
                            (m) => m.isStreaming === true,
                        );
                        if (!hasStreamingMessage) {
                            handleComplete();
                        }
                    }
                }
            }
        });

        const cleanup = () => {
            window.removeEventListener("streamComplete", handleStreamComplete);
            if (unwatch) unwatch();
        };

        // Also check current state immediately in case it already completed
        const currentData = queryClient.getQueryData(["chat", String(chatId)]);
        if (currentData && !currentData.isChatLoading) {
            const messages = currentData.messages || [];
            const hasStreamingMessage = messages.some(
                (m) => m.isStreaming === true,
            );
            if (!hasStreamingMessage) {
                handleComplete();
            }
        }
    });
}

function getToolArg(toolInfo, name, fallback = undefined) {
    if (
        toolInfo?.toolArgs &&
        Object.prototype.hasOwnProperty.call(toolInfo.toolArgs, name)
    ) {
        return toolInfo.toolArgs[name];
    }
    if (Object.prototype.hasOwnProperty.call(toolInfo || {}, name)) {
        return toolInfo[name];
    }
    return fallback;
}

function getDataUrlImageExtension(mimeType) {
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/gif") return "gif";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
    return null;
}

function dataUriToBlob(dataUri) {
    const match = String(dataUri).match(
        /^data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i,
    );

    if (!match) {
        throw new Error(
            "imageDataUrl must be a valid base64 PNG, JPEG, GIF, or WebP data URL.",
        );
    }

    const mimeType = match[1].toLowerCase();
    const extension = getDataUrlImageExtension(mimeType);
    const data = match[2].replace(/\s/g, "");
    let byteString;

    try {
        byteString = atob(data);
    } catch {
        throw new Error("imageDataUrl contains invalid base64 image data.");
    }

    const buffer = new Uint8Array(byteString.length);

    for (let i = 0; i < byteString.length; i++) {
        buffer[i] = byteString.charCodeAt(i);
    }

    return {
        blob: new Blob([buffer], { type: mimeType }),
        extension,
    };
}

async function uploadFeedbackImage(dataUrl, context = {}) {
    const { blob, extension } = dataUriToBlob(dataUrl);
    const file = new File([blob], `agent-feedback-image.${extension}`, {
        type: blob.type,
    });
    const userContextId = context.user?.contextId;

    return uploadFileToMediaHelper(file, {
        storageTarget: userContextId
            ? createUserGlobalStorageTarget(userContextId)
            : null,
        checkHash: false,
        serverUrl: config.endpoints.mediaHelper(context.serverUrl || ""),
    });
}

async function fetchJsonOrThrow(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
}

function automationWorkspacePaths(userContextId, slug) {
    const automationDirectory = userContextId
        ? `/workspace/files/users/${userContextId}/automations/${slug}`
        : null;
    return {
        automationDirectory,
        automationMdPath: automationDirectory
            ? `${automationDirectory}/AUTOMATION.md`
            : null,
    };
}

function buildAutomationPayload(toolInfo, allowedFields) {
    const payload = {};
    for (const field of allowedFields) {
        const value = getToolArg(toolInfo, field);
        if (value !== undefined) {
            payload[field] = value;
        }
    }
    return payload;
}

// Handler functions for each client-side tool
// Note: Handlers receive (toolInfo, context) where context contains { router, dispatch, isStreaming, queryClient, chatId }
export const CLIENT_SIDE_TOOL_HANDLERS = {
    submitfeedback: async (toolInfo, context = {}) => {
        const message = String(getToolArg(toolInfo, "message", "")).trim();

        if (!message) {
            throw new Error("Feedback message is required.");
        }

        const category = getToolArg(toolInfo, "category", "other");
        const normalizedCategory = [
            "bug",
            "idea",
            "question",
            "other",
        ].includes(category)
            ? category
            : "other";
        const imageDataUrl = getToolArg(toolInfo, "imageDataUrl");
        let imageUrl = getToolArg(toolInfo, "imageUrl") || null;

        if (!imageUrl && imageDataUrl) {
            const uploadResult = await uploadFeedbackImage(
                imageDataUrl,
                context,
            );
            imageUrl = uploadResult?.url || null;
        }

        const pageUrl =
            getToolArg(toolInfo, "pageUrl") ||
            (typeof window !== "undefined" ? window.location.href : undefined);
        const userAgent =
            typeof navigator !== "undefined" ? navigator.userAgent : undefined;

        const data = await fetchJsonOrThrow("/api/feedback", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message,
                category: normalizedCategory,
                screenshot: imageUrl,
                pageUrl,
                userAgent,
                source: "agent",
            }),
        });

        return {
            success: true,
            data: {
                feedbackId: data.feedbackId,
                category: normalizedCategory,
                imageUrl,
                pageUrl,
                description: imageUrl
                    ? "Feedback submitted with an attached image."
                    : "Feedback submitted.",
            },
        };
    },

    navigate: async (toolInfo, context) => {
        const { router, dispatch } = context || {};

        if (!router) {
            throw new Error("Router not available in tool context");
        }

        if (!dispatch) {
            throw new Error("Redux dispatch not available in tool context");
        }

        // Get path from tool parameters (can be in toolArgs or at top level)
        let path = toolInfo.toolArgs?.path || toolInfo.path;

        if (!path) {
            console.error("Missing path in toolInfo:", toolInfo);
            throw new Error(
                "Navigation path is required. Please provide a valid path starting with '/' (e.g., '/home', '/chat', '/workspaces'). Note: Applets are workspaces, so use /workspaces/:id instead of /applets/:id.",
            );
        }

        // Validate path starts with /
        if (!path.startsWith("/")) {
            throw new Error(
                `Invalid path format: "${path}". Path must start with '/' (e.g., '/home', '/chat').`,
            );
        }

        // Convert /applets/:id paths to /workspaces/:id (applets are workspaces)
        if (path.startsWith("/applets/")) {
            path = path.replace(/^\/applets\//, "/workspaces/");
            console.log(`[Navigate Tool] Converted /applets/ path to: ${path}`);
        }

        // Validate the path using the page routes utility
        const pageInfo = validatePath(path);

        if (!pageInfo) {
            console.warn(`Navigating to unrecognized path: ${path}`);
            // Still allow navigation but warn about it
        }

        // Check if we're navigating TO the chat page
        const isNavigatingToChat = path.startsWith("/chat");

        // Build a friendly description of where we're going
        let pageDescription = pageInfo?.name || path;

        if (pageInfo) {
            pageDescription = pageInfo.name;

            // Add admin warning if needed
            if (pageInfo.adminOnly) {
                pageDescription += " (Admin only)";
            }
        }

        // Execute navigation asynchronously after streaming completes
        // This ensures the final message is committed before the page changes
        waitForStreamingCompletion(context).then(() => {
            // For non-chat pages, open the sidebar chat before navigation
            // Layout will handle preserving state when navigating to/from /chat
            if (!isNavigatingToChat) {
                dispatch({
                    type: "chat/setChatBoxPosition",
                    payload: { position: "docked" },
                });
            }

            // Add openChat query parameter for non-chat pages
            const pathWithQuery =
                !isNavigatingToChat &&
                (path.includes("?")
                    ? `${path}&openChat=true`
                    : `${path}?openChat=true`);

            // Navigate to the path after a short delay to ensure chat state is updated
            setTimeout(() => {
                router.push(isNavigatingToChat ? path : pathWithQuery);

                if (!isNavigatingToChat) {
                    // Dispatch again after navigation to ensure chat stays open
                    // This handles cases where the page mount logic might close it
                    setTimeout(() => {
                        dispatch({
                            type: "chat/setChatBoxPosition",
                            payload: { position: "docked" },
                        });
                    }, 300);

                    // And one more time with a longer delay to handle slow page loads
                    setTimeout(() => {
                        dispatch({
                            type: "chat/setChatBoxPosition",
                            payload: { position: "docked" },
                        });
                    }, 800);

                    // Focus the chat input after navigation completes
                    setTimeout(() => {
                        dispatch({ type: "chat/focusChatInput" });
                    }, 1200);
                }
            }, 100);
        });

        // Return success (navigation will happen after streaming completes)
        return {
            success: true,
            data: {
                path: path,
                pageName: pageInfo?.name,
                description: `Navigating to **${pageDescription}**${pageInfo?.description ? ` — ${pageInfo.description}` : ""}. ${isNavigatingToChat ? "The full chat page will be displayed." : "The sidebar chat will remain visible."}`,
            },
        };
    },
    openincanvas: async (toolInfo, context) => {
        const { dispatch, user } = context || {};

        if (!dispatch) {
            throw new Error("Redux dispatch not available in tool context");
        }

        const {
            fileHash,
            blobPath,
            fileUrl,
            workspacePath,
            tags,
            mimeType: initialMimeType,
            filename,
            name: requestedName,
            hideCanvasChrome,
        } = normalizeOpenCanvasFileArgs(toolInfo);
        let mimeType = initialMimeType;

        // Infer mimeType from filename extension if not provided
        if (!mimeType && filename) {
            const extension = filename.split(".").pop()?.toLowerCase();
            if (extension && MIME_TYPE_MAP[extension]) {
                mimeType = MIME_TYPE_MAP[extension];
            }
        }

        const isHtmlFile = mimeType.toLowerCase() === "text/html";

        if (!isHtmlFile) {
            throw new Error(
                "OpenCanvasFile only supports HTML files. Use the file preview or file collection for non-HTML files.",
            );
        }

        // Articles live at /workspace/files/articles/<slug>.html. Detect them
        // by blobPath prefix or by an explicit "article"/"story" tag, then
        // open them in the article editor with a workspacePath so the editor
        // can read the file directly. Everything else HTML opens as preview.
        const tagList = Array.isArray(tags)
            ? tags.map((t) => String(t).toLowerCase())
            : [];
        const hasArticleTag =
            tagList.includes("article") || tagList.includes("story");
        const blobUnderArticles =
            typeof blobPath === "string" &&
            blobPath.replace(/^\/+/, "").startsWith("articles/");
        const isArticleFile =
            isHtmlFile && (hasArticleTag || blobUnderArticles);
        // Articles need a blobPath to derive a workspacePath. If the caller
        // tagged the file as an article but omitted blobPath (only fileHash),
        // fall through to the generic HTML preview branch instead of throwing.
        const articleWorkspacePath =
            isArticleFile && typeof blobPath === "string"
                ? `/workspace/files/${blobPath.replace(/^\/+/, "")}`
                : null;

        let canvasPayload;
        let description;

        if (isArticleFile && articleWorkspacePath) {
            canvasPayload = {
                type: "article",
                fileHash: fileHash || null,
                blobPath: blobPath || null,
                filename: filename,
                title: filename,
                workspacePath: articleWorkspacePath,
                workspaceContentVersion: Date.now(),
            };
            description = `Opening **${filename}** in the article editor.`;
        } else if (isHtmlFile) {
            const linkedApplet = await resolveCanvasAppletForFile({
                fileHash,
                blobPath,
                workspacePath,
                filename,
            });
            const shouldRegisterApplet =
                !linkedApplet &&
                typeof workspacePath === "string" &&
                workspacePath.startsWith("/workspace/files/applets/");
            const registeredApplet = shouldRegisterApplet
                ? await registerCanvasAppletFromWorkspaceFile({
                      workspacePath,
                      appletName: requestedName,
                      userContextId: user?.contextId || null,
                  })
                : null;
            const appletTitle =
                registeredApplet?.appletName || linkedApplet?.name || filename;
            const resolvedWorkspacePath =
                registeredApplet?.workspacePath ||
                linkedApplet?.workspacePath ||
                workspacePath;
            const resolvedAppletId =
                registeredApplet?.appletId ||
                (linkedApplet?._id ? String(linkedApplet._id) : null);
            const resolvedFileUrl =
                registeredApplet?.applet?.filePath ||
                linkedApplet?.filePath ||
                fileUrl;
            const inlineHtml =
                !registeredApplet && !resolvedFileUrl && resolvedWorkspacePath
                    ? await readWorkspaceHtmlForCanvas(resolvedWorkspacePath)
                    : null;

            canvasPayload = {
                type: "html",
                fileHash: fileHash,
                blobPath: blobPath,
                filename: filename,
                title: appletTitle,
                url: resolvedFileUrl,
                htmlContent: registeredApplet?.html || inlineHtml || undefined,
                workspacePath: resolvedWorkspacePath,
                appletId: resolvedAppletId,
                canvasChrome:
                    hideCanvasChrome && !registeredApplet && !linkedApplet
                        ? "hidden"
                        : undefined,
            };
            description = registeredApplet
                ? `Registered and opened **${appletTitle}** as a new applet.`
                : linkedApplet
                  ? `Opening **${appletTitle}** in the canvas.`
                  : `Opening **${filename}** in the canvas.`;
        }

        // Wait for streaming to complete before opening canvas to prevent message loss
        // This ensures the response message is fully streamed before tab switching occurs
        waitForStreamingCompletion(context).then(() => {
            // Open the canvas after streaming completes
            dispatch({
                type: "chat/openCanvas",
                payload: canvasPayload,
            });

            // Ensure canvas is visible (triggers tab switch on mobile)
            dispatch({
                type: "chat/setCanvasVisibility",
                payload: true,
            });
        });

        // Return success immediately (canvas will open after streaming completes)
        return {
            success: true,
            data: {
                fileHash: fileHash,
                blobPath: blobPath,
                filename: filename,
                description: description,
            },
        };
    },
    createnewstory: async (toolInfo, context) => {
        const { dispatch } = context || {};

        if (!dispatch) {
            throw new Error("Redux dispatch not available in tool context");
        }

        const titleArg = toolInfo.toolArgs?.title || toolInfo.title || "";
        const baseSlug = titleArg
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60);
        const slug =
            baseSlug || `untitled-article-${Date.now().toString(36).slice(-4)}`;
        const workspacePath = `/workspace/files/articles/${slug}.html`;

        // Wait for streaming to complete before opening canvas to prevent message loss
        // This ensures the response message is fully streamed before tab switching occurs
        waitForStreamingCompletion(context).then(() => {
            // Open the canvas with a new empty article/story editor
            // Use type "article" (not "empty") so the Write component renders
            // fileHash: null indicates it's a new article, not loading an existing one
            // workspacePath links the canvas to the workspace file for live updates
            dispatch({
                type: "chat/openCanvas",
                payload: {
                    type: "article",
                    fileHash: null,
                    filename: null,
                    title: "Canvas",
                    workspacePath,
                },
            });

            // Ensure canvas is visible (triggers tab switch on mobile)
            dispatch({
                type: "chat/setCanvasVisibility",
                payload: true,
            });
        });

        // Return success immediately (canvas will open after streaming completes)
        return {
            success: true,
            data: {
                workspacePath,
                description: `Opened a new story/article in the canvas. Write your article content to the workspace file at **${workspacePath}** using the workspace shell tool. Use this HTML format:
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="concierge-type" content="article">
    <meta id="title" content="Your Article Title">
    <meta id="subhead" content="Your subtitle here">
    <meta id="featuredImage" content="">
    <title>Your Article Title</title>
</head>
<body>
<p>Your article content here in HTML...</p>
</body>
</html>
\`\`\`
The canvas will automatically update as you write to this file. ${toolInfo.toolArgs?.userMessage || toolInfo.userMessage || ""}`,
            },
        };
    },
    closecanvas: async (toolInfo, context) => {
        const { dispatch } = context || {};

        if (!dispatch) {
            throw new Error("Redux dispatch not available in tool context");
        }

        // Close the canvas: clear content and hide it
        // This matches the pattern used in Canvas.js handleClose
        dispatch({
            type: "chat/closeCanvas",
        });

        dispatch({
            type: "chat/setCanvasVisibility",
            payload: false,
        });

        return {
            success: true,
            data: {
                description: `Closed the canvas. ${toolInfo.toolArgs?.userMessage || toolInfo.userMessage || ""}`,
            },
        };
    },
    loadskill: async (toolInfo, context) => {
        const name = toolInfo.toolArgs?.name || toolInfo.name;
        const userContextId = context?.user?.contextId;
        return loadSkill(name, { userContextId });
    },
    connectmcpserver: async (toolInfo) => {
        const serverKey = toolInfo.toolArgs?.serverKey || toolInfo.serverKey;
        if (!serverKey) {
            throw new Error("serverKey is required");
        }

        const preset = MCP_PRESETS[serverKey];
        if (!preset) {
            throw new Error(`Unknown MCP server: ${serverKey}`);
        }

        // Initiate OAuth flow (same as reauth — mirrors useMcpServers.handleConnectPreset)
        let authorizeUrl;
        if (preset.authType === "oauth2" && preset.mcpOAuthInit) {
            const redirectUri = `${window.location.origin}${preset.mcpOAuthRedirect}`;
            const res = await fetch(preset.mcpOAuthInit, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ redirectUri }),
            });
            const data = await res.json();
            if (!res.ok || !data.authorizeUrl) {
                throw new Error(
                    data.error || "Failed to initialize OAuth flow",
                );
            }
            authorizeUrl = data.authorizeUrl;
        } else if (preset.oauthUrl) {
            authorizeUrl = preset.oauthUrl;
        } else {
            throw new Error(`OAuth is not configured for ${preset.name}`);
        }

        // Open OAuth popup
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(
            authorizeUrl,
            "mcp-oauth",
            `width=${width},height=${height},left=${left},top=${top}`,
        );

        if (!popup) {
            return {
                success: false,
                error: `Unable to open the authentication window for ${preset.name}. Please allow popups for this site and try again.`,
                data: {
                    description: `The authentication window for ${preset.name} was blocked by your browser. Please allow popups for this site and try again.`,
                },
            };
        }

        // Wait for OAuth completion via postMessage or popup close
        return new Promise((resolve) => {
            let settled = false;
            const settle = (result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                clearInterval(closedCheck);
                window.removeEventListener("message", onMessage);
                resolve(result);
            };

            // 4 min timeout (Cortex callback timeout is 5 min)
            const timeout = setTimeout(() => {
                settle({
                    success: true,
                    data: {
                        description: `The authentication window for ${preset.name} was opened. If you completed the login, the service will be available in your next message. If not, you can ask to try again.`,
                    },
                });
            }, 240000);

            const expectedMessageType = `${serverKey}-oauth-complete`;
            const onMessage = (event) => {
                if (event?.origin !== window.location.origin) {
                    return;
                }

                if (event?.source !== popup) {
                    return;
                }

                const type = event?.data?.type;
                if (type !== expectedMessageType) {
                    return;
                }

                if (event?.data?.success !== true) {
                    settle({
                        success: false,
                        data: {
                            description: `Connection to ${preset.name} did not complete successfully. You can ask to try again.`,
                        },
                    });
                    return;
                }

                // Include MCP server config for mid-turn re-initialization
                const newMcpConfig = event.data.mcpServerConfig
                    ? { [serverKey]: event.data.mcpServerConfig }
                    : undefined;

                settle({
                    success: true,
                    data: {
                        description: `Successfully connected ${preset.name}. The service and its tools are available now. Continue with the user's request.`,
                        newMcpConfig,
                    },
                });
            };
            window.addEventListener("message", onMessage);

            // Detect popup closed without completing OAuth
            const closedCheck = setInterval(() => {
                if (popup && popup.closed) {
                    settle({
                        success: true,
                        data: {
                            description: `The authentication window for ${preset.name} was closed. If you completed the login, the service will be available in your next message. If not, you can ask to try again.`,
                        },
                    });
                }
            }, 1000);
        });
    },
    reauthenticatemcpserver: async (toolInfo) => {
        const serverKey = toolInfo.toolArgs?.serverKey || toolInfo.serverKey;
        if (!serverKey) {
            throw new Error("serverKey is required");
        }

        const preset = MCP_PRESETS[serverKey];
        if (!preset) {
            throw new Error(`Unknown MCP server: ${serverKey}`);
        }

        // Initiate OAuth flow (mirrors useMcpServers.handleConnectPreset)
        let authorizeUrl;
        if (preset.authType === "oauth2" && preset.mcpOAuthInit) {
            const redirectUri = `${window.location.origin}${preset.mcpOAuthRedirect}`;
            const res = await fetch(preset.mcpOAuthInit, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ redirectUri }),
            });
            const data = await res.json();
            if (!res.ok || !data.authorizeUrl) {
                throw new Error(
                    data.error || "Failed to initialize OAuth flow",
                );
            }
            authorizeUrl = data.authorizeUrl;
        } else if (preset.oauthUrl) {
            authorizeUrl = preset.oauthUrl;
        } else {
            throw new Error(`OAuth is not configured for ${preset.name}`);
        }

        // Open OAuth popup
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(
            authorizeUrl,
            "mcp-oauth",
            `width=${width},height=${height},left=${left},top=${top}`,
        );

        if (!popup) {
            return {
                success: false,
                error: `Unable to open the re-authentication window for ${preset.name}. Please allow popups for this site and try again.`,
                data: {
                    description: `The re-authentication window for ${preset.name} was blocked by your browser. Please allow popups for this site and try again.`,
                },
            };
        }

        // Wait for OAuth completion via postMessage or popup close
        return new Promise((resolve) => {
            let settled = false;
            const settle = (result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                clearInterval(closedCheck);
                window.removeEventListener("message", onMessage);
                resolve(result);
            };

            // 4 min timeout (Cortex callback timeout is 5 min)
            const timeout = setTimeout(() => {
                settle({
                    success: true,
                    data: {
                        description: `The re-authentication window for ${preset.name} was opened. If you completed the login, your connection will be restored in your next message. If not, you can ask to try again.`,
                    },
                });
            }, 240000);

            const expectedMessageType = `${serverKey}-oauth-complete`;
            const onMessage = (event) => {
                if (event?.origin !== window.location.origin) {
                    return;
                }

                if (event?.source !== popup) {
                    return;
                }

                const type = event?.data?.type;
                if (type !== expectedMessageType) {
                    return;
                }

                if (event?.data?.success !== true) {
                    settle({
                        success: false,
                        data: {
                            description: `Re-authentication for ${preset.name} did not complete successfully. You can ask to try again.`,
                        },
                    });
                    return;
                }

                // Include MCP server config for mid-turn re-initialization
                const newMcpConfig = event.data.mcpServerConfig
                    ? { [serverKey]: event.data.mcpServerConfig }
                    : undefined;

                settle({
                    success: true,
                    data: {
                        description: `Successfully re-authenticated ${preset.name}. The connection has been restored and its tools are available now. Continue with the user's request.`,
                        newMcpConfig,
                    },
                });
            };
            window.addEventListener("message", onMessage);

            // Detect popup closed without completing OAuth
            const closedCheck = setInterval(() => {
                if (popup && popup.closed) {
                    settle({
                        success: true,
                        data: {
                            description: `The re-authentication window for ${preset.name} was closed. If you completed the login, your connection will be restored in your next message. If not, you can ask to try again.`,
                        },
                    });
                }
            }, 1000);
        });
    },
    createskill: async (toolInfo, context) => {
        const name = toolInfo.toolArgs?.name || toolInfo.name;
        const description =
            toolInfo.toolArgs?.description || toolInfo.description;
        const content = toolInfo.toolArgs?.content || toolInfo.content;

        if (!name || !description || !content) {
            throw new Error(
                "name, description, and content are all required to create a skill",
            );
        }

        const response = await fetch("/api/skills", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description, content }),
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to create skill");
        }

        const skill = await response.json();
        const skillName = skill.name;
        const userContextId = context?.user?.contextId;
        const skillDir = userContextId
            ? `/workspace/files/skills/${skillName}`
            : null;
        const skillMdPath = skillDir ? `${skillDir}/SKILL.md` : null;

        const { overflow } = splitSkillSummaryDescription(description ?? "");
        const overflowNote =
            overflow !== null
                ? ` Extended summary beyond ${SKILL_DESCRIPTION_MAX_LENGTH} characters was preserved at the top of SKILL.md.`
                : "";

        return {
            success: true,
            data: {
                name: skillName,
                description: skill.description,
                skillDirectory: skillDir,
                skillMdPath,
                instructions: `Skill "${skillName}" created successfully. It can now be loaded with the LoadSkill tool.${overflowNote}${skillDir ? ` The skill files are stored at **${skillDir}/**. The main skill content is at **${skillMdPath}**. You can read, edit, or add files to this directory directly using the workspace shell.` : ""}`,
            },
        };
    },
    editskill: async (toolInfo, context) => {
        const name = toolInfo.toolArgs?.name || toolInfo.name;
        const description =
            toolInfo.toolArgs?.description || toolInfo.description;
        const content = toolInfo.toolArgs?.content || toolInfo.content;

        if (!name) {
            throw new Error("name is required to edit a skill");
        }

        if (description === undefined && content === undefined) {
            throw new Error(
                "At least one of description or content must be provided to update a skill",
            );
        }

        const body = {};
        if (description !== undefined) body.description = description;
        if (content !== undefined) body.content = content;

        const skillName = name.toLowerCase();
        let overflowHint = "";
        if (description !== undefined) {
            const { overflow } = splitSkillSummaryDescription(description);
            if (overflow !== null) {
                overflowHint = ` Extended summary beyond ${SKILL_DESCRIPTION_MAX_LENGTH} characters was preserved at the top of SKILL.md.`;
            }
        }

        const response = await fetch(
            `/api/skills/${encodeURIComponent(skillName)}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            },
        );

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to update skill");
        }

        const skill = await response.json();
        const updatedFields = [];
        if (description !== undefined) updatedFields.push("description");
        if (content !== undefined) updatedFields.push("content");

        const userContextId = context?.user?.contextId;
        const skillDir = userContextId
            ? `/workspace/files/skills/${skillName}`
            : null;
        const skillMdPath = skillDir ? `${skillDir}/SKILL.md` : null;

        return {
            success: true,
            data: {
                name: skill.name,
                description: skill.description,
                updatedFields,
                skillDirectory: skillDir,
                skillMdPath,
                instructions: `Skill "${skill.name}" updated successfully (${updatedFields.join(", ")}). Load it with the LoadSkill tool to use the updated version.${overflowHint}${skillDir ? ` The skill files are at **${skillDir}/**. The main content file is **${skillMdPath}**. You can also read, edit, or add files to this directory directly using the workspace shell.` : ""}`,
            },
        };
    },
    listautomations: async () => {
        const data = await fetchJsonOrThrow("/api/automations");
        return {
            success: true,
            data: {
                automations: data.automations || [],
                description: `Found ${(data.automations || []).length} automation(s). Use ReadAutomation before editing one, and use RunAutomation to start a manual run.`,
            },
        };
    },
    readautomation: async (toolInfo, context) => {
        const idOrSlug = getToolArg(toolInfo, "idOrSlug");
        if (!idOrSlug) {
            throw new Error("idOrSlug is required to read an automation");
        }

        const automation = await fetchJsonOrThrow(
            `/api/automations/${encodeURIComponent(idOrSlug)}`,
        );
        const paths = automationWorkspacePaths(
            context?.user?.contextId,
            automation.slug,
        );

        return {
            success: true,
            data: {
                ...automation,
                ...paths,
                instructions: `Automation "${automation.name}" loaded. Its main file is AUTOMATION.md${paths.automationMdPath ? ` at **${paths.automationMdPath}**` : ""}. Preserve the existing content unless the user asked for a replacement.`,
            },
        };
    },
    createautomation: async (toolInfo, context) => {
        const payload = buildAutomationPayload(toolInfo, [
            "name",
            "slug",
            "description",
            "content",
            "enabled",
            "schedule",
            "timezone",
            "producesHtml",
            "pinnedToSidebar",
        ]);

        if (!payload.name || !payload.description || !payload.content) {
            throw new Error(
                "name, description, and content are required to create an automation",
            );
        }

        const automation = await fetchJsonOrThrow("/api/automations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const paths = automationWorkspacePaths(
            context?.user?.contextId,
            automation.slug,
        );

        return {
            success: true,
            data: {
                ...automation,
                ...paths,
                instructions: `Automation "${automation.name}" created successfully.${paths.automationDirectory ? ` Files are stored under **${paths.automationDirectory}/** and the main instructions are at **${paths.automationMdPath}**. Add supporting files in that directory if needed.` : ""} Use RunAutomation to start it manually, or UpdateAutomation to change schedule, HTML output, or sidebar pinning.`,
            },
        };
    },
    updateautomation: async (toolInfo, context) => {
        const idOrSlug = getToolArg(toolInfo, "idOrSlug");
        if (!idOrSlug) {
            throw new Error("idOrSlug is required to update an automation");
        }

        const payload = buildAutomationPayload(toolInfo, [
            "name",
            "description",
            "content",
            "enabled",
            "schedule",
            "timezone",
            "producesHtml",
            "pinnedToSidebar",
        ]);

        if (Object.keys(payload).length === 0) {
            throw new Error(
                "At least one automation field must be provided to update",
            );
        }

        const automation = await fetchJsonOrThrow(
            `/api/automations/${encodeURIComponent(idOrSlug)}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            },
        );
        const paths = automationWorkspacePaths(
            context?.user?.contextId,
            automation.slug,
        );

        return {
            success: true,
            data: {
                ...automation,
                ...paths,
                updatedFields: Object.keys(payload),
                instructions: `Automation "${automation.name}" updated (${Object.keys(payload).join(", ")}).${paths.automationMdPath ? ` Main instructions are at **${paths.automationMdPath}**.` : ""}`,
            },
        };
    },
    runautomation: async (toolInfo) => {
        const idOrSlug = getToolArg(toolInfo, "idOrSlug");
        if (!idOrSlug) {
            throw new Error("idOrSlug is required to run an automation");
        }

        const result = await fetchJsonOrThrow(
            `/api/automations/${encodeURIComponent(idOrSlug)}/run`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            },
        );

        return {
            success: true,
            data: {
                ...result,
                instructions: `Automation run started. Track task **${result.taskId}** in notifications or the Automations run history.`,
            },
        };
    },
    deleteautomation: async (toolInfo) => {
        const idOrSlug = getToolArg(toolInfo, "idOrSlug");
        if (!idOrSlug) {
            throw new Error("idOrSlug is required to delete an automation");
        }

        const result = await fetchJsonOrThrow(
            `/api/automations/${encodeURIComponent(idOrSlug)}`,
            { method: "DELETE" },
        );

        return {
            success: true,
            data: {
                ...result,
                idOrSlug,
                description: `Deleted automation "${idOrSlug}".`,
            },
        };
    },
    viewautomationhtml: async (toolInfo, context) => {
        const { router, dispatch } = context || {};
        const idOrSlug = getToolArg(toolInfo, "idOrSlug");
        const taskId = getToolArg(toolInfo, "taskId", "latest");

        if (!router) {
            throw new Error("Router not available in tool context");
        }

        if (!idOrSlug) {
            throw new Error("idOrSlug is required to view automation HTML");
        }

        const path = `/automations/${encodeURIComponent(idOrSlug)}/runs/${encodeURIComponent(taskId)}`;
        waitForStreamingCompletion(context).then(() => {
            if (dispatch) {
                dispatch({
                    type: "chat/setChatBoxPosition",
                    payload: { position: "docked" },
                });
            }
            router.push(`${path}?openChat=true`);
        });

        return {
            success: true,
            data: {
                path,
                description: `Opening the ${taskId === "latest" ? "latest" : "selected"} HTML output for automation "${idOrSlug}".`,
            },
        };
    },
    createapplet: async (toolInfo, context) => {
        const { dispatch, user } = context || {};

        if (!dispatch) {
            throw new Error("Redux dispatch not available in tool context");
        }

        const prompt = toolInfo.toolArgs?.prompt || toolInfo.prompt;
        const workspacePath =
            toolInfo.toolArgs?.workspacePath || toolInfo.workspacePath;
        const requestedName = toolInfo.toolArgs?.name || toolInfo.name;
        const createNew =
            toolInfo.toolArgs?.createNew ?? toolInfo.createNew ?? false;
        const hasPrompt = !!prompt?.trim?.();
        const hasWorkspacePath = !!workspacePath?.trim?.();
        const activeHtmlContent = context?.getActiveHtmlContent
            ? context.getActiveHtmlContent()
            : {};
        const activeAppletId = activeHtmlContent?.appletId || null;
        const confirmedCreateNew =
            createNew === true ||
            (typeof createNew === "string" &&
                createNew.toLowerCase() === "createnew");

        if (hasPrompt === hasWorkspacePath) {
            throw new Error(
                "Provide exactly one of prompt or workspacePath for CreateApplet",
            );
        }

        if (hasPrompt && activeAppletId && !confirmedCreateNew) {
            const workspacePathHint = activeHtmlContent?.workspacePath
                ? ` The current applet workspace file is **${activeHtmlContent.workspacePath}**.`
                : "";
            return {
                success: true,
                data: {
                    requiresConfirmation: true,
                    appletId: activeAppletId,
                    workspacePath: activeHtmlContent?.workspacePath || null,
                    description: `CreateApplet creates a separate new applet; it does not edit the active applet.${workspacePathHint} To edit the current applet, read and modify the Draft workspace HTML file with the workspace shell, then call SaveAppletDraftAsVersion only when the user wants a saved version checkpoint. If the user explicitly wants a new applet instead, call CreateApplet again with createNew: true.`,
                },
            };
        }

        if (hasWorkspacePath) {
            const activeTabId = context?.getActiveTabId
                ? context.getActiveTabId()
                : null;
            const registration = await registerCanvasAppletFromWorkspaceFile({
                workspacePath: workspacePath.trim(),
                appletName: requestedName,
                userContextId: user?.contextId || null,
            });

            const nextContent = {
                type: "html",
                title: registration.appletName,
                filename: registration.filename,
                htmlContent: registration.html,
                appletId: registration.appletId,
                workspacePath: registration.workspacePath,
                url: registration.applet?.filePath || activeHtmlContent?.url,
            };

            if (
                activeTabId &&
                activeHtmlContent?.workspacePath === registration.workspacePath
            ) {
                dispatch({
                    type: "chat/updateCanvasTab",
                    payload: {
                        tabId: activeTabId,
                        content: nextContent,
                    },
                });
            } else {
                dispatch({
                    type: "chat/openCanvas",
                    payload: nextContent,
                });
                dispatch({
                    type: "chat/setCanvasVisibility",
                    payload: true,
                });
            }

            return {
                success: true,
                data: {
                    appletId: registration.appletId,
                    workspacePath: registration.workspacePath,
                    filename: registration.filename,
                    description: `Registered "${registration.appletName}" as a new applet from the existing workspace file.`,
                },
            };
        }

        const { tabId, completion } = launchAppletGeneration({
            prompt,
            dispatch,
            userContextId: user?.contextId || null,
            tabId: uuidv4(),
            appletName: requestedName,
            onError: (error) => {
                console.error("Error generating applet:", error);
            },
            onSaveError: (error) => {
                console.error("Error uploading generated applet:", error);
            },
        });

        void completion.catch(() => {});

        // Return immediately — streaming happens in the background
        return {
            success: true,
            data: {
                description: `Generating applet with a live preview in the canvas. The applet is being created based on your description and will appear in real-time.`,
                tabId,
            },
        };
    },
};

// --- Applet driver helpers (used by Click/Fill/Query/Wait/Snapshot) ---

function resolveAppletElements(doc, selector) {
    if (!selector || typeof selector !== "string") {
        throw new Error("selector is required and must be a string");
    }
    try {
        return Array.from(doc.querySelectorAll(selector));
    } catch (error) {
        throw new Error(`Invalid CSS selector "${selector}": ${error.message}`);
    }
}

function pickAppletElement(elements, { text, nth }) {
    if (typeof text === "string" && text.length > 0) {
        const needle = text.toLowerCase();
        const match = elements.find((el) =>
            (el.textContent || "").toLowerCase().includes(needle),
        );
        if (!match) {
            throw new Error(
                `No element matched the selector AND contained text "${text}"`,
            );
        }
        return match;
    }
    const index = Number.isInteger(nth) && nth >= 0 ? nth : 0;
    if (elements.length === 0) {
        throw new Error("No elements matched the selector");
    }
    if (index >= elements.length) {
        throw new Error(
            `nth=${index} is out of range — only ${elements.length} element(s) matched`,
        );
    }
    return elements[index];
}

function isAppletElementVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const win = el.ownerDocument?.defaultView;
    const style = win?.getComputedStyle?.(el);
    if (!style) return true;
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (parseFloat(style.opacity || "1") === 0) return false;
    return true;
}

// Inputs whose value should never be sent back to the model. Anything the
// user could reasonably consider secret is redacted, not exposed — even when
// the LLM explicitly queries the field.
const SENSITIVE_INPUT_TYPES = new Set(["password"]);
const SENSITIVE_AUTOCOMPLETE_VALUES = new Set([
    "current-password",
    "new-password",
    "one-time-code",
    "cc-number",
    "cc-csc",
    "cc-exp",
    "cc-exp-month",
    "cc-exp-year",
]);

function isSensitiveField(el) {
    if (!el) return false;
    const type = (el.type || el.getAttribute?.("type") || "").toLowerCase();
    if (SENSITIVE_INPUT_TYPES.has(type)) return true;
    const autocomplete = (
        el.getAttribute?.("autocomplete") || ""
    ).toLowerCase();
    if (autocomplete) {
        for (const token of autocomplete.split(/\s+/)) {
            if (SENSITIVE_AUTOCOMPLETE_VALUES.has(token)) return true;
        }
    }
    return false;
}

function describeAppletElement(el) {
    if (!el) return null;
    const sensitive = isSensitiveField(el);
    const attrs = {};
    for (const name of [
        "id",
        "name",
        "type",
        "role",
        "href",
        "value",
        "placeholder",
        "aria-label",
        "data-testid",
    ]) {
        const v = el.getAttribute?.(name);
        if (v == null || v === "") continue;
        // Never echo the literal `value` attribute for sensitive fields —
        // it may carry a server-rendered default that contains secret data.
        if (sensitive && name === "value") {
            attrs[name] = "[redacted]";
            continue;
        }
        attrs[name] = v;
    }
    const className =
        typeof el.className === "string" && el.className
            ? el.className.split(/\s+/).slice(0, 4).join(" ")
            : undefined;
    const text = (el.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
    const tag = el.tagName ? el.tagName.toLowerCase() : "?";
    const description = {
        tag,
        text: text || undefined,
        attrs: Object.keys(attrs).length ? attrs : undefined,
        className,
        visible: isAppletElementVisible(el),
        disabled: el.disabled === true || undefined,
    };
    if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el.isContentEditable
    ) {
        if (el.type === "checkbox" || el.type === "radio") {
            description.checked = !!el.checked;
        } else if (sensitive) {
            description.value = "[redacted]";
            description.sensitive = true;
        } else {
            description.value = String(el.value ?? el.textContent ?? "").slice(
                0,
                500,
            );
        }
    }
    return description;
}

function dispatchInputEvents(el) {
    const win = el.ownerDocument?.defaultView;
    if (!win) return;
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
}

function setAppletFieldValue(el, value) {
    const win = el.ownerDocument?.defaultView;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "input" && (el.type === "checkbox" || el.type === "radio")) {
        el.checked = value === true || value === "true";
        dispatchInputEvents(el);
        return { kind: el.type, value: el.checked };
    }
    if (tag === "select") {
        const desired = String(value);
        const options = Array.from(el.options || []);
        const byValue = options.find((opt) => opt.value === desired);
        const byText = options.find(
            (opt) => (opt.textContent || "").trim() === desired,
        );
        const match = byValue || byText;
        if (!match) {
            throw new Error(
                `No <option> matched value or text "${desired}" in this <select>`,
            );
        }
        el.value = match.value;
        dispatchInputEvents(el);
        return { kind: "select", value: el.value };
    }
    if (tag === "input" || tag === "textarea") {
        // React tracks the previous value on the native node; setting via the
        // native setter bypasses React's check so input/change fire properly.
        const proto =
            tag === "textarea"
                ? win?.HTMLTextAreaElement?.prototype
                : win?.HTMLInputElement?.prototype;
        const setter = proto
            ? Object.getOwnPropertyDescriptor(proto, "value")?.set
            : null;
        if (setter) setter.call(el, String(value));
        else el.value = String(value);
        dispatchInputEvents(el);
        return { kind: tag, value: el.value };
    }
    if (el.isContentEditable) {
        el.textContent = String(value);
        dispatchInputEvents(el);
        return { kind: "contenteditable", value: el.textContent };
    }
    throw new Error(
        `Element <${tag}> is not a fillable field (input/textarea/select/contenteditable)`,
    );
}

CLIENT_SIDE_TOOL_HANDLERS.clickappletelement = async (toolInfo) => {
    const selector = getToolArg(toolInfo, "selector");
    const text = getToolArg(toolInfo, "text");
    const nth = getToolArg(toolInfo, "nth");
    const doc = requireActiveAppletDocument();
    const elements = resolveAppletElements(doc, selector);
    const target = pickAppletElement(elements, { text, nth });
    if (target.disabled) {
        throw new Error(
            `Target element is disabled — cannot click (${describeAppletElement(target).tag}#${target.id || "?"})`,
        );
    }
    target.scrollIntoView?.({ block: "center", inline: "center" });
    target.click();
    return {
        success: true,
        data: {
            matchedCount: elements.length,
            clicked: describeAppletElement(target),
            description: `Clicked ${describeAppletElement(target).tag}${target.id ? `#${target.id}` : ""} inside the applet.`,
        },
    };
};

CLIENT_SIDE_TOOL_HANDLERS.fillappletfield = async (toolInfo) => {
    const selector = getToolArg(toolInfo, "selector");
    const value = getToolArg(toolInfo, "value");
    const nth = getToolArg(toolInfo, "nth");
    const submit = getToolArg(toolInfo, "submit") === true;
    const doc = requireActiveAppletDocument();
    const elements = resolveAppletElements(doc, selector);
    const target = pickAppletElement(elements, { nth });
    const result = setAppletFieldValue(target, value);
    let submitted = false;
    if (submit) {
        const form = target.form || target.closest?.("form");
        if (form) {
            if (typeof form.requestSubmit === "function") form.requestSubmit();
            else form.submit();
            submitted = true;
        }
    }
    return {
        success: true,
        data: {
            matchedCount: elements.length,
            field: describeAppletElement(target),
            set: result,
            submitted,
            description: `Filled ${result.kind} with new value${submitted ? " and submitted the form" : ""}.`,
        },
    };
};

CLIENT_SIDE_TOOL_HANDLERS.queryappletdom = async (toolInfo) => {
    const selector = getToolArg(toolInfo, "selector");
    const requestedLimit = getToolArg(toolInfo, "limit");
    const limit = Math.min(
        50,
        Number.isInteger(requestedLimit) && requestedLimit > 0
            ? requestedLimit
            : 10,
    );
    const doc = requireActiveAppletDocument();
    const elements = resolveAppletElements(doc, selector);
    const matches = elements.slice(0, limit).map(describeAppletElement);
    return {
        success: true,
        data: {
            selector,
            matchedCount: elements.length,
            returnedCount: matches.length,
            matches,
            description: `Selector matched ${elements.length} element(s); returning details for ${matches.length}.`,
        },
    };
};

CLIENT_SIDE_TOOL_HANDLERS.waitforappletelement = async (toolInfo) => {
    const selector = getToolArg(toolInfo, "selector");
    const gone = getToolArg(toolInfo, "gone") === true;
    const requestedTimeout = getToolArg(toolInfo, "timeoutMs");
    const timeoutMs = Math.min(
        15000,
        Number.isInteger(requestedTimeout) && requestedTimeout > 0
            ? requestedTimeout
            : 5000,
    );
    const doc = requireActiveAppletDocument();
    const start = Date.now();
    let attempts = 0;
    while (Date.now() - start < timeoutMs) {
        attempts += 1;
        const elements = resolveAppletElements(doc, selector);
        const satisfied = gone ? elements.length === 0 : elements.length > 0;
        if (satisfied) {
            return {
                success: true,
                data: {
                    selector,
                    gone,
                    waitedMs: Date.now() - start,
                    attempts,
                    matchedCount: elements.length,
                    description: gone
                        ? `Selector cleared after ${Date.now() - start}ms.`
                        : `Selector appeared after ${Date.now() - start}ms (${elements.length} match(es)).`,
                },
            };
        }
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(
        `Timed out after ${timeoutMs}ms waiting for selector "${selector}"${gone ? " to disappear" : ""}`,
    );
};

CLIENT_SIDE_TOOL_HANDLERS.readappletconsole = async (toolInfo) => {
    const clear = getToolArg(toolInfo, "clear") === true;
    const levelsArg = getToolArg(toolInfo, "levels");
    const requestedLimit = getToolArg(toolInfo, "limit");
    const limit = Math.min(
        200,
        Number.isInteger(requestedLimit) && requestedLimit > 0
            ? requestedLimit
            : 50,
    );
    const allowed = new Set(
        Array.isArray(levelsArg) && levelsArg.length > 0
            ? levelsArg
            : ["log", "info", "warn", "error"],
    );
    const { consoleEntries = [], networkRequests = [] } = await inspectApplet({
        clear,
    });
    const filtered = consoleEntries
        .filter((entry) => allowed.has(entry?.level))
        .slice(-limit);
    const failingNetwork = networkRequests
        .filter((req) => req?.status >= 400 || req?.error)
        .slice(-limit);
    return {
        success: true,
        data: {
            totalCaptured: consoleEntries.length,
            returnedCount: filtered.length,
            consoleEntries: filtered,
            failingNetworkRequests: failingNetwork,
            cleared: clear,
            description: `Read ${filtered.length} console entr${filtered.length === 1 ? "y" : "ies"} (of ${consoleEntries.length} captured) and ${failingNetwork.length} failing network request(s).${clear ? " Buffer cleared." : ""}`,
        },
    };
};

CLIENT_SIDE_TOOL_HANDLERS.getappletpagesnapshot = async (toolInfo) => {
    const includeText = getToolArg(toolInfo, "includeText") === true;
    const entry = getActiveAppletSandbox();
    if (!entry) {
        throw new Error(
            "No applet is currently open in the canvas. Open one before snapshotting.",
        );
    }
    const doc = requireActiveAppletDocument();
    const win = entry.iframe.contentWindow;

    const headings = Array.from(doc.querySelectorAll("h1, h2, h3"))
        .slice(0, 20)
        .map((h) => ({
            tag: h.tagName.toLowerCase(),
            text: (h.textContent || "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 200),
        }));

    const buttons = Array.from(
        doc.querySelectorAll(
            "button, [role='button'], input[type='submit'], input[type='button']",
        ),
    )
        .filter(isAppletElementVisible)
        .slice(0, 30)
        .map(describeAppletElement);

    const links = Array.from(doc.querySelectorAll("a[href]"))
        .filter(isAppletElementVisible)
        .slice(0, 20)
        .map((a) => ({
            text: (a.textContent || "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 120),
            href: a.getAttribute("href"),
        }));

    const fields = Array.from(doc.querySelectorAll("input, textarea, select"))
        .slice(0, 30)
        .map(describeAppletElement);

    let bodyText;
    if (includeText) {
        bodyText = (doc.body?.innerText || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 2000);
    }

    let consoleErrors = [];
    let failingNetworkRequests = [];
    try {
        const inspect = await inspectApplet({});
        consoleErrors = (inspect.consoleEntries || [])
            .filter((e) => e?.level === "error" || e?.level === "warn")
            .slice(-10);
        failingNetworkRequests = (inspect.networkRequests || [])
            .filter((req) => req?.status >= 400 || req?.error)
            .slice(-10);
    } catch (error) {
        consoleErrors = [
            {
                level: "warn",
                message: `Console inspect unavailable: ${error.message}`,
            },
        ];
    }

    return {
        success: true,
        data: {
            appletId: entry.appletId,
            title: doc.title || null,
            url: win?.location?.href || null,
            hash: win?.location?.hash || null,
            pathname: win?.location?.pathname || null,
            headings,
            buttons,
            links,
            fields,
            bodyText,
            consoleErrors,
            failingNetworkRequests,
            description: `Snapshot of applet ${entry.appletId}: ${headings.length} heading(s), ${buttons.length} button(s), ${fields.length} field(s), ${consoleErrors.length} recent error/warning(s).`,
        },
    };
};

CLIENT_SIDE_TOOL_HANDLERS.opencanvasfile =
    CLIENT_SIDE_TOOL_HANDLERS.openincanvas;
CLIENT_SIDE_TOOL_HANDLERS.createarticle =
    CLIENT_SIDE_TOOL_HANDLERS.createnewstory;
