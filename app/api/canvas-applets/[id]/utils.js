import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Applet from "../../models/applet";
import App, { APP_STATUS } from "../../models/app";
import { getCurrentUser } from "../../utils/auth";
import { resolveShareAccess } from "../../utils/shareAccess";

/**
 * Verify that the current user can access a v2 canvas applet's data/files.
 * Access is granted when the user owns the applet, has explicit share access,
 * or the applet is published through a listed app-store record.
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

    const access = await resolveShareAccess({
        entityType: "applet",
        entityId: applet._id,
        userId: user._id,
        ownerId: applet.owner,
    });

    let publishedAccess = null;
    if (!access.canAccess && applet.publishedVersionIndex != null) {
        publishedAccess = await resolveShareAccess({
            entityType: "published_applet",
            entityId: applet._id,
            userId: user._id,
            ownerId: applet.owner,
        });
    }

    let hasListedPublicApp = false;
    if (
        !access.canAccess &&
        !publishedAccess?.canAccess &&
        applet.publishedVersionIndex != null
    ) {
        hasListedPublicApp = Boolean(
            await App.findOne({
                appletId: applet._id,
                status: APP_STATUS.ACTIVE,
                listedInStore: { $ne: false },
            })
                .select("_id")
                .lean(),
        );
    }

    if (
        !access.canAccess &&
        !publishedAccess?.canAccess &&
        !hasListedPublicApp
    ) {
        return {
            error: NextResponse.json(
                { error: "Access denied" },
                { status: 403 },
            ),
        };
    }

    return {
        applet,
        user,
        access: access.canAccess
            ? access
            : publishedAccess?.canAccess
              ? publishedAccess
              : { canAccess: true, isOwner: false, role: "viewer" },
    };
}
