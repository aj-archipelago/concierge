// globalContext.js
// Global context that is always provided to the LLM
// This context is included in every conversation, regardless of the current page

import { extractPreviewTextFromStoredPayload } from "./assistantInlinePayload";

const MAX_CHAT_TITLE_LENGTH = 100;

/**
 * Builds the pathname context string
 * @param {string} pathname - The current pathname (e.g., '/write', '/chat')
 * @returns {string} Formatted pathname context
 */
export function buildPathnameContext(pathname) {
    if (!pathname) {
        return "";
    }
    return `## Current Page Context\nYou are currently on the page: **${pathname}**\n`;
}

/**
 * Formats a chat title for display in context
 * @param {Object} chat - Chat object with title or firstMessage
 * @returns {string} Display title for the chat
 */
function formatChatTitle(chat) {
    let displayTitle = "New Chat";
    if (typeof chat.title === "string" && chat.title.trim()) {
        displayTitle = chat.title.trim();
    } else if (chat.firstMessage?.payload) {
        displayTitle =
            extractPreviewTextFromStoredPayload(chat.firstMessage.payload) ||
            "New Chat";
    }
    // Limit title length to MAX_CHAT_TITLE_LENGTH characters
    return displayTitle.substring(0, MAX_CHAT_TITLE_LENGTH);
}

/**
 * Builds the recent chats context string
 * @param {Array} activeChats - Array of active chat objects
 * @param {string} currentChatId - ID of the current chat to exclude
 * @param {number} maxChats - Maximum number of recent chats to include (default: 20)
 * @returns {string} Formatted recent chats context
 */
export function buildRecentChatsContext(
    activeChats,
    currentChatId,
    maxChats = 20,
) {
    if (
        !activeChats ||
        !Array.isArray(activeChats) ||
        activeChats.length === 0
    ) {
        return "";
    }

    // Get the most recent chats (excluding the current chat if it's in the list)
    const recentChats = activeChats
        .filter((c) => c && c._id && String(c._id) !== currentChatId)
        .slice(0, maxChats)
        .map((c) => {
            const displayTitle = formatChatTitle(c);
            return `- ${displayTitle} (ID: ${c._id})`;
        });

    if (recentChats.length === 0) {
        return "";
    }

    return `\n## Recent Chats\nHere are the user's recent ${recentChats.length} chats:\n${recentChats.join("\n")}\n`;
}

/**
 * Builds the canvas workflow context string.
 * This keeps high-value canvas invariants global while leaving detailed recipes
 * to the LoadSkill tool and active canvas page context.
 * @param {Object} options - Options for building canvas workflow context
 * @param {string} options.currentChatId - ID of the current chat
 * @returns {string} Formatted canvas workflow context
 */
export function buildCanvasWorkflowContext({ currentChatId } = {}) {
    const chatArtifactDirectory = currentChatId
        ? `/workspace/files/chats/${currentChatId}/`
        : "/workspace/files/chats/<chatId>/";

    return `\n## Canvas Workflows

Concierge uses the canvas (right side of chat) for durable generated artifacts such as articles, stories, HTML previews, and applets. When the user asks to create or edit one of these artifacts, put the artifact in the canvas/workspace file instead of pasting the full artifact content into chat.

**Tool discovery:** Some local tools are request-scoped and may be hidden until loaded. If a tool named here is not currently visible, use **SearchAvailableTools** with the capability or exact tool name first. Do not conclude that **CreateArticle**, **OpenCanvasFile**, **CreateApplet**, **LoadSkill**, **SubmitFeedback**, or applet management tools are unavailable just because they are not initially visible.

**Product feedback:** If the user is stuck, a workflow is confusing, or something appears broken, use **SubmitFeedback** to send a concise product feedback report to the Concierge team. Attach an existing image URL or image data URL only when you already have relevant visual evidence; do not capture the user's screen.

**Standalone generated files:** When you create an ad hoc file for this chat, prefer placing it under **\`${chatArtifactDirectory}\`** so it stays associated with the conversation. For example, a standalone HTML report can be written to **\`${chatArtifactDirectory}<slug>.html\`** and opened with **OpenCanvasFile** using \`fileRef\` set to that path. This is only the default home for chat artifacts; use another workspace path when the user asks for it or when a specific workflow requires it.

**Articles and stories:** Articles are HTML files at **\`/workspace/files/articles/<slug>.html\`**. The workspace file is the source of truth. For a new article, use **CreateArticle** to get a \`workspacePath\`, then write the article HTML to that path with the workspace shell. For an existing article, find the file and use **OpenCanvasFile**; the Article Canvas Context's \`workspacePath\` is authoritative. Load the **\`articles\`** skill for the exact required HTML structure, meta tags, and styling rules.

**Applets:** Applets are interactive HTML applications backed by a mutable Draft workspace file plus an applet record for saved versions and publishing state. For a brand-new applet, use **CreateApplet** with a prompt. For an existing applet, edit the Draft workspace file in place using the active HTML Canvas Context, **GetAppletState**, or **OpenAppletDraft** to find the exact \`workspacePath\`; do not call **CreateApplet** to edit an existing applet unless the user explicitly wants a separate new applet or a rebuild. Draft edits do not create saved versions or update published links; use **SaveAppletDraftAsVersion** and **PublishAppletVersion** when the user asks to checkpoint or publish. Load the **\`applets\`** skill for the SDK, theming, persistence, and publishing details.`;
}

export const buildStoriesAndFilesContext = buildCanvasWorkflowContext;

/**
 * Builds the complete global context that is always included in conversations
 * This context is provided regardless of the current page
 * @param {Object} options - Options for building global context
 * @param {string} options.pathname - Current pathname
 * @param {Array} options.activeChats - Array of active chat objects
 * @param {string} options.currentChatId - ID of the current chat to exclude from recent chats
 * @param {number} options.maxRecentChats - Maximum number of recent chats to include (default: 20)
 * @returns {string} Complete global context string
 */
export function buildGlobalContext({
    pathname,
    activeChats,
    currentChatId,
    maxRecentChats = 20,
}) {
    const pathnameContext = buildPathnameContext(pathname);
    const recentChatsContext = buildRecentChatsContext(
        activeChats,
        currentChatId,
        maxRecentChats,
    );
    const canvasWorkflowContext = buildCanvasWorkflowContext({
        currentChatId,
    });

    // Combine global context parts
    // Pathname is always first, then recent chats, then canvas workflow info
    let globalContext = pathnameContext;
    if (recentChatsContext) {
        globalContext += recentChatsContext;
    }
    globalContext += canvasWorkflowContext;

    return globalContext;
}

/**
 * Combines global context with page-specific context
 * Global context is always included, and page context is appended if provided
 * @param {Object} options - Options for combining contexts
 * @param {string} options.pathname - Current pathname
 * @param {Array} options.activeChats - Array of active chat objects
 * @param {string} options.currentChatId - ID of the current chat
 * @param {string} options.pageContext - Optional page-specific context
 * @param {number} options.maxRecentChats - Maximum number of recent chats (default: 20)
 * @returns {string} Combined context string
 */
export function combineContexts({
    pathname,
    activeChats,
    currentChatId,
    pageContext = null,
    maxRecentChats = 20,
}) {
    const globalContext = buildGlobalContext({
        pathname,
        activeChats,
        currentChatId,
        maxRecentChats,
    });

    if (!pageContext) {
        // No page context set - provide minimal context with global context
        return `\n\n${globalContext}`;
    }

    // Page context exists - prepend global context to make it most prominent
    // This ensures the current page is always mentioned first, even if pageContext mentions a different page
    return `\n\n${globalContext}\n${pageContext}\n`;
}
