import App from "../../models/app";
import {
    CORE_SIDEBAR_NATIVE_APP_SLUGS,
    DEFAULT_NATIVE_APP_SLUGS,
    ensureBuiltInNativeApps,
} from "../../apps/native-apps";

export const SIDEBAR_APPS_SCHEMA_VERSION = 1;

function getUserAppId(entry) {
    const raw = entry?.appId;
    if (!raw) return null;
    if (typeof raw === "object" && raw?._id) return String(raw._id);
    return String(raw);
}

function userAppEntry(app, order, addedAt = new Date()) {
    return {
        appId: app._id,
        order,
        addedAt,
    };
}

function sortedUserApps(apps) {
    return [...apps].sort((a, b) => {
        const aOrder = typeof a.order === "number" ? a.order : 0;
        const bOrder = typeof b.order === "number" ? b.order : 0;
        return aOrder - bOrder;
    });
}

async function getDefaultNativeAppsBySlug() {
    // Sidebar navigation is user-managed; default installs are still removable
    // through Manage Apps.
    const apps = await ensureBuiltInNativeApps();
    return new Map(apps.map((app) => [app.slug, app]));
}

function buildDefaultUserApps(appBySlug) {
    return DEFAULT_NATIVE_APP_SLUGS.map((slug, index) => {
        const app = appBySlug.get(slug);
        return app ? userAppEntry(app, index) : null;
    }).filter(Boolean);
}

async function migrateExistingUserApps(user, appBySlug) {
    const currentApps = sortedUserApps(
        Array.isArray(user.apps) ? user.apps : [],
    );
    const currentAppIds = currentApps.map(getUserAppId).filter(Boolean);
    const existingApps = currentAppIds.length
        ? await App.find({
              _id: { $in: currentAppIds },
          })
              .select("_id slug type")
              .lean()
        : [];
    const slugByAppId = new Map(
        existingApps.map((app) => [String(app._id), app.slug]),
    );
    const installedSlugs = new Set(
        currentAppIds.map((id) => slugByAppId.get(id)).filter(Boolean),
    );

    const missingCoreApps = CORE_SIDEBAR_NATIVE_APP_SLUGS.filter(
        (slug) => !installedSlugs.has(slug),
    )
        .map((slug) => {
            const app = appBySlug.get(slug);
            return app ? userAppEntry(app, 0) : null;
        })
        .filter(Boolean);

    const nextApps = [...missingCoreApps, ...currentApps].map(
        (entry, index) => ({
            appId: entry.appId,
            order: index,
            addedAt: entry.addedAt || new Date(),
        }),
    );

    user.apps = nextApps;
}

export async function reconcileUserApps(user) {
    const currentVersion = Number(user.sidebarAppsVersion || 0);

    if (currentVersion >= SIDEBAR_APPS_SCHEMA_VERSION) {
        return false;
    }

    const appBySlug = await getDefaultNativeAppsBySlug();

    if (!Array.isArray(user.apps) || user.apps.length === 0) {
        user.apps = buildDefaultUserApps(appBySlug);
    } else {
        await migrateExistingUserApps(user, appBySlug);
    }

    user.sidebarAppsVersion = SIDEBAR_APPS_SCHEMA_VERSION;
    await user.save();

    console.log(
        `Reconciled ${user.apps.length} sidebar apps for user ${user.userId}`,
    );
    return true;
}
