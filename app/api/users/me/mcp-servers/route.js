import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import { sanitizeMcpServersForClient } from "../../../utils/mcp-server-config";
import { validateMcpServerUrl } from "../../../utils/mcpUrlValidation";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/me/mcp-servers
 * Returns the user's MCP server configuration.
 * Sensitive headers (e.g. Authorization) are included - caller must handle securely.
 */
export async function GET() {
    try {
        const user = await getCurrentUser(false);
        const mcpServers = sanitizeMcpServersForClient(user.mcpServers || {});
        return NextResponse.json(mcpServers);
    } catch (error) {
        console.error("Error fetching MCP servers:", error);
        return NextResponse.json(
            { error: "Failed to fetch MCP servers" },
            { status: 500 },
        );
    }
}

/**
 * PUT /api/users/me/mcp-servers
 * Replaces the entire mcpServers config.
 * Body: { "serverKey": { type, url, headers? }, ... }
 */
export async function PUT(request) {
    try {
        const user = await getCurrentUser(false);
        const body = await request.json();

        if (typeof body !== "object" || body === null) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 },
            );
        }

        user.mcpServers = body;
        await user.save();

        return NextResponse.json(sanitizeMcpServersForClient(user.mcpServers));
    } catch (error) {
        console.error("Error updating MCP servers:", error);
        return NextResponse.json(
            { error: "Failed to update MCP servers" },
            { status: 500 },
        );
    }
}

/**
 * PATCH /api/users/me/mcp-servers
 * Adds or updates a single MCP server entry.
 * Body: { serverId: string, config: { type, url, headers? } }
 */
export async function PATCH(request) {
    try {
        const user = await getCurrentUser(false);
        const body = await request.json();

        const { serverId, config } = body;
        if (!serverId || typeof serverId !== "string") {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }
        if (!config || typeof config !== "object") {
            return NextResponse.json(
                { error: "config is required" },
                { status: 400 },
            );
        }

        // Custom (non-preset) servers: validate URL server-side to block SSRF.
        // Presets use vetted URLs hard-coded in the client.
        const isCustom = serverId.startsWith("custom-");
        if (isCustom) {
            const result = validateMcpServerUrl(config.url);
            if (!result.ok) {
                return NextResponse.json(
                    { error: result.error },
                    { status: 400 },
                );
            }
            config.url = result.url;
        }

        const nextConfig = {
            type: config.type || "streamable-http",
            url: config.url,
            headers: config.headers || {},
        };
        if (config.authType === "bearer" || config.authType === "oauth2") {
            nextConfig.authType = config.authType;
        }
        if (typeof config.name === "string" && config.name.trim()) {
            nextConfig.name = config.name.trim().slice(0, 100);
        }

        const mcpServers = { ...(user.mcpServers || {}) };
        mcpServers[serverId] = nextConfig;
        user.mcpServers = mcpServers;
        await user.save();

        return NextResponse.json(sanitizeMcpServersForClient(user.mcpServers));
    } catch (error) {
        console.error("Error patching MCP server:", error);
        return NextResponse.json(
            { error: "Failed to update MCP server" },
            { status: 500 },
        );
    }
}
