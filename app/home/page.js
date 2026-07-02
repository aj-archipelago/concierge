import HomeAppletDirectory from "./components/HomeAppletDirectory";
import HomeOutputSandbox from "./components/HomeOutputSandbox";
import { getCurrentUser } from "../api/utils/auth";
import { resolveAppletRuntimeHtml } from "../api/canvas-applets/registry";
import {
    readHomeAppletDirectoryForUser,
    readHomeAppletIdForUser,
    readHomeItemsForUser,
} from "../api/users/me/homeAppletSettings";
import Applet from "../api/models/applet";
import App, { APP_STATUS } from "../api/models/app";
import {
    buildCanonicalAppByAppletId,
    hydrateMissingAppletImageVariants,
} from "../api/canvas-applets/app-records";
import { resolveShareAccess } from "../api/utils/shareAccess";

export const dynamic = "force-dynamic";

async function readHomeAppletHtml() {
    const user = await getCurrentUser(false);
    if (!user?._id) {
        return { html: null, user: null };
    }

    const homeAppletId = await readHomeAppletIdForUser(user);
    if (!homeAppletId) {
        return { html: null, user };
    }

    try {
        const { html } = await resolveAppletRuntimeHtml(user, homeAppletId);
        return { html, user };
    } catch (error) {
        console.warn(
            "Home page falling back to the default Home layout because the configured home applet could not be loaded:",
            error?.message,
        );
        return { html: null, user };
    }
}

async function readHomeAppletDirectory(user) {
    if (!user?._id) return [];

    const directoryEntries = await readHomeAppletDirectoryForUser(user);
    const appletIds = directoryEntries.map((entry) => entry.appletId);
    if (appletIds.length === 0) return [];

    const [applets, apps] = await Promise.all([
        Applet.find({ _id: { $in: appletIds }, version: 2 })
            .select(
                "_id owner name htmlVersions publishedVersionIndex updatedAt createdAt",
            )
            .lean(),
        App.find({
            appletId: { $in: appletIds },
            status: APP_STATUS.ACTIVE,
        })
            .populate("author", "username email")
            .lean(),
    ]);
    const appletById = new Map(
        applets.map((applet) => [String(applet._id), applet]),
    );
    const appByAppletId = await hydrateMissingAppletImageVariants(
        buildCanonicalAppByAppletId(apps),
    );
    const accessByAppletId = new Map(
        await Promise.all(
            applets.map(async (applet) => {
                const access = await resolveShareAccess({
                    entityType: "applet",
                    entityId: applet._id,
                    userId: user._id,
                    ownerId: applet.owner,
                });
                return [String(applet._id), access];
            }),
        ),
    );

    return directoryEntries
        .map((entry) => {
            const applet = appletById.get(entry.appletId);
            const access = accessByAppletId.get(entry.appletId);
            if (!applet || !access?.canAccess) return null;

            const app = appByAppletId.get(entry.appletId) || {};
            const versions = Array.isArray(applet.htmlVersions)
                ? applet.htmlVersions
                : [];
            const updatedAt =
                app.updatedAt || applet.updatedAt || applet.createdAt;

            return {
                appletId: entry.appletId,
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
                authorName: app.author?.username || null,
                publishedVersionIndex:
                    typeof applet.publishedVersionIndex === "number"
                        ? applet.publishedVersionIndex
                        : null,
                latestVersionIndex:
                    versions.length > 0 ? versions.length - 1 : null,
                updatedAt:
                    updatedAt?.toISOString?.() ||
                    updatedAt?.toString?.() ||
                    null,
            };
        })
        .filter(Boolean);
}

async function renderHomeAppletDirectory(user) {
    const [homeAppletDirectory, homeItems] = await Promise.all([
        readHomeAppletDirectory(user),
        readHomeItemsForUser(user),
    ]);
    return (
        <HomeAppletDirectory
            applets={homeAppletDirectory}
            initialHomeItems={homeItems.items}
            initialHomeItemsConfigured={homeItems.configured}
            initialHomeItemsDefaultGroupMigrated={
                homeItems.defaultGroupMigrated
            }
        />
    );
}

export default async function page() {
    const { html: homeHtml, user } = await readHomeAppletHtml();
    if (homeHtml) {
        return <HomeOutputSandbox html={homeHtml} />;
    }

    return renderHomeAppletDirectory(user);
}
