export function toPickerIdString(value) {
    if (!value) return null;
    if (typeof value === "object" && value._id) return String(value._id);
    return String(value);
}

export function getUserAppId(userApp) {
    return toPickerIdString(userApp?.appId);
}

export function getUserAppletId(userApp) {
    const app = userApp?.appId;
    if (!app || typeof app !== "object" || app.type !== "applet") return null;
    return toPickerIdString(app.appletId);
}

function getAppAuthorName(app) {
    if (!app?.author) return null;
    if (typeof app.author === "object") {
        return app.author.username || app.author.email || null;
    }
    return null;
}

export function normalizeAppletPickerApplet(applet) {
    const appletId = toPickerIdString(applet?._id);
    if (!appletId || Number(applet?.version || 1) !== 2) return null;

    const app = applet.app || {};
    const versions = Array.isArray(applet.htmlVersions)
        ? applet.htmlVersions
        : [];

    return {
        appletId,
        name: app.name || applet.name || "Untitled Applet",
        slug: app.slug || null,
        listedInStore: app.listedInStore,
        icon: app.icon || null,
        description: app.description || null,
        badgeLabel: app.badgeLabel || null,
        imageUrl: app.imageUrl || null,
        imageLightUrl: app.imageLightUrl || null,
        imageDarkUrl: app.imageDarkUrl || null,
        imageAlt: app.imageAlt || null,
        category: app.category || null,
        tags: Array.isArray(app.tags) ? app.tags : [],
        authorName: getAppAuthorName(app),
        publishedVersionIndex:
            typeof applet.publishedVersionIndex === "number"
                ? applet.publishedVersionIndex
                : null,
        latestVersionIndex: versions.length > 0 ? versions.length - 1 : null,
        updatedAt:
            app.updatedAt || applet.updatedAt || applet.createdAt || null,
    };
}
