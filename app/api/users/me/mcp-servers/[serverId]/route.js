import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../utils/auth";
import { sanitizeMcpServersForClient } from "../../../../utils/mcp-server-config";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/me/mcp-servers/[serverId]
 * Returns a specific MCP server config without sensitive tokens (headers stripped).
 */
export async function GET(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser(false);
        const { serverId } = await params;
        const mcpServers = user.mcpServers || {};

        const config = mcpServers[serverId];
        if (!config) {
            return NextResponse.json(
                { error: "MCP server not found" },
                { status: 404 },
            );
        }

        return NextResponse.json(
            sanitizeMcpServersForClient({ [serverId]: config })[serverId],
        );
    } catch (error) {
        console.error("Error fetching MCP server:", error);
        return NextResponse.json(
            { error: "Failed to fetch MCP server" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/users/me/mcp-servers/[serverId]
 * Removes a specific MCP server from the user's config.
 */
export async function DELETE(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser(false);
        const { serverId } = await params;
        const mcpServers = { ...(user.mcpServers || {}) };

        if (!(serverId in mcpServers)) {
            return NextResponse.json(
                { error: "MCP server not found" },
                { status: 404 },
            );
        }

        delete mcpServers[serverId];
        user.mcpServers = mcpServers;
        user.markModified("mcpServers");
        await user.save();

        return NextResponse.json(sanitizeMcpServersForClient(mcpServers));
    } catch (error) {
        console.error("Error deleting MCP server:", error);
        return NextResponse.json(
            { error: "Failed to delete MCP server" },
            { status: 500 },
        );
    }
}
