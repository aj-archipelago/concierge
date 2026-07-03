import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "../../../utils/auth";
import App, { APP_STATUS, APP_TYPES } from "../../../models/app";
import { getAppletRegistry } from "../../registry";
import { ensureCanonicalAppletApp } from "../../app-records";

function jsonError(error, fallback = "Internal server error") {
    return NextResponse.json(
        { error: error?.message || fallback },
        { status: error?.status || 500 },
    );
}

function validateAppletId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }
}

function privateAppletSlug(id) {
    return `private-applet-${id}`;
}

async function requireUser() {
    const user = await getCurrentUser(false);
    if (!user?._id) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
    }
    return user;
}

async function ensureSidebarAppletApp(user, appletId) {
    const applet = await getAppletRegistry(user, appletId);
    return ensureCanonicalAppletApp(appletId, {
        name: applet.name || "Untitled Applet",
        slug: privateAppletSlug(appletId),
        author: applet.owner || user._id,
        type: APP_TYPES.APPLET,
        status: APP_STATUS.ACTIVE,
        listedInStore: false,
        appletId,
        icon: null,
        description: null,
    });
}

async function addAppToUser(user, app) {
    const appId = String(app._id);
    const currentApps = Array.isArray(user.apps) ? user.apps : [];
    if (currentApps.some((entry) => String(entry.appId) === appId)) {
        return user;
    }

    user.apps = [
        ...currentApps,
        {
            appId: app._id,
            order: currentApps.length,
            addedAt: new Date(),
        },
    ];
    return user.save();
}

async function removeAppFromUser(user, appletId) {
    const app = await App.findOne({ appletId }).select("_id").lean();
    if (!app?._id || !Array.isArray(user.apps)) {
        return user;
    }

    const appId = String(app._id);
    user.apps = user.apps
        .filter((entry) => String(entry.appId) !== appId)
        .map((entry, index) => ({
            appId: entry.appId,
            order: index,
            addedAt: entry.addedAt || new Date(),
        }));
    return user.save();
}

async function respondWithUser(user) {
    await user.populate("apps.appId");
    return NextResponse.json(JSON.parse(JSON.stringify(user.toJSON())));
}

export async function POST(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        validateAppletId(id);
        const user = await requireUser();
        const app = await ensureSidebarAppletApp(user, id);
        await addAppToUser(user, app);
        return respondWithUser(user);
    } catch (error) {
        console.error("Error installing applet:", error);
        return jsonError(error);
    }
}

export async function DELETE(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        validateAppletId(id);
        const user = await requireUser();
        await removeAppFromUser(user, id);
        return respondWithUser(user);
    } catch (error) {
        console.error("Error removing applet install:", error);
        return jsonError(error);
    }
}
