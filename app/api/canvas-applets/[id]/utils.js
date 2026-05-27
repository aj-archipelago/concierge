import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Applet from "../../models/applet";
import { getCurrentUser } from "../../utils/auth";

/**
 * Verify that the current user can access a v2 canvas applet's data/files.
 * Access is granted if the user is the owner OR the applet is published.
 *
 * @param {string} appletId - The applet ID from the URL params
 * @returns {{ applet: Object, user: Object } | { error: NextResponse }}
 */
export async function getCanvasAppletForDataAccess(appletId) {
    const user = await getCurrentUser();
    if (!user?._id) {
        return {
            error: NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            ),
        };
    }

    if (!mongoose.Types.ObjectId.isValid(appletId)) {
        return {
            error: NextResponse.json(
                { error: "Invalid applet ID" },
                { status: 400 },
            ),
        };
    }

    const applet = await Applet.findOne({
        _id: appletId,
        version: 2,
    });

    if (!applet) {
        return {
            error: NextResponse.json(
                { error: "Applet not found" },
                { status: 404 },
            ),
        };
    }

    // Allow access if user is owner or applet is published
    const isOwner = applet.owner.toString() === user._id.toString();
    const isPublished = applet.publishedVersionIndex != null;

    if (!isOwner && !isPublished) {
        return {
            error: NextResponse.json(
                { error: "Access denied" },
                { status: 403 },
            ),
        };
    }

    return { applet, user };
}
