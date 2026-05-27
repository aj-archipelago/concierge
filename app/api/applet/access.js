import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Applet from "../models/applet.js";
import App, { APP_STATUS, APP_TYPES } from "../models/app.js";
import Workspace from "../models/workspace.js";

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

    if (applet.version === 2) {
        if (applet.publishedVersionIndex != null) {
            return null;
        }

        return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const workspace = await Workspace.findOne({ applet: applet._id })
        .select("_id")
        .lean();
    const publicApplet = await App.findOne({
        type: APP_TYPES.APPLET,
        status: APP_STATUS.ACTIVE,
        $or: [
            { appletId: applet._id },
            ...(workspace?._id ? [{ workspaceId: workspace._id }] : []),
        ],
    })
        .select("_id")
        .lean();

    if (publicApplet) {
        return null;
    }

    return NextResponse.json({ error: "Access denied" }, { status: 403 });
}
