import {
    FEATURED_PRESET_IDS,
    MCP_PRESETS,
} from "../../../src/utils/mcpPresets.js";
import { refreshExpiringMcpServersForUser } from "./mcp-token-refresh.js";

async function resolveAtlassianCloudId({ user, mcpServers, logPrefix }) {
    const atlassian = mcpServers?.atlassian;
    if (!atlassian) return;

    if (atlassian?.headers?.Authorization && !atlassian.cloudId) {
        try {
            const resourcesRes = await fetch(
                "https://api.atlassian.com/oauth/token/accessible-resources",
                {
                    headers: {
                        Authorization: atlassian.headers.Authorization,
                    },
                },
            );
            if (resourcesRes.ok) {
                const resources = await resourcesRes.json();
                if (resources.length > 0) {
                    const cloudId = resources[0].id;
                    console.log(
                        `${logPrefix} Auto-resolved Atlassian cloud ID: ${cloudId} (${resources[0].name})`,
                    );
                    atlassian.cloudId = cloudId;
                    atlassian.headers ??= {};
                    atlassian.headers["X-Atlassian-Cloud-Id"] = cloudId;

                    if (user?.mcpServers) {
                        user.mcpServers.atlassian = atlassian;
                        user.markModified?.("mcpServers");
                        await user.save?.();
                    }
                }
            }
        } catch (err) {
            console.warn(
                `${logPrefix} Failed to auto-resolve Atlassian cloud ID:`,
                err.message,
            );
        }
    }

    if (atlassian?.cloudId && !atlassian.headers?.["X-Atlassian-Cloud-Id"]) {
        atlassian.headers ??= {};
        atlassian.headers["X-Atlassian-Cloud-Id"] = atlassian.cloudId;
    }
}

export async function buildMcpAgentConfigForUser(
    user,
    {
        logPrefix = "[MCP:agent]",
        headless = false,
        includeAvailableServers = !headless,
    } = {},
) {
    const refreshResult = await refreshExpiringMcpServersForUser(user, {
        logPrefix,
    });
    const unavailableServerKeys = new Set(
        refreshResult.unavailableServers.map((server) => server.serverKey),
    );
    const mcpServers =
        refreshResult.mcpServers && typeof refreshResult.mcpServers === "object"
            ? { ...refreshResult.mcpServers }
            : {};

    // atlassian_api is a service-token alias, not a Cortex MCP server.
    if (mcpServers?.atlassian_api) {
        delete mcpServers.atlassian_api;
    }
    if (headless) {
        for (const serverKey of unavailableServerKeys) {
            delete mcpServers[serverKey];
        }
    }

    const mcpServerKeys = mcpServers ? Object.keys(mcpServers) : [];
    console.log(
        `${logPrefix} userId=${user?.userId || user?._id || "unknown"} | mcpServers keys=[${mcpServerKeys.join(",")}] | hasServers=${mcpServerKeys.length > 0}`,
    );

    if (mcpServerKeys.length > 0) {
        for (const key of mcpServerKeys) {
            const srv = mcpServers[key];
            console.log(
                `${logPrefix}   ${key}: url=${srv?.url} | hasAuth=${!!srv?.headers?.Authorization} | hasCloudId=${!!srv?.headers?.["X-Atlassian-Cloud-Id"]} | expiresAt=${srv?.expiresAt ? new Date(srv.expiresAt).toISOString() : "none"} | hasRefreshToken=${!!srv?.refreshToken}`,
            );
        }
        await resolveAtlassianCloudId({ user, mcpServers, logPrefix });
    }

    const mcpConfig =
        mcpServers && Object.keys(mcpServers).length > 0
            ? JSON.stringify(mcpServers)
            : null;
    const atlassianCloudId = mcpServers?.atlassian?.cloudId;
    const atlassianHeader =
        mcpServers?.atlassian?.headers?.["X-Atlassian-Cloud-Id"];
    console.log(
        `${logPrefix} mcpConfig=${mcpConfig ? "set (" + mcpConfig.length + " chars)" : "null"} | atlassian.cloudId=${atlassianCloudId || "MISSING"} | atlassian.header.X-Atlassian-Cloud-Id=${atlassianHeader || "MISSING"}`,
    );

    const connectedKeys = new Set(mcpServerKeys);
    const availableServers = includeAvailableServers
        ? FEATURED_PRESET_IDS.filter((id) => !connectedKeys.has(id)).map(
              (id) => {
                  const preset = MCP_PRESETS[id];
                  return {
                      id: preset.id,
                      name: preset.name,
                      description: preset.description,
                  };
              },
          )
        : [];

    return {
        mcpConfig,
        mcpAvailableServers:
            availableServers.length > 0
                ? JSON.stringify(availableServers)
                : null,
        refreshedMcpServers: refreshResult.refreshedServers,
        unavailableMcpServers: refreshResult.unavailableServers,
    };
}
