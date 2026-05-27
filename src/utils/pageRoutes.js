// pageRoutes.js
// Utility to dynamically discover available pages in the Next.js app

/**
 * Returns a list of all available static pages in Concierge
 * This list is manually maintained but represents the actual pages in the app/ directory
 *
 * For dynamic routes (like /chat/[id]), only the base route is included
 */
export const AVAILABLE_PAGES = [
    {
        path: "/home",
        name: "Home",
        description: "Main home page with digests and overview",
        descriptionAr: "الصفحة الرئيسية مع الملخّصات ونظرة عامة",
        dynamic: false,
    },
    {
        path: "/chat",
        name: "Chat",
        description: "Chat interface for conversations",
        descriptionAr: "واجهة الدردشة للمحادثات",
        dynamic: false,
    },
    {
        path: "/chat/[id]",
        name: "Chat Conversation",
        description: "Specific chat conversation (requires chat ID)",
        descriptionAr: "محادثة معيّنة (يتطلب معرّف المحادثة)",
        dynamic: true,
        example: "/chat/507f1f77bcf86cd799439011",
    },
    {
        path: "/automations",
        name: "Automations",
        description: "Scheduled AI automations and run history",
        descriptionAr: "الأتمتات المجدولة وسجل التشغيل",
        dynamic: false,
    },
    {
        path: "/automations/[id]/runs/[taskId]",
        name: "Automation HTML Output",
        description:
            "Rendered HTML output for a specific automation run or latest result",
        descriptionAr: "مخرجات HTML لأتمتة محددة أو آخر نتيجة",
        dynamic: true,
        example: "/automations/weekly-digest/runs/latest",
    },
    {
        path: "/workspaces",
        name: "Prompt Collections",
        description: "List of all prompt collections (workspaces)",
        descriptionAr: "قائمة جميع مساحات العمل/مجموعات المطالبات",
        dynamic: false,
    },
    {
        path: "/workspaces/[id]",
        name: "Prompt Collection",
        description:
            "Specific prompt collection/workspace (requires workspace ID)",
        descriptionAr: "مساحة عمل معيّنة (يتطلب معرّف مساحة العمل)",
        dynamic: true,
        example: "/workspaces/507f1f77bcf86cd799439011",
    },
    {
        path: "/apps/[slug]",
        name: "Published App",
        description: "Published applet by slug (requires app slug)",
        descriptionAr: "تطبيق منشور بالرابط (يتطلب المعرّف النصي للتطبيق)",
        dynamic: true,
        example: "/apps/my-app-slug",
    },
    {
        path: "/media",
        name: "Media",
        description: "Media library and management",
        descriptionAr: "مكتبة الوسائط وإدارتها",
        dynamic: false,
    },
    {
        path: "/images",
        name: "Images",
        description: "Image generation and management",
        descriptionAr: "توليد الصور وإدارتها",
        dynamic: false,
    },
    {
        path: "/video",
        name: "Video",
        description: "Video processing and management",
        descriptionAr: "معالجة الفيديو وإدارته",
        dynamic: false,
    },
    {
        path: "/transcribe",
        name: "Transcribe",
        description: "Audio transcription interface",
        descriptionAr: "واجهة تفريغ الصوت إلى نص",
        dynamic: false,
    },
    {
        path: "/translate",
        name: "Translate",
        description: "Translation interface",
        descriptionAr: "واجهة الترجمة",
        dynamic: false,
    },
    {
        path: "/write",
        name: "Write",
        description: "Writing and content creation interface",
        descriptionAr: "واجهة الكتابة وإنشاء المحتوى",
        dynamic: false,
    },
    {
        path: "/notifications",
        name: "Notifications",
        description: "User notifications and alerts",
        descriptionAr: "إشعارات المستخدم والتنبيهات",
        dynamic: false,
    },
    {
        path: "/code/jira",
        name: "Jira Integration",
        description: "Jira project integration",
        descriptionAr: "تكامل Jira",
        dynamic: false,
    },
];

/**
 * Get all static pages (non-dynamic routes)
 */
export function getStaticPages() {
    return AVAILABLE_PAGES.filter((page) => !page.dynamic);
}

/**
 * Get all dynamic pages (routes with parameters)
 */
export function getDynamicPages() {
    return AVAILABLE_PAGES.filter((page) => page.dynamic);
}

/**
 * Get pages accessible to regular users (non-admin)
 */
export function getUserPages() {
    return AVAILABLE_PAGES.filter((page) => !page.adminOnly);
}

/**
 * Get admin-only pages
 */
export function getAdminPages() {
    return AVAILABLE_PAGES.filter((page) => page.adminOnly);
}

/**
 * Format pages list as a readable string for AI context
 */
export function formatPagesForAI() {
    const staticPages = getStaticPages();
    const dynamicPages = getDynamicPages();

    let output = "## Available Pages in Concierge\n\n";

    output += "### Static Pages (navigate directly):\n";
    staticPages.forEach((page) => {
        const adminBadge = page.adminOnly ? " 🔒 (Admin only)" : "";
        output += `- **${page.path}** — ${page.description}${adminBadge}\n`;
    });

    output += "\n### Dynamic Pages (require ID/slug):\n";
    dynamicPages.forEach((page) => {
        output += `- **${page.path}** — ${page.description}\n`;
        if (page.example) {
            output += `  Example: ${page.example}\n`;
        }
    });

    return output;
}

/**
 * Validate if a path exists in the app
 * @param {string} path - The path to validate
 * @returns {object|null} - Page info if valid, null otherwise
 */
export function validatePath(path) {
    // Check exact match for static pages
    const staticMatch = AVAILABLE_PAGES.find((page) => page.path === path);
    if (staticMatch) {
        return staticMatch;
    }

    // Check if it matches a dynamic route pattern
    const dynamicMatch = AVAILABLE_PAGES.find((page) => {
        if (!page.dynamic) return false;

        // Convert [id] or [slug] to regex pattern
        const pattern = page.path
            .replace(/\[id\]/g, "[^/]+")
            .replace(/\[slug\]/g, "[^/]+");
        const regex = new RegExp(`^${pattern}$`);

        return regex.test(path);
    });

    return dynamicMatch || null;
}
