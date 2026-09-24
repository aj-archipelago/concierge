import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Workspace from "../../../../models/workspace";
import Applet from "../../../../models/applet";
import App, { APP_STATUS } from "../../../../models/app";
import { getCurrentUser } from "../../../../utils/auth";
import { resolveShareAccess } from "../../../../utils/shareAccess";
import { resolvePublishedAppletContent } from "../../../../canvas-applets/versioning";

// Public endpoint for legacy workspace applet links. This intentionally avoids
// the authenticated workspace editor route so published links keep working for
// anonymous users.
export async function GET(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        const workspaceQuery = mongoose.isObjectIdOrHexString(id)
            ? { _id: id }
            : { slug: id };
        const workspace = await Workspace.findOne(workspaceQuery)
            .select("applet")
            .lean();

        if (!workspace?.applet) {
            return NextResponse.json(
                { error: "Published applet not found" },
                { status: 404 },
            );
        }

        const applet = await Applet.findOne({
            _id: workspace.applet,
            publishedVersionIndex: { $exists: true, $ne: null },
        })
            .select(
                "name owner htmlVersions publishedVersionIndex publishedContentUrl publishedContentBlobPath publishedContentHash publishedContentSize publishedContentContextId publishedContentVersionIndex publishedContentTimestamp",
            )
            .lean();

        if (!applet) {
            return NextResponse.json(
                { error: "Published applet not found" },
                { status: 404 },
            );
        }

        const app = await App.findOne({
            workspaceId: workspace._id,
            type: "applet",
            status: APP_STATUS.ACTIVE,
        })
            .select("name slug description icon status type listedInStore")
            .lean();

        if (app?.listedInStore === false) {
            const currentUser = await getCurrentUser(false);
            const access = await resolveShareAccess({
                entityType: "published_applet",
                entityId: applet._id,
                userId: currentUser?._id,
                ownerId: applet.owner,
            });

            if (!access.canAccess) {
                return NextResponse.json(
                    { error: "Unauthorized" },
                    { status: 401 },
                );
            }
        }

        return NextResponse.json({
            app: app?.listedInStore !== false ? app || null : null,
            applet: {
                _id: applet._id,
                name: applet.name,
                publishedVersionIndex: applet.publishedVersionIndex,
                publishedHtml:
                    (await resolvePublishedAppletContent(applet)) || null,
            },
        });
    } catch (error) {
        console.error("Error fetching published workspace applet:", error);
        return NextResponse.json(
            { error: "Failed to fetch published applet" },
            { status: 500 },
        );
    }
}
