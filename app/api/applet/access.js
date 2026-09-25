import { NextResponse } from "next/server.js";
import mongoose from "mongoose";
import Applet from "../models/applet.js";
import App, { APP_STATUS, APP_TYPES } from "../models/app.js";
import Workspace from "../models/workspace.js";
import { resolveShareAccess } from "../utils/shareAccess.js";

async function hasListedPublicApp(applet, workspace) {
    const publicApplet = await App.findOne({
        type: APP_TYPES.APPLET,
        status: APP_STATUS.ACTIVE,
        listedInStore: { $ne: false },
        $or: [
            { appletId: applet._id },
            ...(workspace?._id ? [{ workspaceId: workspace._id }] : []),
        ],
    })
        .select("_id")
        .lean();

    return Boolean(publicApplet);
}

async function hasSharedAppletAccess(applet, userId) {
    const draftAccess = await resolveShareAccess({
        entityType: "applet",
        entityId: applet._id,
        userId,
        ownerId: applet.owner,
    });

    if (draftAccess.canAccess) {
        return true;
    }

    if (applet.publishedVersionIndex == null) {
        return false;
    }

    const publishedAccess = await resolveShareAccess({
        entityType: "published_applet",
        entityId: applet._id,
        userId,
        ownerId: applet.owner,
    });

    return publishedAccess.canAccess;
}

export async function validateAppletAccess(appletId, user) {
    if (!user?._id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!mongoose.Types.ObjectId.isValid(appletId)) {
        return NextResponse.json(
            { error: "Invalid applet ID" },
            { status: 400 },
        );
    }

    const applet = await Applet.findById(appletId)
        .select("owner version publishedVersionIndex")
        .lean();

    if (!applet) {
        return NextResponse.json(
            { error: "Applet not found" },
            { status: 404 },
        );
    }

    if (String(applet.owner) === String(user._id)) {
        return null;
    }

    if (await hasSharedAppletAccess(applet, user._id)) {
        return null;
    }

    if (applet.version === 2) {
        if (
            applet.publishedVersionIndex != null &&
            (await hasListedPublicApp(applet))
        ) {
            return null;
        }

        return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const workspace = await Workspace.findOne({ applet: applet._id })
        .select("_id")
        .lean();

    if (await hasListedPublicApp(applet, workspace)) {
        return null;
    }

    return NextResponse.json({ error: "Access denied" }, { status: 403 });
}
