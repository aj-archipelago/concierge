import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "../../../utils/auth";
import { getAppletRegistry } from "../../../canvas-applets/registry";
import {
    clearHomeAppletIdForUser,
    readHomeAppletDirectoryForUser,
    readHomeItemsForUser,
    readHomeAppletIdForUser,
    setHomeAppletIdForUser,
} from "../homeAppletSettings";

function jsonError(error, fallback = "Internal server error") {
    return NextResponse.json(
        { error: error?.message || fallback },
        { status: error?.status || 500 },
    );
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

function validateAppletId(appletId) {
    if (!mongoose.Types.ObjectId.isValid(appletId)) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }
}

export async function GET() {
    try {
        const user = await requireUser();
        const [homeAppletId, homeAppletDirectory, homeItems] =
            await Promise.all([
                readHomeAppletIdForUser(user),
                readHomeAppletDirectoryForUser(user),
                readHomeItemsForUser(user),
            ]);
        return NextResponse.json({
            homeAppletId,
            homeAppletDirectory,
            homeAppletIds: homeAppletDirectory.map((entry) => entry.appletId),
            homeItems: homeItems.items,
            homeItemsConfigured: homeItems.configured,
        });
    } catch (error) {
        return jsonError(error);
    }
}

export async function PUT(request) {
    try {
        const user = await requireUser();
        const { appletId } = await request.json();
        validateAppletId(appletId);

        await getAppletRegistry(user, appletId);

        return NextResponse.json({
            homeAppletId: await setHomeAppletIdForUser(user, appletId),
        });
    } catch (error) {
        console.error("Error setting home applet:", error);
        return jsonError(error);
    }
}

export async function DELETE() {
    try {
        const user = await requireUser();
        await clearHomeAppletIdForUser(user);

        return NextResponse.json({ homeAppletId: null });
    } catch (error) {
        console.error("Error clearing home applet:", error);
        return jsonError(error);
    }
}

export const dynamic = "force-dynamic";
