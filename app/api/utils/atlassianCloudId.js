const ACCESSIBLE_RESOURCES_URL =
    "https://api.atlassian.com/oauth/token/accessible-resources";

/**
 * @param {string} authorizationValue - Full header e.g. "Bearer eyJ..."
 * @returns {Promise<string|null>} First accessible Jira cloud id (site id)
 */
export async function fetchAtlassianCloudIdFromAuthorization(
    authorizationValue,
) {
    if (!authorizationValue || typeof authorizationValue !== "string") {
        return null;
    }
    try {
        const res = await fetch(ACCESSIBLE_RESOURCES_URL, {
            headers: {
                Authorization: authorizationValue,
                Accept: "application/json",
            },
        });
        if (!res.ok) {
            console.warn(
                `[MCP:cloudId] accessible-resources returned ${res.status}: ${await res.text().catch(() => "no body")}`,
            );
            return null;
        }
        const data = await res.json();
        const sites = Array.isArray(data) ? data : [];
        console.log(
            `[MCP:cloudId] accessible-resources returned ${sites.length} site(s): ${JSON.stringify(sites.map((r) => ({ id: r.id, name: r.name, url: r.url })))}`,
        );
        if (sites.length > 0 && sites[0].id) {
            return sites[0].id;
        }
    } catch (err) {
        console.warn("[MCP:cloudId] accessible-resources failed:", err.message);
    }
    return null;
}

export async function fetchAtlassianCloudIdFromAccessToken(accessToken) {
    if (!accessToken) {
        return null;
    }
    return fetchAtlassianCloudIdFromAuthorization(`Bearer ${accessToken}`);
}
