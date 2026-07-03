import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Applet from "../../../models/applet";
import App, { APP_STATUS } from "../../../models/app";
import { getCurrentUser } from "../../../utils/auth";
import { resolveShareAccess } from "../../../utils/shareAccess";
import {
    getAppletVersionBlobPath,
    resolvePublishedAppletContent,
} from "../../../canvas-applets/versioning";
import { buildAppletViewMeta } from "../../../utils/appletViewMeta";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(body, init = {}) {
    const response = NextResponse.json(body, init);
    response.headers.set("Cache-Control", "no-store");
    return response;
}

async function assertPublishedAppletAccess(applet, user) {
    const access = await resolveShareAccess({
        entityType: "applet",
        entityId: applet._id,
        userId: user?._id,
        ownerId: applet.owner,
    });

    if (!access.canAccess) {
        return {
            error: jsonNoStore({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    return {};
}

// GET: fetch a published canvas applet. App-store listings are public;
// private publishes require share access.
export async function GET(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return jsonNoStore({ error: "Invalid applet ID" }, { status: 400 });
        }

        const applet = await Applet.findOne({
            _id: id,
            version: 2,
            publishedVersionIndex: { $exists: true, $ne: null },
        })
            .select(
                "name owner htmlVersions publishedVersionIndex publishedContentUrl publishedContentBlobPath publishedContentHash publishedContentSize publishedContentContextId publishedContentVersionIndex publishedContentTimestamp",
            )
            .lean();

        if (!applet) {
            return jsonNoStore(
                { error: "Published applet not found" },
                { status: 404 },
            );
        }

        const appListing = await App.findOne({
            appletId: id,
            status: APP_STATUS.ACTIVE,
            listedInStore: { $ne: false },
        })
            .select("_id")
            .lean();

        const currentUser = await getCurrentUser(false);

        if (!appListing) {
            const accessResult = await assertPublishedAppletAccess(
                applet,
                currentUser,
            );
            if (accessResult.error) {
                return accessResult.error;
            }
        }

        const publishedVersion =
            applet.htmlVersions?.[applet.publishedVersionIndex];
        const publishedHtml =
            (await resolvePublishedAppletContent(applet)) || null;
        const repairedBlobPath = getAppletVersionBlobPath(publishedVersion);
        if (repairedBlobPath && !publishedVersion?.contentBlobPath) {
            await Applet.updateOne(
                { _id: applet._id },
                {
                    $set: {
                        [`htmlVersions.${applet.publishedVersionIndex}.contentBlobPath`]:
                            repairedBlobPath,
                    },
                },
            );
        }

        const app = await App.findOne({
            appletId: id,
            status: APP_STATUS.ACTIVE,
            listedInStore: { $ne: false },
        })
            .select("name slug description icon status type")
            .lean();

        return jsonNoStore({
            applet: {
                _id: applet._id,
                name: applet.name,
                publishedVersionIndex: applet.publishedVersionIndex,
                publishedHtml,
            },
            app: app || null,
            meta: buildAppletViewMeta(applet.owner, currentUser),
        });
    } catch (error) {
        console.error("Error fetching published applet:", error);
        return jsonNoStore({ error: "Internal server error" }, { status: 500 });
    }
}
