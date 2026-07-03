export const SHARE_ENTITY_URLS = {
    chat: (id) => `/chat/${id}`,
    workspace: (id) => `/workspaces/${id}`,
    applet: (id) => `/applets/${id}`,
    automation: (id) => `/automations/${id}`,
    article: (id) => `/articles/${id}`,
};

export function publishedAppletUrl(entityId) {
    return `/published/applets/${String(entityId)}`;
}

export function shareEntityUrl(entityType, entityId) {
    const build = SHARE_ENTITY_URLS[entityType];
    return build ? build(String(entityId)) : null;
}

export function shareQueryKey(entityType, entityId) {
    return ["share", entityType, String(entityId)];
}

export function ownedSharesQueryKey() {
    return ["shares", "owned"];
}

export function isShareActive(share, { legacyShared = false } = {}) {
    if (legacyShared) return true;
    if (!share) return false;
    if (share.link?.enabled) return true;
    return Array.isArray(share.recipients) && share.recipients.length > 0;
}
