/**
 * Sanitize mcpServers for the client: strip tokens and refresh material while
 * preserving connection status and display metadata.
 */
export function sanitizeMcpServersForClient(mcpServers) {
    if (!mcpServers || typeof mcpServers !== "object") return mcpServers;

    const sanitized = {};
    for (const [key, config] of Object.entries(mcpServers)) {
        sanitized[key] = {
            type: config.type,
            url: config.url,
            name: config.name,
            authType: config.authType,
            hasAuth: !!(
                config.headers?.Authorization || config.headers?.authorization
            ),
            hasBotToken: !!config.botToken,
            expiresAt: config.expiresAt,
        };
    }
    return sanitized;
}
