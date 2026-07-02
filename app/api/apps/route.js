import App, { APP_STATUS, APP_TYPES } from "../models/app";
import Workspace from "../models/workspace";
import { ensureBuiltInNativeApps } from "./native-apps";

function toIdString(value) {
    if (!value) return null;
    if (typeof value === "object" && value?._id) return String(value._id);
    return String(value);
}

function isPublishedApplet(applet) {
    return applet?.publishedVersionIndex != null;
}

function getLegacyWorkspaceIds(apps) {
    return apps
        .filter(
            (app) =>
                app?.type === APP_TYPES.APPLET &&
                !app.appletId &&
                app.workspaceId,
        )
        .map((app) => toIdString(app.workspaceId))
        .filter(Boolean);
}

async function getPublishedLegacyWorkspaceIds(apps) {
    const workspaceIds = getLegacyWorkspaceIds(apps);
    if (workspaceIds.length === 0) return new Set();

    const workspaces = await Workspace.find({ _id: { $in: workspaceIds } })
        .select("_id applet")
        .populate("applet", "publishedVersionIndex")
        .lean();

    return new Set(
        workspaces
            .filter((workspace) => isPublishedApplet(workspace.applet))
            .map((workspace) => String(workspace._id)),
    );
}

function isDiscoverableApp(app, publishedLegacyWorkspaceIds) {
    if (app?.type !== APP_TYPES.APPLET) return true;
    if (app.appletId) return isPublishedApplet(app.appletId);

    const workspaceId = toIdString(app.workspaceId);
    return workspaceId ? publishedLegacyWorkspaceIds.has(workspaceId) : false;
}

export async function GET() {
    try {
        await ensureBuiltInNativeApps();

        // Fetch all active apps and populate the author field
        const apps = await App.find({
            status: APP_STATUS.ACTIVE,
            listedInStore: { $ne: false },
        })
            .populate("author", "username email")
            .populate("appletId", "publishedVersionIndex htmlVersions name")
            .sort({
                name: 1,
            });

        const publishedLegacyWorkspaceIds =
            await getPublishedLegacyWorkspaceIds(apps);

        return Response.json(
            apps.filter((app) =>
                isDiscoverableApp(app, publishedLegacyWorkspaceIds),
            ),
        );
    } catch (error) {
        console.error("Error fetching apps:", error);
        return Response.json(
            { error: "Failed to fetch apps: " + error.message },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
