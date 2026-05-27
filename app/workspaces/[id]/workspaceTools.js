// workspaceTools.js
// Workspace-specific client-side tool handlers
// This is a simplified example showing how to create contextual tools for workspaces

/**
 * Example contextual tool definitions for workspace pages
 * These tools are only available when viewing a workspace (prompt collection)
 */
export const WORKSPACE_CONTEXTUAL_TOOLS = [
    {
        type: "function",
        icon: "📚",
        function: {
            name: "GetWorkspaceInfo",
            description:
                "Get information about the current prompt collection (workspace), including its name, ID, and metadata. Use this when the user asks about the current workspace or needs details about it.",
            descriptionAr:
                "اعرض معلومات عن مجموعة المطالبات/مساحة العمل الحالية: الاسم، المعرّف، والبيانات. عند سؤال «ما هذه المساحة؟».",
            parameters: {
                type: "object",
                properties: {
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about retrieving workspace information",
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
            name: "ListWorkspaces",
            description:
                "List or search the user's prompt collections (workspaces). Use this tool when the user asks to see their workspaces, list workspaces, search for a workspace, or find workspaces by name.",
            descriptionAr:
                "اعرض أو ابحث في مساحات عمل المستخدم. عند «قائمة المساحات» أو «ابحث».",
            parameters: {
                type: "object",
                properties: {
                    searchQuery: {
                        type: "string",
                        description:
                            "Optional search query to filter workspaces by name. If not provided, all workspaces will be returned.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about retrieving workspace information",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    // Add more contextual tools here as needed
];

/**
 * Example handler for GetWorkspaceInfo tool
 * Retrieves information about the current workspace
 */
export async function handleGetWorkspaceInfo(toolInfo, context) {
    // Get workspace ID from current URL
    const workspaceId =
        typeof window !== "undefined"
            ? window.location.pathname.match(/\/workspaces\/([^/]+)/)?.[1]
            : null;

    if (!workspaceId) {
        throw new Error(
            "Not currently on a workspace page. Cannot get workspace information.",
        );
    }

    try {
        // Fetch workspace data from API
        const response = await fetch(`/api/workspaces/${workspaceId}`);

        if (!response.ok) {
            throw new Error(
                `Failed to fetch workspace data: ${response.statusText}`,
            );
        }

        const workspace = await response.json();

        return {
            success: true,
            data: {
                workspaceId: workspace._id,
                workspaceName: workspace.name,
                slug: workspace.slug,
                createdAt: workspace.createdAt,
                updatedAt: workspace.updatedAt,
                description: `Retrieved information for prompt collection **${workspace.name}** (ID: ${workspace._id})`,
            },
        };
    } catch (error) {
        throw new Error(`Failed to get workspace info: ${error.message}`);
    }
}

/**
 * Handler for ListWorkspaces tool
 * Lists all workspaces for the current user
 */
export async function handleListWorkspaces(toolInfo, context) {
    // Get search query from tool parameters (optional)
    const searchQuery =
        toolInfo.toolArgs?.searchQuery || toolInfo.searchQuery || "";

    try {
        // Fetch workspaces from the API
        const response = await fetch("/api/workspaces");

        if (!response.ok) {
            throw new Error(
                `Failed to fetch workspaces: ${response.statusText}`,
            );
        }

        let workspaces = await response.json();

        // Filter workspaces by search query if provided
        if (searchQuery && searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            workspaces = workspaces.filter(
                (workspace) =>
                    workspace.name?.toLowerCase().includes(query) ||
                    workspace.slug?.toLowerCase().includes(query),
            );
        }

        // Format workspaces list for display
        if (workspaces.length === 0) {
            return {
                success: true,
                data: {
                    workspaces: [],
                    count: 0,
                    description: searchQuery
                        ? `No workspaces found matching "${searchQuery}".`
                        : "You don't have any workspaces yet.",
                },
            };
        }

        // Format workspaces with ID and name
        const formattedWorkspaces = workspaces.map((workspace) => ({
            id: workspace._id,
            name: workspace.name,
            slug: workspace.slug,
            hasPublishedApplet: workspace.hasPublishedApplet || false,
            updatedAt: workspace.updatedAt,
        }));

        // Create a formatted list string
        const workspacesList = formattedWorkspaces
            .map(
                (workspace, index) =>
                    `${index + 1}. **${workspace.name}** (ID: ${workspace.id})${workspace.hasPublishedApplet ? " 📱 Published" : ""}`,
            )
            .join("\n");

        return {
            success: true,
            data: {
                workspaces: formattedWorkspaces,
                count: formattedWorkspaces.length,
                description: searchQuery
                    ? `Found ${formattedWorkspaces.length} workspace${formattedWorkspaces.length !== 1 ? "s" : ""} matching "${searchQuery}":\n\n${workspacesList}`
                    : `You have ${formattedWorkspaces.length} workspace${formattedWorkspaces.length !== 1 ? "s" : ""}:\n\n${workspacesList}`,
            },
        };
    } catch (error) {
        throw new Error(`Failed to list workspaces: ${error.message}`);
    }
}

/**
 * Tool handlers mapping
 * Maps tool names (lowercase) to their handler functions
 */
export const WORKSPACE_TOOL_HANDLERS = {
    getworkspaceinfo: handleGetWorkspaceInfo,
    listworkspaces: handleListWorkspaces,
    // Add more handlers here as needed
};
