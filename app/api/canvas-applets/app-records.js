import App, { APP_STATUS, APP_TYPES } from "../models/app";
import MediaItem from "../models/media-item.mjs";
import User from "../models/user.mjs";
import { isCosmosRateLimitError } from "../utils/db-retry.mjs";

const UNIQUE_ACTIVE_APPLET_APP_INDEX = "unique_active_applet_app_identity";

function idString(value) {
    return (
        value?._id?.toString?.() || value?.toString?.() || String(value || "")
    );
}

function toPlain(doc) {
    return typeof doc?.toObject === "function" ? doc.toObject() : doc;
}

async function maybeLean(queryOrValue) {
    if (!queryOrValue) return null;
    if (typeof queryOrValue.lean === "function") return queryOrValue.lean();
    return queryOrValue;
}

function hasValue(value) {
    return value !== undefined && value !== null && value !== "";
}

function appletAssetFolders(appletId) {
    const id = idString(appletId);
    return [`assets/${id}`, `applets/assets/${id}`];
}

function appletIdFromAssetFolder(outputFolder) {
    const match = String(outputFolder || "").match(
        /^(?:applets\/)?assets\/([^/]+)$/,
    );
    return match?.[1] || null;
}

function mediaItemUrl(mediaItem) {
    return mediaItem?.azureUrl || mediaItem?.url || mediaItem?.gcsUrl || null;
}

function mediaItemThemeVariant(mediaItem) {
    const tags = Array.isArray(mediaItem?.tags) ? mediaItem.tags : [];
    if (tags.includes("theme-light")) return "light";
    if (tags.includes("theme-dark")) return "dark";
    return null;
}

function serializeAppletApp(app) {
    const plain = toPlain(app);
    if (!plain) return null;
    return Object.fromEntries(
        Object.entries({
            _id: plain._id,
            id: plain.id,
            name: plain.name,
            slug: plain.slug,
            author: plain.author,
            type: plain.type,
            status: plain.status,
            listedInStore: plain.listedInStore,
            workspaceId: plain.workspaceId,
            appletId: plain.appletId,
            icon: plain.icon,
            description: plain.description,
            badgeLabel: plain.badgeLabel,
            imageUrl: plain.imageUrl,
            imageLightUrl: plain.imageLightUrl,
            imageDarkUrl: plain.imageDarkUrl,
            imageAlt: plain.imageAlt,
            category: plain.category,
            tags: Array.isArray(plain.tags) ? plain.tags : [],
            metadataGeneratedAt: plain.metadataGeneratedAt,
            createdAt: plain.createdAt,
            updatedAt: plain.updatedAt,
        }).filter(([, value]) => value !== undefined),
    );
}

export function appMetadataScore(app, { preferredAppId = null } = {}) {
    if (!app) return 0;
    const updatedAtMs = Date.parse(app.updatedAt || app.createdAt || 0);
    return (
        (app.listedInStore === true ? 1_000_000 : 0) +
        (preferredAppId && idString(app._id) === idString(preferredAppId)
            ? 500_000
            : 0) +
        (app.imageUrl || app.imageLightUrl || app.imageDarkUrl ? 10_000 : 0) +
        (app.description ? 1_000 : 0) +
        (app.icon ? 500 : 0) +
        (app.workspaceId ? 250 : 0) +
        (Array.isArray(app.tags) && app.tags.length > 0 ? 100 : 0) +
        (app.category ? 80 : 0) +
        (app.badgeLabel ? 50 : 0) +
        (app.metadataGeneratedAt ? 25 : 0) +
        (Number.isFinite(updatedAtMs) ? updatedAtMs / 1_000_000_000_000 : 0)
    );
}

export function pickCanonicalAppletApp(apps, options = {}) {
    return (Array.isArray(apps) ? apps : []).reduce((best, app) => {
        if (!best) return app;
        return appMetadataScore(app, options) > appMetadataScore(best, options)
            ? app
            : best;
    }, null);
}

export function buildCanonicalAppByAppletId(apps) {
    const appsByAppletId = new Map();
    for (const app of Array.isArray(apps) ? apps : []) {
        const appletId = app?.appletId ? idString(app.appletId) : null;
        if (!appletId) continue;
        appsByAppletId.set(appletId, [
            ...(appsByAppletId.get(appletId) || []),
            app,
        ]);
    }

    const appByAppletId = new Map();
    for (const [appletId, appGroup] of appsByAppletId.entries()) {
        const canonical = pickCanonicalAppletApp(appGroup);
        const app =
            appGroup.length > 1
                ? {
                      ...canonical,
                      ...mergeCanonicalApp(canonical, appGroup),
                      _id: canonical._id,
                  }
                : canonical;
        appByAppletId.set(appletId, serializeAppletApp(app));
    }
    return appByAppletId;
}

export async function hydrateMissingAppletImageVariants(appByAppletId) {
    const missingAppletIds = [...appByAppletId.entries()]
        .filter(([, app]) => app && (!app.imageLightUrl || !app.imageDarkUrl))
        .map(([appletId]) => appletId);
    if (missingAppletIds.length === 0) return appByAppletId;

    const outputFolders = missingAppletIds.flatMap(appletAssetFolders);
    const mediaItems = await maybeLean(
        MediaItem.find({
            outputFolder: { $in: outputFolders },
            status: "completed",
            tags: "applet-card",
        }).select("outputFolder tags azureUrl url gcsUrl createdAt"),
    );
    const newestMediaItems = [
        ...(Array.isArray(mediaItems) ? mediaItems : []),
    ].sort((a, b) => {
        const aMs = Date.parse(a?.createdAt || 0);
        const bMs = Date.parse(b?.createdAt || 0);
        return (
            (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0)
        );
    });
    const variantsByAppletId = new Map();

    for (const mediaItem of newestMediaItems) {
        const appletId = appletIdFromAssetFolder(mediaItem.outputFolder);
        const variant = mediaItemThemeVariant(mediaItem);
        const url = mediaItemUrl(mediaItem);
        if (!appletId || !variant || !url) continue;

        const variants = variantsByAppletId.get(appletId) || {};
        if (!variants[variant]) {
            variants[variant] = url;
            variantsByAppletId.set(appletId, variants);
        }
    }

    for (const appletId of missingAppletIds) {
        const app = appByAppletId.get(appletId);
        const variants = variantsByAppletId.get(appletId);
        if (!app || !variants) continue;

        if (!app.imageLightUrl && variants.light) {
            app.imageLightUrl = variants.light;
        }
        if (!app.imageDarkUrl && variants.dark) {
            app.imageDarkUrl = variants.dark;
        }
        if (!app.imageUrl) {
            app.imageUrl = app.imageLightUrl || app.imageDarkUrl || null;
        }
    }

    return appByAppletId;
}

export async function hydrateMissingAppletImageVariantsForApp(app, appletId) {
    if (!app || (app.imageLightUrl && app.imageDarkUrl)) return app;
    const appByAppletId = new Map([[idString(appletId), { ...app }]]);
    await hydrateMissingAppletImageVariants(appByAppletId);
    return appByAppletId.get(idString(appletId)) || app;
}

function mergeCanonicalApp(canonicalApp, apps) {
    const canonical = toPlain(canonicalApp) || {};
    const richerApps = [...(Array.isArray(apps) ? apps : [])]
        .map(toPlain)
        .sort((a, b) => appMetadataScore(b) - appMetadataScore(a));
    const merged = {
        name: canonical.name,
        slug: canonical.slug,
        author: canonical.author,
        type: APP_TYPES.APPLET,
        status: APP_STATUS.ACTIVE,
        listedInStore:
            canonical.listedInStore === true ||
            richerApps.some((app) => app?.listedInStore === true),
        workspaceId: canonical.workspaceId,
        appletId: canonical.appletId,
        icon: canonical.icon,
        description: canonical.description,
        badgeLabel: canonical.badgeLabel,
        imageUrl: canonical.imageUrl,
        imageLightUrl: canonical.imageLightUrl,
        imageDarkUrl: canonical.imageDarkUrl,
        imageAlt: canonical.imageAlt,
        category: canonical.category,
        tags: Array.isArray(canonical.tags) ? canonical.tags : [],
        metadataGeneratedAt: canonical.metadataGeneratedAt,
    };

    for (const app of richerApps) {
        for (const field of [
            "name",
            "slug",
            "author",
            "workspaceId",
            "appletId",
            "icon",
            "description",
            "badgeLabel",
            "imageUrl",
            "imageLightUrl",
            "imageDarkUrl",
            "imageAlt",
            "category",
            "metadataGeneratedAt",
        ]) {
            if (!hasValue(merged[field]) && hasValue(app?.[field])) {
                merged[field] = app[field];
            }
        }
        if (
            (!Array.isArray(merged.tags) || merged.tags.length === 0) &&
            Array.isArray(app?.tags) &&
            app.tags.length > 0
        ) {
            merged.tags = app.tags;
        }
    }

    return Object.fromEntries(
        Object.entries(merged).filter(([, value]) => value !== undefined),
    );
}

async function rewriteUserAppReferences({ canonicalAppId, duplicateAppIds }) {
    if (!canonicalAppId || duplicateAppIds.length === 0) return;
    const duplicateIdSet = new Set(duplicateAppIds.map(idString));
    const users = await User.find({
        "apps.appId": { $in: duplicateAppIds },
    }).select("apps");

    for (const user of users) {
        const seen = new Set();
        let changed = false;
        const nextApps = [];

        for (const appEntry of Array.isArray(user.apps) ? user.apps : []) {
            const originalAppId = idString(appEntry.appId);
            const nextAppId = duplicateIdSet.has(originalAppId)
                ? canonicalAppId
                : appEntry.appId;
            const nextAppIdString = idString(nextAppId);

            if (seen.has(nextAppIdString)) {
                changed = true;
                continue;
            }

            seen.add(nextAppIdString);
            if (nextAppIdString !== originalAppId) changed = true;
            nextApps.push({
                appId: nextAppId,
                order: nextApps.length,
                addedAt: appEntry.addedAt || new Date(),
            });
        }

        if (changed) {
            user.apps = nextApps;
            await user.save();
        }
    }
}

export async function canonicalizeAppletApps(
    appletId,
    { preferredAppId = null } = {},
) {
    if (!appletId) return null;
    const apps = await maybeLean(
        App.find({
            appletId,
            type: APP_TYPES.APPLET,
            status: APP_STATUS.ACTIVE,
        }),
    );
    if (!Array.isArray(apps) || apps.length === 0) return null;

    const canonical = pickCanonicalAppletApp(apps, { preferredAppId });
    const duplicateIds = apps
        .filter((app) => idString(app._id) !== idString(canonical._id))
        .map((app) => app._id);

    if (duplicateIds.length === 0) return serializeAppletApp(canonical);

    const merged = mergeCanonicalApp(canonical, apps);
    const updatedCanonical = (await maybeLean(
        App.findByIdAndUpdate(
            canonical._id,
            { $set: merged },
            {
                new: true,
                runValidators: true,
            },
        ),
    )) || { ...canonical, ...merged };

    await rewriteUserAppReferences({
        canonicalAppId: updatedCanonical._id || canonical._id,
        duplicateAppIds: duplicateIds,
    });
    await App.updateMany(
        { _id: { $in: duplicateIds } },
        {
            $set: {
                status: APP_STATUS.INACTIVE,
                listedInStore: false,
            },
        },
        { runValidators: true },
    );

    return serializeAppletApp(updatedCanonical);
}

export async function findCanonicalAppletApp(appletId) {
    return canonicalizeAppletApps(appletId);
}

export async function upsertCanonicalAppletApp(
    appletId,
    update,
    { setOnInsert = {}, preferredAppId = null } = {},
) {
    const canonical = await canonicalizeAppletApps(appletId, {
        preferredAppId,
    });

    if (canonical?._id) {
        await maybeLean(
            App.findByIdAndUpdate(
                canonical._id,
                { $set: update },
                { new: true, runValidators: true },
            ),
        );
        return canonicalizeAppletApps(appletId, {
            preferredAppId: canonical._id,
        });
    }

    const filteredSetOnInsert = Object.fromEntries(
        Object.entries(setOnInsert).filter(([key]) => !(key in update)),
    );

    const created = await maybeLean(
        App.findOneAndUpdate(
            { appletId },
            { $set: update, $setOnInsert: filteredSetOnInsert },
            { new: true, upsert: true, runValidators: true },
        ),
    );

    return canonicalizeAppletApps(appletId, {
        preferredAppId: created?._id,
    });
}

export async function ensureCanonicalAppletApp(appletId, createFields) {
    const canonical = await canonicalizeAppletApps(appletId);
    if (canonical) return canonical;
    return upsertCanonicalAppletApp(appletId, createFields, {
        setOnInsert:
            createFields.listedInStore === undefined
                ? { listedInStore: false }
                : {},
    });
}

export async function repairDuplicateAppletApps() {
    const activeApps = await maybeLean(
        App.find({
            appletId: { $exists: true, $ne: null },
            type: APP_TYPES.APPLET,
            status: APP_STATUS.ACTIVE,
        }),
    );
    const appletIdsWithDuplicates = new Set();
    const counts = new Map();

    for (const app of Array.isArray(activeApps) ? activeApps : []) {
        const appletId = idString(app.appletId);
        const count = (counts.get(appletId) || 0) + 1;
        counts.set(appletId, count);
        if (count > 1) {
            appletIdsWithDuplicates.add(appletId);
        }
    }

    for (const appletId of appletIdsWithDuplicates) {
        await canonicalizeAppletApps(appletId);
    }

    return {
        duplicateAppletCount: appletIdsWithDuplicates.size,
        deactivatedAppCount: [...counts.values()].reduce(
            (total, count) => total + Math.max(0, count - 1),
            0,
        ),
    };
}

export async function ensureUniqueActiveAppletAppIndex() {
    const createIndex = () =>
        App.collection.createIndex(
            { appletId: 1, type: 1, status: 1 },
            {
                name: UNIQUE_ACTIVE_APPLET_APP_INDEX,
                unique: true,
                partialFilterExpression: {
                    appletId: { $type: "objectId" },
                    type: APP_TYPES.APPLET,
                    status: APP_STATUS.ACTIVE,
                },
            },
        );
    const shouldSkipUnsupportedUniqueIndex = (error) =>
        error?.code === 67 || error?.codeName === "CannotCreateIndex";
    const isIndexSpecConflict = (error) =>
        error?.code === 86 || error?.codeName === "IndexKeySpecsConflict";
    const shouldSkipTransientIndexAttempt = (error) =>
        isCosmosRateLimitError(error);
    const warnUnsupportedUniqueIndex = () => {
        console.warn(
            "Skipping unique active applet app index; this database does not support adding it after data exists.",
        );
    };
    const warnTransientIndexAttempt = (error) => {
        console.warn(
            `Skipping unique active applet app index during transient database throttling: ${error?.message || error}`,
        );
    };

    try {
        await createIndex();
    } catch (error) {
        if (shouldSkipUnsupportedUniqueIndex(error)) {
            warnUnsupportedUniqueIndex();
            return;
        }

        if (shouldSkipTransientIndexAttempt(error)) {
            warnTransientIndexAttempt(error);
            return;
        }

        if (!isIndexSpecConflict(error)) {
            throw error;
        }

        try {
            await App.collection.dropIndex(UNIQUE_ACTIVE_APPLET_APP_INDEX);
        } catch (dropError) {
            if (shouldSkipTransientIndexAttempt(dropError)) {
                warnTransientIndexAttempt(dropError);
                return;
            }
            throw dropError;
        }

        try {
            await createIndex();
        } catch (retryError) {
            if (shouldSkipUnsupportedUniqueIndex(retryError)) {
                warnUnsupportedUniqueIndex();
                return;
            }
            if (shouldSkipTransientIndexAttempt(retryError)) {
                warnTransientIndexAttempt(retryError);
                return;
            }
            throw retryError;
        }
    }
}
