import { NextResponse } from "next/server";
import App, { APP_STATUS } from "../../models/app";
import Workspace from "../../models/workspace";
import Applet from "../../models/applet";
import { getCurrentUser } from "../../utils/auth";
import {
    getAppletVersionBlobPath,
    resolvePublishedAppletContent,
} from "../../canvas-applets/versioning";
import { buildAppletViewMeta } from "../../utils/appletViewMeta";

/** Safe shape for public /apps/[slug] — no messages, suggestions, or draft versions. */
async function toPublicAppletPayload(applet) {
    const publishedVersion =
        applet.publishedVersionIndex != null
            ? applet.htmlVersions?.[applet.publishedVersionIndex]
            : null;
    const publishedHtml =
        publishedVersion != null
            ? ((await resolvePublishedAppletContent(applet)) ?? null)
            : null;
    const repairedBlobPath = getAppletVersionBlobPath(publishedVersion);
    if (repairedBlobPath && !publishedVersion?.contentBlobPath && applet?._id) {
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

    return {
        _id: applet._id,
        name: applet.name,
        publishedVersionIndex: applet.publishedVersionIndex,
        publishedHtml,
    };
}

export async function GET(request, { params }) {
    params = await params;
    const { slug } = params;

    try {
        // Find the app by slug
        const app = await App.findOne({
            slug: slug,
            status: APP_STATUS.ACTIVE,
            listedInStore: { $ne: false },
        }).populate("author", "username email");

        if (!app) {
            return NextResponse.json(
                { error: "App not found" },
                { status: 404 },
            );
        }

        // Canvas applets (v2) — linked via appletId directly. Prefer this
        // when both appletId and legacy workspaceId are present.
        if (app.type === "applet" && app.appletId) {
            const applet = await Applet.findById(app.appletId)
                .select(
                    "owner htmlVersions publishedVersionIndex name publishedContentUrl publishedContentBlobPath publishedContentHash publishedContentSize publishedContentContextId publishedContentVersionIndex publishedContentTimestamp",
                )
                .lean();

            if (!applet) {
                return NextResponse.json(
                    { error: "Applet not found" },
                    { status: 404 },
                );
            }
            if (applet.publishedVersionIndex == null) {
                return NextResponse.json(
                    { error: "App not found" },
                    { status: 404 },
                );
            }

            const currentUser = await getCurrentUser();
            return NextResponse.json({
                app,
                applet: await toPublicAppletPayload(applet),
                meta: buildAppletViewMeta(applet.owner, currentUser),
            });
        }

        // Legacy: applet linked via workspace (do not return full workspace/applet docs)
        if (app.type === "applet" && app.workspaceId) {
            const workspace = await Workspace.findById(app.workspaceId)
                .select("applet")
                .lean();

            if (!workspace?.applet) {
                return NextResponse.json(
                    { error: "Associated workspace or applet not found" },
                    { status: 404 },
                );
            }

            const applet = await Applet.findById(workspace.applet)
                .select(
                    "owner htmlVersions publishedVersionIndex name publishedContentUrl publishedContentBlobPath publishedContentHash publishedContentSize publishedContentContextId publishedContentVersionIndex publishedContentTimestamp",
                )
                .lean();

            if (!applet) {
                return NextResponse.json(
                    { error: "Applet not found" },
                    { status: 404 },
                );
            }
            if (applet.publishedVersionIndex == null) {
                return NextResponse.json(
                    { error: "App not found" },
                    { status: 404 },
                );
            }

            const currentUser = await getCurrentUser();
            return NextResponse.json({
                app,
                applet: await toPublicAppletPayload(applet),
                meta: buildAppletViewMeta(applet.owner, currentUser),
            });
        }

        // For other app types, just return the app
        return NextResponse.json({ app });
    } catch (error) {
        console.error("Error fetching app by slug:", error);
        return NextResponse.json(
            { error: "Failed to fetch app" },
            { status: 500 },
        );
    }
}
