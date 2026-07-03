// chatTools.js
// Chat page-specific client-side tool handlers

import { requestToolConfirmation, translateToolText } from "./toolInteraction";
import {
    injectAppletIdMeta,
    injectAppletMetaTags,
} from "../../src/utils/appletHtmlUtils";
import {
    generateAndApplyAppletImage,
    generateAndApplyAppletMetadata,
} from "../../src/utils/appletAssetGeneration";

/**
 * Contextual tool definitions for chat pages
 * These tools are only available when viewing a chat page
 */
export const CHAT_CONTEXTUAL_TOOLS = [
    {
        type: "function",
        icon: "🧩",
        function: {
            name: "ListApplets",
            description:
                "List the user's Concierge applets from the `/api/canvas-applets` registry, optionally filtered by `query`. Use this to find applet IDs and current Draft workspace paths. Do not use Cortex MAM/media asset APIs for applet metadata; Mongo applet IDs only belong to this Concierge applet registry.",
            descriptionAr:
                "اعرض تطبيقات Concierge من سجل `/api/canvas-applets` مع إمكانية التصفية بـ `query`. استخدمه للعثور على معرفات التطبيقات ومسارات ملفات المسودة.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: ["string", "null"],
                        description:
                            "Optional case-insensitive substring filter on applet names.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about listing applets",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🧩",
        function: {
            name: "GetApplet",
            description:
                "Read one Concierge applet record from the `/api/canvas-applets` registry. Returns applet metadata, directory/sidebar/app-store card metadata (`appMetadata`: name, slug, description, icon, imageUrl, imageAlt, badgeLabel, tags, category, metadataGeneratedAt, listedInStore), immutable saved version summaries, published version pointer, and editable Draft workspace file path. This does not return saved version HTML; external saved versions include a workspacePath under `/workspace/files/...` when available, so read or diff that workspace file instead of downloading blob URLs. Use GetAppletVersionSource for one version's source metadata, or CopyAppletVersionToDraft to make a version editable.",
            descriptionAr:
                "اقرأ سجل تطبيق Concierge واحداً: البيانات، ملخص الإصدارات الثابتة، مؤشر المنشور، حالة متجر التطبيقات، ومسار ملف المسودة القابل للتحرير. عندما يتوفر workspacePath لإصدار محفوظ، اقرأه أو قارنه من مساحة العمل بدلاً من تنزيل روابط blob.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description: "Required Mongo applet ID.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about reading the applet",
                    },
                },
                required: ["appletId", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🏠",
        function: {
            name: "SetHomeApplet",
            description:
                "Set one Concierge applet as the user's Home page, or clear the Home applet. appletId defaults to the active canvas applet. The Home page renders the applet's mutable Draft, so publishing is not required for ordinary Home-only updates. If the user asked you to create a homepage/launchpad/launcher applet that opens other applets, first save Draft as a version, publish that saved version locally, then call SetHomeApplet.",
            descriptionAr:
                "عيّن تطبيق Concierge واحداً كصفحة رئيسية للمستخدم، أو امسح تطبيق الصفحة الرئيسية. appletId اختياري ويستخدم التطبيق النشط في اللوحة افتراضياً. عند إنشاء صفحة رئيسية أو لوحة تشغيل لتطبيقات أخرى، احفظ المسودة كإصدار ثم انشر ذلك الإصدار محلياً قبل تعيينها كصفحة رئيسية.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    clear: {
                        type: "boolean",
                        description:
                            "Set true to clear the current Home applet instead of setting one.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about updating the Home applet",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🔎",
        function: {
            name: "GetAppletState",
            description:
                "Return the current state of one applet in Draft/Version terms plus the current directory/sidebar/app-store card metadata (`appMetadata`). Draft is the mutable workspace HTML file. Saved versions are immutable checkpoints. Published applets point at one saved version. This tool reports the Draft workspace path, saved version count, latest saved version, published version, whether Draft differs from the latest saved version, and the recommended next action. appletId defaults to the active canvas applet.",
            descriptionAr:
                "اعرض حالة تطبيق واحد بمفاهيم المسودة/الإصدارات. المسودة هي ملف HTML القابل للتحرير في المساحة؛ الإصدارات المحفوظة نقاط ثابتة؛ والمنشور يشير إلى إصدار محفوظ واحد.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about checking the applet state",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "💾",
        function: {
            name: "SaveAppletDraftAsVersion",
            description:
                "Checkpoint the current Draft workspace HTML as a new immutable applet version without publishing. Use this after meaningful edits when the user wants a saved checkpoint. This never changes the live published version; if Draft matches the latest saved version, no duplicate is created. For homepage/launchpad/launcher applets that open other applets, save a version before publishing locally and setting Home. appletId defaults to the active canvas applet.",
            descriptionAr:
                "احفظ مسودة HTML الحالية كإصدار ثابت جديد للتطبيق. لا ينشر التطبيق ولا ينشئ نسخة مكررة إذا كانت المسودة تطابق آخر إصدار محفوظ. لتطبيقات الصفحة الرئيسية أو لوحات التشغيل التي تفتح تطبيقات أخرى، احفظ إصداراً قبل النشر المحلي وتعيين الصفحة الرئيسية.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about saving the applet Draft",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🚀",
        function: {
            name: "PublishAppletVersion",
            description:
                "Promote a saved immutable applet version to the live published link. Use only when the user explicitly asks to publish, ship, make live, or update the public version, plus the special case where you created a homepage/launchpad/launcher applet that opens other applets and need to publish the saved version locally before SetHomeApplet. Prefer passing a 1-indexed `version` number. If `version` is omitted, this snapshots current Draft if needed and publishes that new version; use that shortcut only when the user explicitly wants current Draft live now. Publishing never points directly at mutable Draft. appletId defaults to the active canvas applet.",
            descriptionAr:
                "انشر إصداراً ثابتاً من التطبيق. استخدمه أيضاً عند إنشاء صفحة رئيسية أو لوحة تشغيل لتطبيقات أخرى وتحتاج إلى نشر الإصدار المحفوظ محلياً قبل تعيينه كصفحة رئيسية. إذا لم يُمرر رقم إصدار، تُحفظ المسودة الحالية كإصدار عند الحاجة ثم يُنشر ذلك الإصدار.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    version: {
                        type: ["number", "null"],
                        description:
                            "Preferred: 1-indexed saved version to publish. Omit only to publish current Draft immediately by first snapshotting it if needed.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about publishing the applet",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🗑️",
        function: {
            name: "DeleteAppletVersion",
            description:
                "Delete one immutable saved applet version after confirmation. Use this when an extra or mistaken checkpoint was created. Deleting a version renumbers later versions; if the deleted version was published, the applet is unpublished. This never deletes Draft or the applet itself. appletId defaults to the active canvas applet.",
            descriptionAr:
                "احذف إصداراً محفوظاً واحداً بعد التأكيد. لا يحذف المسودة أو التطبيق نفسه، وقد يغيّر ترقيم الإصدارات التالية.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    version: {
                        type: "number",
                        description:
                            "Required. 1-indexed saved version number to delete.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about deleting the applet version",
                    },
                },
                required: ["version", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "📦",
        function: {
            name: "OpenAppletDraft",
            description:
                "Open the applet's editable Draft workspace file in the canvas and return its workspacePath. This is the non-destructive way to switch the canvas back to Draft. It does not copy saved versions over Draft; use CopyAppletVersionToDraft when the user explicitly wants an immutable version copied into Draft.",
            descriptionAr:
                "افتح ملف مسودة التطبيق القابل للتحرير في اللوحة وأعد مساره. لا ينسخ الإصدارات المحفوظة فوق المسودة.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about opening the applet Draft",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "✏️",
        function: {
            name: "UpdateAppletMetadata",
            description:
                "Update applet metadata, not Draft/version content. Normal use: rename with `name`; update directory/sidebar metadata with `appName`, `appSlug`, `appDescription`, `appIcon`, `appImageUrl`, `appImageLightUrl`, `appImageDarkUrl`, `appImageAlt`, `appBadgeLabel`, `appTags`, `appCategory`, or `appMetadataGeneratedAt`; add/update the public app-store listing only with `publishToAppStore: true`; remove it from the app store with `publishToAppStore: false`. Advanced use: relink `workspacePath` or clear `clearSdkSuspension`. For applet content, edit Draft with the workspace shell; use SaveAppletDraftAsVersion for checkpoints, CopyAppletVersionToDraft for rollbacks, and PublishAppletVersion only for explicit live version promotion. appletId defaults to the active canvas applet.",
            descriptionAr:
                "حدّث بيانات التطبيق المتبقية مثل الاسم والربط وبيانات متجر التطبيقات. لا تستخدمها لحفظ المسودة أو استعادة الإصدارات أو النشر المباشر؛ استخدم الأدوات المخصصة لذلك.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    name: {
                        type: "string",
                        description: "Optional new applet display name.",
                    },
                    workspacePath: {
                        type: "string",
                        description:
                            "Optional existing editable workspace HTML file path to link this applet to, such as /workspace/files/applets/my-applet.html. Use an exact workspacePath; do not guess a /global/ path.",
                    },
                    appName: {
                        type: "string",
                        description:
                            "Optional directory/sidebar/app-store card name. Can be set without publishing.",
                    },
                    appSlug: {
                        type: "string",
                        description:
                            "Optional directory/sidebar/app-store card slug. Can be set without publishing.",
                    },
                    appDescription: {
                        type: "string",
                        description: "Optional app directory description.",
                    },
                    appIcon: {
                        type: "string",
                        description:
                            "Optional Lucide icon name for app directory cards and sidebar entries.",
                    },
                    appImageUrl: {
                        type: "string",
                        description:
                            "Optional default/light image URL for app directory cards.",
                    },
                    appImageLightUrl: {
                        type: "string",
                        description:
                            "Optional light-mode image URL for app directory cards.",
                    },
                    appImageDarkUrl: {
                        type: "string",
                        description:
                            "Optional dark-mode image URL for app directory cards.",
                    },
                    appImageAlt: {
                        type: "string",
                        description:
                            "Optional alt text for the app directory card image.",
                    },
                    appBadgeLabel: {
                        type: "string",
                        description:
                            "Optional short label shown over image-backed app cards.",
                    },
                    appTags: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Optional app directory tags used for search and card chips.",
                    },
                    appCategory: {
                        type: "string",
                        description:
                            "Optional app directory category used for search and card chips.",
                    },
                    appMetadataGeneratedAt: {
                        type: "string",
                        description:
                            "Optional ISO timestamp recording when applet card metadata was generated.",
                    },
                    publishToAppStore: {
                        type: "boolean",
                        description:
                            "Optional: true to publish or update the app store record, false to remove it from the app store.",
                    },
                    clearSdkSuspension: {
                        type: "boolean",
                        description:
                            "Optional: true to clear a temporary SDK suspension after fixing applet code that exceeded SDK safety limits.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about updating applet metadata",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "✨",
        function: {
            name: "GenerateAppletMetadata",
            description:
                "Generate and apply Concierge applet card/sidebar metadata for an existing applet using the applet-specific metadata endpoint and prompt. Use this instead of generic media APIs or hand-written metadata when the user wants applet name, slug, description, icon, badge, category, tags, alt text, or image prompt refreshed from the applet's current HTML. This updates metadata only; it never publishes, checkpoints, or changes Draft HTML. appletId defaults to the active canvas applet.",
            descriptionAr:
                "ولّد وطبّق بيانات بطاقة/شريط تطبيق Concierge باستخدام نقطة النهاية الخاصة بالتطبيق. يحدّث البيانات فقط ولا ينشر ولا يحفظ إصداراً ولا يغيّر HTML المسودة.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about generating applet metadata",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🖼️",
        function: {
            name: "GenerateAppletImage",
            description:
                "Generate light-mode and dark-mode applet-directory card artwork using the applet-specific image endpoint, style prompt, output folder, and media pipeline. Generated applet assets are stored under applets/assets/<appletId>. By default this waits for the generated image URLs and writes them back to applet card/sidebar metadata; set waitForResult false only when you want to start the background tasks and return the task IDs immediately. Use this instead of CreateMedia for applet card images. appletId defaults to the active canvas applet.",
            descriptionAr:
                "ولّد صورتي بطاقة تطبيق للوضع الفاتح والداكن باستخدام نقطة نهاية الصور الخاصة بالتطبيق ومسار الوسائط المخصص. تُحفظ أصول التطبيق ضمن applets/assets/<appletId>. افتراضياً ينتظر روابط الصور ويحدّث بيانات بطاقة التطبيق.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    prompt: {
                        type: "string",
                        description:
                            "Optional full image prompt override. Prefer styleCues when you only want to influence look and feel.",
                    },
                    styleCues: {
                        type: "string",
                        description:
                            "Optional additive visual styling cues for palette, medium, lighting, mood, composition, or materials. These are appended to the applet metadata prompt and are ignored by the manual Generate Images UI when left blank.",
                    },
                    metadata: {
                        type: "object",
                        description:
                            "Optional applet card metadata override to guide the image generator, such as name, description, badgeLabel, category, tags, imageAlt, or imagePrompt.",
                    },
                    quality: {
                        type: "string",
                        description:
                            "Optional generation quality override, for example draft.",
                    },
                    aspectRatio: {
                        type: "string",
                        description:
                            "Optional aspect ratio override. Applet cards default to 16:9.",
                    },
                    waitForResult: {
                        type: "boolean",
                        description:
                            "Optional. Defaults to true. Set false to only start the background image task and return taskId/jobId.",
                    },
                    updateMetadata: {
                        type: "boolean",
                        description:
                            "Optional. Defaults to true when waiting for a result. Set false to return the image URL without writing it to applet metadata.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about generating applet card artwork",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🚫",
        function: {
            name: "UnpublishApplet",
            description:
                "Clear the directly published applet version. This does not delete Draft, saved versions, or the applet record. appletId defaults to the active canvas applet.",
            descriptionAr:
                "ألغِ نشر الإصدار المباشر للتطبيق دون حذف المسودة أو الإصدارات المحفوظة أو سجل التطبيق.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about unpublishing the applet",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "📍",
        function: {
            name: "GetAppletVersionSource",
            description:
                "Read source metadata for one immutable saved applet version without copying it into Draft. Use this for compare/inspect workflows. Returns storage kind, workspacePath under `/workspace/files/...` when available, blob path or URL, content hash, size, timestamp, and published state. Prefer reading/diffing the workspacePath with the workspace shell instead of downloading blob URLs. It does not return the full HTML blob.",
            descriptionAr:
                "اقرأ بيانات مصدر إصدار محفوظ ثابت دون نسخه إلى المسودة. يعيد نوع التخزين و workspacePath عند توفره ومسار blob أو الرابط والهاش والحجم والوقت وحالة النشر. فضّل قراءة workspacePath أو مقارنته من مساحة العمل بدلاً من تنزيل روابط blob.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID. If omitted, the currently active canvas applet is used.",
                    },
                    version: {
                        type: "number",
                        description:
                            "Required. 1-indexed saved version number to inspect, such as 7 for v7.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about reading the applet version source",
                    },
                },
                required: ["version", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "↩️",
        function: {
            name: "CopyAppletVersionToDraft",
            description:
                "Copy one immutable saved Concierge applet version into the editable Draft workspace file. Use this whenever the user says restore, roll back, use v5, go back to version N, or make an older version editable. This does not mutate the saved version and does not create a new version number. After restore, Draft is active in the canvas; call SaveAppletDraftAsVersion only if the user wants a new saved checkpoint, or PublishAppletVersion { version } only if they ask to make a saved version live.",
            descriptionAr:
                "انسخ إصداراً ثابتاً محفوظاً من التطبيق إلى ملف المسودة القابل للتحرير. لا يغير الإصدار المحفوظ ولا ينشئ رقم إصدار جديداً.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional Mongo applet ID to restore. If omitted, the currently active canvas applet is used.",
                    },
                    version: {
                        type: "number",
                        description:
                            "Required. 1-indexed saved version number to restore, such as 5 for v5.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about restoring the applet version",
                    },
                },
                required: ["version", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🗑️",
        function: {
            name: "DeleteApplet",
            description:
                "Delete an applet after asking the user for confirmation in a dialog. appletId is optional — defaults to the active canvas applet. If the deleted applet was the one open in the canvas, its tab closes too. Do not use media/card tools for Concierge applets.",
            descriptionAr:
                "احذف تطبيقاً بعد تأكيد في حوار. appletId اختياري — الافتراضي التطبيق النشط. إن كان مفتوحاً في اللوحة تُغلق تبويبه. لا تستخدم أدوات الوسائط/البطاقات لحذف تطبيقات Concierge.",
            parameters: {
                type: "object",
                properties: {
                    appletId: {
                        type: "string",
                        description:
                            "Optional. The Mongo applet ID to delete (e.g. from ListApplets). If omitted, the currently active canvas applet is used.",
                    },
                    appletName: {
                        type: "string",
                        description:
                            "Optional applet name to show in the confirmation dialog.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about deleting the applet",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🔍",
        function: {
            name: "SearchChats",
            description:
                "Search the user's chats by title or content. Use this tool when the user asks to find chats, search for conversations, look for specific topics, or find chats containing certain words or phrases. Returns matching chats with their titles and IDs.",
            descriptionAr:
                "ابحث في محادثات المستخدم حسب العنوان أو النص. استخدم عند «ابحث عن دردشة» أو «مواضيع» أو «كلمات». يُرجع المحادثات المطابقة مع العناوين والمعرّفات.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description:
                            "The search query to find chats. Can search by title or content depending on searchType.",
                    },
                    searchType: {
                        type: "string",
                        enum: ["title", "content"],
                        description:
                            "Type of search: 'title' searches only chat titles (faster), 'content' searches within chat messages (more thorough). Defaults to 'title' if not specified.",
                    },
                    limit: {
                        type: "number",
                        description:
                            "Optional limit on the number of results to return. Defaults to 20 if not provided.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about the search results",
                    },
                },
                required: ["query", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "📄",
        function: {
            name: "GetChatContent",
            description:
                "Fetch the full content of a specific chat by its ID. Use this tool when the user asks to see a chat's messages, view a conversation, read a specific chat, or retrieve chat content. Returns the complete chat including title, all messages, and metadata.",
            descriptionAr:
                "جلب محتوى محادثة كامل بمعرّفها. استخدم عند «أرني المحادثة» أو «الرسائل» أو «اقرأ محادثة». يُرجع العنوان، الرسائل، والبيانات الوصفية.",
            parameters: {
                type: "object",
                properties: {
                    chatId: {
                        type: "string",
                        description:
                            "The ID of the chat to fetch. This should be a valid MongoDB ObjectId.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about retrieving the chat content",
                    },
                },
                required: ["chatId", "userMessage"],
            },
        },
    },
];

function getToolArgs(toolInfo) {
    return toolInfo.toolArgs || toolInfo;
}

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function getActiveHtmlContent(context) {
    const { getActiveHtmlContent } = context || {};
    return getActiveHtmlContent ? getActiveHtmlContent() || {} : {};
}

function getActiveAppletContext(context) {
    const activeHtmlContent = getActiveHtmlContent(context);
    return {
        appletId: activeHtmlContent.appletId || null,
        workspacePath: activeHtmlContent.workspacePath || null,
        appletName:
            activeHtmlContent.title || activeHtmlContent.filename || "Applet",
        activeVersionNumber:
            typeof activeHtmlContent.appletActiveVersionNumber === "number"
                ? activeHtmlContent.appletActiveVersionNumber
                : null,
        isViewingDraft:
            typeof activeHtmlContent.appletIsViewingDraft === "boolean"
                ? activeHtmlContent.appletIsViewingDraft
                : null,
    };
}

function getCanvasSnapshot(context) {
    if (typeof context?.getCanvasSnapshot === "function") {
        const snapshot = context.getCanvasSnapshot() || {};
        return {
            canvasContent: snapshot.canvasContent || null,
            canvasTabs: Array.isArray(snapshot.canvasTabs)
                ? snapshot.canvasTabs
                : [],
            activeTabId: snapshot.activeTabId || null,
        };
    }

    const activeHtmlContent = getActiveHtmlContent(context);
    const activeTabId =
        typeof context?.getActiveTabId === "function"
            ? context.getActiveTabId()
            : null;
    return {
        canvasContent: activeHtmlContent || null,
        canvasTabs: activeHtmlContent
            ? [{ id: activeTabId, content: activeHtmlContent }]
            : [],
        activeTabId,
    };
}

function findCanvasTabForApplet(snapshot, appletId) {
    if (!appletId) return null;
    const normalizedAppletId = String(appletId);
    return (snapshot.canvasTabs || []).find(
        (tab) => String(tab?.content?.appletId || "") === normalizedAppletId,
    );
}

function normalizeVersionRequest(version) {
    if (version == null || version === "") {
        return null;
    }

    const parsedVersion =
        typeof version === "string" && version.trim()
            ? Number(version)
            : version;

    if (typeof parsedVersion !== "number" || !Number.isFinite(parsedVersion)) {
        return null;
    }

    if (parsedVersion <= 0) {
        return null;
    }

    if (!Number.isInteger(parsedVersion)) {
        throw new Error("version must be a positive whole number.");
    }

    return parsedVersion;
}

function toVisibleVersionNumber(index) {
    return typeof index === "number" && index >= 0 ? index + 1 : null;
}

async function readWorkspaceHtml({ entityId, path }) {
    if (!entityId) {
        throw new Error("entityId is required for applet workspace access");
    }

    if (!path) {
        throw new Error(
            "workspacePath is required for applet workspace access",
        );
    }

    const params = new URLSearchParams({ entityId, path });
    const response = await fetch(`/api/workspace/file?${params}`);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch file from workspace (${response.status})`,
        );
    }

    const htmlContent = await response.text();
    if (!htmlContent) {
        throw new Error("Empty file content from workspace");
    }

    return htmlContent;
}

async function syncActiveAppletCanvas(
    context,
    {
        appletId,
        appletName,
        workspacePath,
        htmlContent,
        versionSaved = false,
        versionDeleted = false,
        latestVersionIndex = null,
    },
) {
    if (!context?.dispatch) {
        return;
    }

    const dispatch = context.dispatch;
    const chatId = context?.chatId ? String(context.chatId) : null;
    const activeTabId = context?.getActiveTabId
        ? context.getActiveTabId()
        : null;
    const {
        refreshActiveHtmlCanvas,
        refreshHtmlCanvasForChat,
        updateCanvasTab,
        updateCanvasTabForChat,
    } = await import("../../src/stores/chatSlice");

    if (activeTabId) {
        const nextTabContent = {
            appletId,
            appletVersionKey: Date.now(),
        };

        if (versionSaved || versionDeleted) {
            if (typeof latestVersionIndex === "number") {
                nextTabContent.appletVersionCount = latestVersionIndex + 1;
                if (versionSaved) {
                    nextTabContent.appletActiveVersionIndex =
                        latestVersionIndex;
                    nextTabContent.appletActiveVersionNumber =
                        latestVersionIndex + 1;
                    nextTabContent.appletIsViewingDraft = false;
                }
            } else if (versionDeleted) {
                nextTabContent.appletVersionCount = 0;
            }
        }

        if (appletName) {
            nextTabContent.title = appletName;
            nextTabContent.filename = appletName;
        }

        if (workspacePath) {
            nextTabContent.workspacePath = workspacePath;
        }

        if (htmlContent) {
            nextTabContent.htmlContent = htmlContent;
            if (!versionSaved) {
                nextTabContent.appletActiveVersionIndex = null;
                nextTabContent.appletActiveVersionNumber = null;
                nextTabContent.appletIsViewingDraft = true;
            }
        }

        dispatch(
            chatId
                ? updateCanvasTabForChat({
                      chatId,
                      tabId: activeTabId,
                      content: nextTabContent,
                  })
                : updateCanvasTab({
                      tabId: activeTabId,
                      content: nextTabContent,
                  }),
        );
    }

    if (htmlContent) {
        dispatch(
            chatId
                ? refreshHtmlCanvasForChat({
                      chatId,
                      tabId: activeTabId,
                      htmlContent,
                  })
                : refreshActiveHtmlCanvas({ htmlContent }),
        );
    }
}

async function fetchAppletRecord(appletId) {
    const response = await fetch(
        `/api/canvas-applets/${encodeURIComponent(appletId)}`,
    );
    if (!response.ok) {
        const error = new Error(
            `Failed to fetch applet record (${response.status})`,
        );
        error.status = response.status;
        throw error;
    }
    return response.json();
}

function normalizeAppletDraftHtmlForVersioning(applet, draftHtml) {
    return injectAppletIdMeta(
        injectAppletMetaTags(draftHtml, applet?.name || "Applet"),
        applet?._id || applet?.id || "",
    );
}

function versionHasExternalContent(version) {
    return !!(version?.contentBlobPath || version?.contentUrl);
}

function buildVersionWorkspacePath(contentBlobPath) {
    return contentBlobPath
        ? `/workspace/files/${contentBlobPath.replace(/^\/+/, "")}`
        : null;
}

function getVersionHtml(version) {
    return typeof version?.content === "string" && version.content.length > 0
        ? version.content
        : "";
}

function getVersionStorageKind(version) {
    return versionHasExternalContent(version) ? "external" : "inline";
}

function getVersionContentState(version) {
    const html = getVersionHtml(version);
    return {
        html,
        contentAvailable: html.length > 0,
        storage: getVersionStorageKind(version),
        contentUrl: version?.contentUrl || null,
        contentBlobPath: version?.contentBlobPath || null,
        workspacePath: buildVersionWorkspacePath(version?.contentBlobPath),
        contentHash: version?.contentHash || null,
        contentContextId: version?.contentContextId || null,
        size:
            typeof version?.contentSize === "number"
                ? version.contentSize
                : html.length,
    };
}

async function resolveVersionContentForComparison(
    versionState,
    entityId,
    cache = new Map(),
) {
    if (!versionState) {
        return { html: null, readError: null, source: null };
    }

    const source =
        versionState.storage === "external"
            ? versionState.workspacePath ||
              versionState.contentBlobPath ||
              versionState.contentUrl ||
              "external"
            : "inline";

    if (versionState.storage === "external" && versionState.workspacePath) {
        if (!entityId) {
            return {
                html: null,
                readError: "entityId is required for applet version access",
                source,
            };
        }
        if (!cache.has(versionState.workspacePath)) {
            cache.set(
                versionState.workspacePath,
                readWorkspaceHtml({
                    entityId,
                    path: versionState.workspacePath,
                })
                    .then((html) => ({ html, readError: null }))
                    .catch((error) => ({
                        html: null,
                        readError: error?.message || String(error),
                    })),
            );
        }
        const result = await cache.get(versionState.workspacePath);
        return { ...result, source };
    }

    if (versionState.contentAvailable) {
        return { html: versionState.html, readError: null, source };
    }

    return { html: null, readError: null, source };
}

async function sha256Hex(value) {
    const subtle = typeof window !== "undefined" ? window.crypto?.subtle : null;
    if (
        typeof value !== "string" ||
        typeof TextEncoder === "undefined" ||
        !subtle?.digest
    ) {
        return null;
    }
    const bytes = new TextEncoder().encode(value);
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function normalizeAppletToolMetadata(app) {
    if (!app) return null;
    const appletId = app.appletId || null;
    const listedInStore =
        typeof app.listedInStore === "boolean" ? app.listedInStore : null;
    const slug = app.slug || null;

    return {
        appId: app._id || app.id || null,
        appletId,
        name: app.name || null,
        slug,
        description: app.description || null,
        icon: app.icon || null,
        badgeLabel: app.badgeLabel || null,
        imageUrl: app.imageUrl || null,
        imageAlt: app.imageAlt || null,
        tags: Array.isArray(app.tags) ? app.tags : [],
        category: app.category || null,
        metadataGeneratedAt: app.metadataGeneratedAt || null,
        status: app.status || null,
        listedInStore,
        appStoreUrl: slug && listedInStore !== false ? `/apps/${slug}` : null,
        privateUrl: appletId ? `/apps/private/${appletId}` : null,
    };
}

function describeAppletMetadata(metadata) {
    if (!metadata) return null;
    const details = [
        metadata.name ? `Card name: ${metadata.name}` : null,
        metadata.slug ? `slug: ${metadata.slug}` : null,
        metadata.category ? `category: ${metadata.category}` : null,
        metadata.tags?.length ? `tags: ${metadata.tags.join(", ")}` : null,
        metadata.imageUrl ? "image: set" : null,
        metadata.icon ? `icon: ${metadata.icon}` : null,
        metadata.listedInStore === true
            ? `listed in app store at ${metadata.appStoreUrl}`
            : metadata.listedInStore === false
              ? "not listed in app store"
              : null,
    ].filter(Boolean);
    return details.length ? details.join(" — ") : null;
}

async function listApplets(query) {
    const response = await fetch("/api/canvas-applets");
    if (!response.ok) {
        throw new Error(`Failed to fetch applets: ${response.statusText}`);
    }

    const data = await response.json();
    const allApplets = Array.isArray(data?.applets) ? data.applets : [];
    const filtered = query
        ? allApplets.filter((applet) =>
              [
                  applet.name,
                  applet.app?.name,
                  applet.app?.slug,
                  applet.app?.description,
                  applet.app?.category,
                  ...(Array.isArray(applet.app?.tags) ? applet.app.tags : []),
              ]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase()
                  .includes(query),
          )
        : allApplets;

    if (filtered.length === 0) {
        return {
            success: true,
            data: {
                mode: "list",
                applets: [],
                count: 0,
                description: query
                    ? `No applets found matching "${query}".`
                    : "No applets found.",
            },
        };
    }

    const applets = filtered.map((applet) => {
        const metadata = normalizeAppletToolMetadata(applet.app);
        return {
            id: applet._id,
            name: applet.name || "Untitled Applet",
            version: applet.version || 1,
            published: applet.publishedVersionIndex != null,
            publishedVersionIndex: applet.publishedVersionIndex ?? null,
            filePath: applet.filePath || null,
            workspacePath: applet.workspacePath || null,
            fileHash: applet.fileHash || null,
            fileBlobPath: applet.fileBlobPath || null,
            updatedAt: applet.updatedAt || null,
            appMetadata: metadata,
            appStore: metadata,
        };
    });

    const appletList = applets
        .map((applet, index) => {
            const details = [
                `ID: ${applet.id}`,
                applet.version === 1 ? "Legacy workspace applet" : null,
                applet.published
                    ? `Published version: ${applet.publishedVersionIndex + 1}`
                    : "Not published",
            ].filter(Boolean);
            if (applet.workspacePath) {
                details.push(`Editable file: ${applet.workspacePath}`);
            } else if (applet.filePath) {
                details.push(`Stored file URL: ${applet.filePath}`);
            } else if (applet.version === 1) {
                details.push(
                    "Editable file will be created on first GetApplet detail fetch",
                );
            }
            const metadataDescription = describeAppletMetadata(
                applet.appMetadata,
            );
            if (metadataDescription) {
                details.push(metadataDescription);
            }
            return `${index + 1}. **${applet.name}** — ${details.join(" — ")}`;
        })
        .join("\n");

    return {
        success: true,
        data: {
            mode: "list",
            applets,
            count: applets.length,
            description: `Found ${applets.length} applet${applets.length !== 1 ? "s" : ""}:\n\n${appletList}`,
        },
    };
}

async function getAppletDetail({ appletId, context, activeApplet }) {
    const applet = await fetchAppletRecord(appletId);

    const versions = Array.isArray(applet.htmlVersions)
        ? applet.htmlVersions.map((v, i) => ({
              version: i + 1,
              timestamp: v.timestamp || null,
              isPublished: applet.publishedVersionIndex === i,
              ...getVersionContentState(v),
              html: undefined,
          }))
        : [];
    const publishedVersionIndex =
        typeof applet.publishedVersionIndex === "number"
            ? applet.publishedVersionIndex
            : null;
    const workspacePath =
        applet.workspacePath || activeApplet.workspacePath || null;

    let hasUnpublishedChanges = null;
    let workspaceMatchesPublished = null;
    if (workspacePath && publishedVersionIndex != null) {
        const entityId = context?.getEntityId ? context.getEntityId() : null;
        if (entityId) {
            try {
                const workspaceHtml = await readWorkspaceHtml({
                    entityId,
                    path: workspacePath,
                });
                const normalizedWorkspaceHtml =
                    normalizeAppletDraftHtmlForVersioning(
                        applet,
                        workspaceHtml,
                    );
                const publishedState = getVersionContentState(
                    applet.htmlVersions?.[publishedVersionIndex],
                );
                const { html: publishedHtml } =
                    await resolveVersionContentForComparison(
                        publishedState,
                        entityId,
                    );
                workspaceMatchesPublished =
                    publishedHtml != null &&
                    publishedHtml === normalizedWorkspaceHtml;
                hasUnpublishedChanges = !workspaceMatchesPublished;
            } catch {
                // Workspace file may not exist or be inaccessible — leave fields null.
            }
        }
    }

    const appMetadata = normalizeAppletToolMetadata(applet.app);
    const appStore = appMetadata;
    const metadataDescription = describeAppletMetadata(appMetadata);

    const summaryLines = [
        `Applet "${applet.name || "Untitled Applet"}" (id: ${appletId}).`,
        workspacePath ? `Workspace file: ${workspacePath}.` : null,
        `Saved versions: ${versions.length}.`,
        publishedVersionIndex != null
            ? `Published version: ${publishedVersionIndex + 1}.`
            : "Not currently published.",
        appMetadata?.listedInStore === true
            ? `Listed in the app store as "${appMetadata.name}" at ${appMetadata.appStoreUrl}.`
            : appMetadata
              ? `Directory/sidebar metadata exists (${metadataDescription}).`
              : "No directory/sidebar metadata is set.",
        hasUnpublishedChanges === true
            ? "Workspace file has unpublished changes."
            : hasUnpublishedChanges === false
              ? "Workspace file matches the published version."
              : null,
    ].filter(Boolean);

    return {
        success: true,
        data: {
            mode: "detail",
            appletId,
            name: applet.name || null,
            workspacePath,
            filePath: applet.filePath || null,
            versions,
            publishedVersionIndex,
            hasUnpublishedChanges,
            appMetadata,
            appStore,
            description: summaryLines.join(" "),
        },
    };
}

async function getAppletVersionSource({
    appletId,
    versionRequest,
    activeApplet,
}) {
    if (versionRequest == null) {
        throw new Error("version must be a positive whole number.");
    }

    const applet = await fetchAppletRecord(appletId);
    const versions = Array.isArray(applet.htmlVersions)
        ? applet.htmlVersions
        : [];
    const idx = versionRequest - 1;
    if (idx < 0 || idx >= versions.length) {
        throw new Error(
            `Version ${versionRequest} not found. Applet has ${versions.length} saved version(s).`,
        );
    }

    const version = versions[idx] || null;
    const contentState = getVersionContentState(version);
    const publishedVersionIndex =
        typeof applet.publishedVersionIndex === "number"
            ? applet.publishedVersionIndex
            : null;
    const storageSource =
        contentState.workspacePath ||
        contentState.contentBlobPath ||
        contentState.contentUrl ||
        (contentState.storage === "inline"
            ? "inline Mongo version content"
            : null);

    return {
        success: true,
        data: {
            appletId,
            name: applet.name || activeApplet?.appletName || "Untitled Applet",
            version: versionRequest,
            isPublished: publishedVersionIndex === idx,
            timestamp: version?.timestamp || null,
            storage: contentState.storage,
            source: storageSource,
            workspacePath: contentState.workspacePath,
            contentBlobPath: contentState.contentBlobPath,
            contentUrl: contentState.contentUrl,
            contentHash: contentState.contentHash,
            contentContextId: contentState.contentContextId,
            contentAvailableInline: contentState.contentAvailable,
            size: contentState.size,
            description:
                contentState.storage === "external"
                    ? contentState.workspacePath
                        ? `Applet version v${versionRequest} is available at ${contentState.workspacePath}. Read or diff that workspace file directly; no download is needed. Raw blob path: ${contentState.contentBlobPath || "not available"}. Use CopyAppletVersionToDraft to make it editable.`
                        : `Applet version v${versionRequest} is stored at ${storageSource}. Use CopyAppletVersionToDraft to make it editable.`
                    : `Applet version v${versionRequest} is stored inline in the applet record. Use CopyAppletVersionToDraft to make it editable.`,
        },
    };
}

function getLatestVersion(applet) {
    const versions = Array.isArray(applet?.htmlVersions)
        ? applet.htmlVersions
        : [];
    const latestVersion = versions[versions.length - 1] || null;
    const contentState = getVersionContentState(latestVersion);
    return versions.length > 0
        ? {
              index: versions.length - 1,
              number: versions.length,
              ...contentState,
          }
        : {
              index: null,
              number: null,
              html: "",
              contentAvailable: false,
              storage: "inline",
              size: 0,
          };
}

function resolveRequestedAppletId(toolArgs, context) {
    const activeApplet = getActiveAppletContext(context);
    const appletId = (toolArgs.appletId || activeApplet.appletId || "").trim();
    if (!appletId) {
        throw new Error(
            "Applet ID is required when no applet is active in the canvas",
        );
    }
    return { appletId, activeApplet };
}

export async function handleGetAppletState(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const { appletId, activeApplet } = resolveRequestedAppletId(
        toolArgs,
        context,
    );
    const applet = await fetchAppletRecord(appletId);
    const workspacePath =
        applet.workspacePath || activeApplet.workspacePath || null;
    const versions = Array.isArray(applet.htmlVersions)
        ? applet.htmlVersions
        : [];
    const latest = getLatestVersion(applet);
    const publishedVersionIndex =
        typeof applet.publishedVersionIndex === "number"
            ? applet.publishedVersionIndex
            : null;

    let draftHtml = typeof applet.html === "string" ? applet.html : "";
    let draftReadError = null;
    const entityId = context?.getEntityId ? context.getEntityId() : null;
    if (workspacePath && entityId) {
        try {
            draftHtml = await readWorkspaceHtml({
                entityId,
                path: workspacePath,
            });
        } catch (error) {
            draftReadError = error?.message || String(error);
        }
    }

    const normalizedDraftHtml = draftHtml
        ? normalizeAppletDraftHtmlForVersioning(applet, draftHtml)
        : "";
    const versionContentCache = new Map();
    const latestResolved =
        latest.number != null
            ? await resolveVersionContentForComparison(
                  latest,
                  entityId,
                  versionContentCache,
              )
            : { html: null, readError: null, source: null };
    const draftMatchesLatest =
        latestResolved.html != null && normalizedDraftHtml
            ? normalizedDraftHtml === latestResolved.html
            : null;
    const publishedState =
        publishedVersionIndex != null
            ? getVersionContentState(versions[publishedVersionIndex])
            : null;
    const publishedResolved =
        publishedState != null
            ? publishedVersionIndex === latest.index
                ? latestResolved
                : await resolveVersionContentForComparison(
                      publishedState,
                      entityId,
                      versionContentCache,
                  )
            : { html: null, readError: null, source: null };
    const draftMatchesPublished =
        publishedVersionIndex != null &&
        publishedResolved.html != null &&
        normalizedDraftHtml
            ? normalizedDraftHtml === publishedResolved.html
            : null;
    const publishedContentUnavailable =
        publishedVersionIndex != null &&
        publishedState &&
        publishedResolved.html == null;
    const [
        draftContentHash,
        latestResolvedContentHash,
        publishedResolvedContentHash,
    ] = await Promise.all([
        sha256Hex(normalizedDraftHtml),
        sha256Hex(latestResolved.html),
        sha256Hex(publishedResolved.html),
    ]);
    const recommendedAction = !workspacePath
        ? "OpenAppletDraft"
        : draftReadError
          ? "Fix workspace file access"
          : publishedContentUnavailable
            ? "Publish a saved version by number, or repair the externalized published version content"
            : draftMatchesLatest === false
              ? "SaveAppletDraftAsVersion to checkpoint Draft"
              : publishedVersionIndex == null
                ? "No publish action needed unless the user asks to make a saved version live"
                : draftMatchesPublished === false
                  ? "No publish action needed unless the user asks to promote a saved version"
                  : "No applet state action needed";

    return {
        success: true,
        data: {
            appletId,
            name: applet.name || "Untitled Applet",
            draft: {
                workspacePath,
                readable: !draftReadError,
                readError: draftReadError,
                contentHash: draftContentHash,
                contentLength: normalizedDraftHtml.length,
                matchesLatestVersion: draftMatchesLatest,
                matchesPublishedVersion: draftMatchesPublished,
            },
            versions: {
                count: versions.length,
                latestVersion: latest.number,
                latestComparison: latest.number
                    ? {
                          version: latest.number,
                          source: latestResolved.source,
                          workspacePath: latest.workspacePath || null,
                          contentBlobPath: latest.contentBlobPath || null,
                          contentHash: latest.contentHash || null,
                          resolvedContentHash: latestResolvedContentHash,
                          readError: latestResolved.readError || null,
                      }
                    : null,
                publishedVersion:
                    publishedVersionIndex != null
                        ? publishedVersionIndex + 1
                        : null,
                publishedComparison:
                    publishedVersionIndex != null
                        ? {
                              version: publishedVersionIndex + 1,
                              source: publishedResolved.source,
                              workspacePath:
                                  publishedState?.workspacePath || null,
                              contentBlobPath:
                                  publishedState?.contentBlobPath || null,
                              contentHash: publishedState?.contentHash || null,
                              resolvedContentHash: publishedResolvedContentHash,
                              readError: publishedResolved.readError || null,
                          }
                        : null,
            },
            appMetadata: normalizeAppletToolMetadata(applet.app),
            appStore: applet.app || null,
            recommendedAction,
            description:
                `Applet "${applet.name || "Untitled Applet"}" Draft is ${workspacePath || "not materialized"}. ` +
                `Saved versions: ${versions.length}. ` +
                (publishedVersionIndex != null
                    ? `Published version: ${publishedVersionIndex + 1}. `
                    : "Not published. ") +
                (draftMatchesLatest === false
                    ? "Draft differs from the latest saved version. "
                    : draftMatchesLatest === true
                      ? "Draft matches the latest saved version. "
                      : "") +
                `Recommended action: ${recommendedAction}.`,
        },
    };
}

/**
 * Handler for ListApplets tool
 */
export async function handleListApplets(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const activeApplet = getActiveAppletContext(context);
    const activeAppletId = (activeApplet.appletId || "").trim();
    const query = (toolArgs.query || "").trim().toLowerCase();

    try {
        const listResult = await listApplets(query);
        if (activeAppletId) {
            listResult.data.activeAppletId = activeAppletId;
        }
        return listResult;
    } catch (error) {
        throw new Error(`Failed to read applets: ${error.message}`);
    }
}

/**
 * Handler for GetApplet tool
 */
export async function handleGetApplet(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const activeApplet = getActiveAppletContext(context);
    const appletId = (toolArgs.appletId || "").trim();

    if (!appletId) {
        throw new Error("appletId is required.");
    }

    try {
        return await getAppletDetail({
            appletId,
            context,
            activeApplet,
        });
    } catch (error) {
        throw new Error(`Failed to read applet: ${error.message}`);
    }
}

export async function handleSetHomeApplet(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const activeApplet = getActiveAppletContext(context);
    const clear = toolArgs.clear === true;
    const appletId = (toolArgs.appletId || activeApplet.appletId || "").trim();

    if (!clear && !appletId) {
        throw new Error(
            "Applet ID is required when no applet is active in the canvas.",
        );
    }

    try {
        const response = await fetch("/api/users/me/home-applet", {
            method: clear ? "DELETE" : "PUT",
            headers: { "Content-Type": "application/json" },
            ...(clear ? {} : { body: JSON.stringify({ appletId }) }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(
                data.error ||
                    `Failed to update home applet (${response.status})`,
            );
        }

        const data = await response.json();
        return {
            success: true,
            data: {
                homeAppletId: data.homeAppletId || null,
                description: data.homeAppletId
                    ? `Home page now uses applet ${data.homeAppletId}.`
                    : "Home applet cleared. Home page will use the default digest.",
            },
        };
    } catch (error) {
        throw new Error(`Failed to update home applet: ${error.message}`);
    }
}

export async function handleGetAppletVersionSource(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const { appletId, activeApplet } = resolveRequestedAppletId(
        toolArgs,
        context,
    );
    const versionRequest = normalizeVersionRequest(toolArgs.version);

    try {
        return await getAppletVersionSource({
            appletId,
            versionRequest,
            activeApplet,
        });
    } catch (error) {
        throw new Error(
            `Failed to read applet version source: ${error.message}`,
        );
    }
}

/**
 * Internal applet update path used by explicit applet tools.
 * Updates applet metadata, file link, and publication/version state
 */
async function handleAppletUpdate(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const activeApplet = getActiveAppletContext(context);
    const explicitAppletId = (toolArgs.appletId || "").trim();
    const appletId = (explicitAppletId || activeApplet.appletId || "").trim();
    const { userMessage } = toolArgs;

    if (!appletId) {
        throw new Error(
            "Applet ID is required when no applet is active in the canvas",
        );
    }

    const mutableFields = [
        "name",
        "workspacePath",
        "appName",
        "appSlug",
        "appDescription",
        "appIcon",
        "appImageUrl",
        "appImageLightUrl",
        "appImageDarkUrl",
        "appImageAlt",
        "appBadgeLabel",
        "appTags",
        "appCategory",
        "appMetadataGeneratedAt",
        "publishToAppStore",
        "publish",
        "unpublish",
        "saveVersion",
        "restoreVersion",
        "publishVersion",
        "deleteVersion",
        "clearSdkSuspension",
    ];
    const hasAnyUpdate = mutableFields.some((field) => hasOwn(toolArgs, field));

    if (!hasAnyUpdate) {
        throw new Error("At least one applet field must be provided");
    }

    const requestBody = {};
    const updatedFields = [];
    const isRestoreRequest = hasOwn(toolArgs, "restoreVersion");
    const isPublishVersionRequest = hasOwn(toolArgs, "publishVersion");
    const isDeleteVersionRequest = hasOwn(toolArgs, "deleteVersion");
    const restoreVersion = isRestoreRequest
        ? normalizeVersionRequest(toolArgs.restoreVersion)
        : null;
    const publishVersion = isPublishVersionRequest
        ? normalizeVersionRequest(toolArgs.publishVersion)
        : null;
    const deleteVersion = isDeleteVersionRequest
        ? normalizeVersionRequest(toolArgs.deleteVersion)
        : null;

    if (isRestoreRequest && restoreVersion == null) {
        throw new Error("restoreVersion must be a positive whole number.");
    }
    if (isPublishVersionRequest && publishVersion == null) {
        throw new Error("publishVersion must be a positive whole number.");
    }
    if (isDeleteVersionRequest && deleteVersion == null) {
        throw new Error("deleteVersion must be a positive whole number.");
    }

    if (hasOwn(toolArgs, "name")) {
        requestBody.name = toolArgs.name;
        updatedFields.push("name");
    }

    const publishToAppStore = hasOwn(toolArgs, "publishToAppStore")
        ? toolArgs.publishToAppStore === true
        : undefined;

    if (publishToAppStore !== undefined) {
        requestBody.publishToAppStore = publishToAppStore;
        updatedFields.push("publishToAppStore");
    }
    if (hasOwn(toolArgs, "appName")) {
        requestBody.appName = toolArgs.appName;
        updatedFields.push("appName");
    }
    if (hasOwn(toolArgs, "appSlug")) {
        requestBody.appSlug = toolArgs.appSlug;
        updatedFields.push("appSlug");
    }
    if (hasOwn(toolArgs, "appDescription")) {
        requestBody.appDescription = toolArgs.appDescription;
        updatedFields.push("appDescription");
    }
    if (hasOwn(toolArgs, "appIcon")) {
        requestBody.appIcon = toolArgs.appIcon;
        updatedFields.push("appIcon");
    }
    if (hasOwn(toolArgs, "appImageUrl")) {
        requestBody.appImageUrl = toolArgs.appImageUrl;
        updatedFields.push("appImageUrl");
    }
    if (hasOwn(toolArgs, "appImageLightUrl")) {
        requestBody.appImageLightUrl = toolArgs.appImageLightUrl;
        updatedFields.push("appImageLightUrl");
    }
    if (hasOwn(toolArgs, "appImageDarkUrl")) {
        requestBody.appImageDarkUrl = toolArgs.appImageDarkUrl;
        updatedFields.push("appImageDarkUrl");
    }
    if (hasOwn(toolArgs, "appImageAlt")) {
        requestBody.appImageAlt = toolArgs.appImageAlt;
        updatedFields.push("appImageAlt");
    }
    if (hasOwn(toolArgs, "appBadgeLabel")) {
        requestBody.appBadgeLabel = toolArgs.appBadgeLabel;
        updatedFields.push("appBadgeLabel");
    }
    if (hasOwn(toolArgs, "appTags")) {
        requestBody.appTags = Array.isArray(toolArgs.appTags)
            ? toolArgs.appTags
            : [];
        updatedFields.push("appTags");
    }
    if (hasOwn(toolArgs, "appCategory")) {
        requestBody.appCategory = toolArgs.appCategory;
        updatedFields.push("appCategory");
    }
    if (hasOwn(toolArgs, "appMetadataGeneratedAt")) {
        requestBody.appMetadataGeneratedAt = toolArgs.appMetadataGeneratedAt;
        updatedFields.push("appMetadataGeneratedAt");
    }
    if (hasOwn(toolArgs, "publish")) {
        requestBody.publish = toolArgs.publish === true;
        updatedFields.push("publish");
    }
    if (hasOwn(toolArgs, "unpublish")) {
        requestBody.unpublish = toolArgs.unpublish === true;
        updatedFields.push("unpublish");
    }
    if (hasOwn(toolArgs, "saveVersion")) {
        requestBody.saveVersion = toolArgs.saveVersion === true;
        updatedFields.push("saveVersion");
    }
    if (isRestoreRequest) {
        requestBody.restoreVersion = restoreVersion;
        updatedFields.push("restoreVersion");
    }
    if (isPublishVersionRequest) {
        requestBody.publishVersion = publishVersion;
        updatedFields.push("publishVersion");
    }
    if (isDeleteVersionRequest) {
        requestBody.deleteVersion = deleteVersion;
        updatedFields.push("deleteVersion");
    }
    if (hasOwn(toolArgs, "clearSdkSuspension")) {
        requestBody.clearSdkSuspension = toolArgs.clearSdkSuspension === true;
        updatedFields.push("clearSdkSuspension");
    }

    const providedWorkspacePath = toolArgs.workspacePath?.trim() || null;
    const needsWorkspaceHtml =
        !isRestoreRequest &&
        !isPublishVersionRequest &&
        !isDeleteVersionRequest &&
        (!!providedWorkspacePath ||
            requestBody.publish === true ||
            requestBody.saveVersion === true);

    const canUseActiveWorkspace =
        !explicitAppletId || explicitAppletId === activeApplet.appletId;
    let targetWorkspacePath = providedWorkspacePath || null;
    let appletRecord = null;

    if (
        isRestoreRequest ||
        isPublishVersionRequest ||
        isDeleteVersionRequest ||
        (needsWorkspaceHtml && !providedWorkspacePath)
    ) {
        appletRecord = await fetchAppletRecord(appletId);
        targetWorkspacePath =
            targetWorkspacePath || appletRecord.workspacePath || null;
    }
    if (!targetWorkspacePath && canUseActiveWorkspace) {
        targetWorkspacePath = activeApplet.workspacePath;
    }

    if (providedWorkspacePath) {
        requestBody.workspacePath = providedWorkspacePath;
        updatedFields.push("workspacePath");
    }

    if (isRestoreRequest) {
        if (!targetWorkspacePath) {
            throw new Error(
                "No editable workspace file is linked to this applet",
            );
        }
    } else if (needsWorkspaceHtml) {
        const entityId = context?.getEntityId ? context.getEntityId() : null;
        if (!targetWorkspacePath) {
            throw new Error(
                "No editable workspace file is linked to this applet",
            );
        }
        const workspaceHtml = await readWorkspaceHtml({
            entityId,
            path: targetWorkspacePath,
        });
        const htmlAppletName =
            requestBody.name ||
            appletRecord?.name ||
            activeApplet.appletName ||
            "Applet";
        requestBody.html = injectAppletIdMeta(
            injectAppletMetaTags(workspaceHtml, htmlAppletName),
            appletId,
        );
    }

    const response = await fetch(
        `/api/canvas-applets/${encodeURIComponent(appletId)}`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        },
    );

    if (!response.ok) {
        let errorMessage = `Failed to update applet (${response.status})`;
        try {
            const data = await response.json();
            errorMessage = data.error || errorMessage;
        } catch {
            // Ignore JSON parse failures and use the fallback error.
        }
        throw new Error(errorMessage);
    }

    const updatedApplet = await response.json();

    const appletName =
        updatedApplet?.name ||
        appletRecord?.name ||
        activeApplet.appletName ||
        "Applet";
    const resolvedWorkspacePath = targetWorkspacePath || null;

    const syncedHtml = requestBody.html || updatedApplet?.html || null;
    const latestVersionNumber = toVisibleVersionNumber(
        updatedApplet.latestVersionIndex,
    );
    const publishedVersionNumber = toVisibleVersionNumber(
        updatedApplet.publishedVersionIndex,
    );
    const updateSummary = [];

    if (updatedApplet.versionSaved && latestVersionNumber != null) {
        updateSummary.push(`Saved as v${latestVersionNumber}.`);
    }
    if (updatedApplet.versionDeleted && updatedApplet.deletedVersion != null) {
        updateSummary.push(`Deleted v${updatedApplet.deletedVersion}.`);
    }
    if (publishedVersionNumber != null) {
        updateSummary.push(`Published version: v${publishedVersionNumber}.`);
    }

    if (activeApplet.appletId === appletId) {
        await syncActiveAppletCanvas(context, {
            appletId,
            appletName,
            workspacePath: resolvedWorkspacePath,
            htmlContent: syncedHtml,
            versionSaved: !!updatedApplet.versionSaved,
            versionDeleted: !!updatedApplet.versionDeleted,
            latestVersionIndex: updatedApplet.latestVersionIndex ?? null,
        });
    }

    return {
        success: true,
        data: {
            appletId,
            name: appletName,
            workspacePath: resolvedWorkspacePath,
            updatedFields,
            publishedVersionNumber,
            versionSaved: !!updatedApplet.versionSaved,
            versionDeleted: !!updatedApplet.versionDeleted,
            deletedVersion: updatedApplet.deletedVersion ?? null,
            latestVersionNumber,
            savedVersionNumber: updatedApplet.versionSaved
                ? latestVersionNumber
                : null,
            appMetadata: normalizeAppletToolMetadata(updatedApplet.app),
            description:
                `Updated "${appletName}" (${updatedFields.join(", ")}). ${updateSummary.join(" ")} ${userMessage || ""}`.trim(),
        },
    };
}

export async function handleDeleteAppletVersion(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const activeApplet = getActiveAppletContext(context);
    const appletId = (toolArgs.appletId || activeApplet.appletId || "").trim();
    const version = normalizeVersionRequest(toolArgs.version);

    if (!appletId) {
        throw new Error(
            "Applet ID is required when no applet is active in the canvas",
        );
    }
    if (version == null) {
        throw new Error("version must be a positive whole number.");
    }

    const appletName =
        activeApplet.appletName || toolArgs.appletName || appletId;
    const confirmMessage = translateToolText(
        context,
        'Delete version {{version}} of "{{name}}"? Later versions will be renumbered.',
        { version, name: appletName },
    );
    const confirmed = await requestToolConfirmation(context, {
        title: translateToolText(context, "Delete Applet Version?"),
        description: confirmMessage,
        confirmLabel: translateToolText(context, "Delete"),
        cancelLabel: translateToolText(context, "Cancel"),
        destructive: true,
        fallbackMessage: confirmMessage,
    });

    if (!confirmed) {
        return {
            success: true,
            data: {
                appletId,
                version,
                deleted: false,
                description:
                    `${translateToolText(context, "Applet version deletion canceled.")} ${toolArgs.userMessage || ""}`.trim(),
            },
        };
    }

    const result = await handleAppletUpdate(
        {
            toolArgs: {
                appletId,
                deleteVersion: version,
                userMessage: toolArgs.userMessage,
            },
        },
        context,
    );

    return {
        ...result,
        data: {
            ...result.data,
            deleted: true,
            deletedVersion: version,
        },
    };
}

export async function handleCopyAppletVersionToDraft(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    return handleAppletUpdate(
        {
            toolArgs: {
                appletId: toolArgs.appletId,
                restoreVersion: toolArgs.version,
                userMessage: toolArgs.userMessage,
            },
        },
        context,
    );
}

export async function handleSaveAppletDraftAsVersion(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    return handleAppletUpdate(
        {
            toolArgs: {
                appletId: toolArgs.appletId,
                saveVersion: true,
                userMessage: toolArgs.userMessage,
            },
        },
        context,
    );
}

export async function handlePublishAppletVersion(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const version = normalizeVersionRequest(toolArgs.version);
    if (
        hasOwn(toolArgs, "version") &&
        toolArgs.version != null &&
        version == null
    ) {
        throw new Error("version must be a positive whole number.");
    }

    if (version != null) {
        return handleAppletUpdate(
            {
                toolArgs: {
                    appletId: toolArgs.appletId,
                    publishVersion: version,
                    userMessage: toolArgs.userMessage,
                },
            },
            context,
        );
    }

    return handleAppletUpdate(
        {
            toolArgs: {
                appletId: toolArgs.appletId,
                publish: true,
                userMessage: toolArgs.userMessage,
            },
        },
        context,
    );
}

export async function handleUnpublishApplet(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    return handleAppletUpdate(
        {
            toolArgs: {
                appletId: toolArgs.appletId,
                unpublish: true,
                userMessage: toolArgs.userMessage,
            },
        },
        context,
    );
}

export async function handleUpdateAppletMetadata(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const contentOrPublishFields = [
        "publish",
        "unpublish",
        "saveVersion",
        "restoreVersion",
        "publishVersion",
        "deleteVersion",
    ];
    const invalidField = contentOrPublishFields.find((field) =>
        hasOwn(toolArgs, field),
    );
    if (invalidField) {
        throw new Error(
            `${invalidField} is not supported by UpdateAppletMetadata; use the dedicated applet tool for that state change.`,
        );
    }
    return handleAppletUpdate(toolInfo, context);
}

export async function handleGenerateAppletMetadata(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const { appletId } = resolveRequestedAppletId(toolArgs, context);

    try {
        const result = await generateAndApplyAppletMetadata(appletId);
        await syncActiveAppletCanvas(context, { appletId });

        return {
            success: true,
            data: {
                appletId,
                source: result.source || "heuristic",
                metadata: result.metadata,
                appMetadata: normalizeAppletToolMetadata(result.applet?.app),
                updatedFields: Object.keys(result.metadata || {}),
                description:
                    "Generated and applied applet card/sidebar metadata without publishing or changing Draft HTML.",
            },
        };
    } catch (error) {
        throw new Error(`Failed to generate applet metadata: ${error.message}`);
    }
}

export async function handleGenerateAppletImage(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const { appletId } = resolveRequestedAppletId(toolArgs, context);
    const waitForResult = toolArgs.waitForResult !== false;
    const updateMetadata = toolArgs.updateMetadata !== false && waitForResult;
    let metadata =
        toolArgs.metadata &&
        typeof toolArgs.metadata === "object" &&
        !Array.isArray(toolArgs.metadata)
            ? toolArgs.metadata
            : null;

    try {
        if (!metadata) {
            const applet = await fetchAppletRecord(appletId);
            metadata = normalizeAppletToolMetadata(applet.app) || {
                name: applet.name || "Untitled Applet",
            };
        }

        const result = await generateAndApplyAppletImage({
            appletId,
            metadata,
            prompt: toolArgs.prompt,
            styleCues: toolArgs.styleCues,
            quality: toolArgs.quality,
            aspectRatio: toolArgs.aspectRatio,
            waitForResult,
            updateMetadata,
            onLightMetadataUpdated: () =>
                syncActiveAppletCanvas(context, { appletId }),
        });

        if (result.metadataUpdated) {
            await syncActiveAppletCanvas(context, { appletId });
        }

        return {
            success: true,
            data: {
                appletId,
                taskId: result.taskId,
                jobId: result.jobId || null,
                lightTaskId: result.lightTaskId || null,
                lightJobId: result.lightJobId || null,
                lightPending: !!result.lightPending,
                lightError: result.lightError || null,
                variants: result.variants || null,
                model: result.model || null,
                prompt: result.prompt || null,
                imageUrl: result.imageUrl || null,
                imageLightUrl: result.imageLightUrl || null,
                imageDarkUrl: result.imageDarkUrl || null,
                metadataUpdated: result.metadataUpdated,
                description: waitForResult
                    ? result.metadataUpdated
                        ? "Generated dark applet card artwork, applied it to applet metadata, and queued the light companion image to fill in when ready."
                        : "Generated dark applet card artwork without updating applet metadata."
                    : "Started applet card artwork generation in the background.",
            },
        };
    } catch (error) {
        throw new Error(`Failed to generate applet image: ${error.message}`);
    }
}

export async function handleOpenAppletDraft(toolInfo, context) {
    const toolArgs = getToolArgs(toolInfo);
    const { appletId, activeApplet } = resolveRequestedAppletId(
        toolArgs,
        context,
    );

    const applet = await fetchAppletRecord(appletId);
    const workspacePath = applet.workspacePath || null;
    const appletName = applet.name || "Untitled Applet";
    let draftHtml = null;
    const entityId = context?.getEntityId ? context.getEntityId() : null;

    if (workspacePath && entityId) {
        try {
            draftHtml = await readWorkspaceHtml({
                entityId,
                path: workspacePath,
            });
        } catch {
            draftHtml = null;
        }
    }

    if (context?.dispatch && workspacePath && draftHtml) {
        if (activeApplet.appletId === appletId) {
            await syncActiveAppletCanvas(context, {
                appletId,
                appletName,
                workspacePath,
                htmlContent: draftHtml,
            });
        } else {
            const { openCanvas, openCanvasForChat } = await import(
                "../../src/stores/chatSlice"
            );
            const chatId = context?.chatId ? String(context.chatId) : null;
            const canvas = {
                type: "html",
                title: appletName,
                filename: appletName,
                url: applet.filePath || null,
                workspacePath,
                htmlContent: draftHtml,
                htmlStatus: "live",
                appletId,
                fileHash: applet.fileHash || null,
                blobPath: applet.fileBlobPath || null,
                appletActiveVersionIndex: null,
                appletActiveVersionNumber: null,
                appletIsViewingDraft: true,
            };
            context.dispatch(
                chatId
                    ? openCanvasForChat({ chatId, canvas })
                    : openCanvas(canvas),
            );
        }
    }

    return {
        success: true,
        data: {
            appletId,
            name: appletName,
            workspacePath,
            opened: !!(context?.dispatch && workspacePath && draftHtml),
            description: workspacePath
                ? `Applet "${appletName}" Draft is at ${workspacePath}.`
                : `Applet "${appletName}" has no Draft workspace path.`,
        },
    };
}

/**
 * Handler for DeleteApplet tool
 * Deletes a file-based canvas applet after browser confirmation. If appletId is
 * omitted, deletes the applet currently active in the canvas (and closes its tab).
 */
export async function handleDeleteApplet(toolInfo, context) {
    const toolArgs = toolInfo.toolArgs || toolInfo;
    const activeApplet = getActiveAppletContext(context);
    const appletId = (toolArgs.appletId || activeApplet.appletId || "").trim();
    const appletName = (
        toolArgs.appletName ||
        (appletId === activeApplet.appletId ? activeApplet.appletName : null) ||
        appletId
    ).trim();
    const { userMessage } = toolArgs;
    const isActive = appletId && appletId === activeApplet.appletId;

    if (!appletId) {
        throw new Error(
            "Applet ID is required when no applet is active in the canvas",
        );
    }

    const confirmMessage = translateToolText(
        context,
        'Delete "{{name}}"? This will remove the applet and its saved data.',
        { name: appletName },
    );
    const confirmed = await requestToolConfirmation(context, {
        title: translateToolText(context, "Delete Applet?"),
        description: confirmMessage,
        confirmLabel: translateToolText(context, "Delete"),
        cancelLabel: translateToolText(context, "Cancel"),
        destructive: true,
        fallbackMessage: confirmMessage,
    });

    if (!confirmed) {
        return {
            success: true,
            data: {
                appletId,
                deleted: false,
                description:
                    `${translateToolText(context, "Applet deletion canceled.")} ${userMessage || ""}`.trim(),
            },
        };
    }

    const response = await fetch(
        `/api/canvas-applets/${encodeURIComponent(appletId)}`,
        {
            method: "DELETE",
        },
    );

    if (!response.ok) {
        let errorMessage = `Failed to delete applet (${response.status})`;
        try {
            const data = await response.json();
            errorMessage = data.error || errorMessage;
        } catch {
            // Ignore JSON parse failures and use the fallback error.
        }
        throw new Error(errorMessage);
    }

    if (context?.dispatch) {
        const {
            closeCanvas,
            closeCanvasForChat,
            closeCanvasTab,
            closeCanvasTabForChat,
            incrementFileBrowserRefresh,
        } = await import("../../src/stores/chatSlice");
        const chatId = context?.chatId ? String(context.chatId) : null;
        const snapshot = getCanvasSnapshot(context);
        const deletedTab = findCanvasTabForApplet(snapshot, appletId);
        const activeTabId = deletedTab?.id || snapshot.activeTabId || null;
        if (deletedTab?.id || (isActive && activeTabId)) {
            context.dispatch(
                chatId
                    ? closeCanvasTabForChat({ chatId, tabId: activeTabId })
                    : closeCanvasTab(activeTabId),
            );
        } else if (isActive) {
            context.dispatch(
                chatId ? closeCanvasForChat({ chatId }) : closeCanvas(),
            );
        }
        context.dispatch(incrementFileBrowserRefresh());
    }

    return {
        success: true,
        data: {
            appletId,
            deleted: true,
            description: `${translateToolText(context, 'Deleted "{{name}}".', {
                name: appletName,
            })} ${userMessage || ""}`.trim(),
        },
    };
}

/**
 * Handler for SearchChats tool
 * Searches chats by title or content using existing search functionality
 */
export async function handleSearchChats(toolInfo, context) {
    // Get parameters from tool args
    const query = toolInfo.toolArgs?.query || toolInfo.query;
    const searchType =
        toolInfo.toolArgs?.searchType || toolInfo.searchType || "title";
    const limit = toolInfo.toolArgs?.limit || toolInfo.limit || 20;

    if (!query || typeof query !== "string" || !query.trim()) {
        throw new Error("Search query is required");
    }

    try {
        // Use existing search API endpoints (DRY - reusing existing functionality)
        const searchParam = searchType === "content" ? "content" : "search";
        const url = `/api/chats?${searchParam}=${encodeURIComponent(query.trim())}&limit=${limit}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to search chats: ${response.statusText}`);
        }

        const chats = await response.json();

        // Format chats list for display
        if (!Array.isArray(chats) || chats.length === 0) {
            return {
                success: true,
                data: {
                    chats: [],
                    count: 0,
                    query: query.trim(),
                    searchType,
                    description: `No chats found matching "${query.trim()}" ${searchType === "content" ? "in chat content" : "in titles"}.`,
                },
            };
        }

        // Format chats with ID, title, and metadata
        const formattedChats = chats.map((chat) => ({
            id: chat._id,
            title: chat.title || "Untitled Chat",
            updatedAt: chat.updatedAt,
            messageCount: chat.messages?.length || 0,
        }));

        // Create a formatted list string
        const chatsList = formattedChats
            .map(
                (chat, index) =>
                    `${index + 1}. **${chat.title}** (ID: ${chat.id})${chat.messageCount > 0 ? ` - ${chat.messageCount} message${chat.messageCount !== 1 ? "s" : ""}` : ""}`,
            )
            .join("\n");

        const exampleChatId = formattedChats[0]?.id || "chat-id";
        const searchTypeDescription =
            searchType === "content" ? "in chat content" : "in chat titles";

        return {
            success: true,
            data: {
                chats: formattedChats,
                count: formattedChats.length,
                query: query.trim(),
                searchType,
                description: `Found ${formattedChats.length} chat${formattedChats.length !== 1 ? "s" : ""} matching "${query.trim()}" ${searchTypeDescription}:\n\n${chatsList}\n\nYou can navigate to any chat by using the Navigate tool with the chat ID (e.g., /chat/${exampleChatId}).`,
            },
        };
    } catch (error) {
        throw new Error(`Failed to search chats: ${error.message}`);
    }
}

/**
 * Handler for GetChatContent tool
 * Fetches a chat by ID using existing API endpoint
 */
export async function handleGetChatContent(toolInfo, context) {
    // Get chatId from tool parameters
    const chatId = toolInfo.toolArgs?.chatId || toolInfo.chatId;

    if (!chatId || typeof chatId !== "string" || !chatId.trim()) {
        throw new Error("Chat ID is required");
    }

    try {
        // Use existing API endpoint (DRY - reusing existing functionality)
        const response = await fetch(
            `/api/chats/${encodeURIComponent(chatId.trim())}`,
        );

        if (!response.ok) {
            if (response.status === 404) {
                return {
                    success: true,
                    data: {
                        chat: null,
                        chatId: chatId.trim(),
                        description: `Chat with ID "${chatId.trim()}" not found. It may have been deleted or you may not have access to it.`,
                    },
                };
            }
            if (response.status === 403 || response.status === 401) {
                return {
                    success: true,
                    data: {
                        chat: null,
                        chatId: chatId.trim(),
                        description: `You don't have permission to access chat with ID "${chatId.trim()}".`,
                    },
                };
            }
            throw new Error(`Failed to fetch chat: ${response.statusText}`);
        }

        const chat = await response.json();

        if (!chat || !chat._id) {
            return {
                success: true,
                data: {
                    chat: null,
                    chatId: chatId.trim(),
                    description: `Chat with ID "${chatId.trim()}" not found.`,
                },
            };
        }

        // Format messages for display
        const messages = chat.messages || [];
        const messagesList = messages
            .map((msg, index) => {
                const sender =
                    msg.sender === "assistant" ? "Assistant" : "User";
                const payload =
                    typeof msg.payload === "string"
                        ? msg.payload
                        : Array.isArray(msg.payload)
                          ? msg.payload
                                .map((p) =>
                                    typeof p === "string"
                                        ? p
                                        : JSON.stringify(p),
                                )
                                .join(" ")
                          : JSON.stringify(msg.payload);
                return `${index + 1}. [${sender}]: ${payload.substring(0, 200)}${payload.length > 200 ? "..." : ""}`;
            })
            .join("\n");

        const messageCount = messages.length;
        const title = chat.title || "Untitled Chat";

        return {
            success: true,
            data: {
                chat: {
                    id: chat._id,
                    title,
                    messageCount,
                    messages: messages,
                    isPublic: chat.isPublic || false,
                    readOnly: chat.readOnly || false,
                    selectedEntityId: chat.selectedEntityId || null,
                },
                description: `Retrieved chat "${title}" (ID: ${chat._id}) with ${messageCount} message${messageCount !== 1 ? "s" : ""}:\n\n${messagesList}${messageCount > 0 ? `\n\nYou can navigate to this chat using the Navigate tool with /chat/${chat._id}.` : ""}`,
            },
        };
    } catch (error) {
        throw new Error(`Failed to fetch chat content: ${error.message}`);
    }
}

/**
 * Tool handlers mapping
 * Maps tool names (lowercase) to their handler functions
 */
export const CHAT_TOOL_HANDLERS = {
    listapplets: handleListApplets,
    getapplet: handleGetApplet,
    sethomeapplet: handleSetHomeApplet,
    getappletstate: handleGetAppletState,
    openappletdraft: handleOpenAppletDraft,
    saveappletdraftasversion: handleSaveAppletDraftAsVersion,
    publishappletversion: handlePublishAppletVersion,
    deleteappletversion: handleDeleteAppletVersion,
    updateappletmetadata: handleUpdateAppletMetadata,
    generateappletmetadata: handleGenerateAppletMetadata,
    generateappletimage: handleGenerateAppletImage,
    unpublishapplet: handleUnpublishApplet,
    getappletversionsource: handleGetAppletVersionSource,
    copyappletversiontodraft: handleCopyAppletVersionToDraft,
    deleteapplet: handleDeleteApplet,
    searchchats: handleSearchChats,
    getchatcontent: handleGetChatContent,
};
