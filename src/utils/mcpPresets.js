/**
 * MCP server presets for quick configuration.
 * These define known MCP servers that users can connect with one click.
 *
 * `descriptionKey` is a translation key resolved by the UI via i18n.
 * `description` is the English fallback (used server-side when sending
 * descriptions to the AI prompt). `name` is a brand name; not translated.
 */
export const MCP_PRESETS = {
    atlassian: {
        id: "atlassian",
        name: "Atlassian JIRA & Confluence",
        type: "streamable-http",
        url: "https://mcp.atlassian.com/v1/mcp",
        authType: "oauth2",
        mcpOAuthInit: "/api/auth/atlassian/mcp-init",
        mcpOAuthRedirect: "/code/jira",
        descriptionKey: "mcp_preset_atlassian_desc",
        description:
            "Search, create, and update JIRA issues and Confluence pages. Connect to your Atlassian Cloud site.",
        icon: "jira",
    },
    slack: {
        id: "slack",
        name: "Slack",
        type: "streamable-http",
        url: "https://mcp.slack.com/mcp",
        authType: "oauth2",
        oauthUrl: "/api/auth/slack",
        descriptionKey: "mcp_preset_slack_desc",
        description:
            "Search messages, channels, and users in your Slack workspace, and send messages on your behalf via the Concierge bot (with a 'Sent by you via Concierge' attribution block).",
        icon: "slack",
    },
    github: {
        id: "github",
        name: "GitHub",
        type: "streamable-http",
        url: "https://api.githubcopilot.com/mcp/",
        authType: "oauth2",
        mcpOAuthInit: "/api/auth/github/mcp-init",
        mcpOAuthRedirect: "/code/github",
        descriptionKey: "mcp_preset_github_desc",
        description:
            "Manage repositories, issues, pull requests, and code on GitHub.",
        icon: "github",
    },
};

export const FEATURED_PRESET_IDS = ["atlassian", "slack", "github"];
