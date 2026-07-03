import App, { APP_STATUS, APP_TYPES } from "../models/app";

const BUILT_IN_NATIVE_APPS_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedBuiltInNativeApps = null;
let cachedBuiltInNativeAppsExpiresAt = 0;
let builtInNativeAppsPromise = null;

export const DEFAULT_NATIVE_APP_SLUGS = [
    "home",
    "files",
    "chat",
    "automations",
    "translate",
    "video",
    "write",
    "workspaces",
    "media",
    "jira",
];

export const CORE_SIDEBAR_NATIVE_APP_SLUGS = [
    "home",
    "files",
    "chat",
    "automations",
];

export const BUILT_IN_NATIVE_APPS = [
    {
        name: "Home",
        slug: "home",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "Home",
        description:
            "Open your personalized home workspace and digest overview.",
    },
    {
        name: "Chats",
        slug: "chat",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "MessageCircle",
        description: "Start conversations and return to recent chats.",
    },
    {
        name: "Automations",
        slug: "automations",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "CalendarClock",
        description: "Create and run scheduled AI automations.",
    },
    {
        name: "Files",
        slug: "files",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "Folder",
        description: "Manage uploaded and generated files across Concierge.",
    },
    {
        name: "Translate",
        slug: "translate",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "Languages",
        description: "Translate text between languages with AI assistance.",
    },
    {
        name: "Transcribe",
        slug: "video",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "FileVideo",
        description: "Transcribe and translate video and audio files.",
    },
    {
        name: "Write",
        slug: "write",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "PencilLine",
        description: "Draft, edit, and refine long-form writing.",
    },
    {
        name: "Applets",
        slug: "workspaces",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "AppWindow",
        description: "Browse, create, and manage your applets.",
    },
    {
        name: "Media",
        slug: "media",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "Image",
        description: "Generate and manage images, audio, and video assets.",
    },
    {
        name: "Jira",
        slug: "jira",
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
        listedInStore: true,
        icon: "ClipboardList",
        description: "Connect Jira issue tracking to your Concierge workflows.",
    },
];

function buildInsertDefinition(definition, author) {
    return Object.fromEntries(
        Object.entries({
            ...definition,
            author: author || undefined,
        }).filter(([, value]) => value !== undefined),
    );
}

function valuesEqual(current, expected) {
    if (
        current === null ||
        current === undefined ||
        expected === null ||
        expected === undefined
    ) {
        return (
            (current === null || current === undefined) &&
            (expected === null || expected === undefined)
        );
    }
    return String(current) === String(expected);
}

function cacheActiveNativeApps(apps) {
    cachedBuiltInNativeApps = apps;
    cachedBuiltInNativeAppsExpiresAt =
        Date.now() + BUILT_IN_NATIVE_APPS_CACHE_TTL_MS;
    return apps;
}

export function clearBuiltInNativeAppsCacheForTests() {
    cachedBuiltInNativeApps = null;
    cachedBuiltInNativeAppsExpiresAt = 0;
    builtInNativeAppsPromise = null;
}

async function ensureBuiltInNativeAppsUncached({ author = null } = {}) {
    const existingApps = await App.find({
        slug: { $in: DEFAULT_NATIVE_APP_SLUGS },
        type: APP_TYPES.NATIVE,
    })
        .select("_id slug name type status listedInStore icon description")
        .lean();

    const existingBySlug = new Map(existingApps.map((app) => [app.slug, app]));
    const operations = [];

    for (const definition of BUILT_IN_NATIVE_APPS) {
        const existing = existingBySlug.get(definition.slug);
        if (!existing) {
            operations.push({
                updateOne: {
                    filter: {
                        slug: definition.slug,
                        type: APP_TYPES.NATIVE,
                    },
                    update: {
                        $setOnInsert: buildInsertDefinition(definition, author),
                    },
                    upsert: true,
                },
            });
            continue;
        }

        const currentDefinition = buildInsertDefinition(definition, author);
        const needsMetadataUpdate = Object.entries(currentDefinition).some(
            ([key, value]) => !valuesEqual(existing[key], value),
        );

        if (needsMetadataUpdate) {
            operations.push({
                updateOne: {
                    filter: { _id: existing._id },
                    update: {
                        $set: currentDefinition,
                    },
                },
            });
        }
    }

    if (operations.length > 0) {
        await App.bulkWrite(operations, { ordered: false });
    }

    return App.find({
        slug: { $in: DEFAULT_NATIVE_APP_SLUGS },
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
    });
}

export async function ensureBuiltInNativeApps({
    author = null,
    force = false,
} = {}) {
    const canUseCache = !author && !force;
    if (
        canUseCache &&
        cachedBuiltInNativeApps &&
        Date.now() < cachedBuiltInNativeAppsExpiresAt
    ) {
        return cachedBuiltInNativeApps;
    }

    if (canUseCache && builtInNativeAppsPromise) {
        return builtInNativeAppsPromise;
    }

    const promise = ensureBuiltInNativeAppsUncached({ author });

    if (!canUseCache) {
        const apps = await promise;
        cacheActiveNativeApps(apps);
        return apps;
    }

    builtInNativeAppsPromise = promise
        .then((apps) => cacheActiveNativeApps(apps))
        .finally(() => {
            builtInNativeAppsPromise = null;
        });

    return builtInNativeAppsPromise;
}
