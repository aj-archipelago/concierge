// chatTools.js
// Chat page-specific client-side tool handlers

import { requestToolConfirmation, translateToolText } from "./toolInteraction";
import {
    injectAppletIdMeta,
    injectAppletMetaTags,
} from "../../src/utils/appletHtmlUtils";

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
                "List the user's Concierge applets from the `/api/canvas-applets` registry, optionally filtered by `query`. Use this to find applet IDs and current Draft workspace paths. Do not use media asset APIs for applet metadata; Mongo applet IDs only belong to this Concierge applet registry.",
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
                "Read one Concierge applet record from the `/api/canvas-applets` registry. Returns metadata, immutable saved version summaries, published version pointer, app-store status, and editable Draft workspace file path. This does not return saved version HTML; external saved versions include a workspacePath under `/workspace/files/...` when available, so read or diff that workspace file instead of downloading blob URLs. Use GetAppletVersionSource for one version's source metadata, or CopyAppletVersionToDraft to make a version editable.",
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
        icon: "🔎",
        function: {
            name: "GetAppletState",
            description:
                "Return the current state of one applet in Draft/Version terms. Draft is the mutable workspace HTML file. Saved versions are immutable checkpoints. Published applets point at one saved version. This tool reports the Draft workspace path, saved version count, latest saved version, published version, whether Draft differs from the latest saved version, and the recommended next action. appletId defaults to the active canvas applet.",
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
                "Snapshot the current Draft workspace HTML as a new immutable applet version. Use this after editing an applet's workspace file with the workspace shell when the user wants a saved checkpoint. This does not publish. If Draft matches the latest saved version, no duplicate version is created. appletId defaults to the active canvas applet.",
            descriptionAr:
                "احفظ مسودة HTML الحالية كإصدار ثابت جديد للتطبيق. لا ينشر التطبيق ولا ينشئ نسخة مكررة إذا كانت المسودة تطابق آخر إصدار محفوظ.",
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
                "Publish an immutable applet version. If `version` is provided, publishes that saved version. If `version` is omitted, snapshots the current Draft workspace HTML as a new immutable version when needed, then publishes that version. Publishing never points directly at mutable Draft. appletId defaults to the active canvas applet.",
            descriptionAr:
                "انشر إصداراً ثابتاً من التطبيق. إذا لم يُمرر رقم إصدار، تُحفظ المسودة الحالية كإصدار عند الحاجة ثم يُنشر ذلك الإصدار.",
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
                            "Optional 1-indexed saved version to publish. Omit to publish Draft by first snapshotting it if needed.",
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
                "Update residual Concierge applet metadata that is not Draft/version content. Use this for rename (`name`), relink to a different existing workspace HTML file (`workspacePath`), publish/update app-store metadata (`publishToAppStore: true, appName, appSlug, appDescription`), remove from the app store (`publishToAppStore: false`), or clear a temporary SDK suspension after fixing runaway applet code (`clearSdkSuspension: true`). Do not use this for normal applet content workflow: edit Draft with the workspace shell, use SaveAppletDraftAsVersion for checkpoints, CopyAppletVersionToDraft for rollbacks, and PublishAppletVersion for direct-link publishing. appletId defaults to the active canvas applet.",
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
                            "Optional app store name to set when publishing to the app store.",
                    },
                    appSlug: {
                        type: "string",
                        description:
                            "Optional app store slug to set when publishing to the app store.",
                    },
                    appDescription: {
                        type: "string",
                        description:
                            "Optional app store description to set when publishing to the app store.",
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
                "Copy one immutable saved Concierge applet version into the editable Draft workspace file. Use this whenever the user says restore, roll back, use v5, go back to version N, or make an older version editable. This does not mutate the saved version and does not create a new version number. After restore, Draft is active in the canvas; call SaveAppletDraftAsVersion only if the user wants a new saved checkpoint, or PublishAppletVersion if they want to ship it.",
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
    const activeTabId = context?.getActiveTabId
        ? context.getActiveTabId()
        : null;
    const { refreshActiveHtmlCanvas: refreshCanvasAction, updateCanvasTab } =
        await import("../../src/stores/chatSlice");

    if (activeTabId) {
        const nextTabContent = {
            appletId,
        };

        if (versionSaved || versionDeleted) {
            nextTabContent.appletVersionKey = Date.now();
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
            updateCanvasTab({
                tabId: activeTabId,
                content: nextTabContent,
            }),
        );
    }

    if (htmlContent) {
        dispatch(refreshCanvasAction({ htmlContent }));
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

async function listApplets(query) {
    const response = await fetch("/api/canvas-applets");
    if (!response.ok) {
        throw new Error(`Failed to fetch applets: ${response.statusText}`);
    }

    const data = await response.json();
    const allApplets = Array.isArray(data?.applets) ? data.applets : [];
    const filtered = query
        ? allApplets.filter((applet) =>
              (applet.name || "").toLowerCase().includes(query),
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

    const applets = filtered.map((applet) => ({
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
    }));

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
                const publishedHtml = publishedState.contentAvailable
                    ? publishedState.html
                    : null;
                workspaceMatchesPublished =
                    publishedHtml != null &&
                    publishedHtml === normalizedWorkspaceHtml;
                hasUnpublishedChanges = !workspaceMatchesPublished;
            } catch {
                // Workspace file may not exist or be inaccessible — leave fields null.
            }
        }
    }

    const app = applet.app || null;
    const appStore = app
        ? {
              status: app.status || null,
              slug: app.slug || null,
              name: app.name || null,
              url: app.slug ? `/apps/${app.slug}` : null,
          }
        : null;

    const summaryLines = [
        `Applet "${applet.name || "Untitled Applet"}" (id: ${appletId}).`,
        workspacePath ? `Workspace file: ${workspacePath}.` : null,
        `Saved versions: ${versions.length}.`,
        publishedVersionIndex != null
            ? `Published version: ${publishedVersionIndex + 1}.`
            : "Not currently published.",
        appStore
            ? `Published to app store as "${appStore.name}" at ${appStore.url}.`
            : "Not in the app store.",
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
    const draftMatchesLatest =
        latest.contentAvailable && normalizedDraftHtml
            ? normalizedDraftHtml === latest.html
            : null;
    const publishedState =
        publishedVersionIndex != null
            ? getVersionContentState(versions[publishedVersionIndex])
            : null;
    const draftMatchesPublished =
        publishedVersionIndex != null &&
        publishedState?.contentAvailable &&
        normalizedDraftHtml
            ? normalizedDraftHtml === publishedState.html
            : null;
    const recommendedAction = !workspacePath
        ? "OpenAppletDraft"
        : draftReadError
          ? "Fix workspace file access"
          : publishedVersionIndex != null &&
              publishedState &&
              !publishedState.contentAvailable
            ? "Republish Draft or repair the externalized published version content"
            : draftMatchesLatest === false
              ? "SaveAppletDraftAsVersion to checkpoint Draft, or PublishAppletVersion to snapshot and publish it"
              : publishedVersionIndex == null
                ? "PublishAppletVersion when ready"
                : draftMatchesPublished === false
                  ? "PublishAppletVersion when ready"
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
                matchesLatestVersion: draftMatchesLatest,
                matchesPublishedVersion: draftMatchesPublished,
            },
            versions: {
                count: versions.length,
                latestVersion: latest.number,
                publishedVersion:
                    publishedVersionIndex != null
                        ? publishedVersionIndex + 1
                        : null,
            },
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
    const appletId = (toolArgs.appletId || activeApplet.appletId || "").trim();
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

    const hasAppStoreMetadata =
        hasOwn(toolArgs, "appName") ||
        hasOwn(toolArgs, "appSlug") ||
        hasOwn(toolArgs, "appDescription");
    const publishToAppStore = hasOwn(toolArgs, "publishToAppStore")
        ? toolArgs.publishToAppStore === true
        : hasAppStoreMetadata
          ? true
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

    let targetWorkspacePath =
        providedWorkspacePath || activeApplet.workspacePath;
    let appletRecord = null;

    if (
        isRestoreRequest ||
        isPublishVersionRequest ||
        isDeleteVersionRequest ||
        (!targetWorkspacePath && needsWorkspaceHtml)
    ) {
        appletRecord = await fetchAppletRecord(appletId);
        targetWorkspacePath =
            targetWorkspacePath || appletRecord.workspacePath || null;
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
            const { openCanvas } = await import("../../src/stores/chatSlice");
            context.dispatch(
                openCanvas({
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
                }),
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

    if (isActive && context?.dispatch) {
        const { closeCanvas, closeCanvasTab, incrementFileBrowserRefresh } =
            await import("../../src/stores/chatSlice");
        const activeTabId = context?.getActiveTabId
            ? context.getActiveTabId()
            : null;
        if (activeTabId) {
            context.dispatch(closeCanvasTab(activeTabId));
        } else {
            context.dispatch(closeCanvas());
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
            isUnused: chat.isUnused || false,
        }));

        // Create a formatted list string
        const chatsList = formattedChats
            .map(
                (chat, index) =>
                    `${index + 1}. **${chat.title}** (ID: ${chat.id})${chat.messageCount > 0 ? ` - ${chat.messageCount} message${chat.messageCount !== 1 ? "s" : ""}` : ""}${chat.isUnused ? " [Unused]" : ""}`,
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
                const sender = msg.sender === "assistant" ? "Assistant" : "User";
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
    getappletstate: handleGetAppletState,
    openappletdraft: handleOpenAppletDraft,
    saveappletdraftasversion: handleSaveAppletDraftAsVersion,
    publishappletversion: handlePublishAppletVersion,
    deleteappletversion: handleDeleteAppletVersion,
    updateappletmetadata: handleUpdateAppletMetadata,
    unpublishapplet: handleUnpublishApplet,
    getappletversionsource: handleGetAppletVersionSource,
    copyappletversiontodraft: handleCopyAppletVersionToDraft,
    deleteapplet: handleDeleteApplet,
    searchchats: handleSearchChats,
    getchatcontent: handleGetChatContent,
};
