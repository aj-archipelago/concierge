import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Applet from "@/app/api/models/applet";
import App, { APP_STATUS } from "@/app/api/models/app";
import {
    getAppletVersionBlobPath,
    resolvePublishedAppletContent,
} from "@/app/api/canvas-applets/versioning";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(body, init = {}) {
    const response = NextResponse.json(body, init);
    response.headers.set("Cache-Control", "no-store");
    return response;
}

// GET: fetch a published canvas applet (no auth required - public endpoint)
export async function GET(request, { params }) {
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
                "name htmlVersions publishedVersionIndex publishedContentUrl publishedContentBlobPath publishedContentHash publishedContentSize publishedContentContextId publishedContentVersionIndex publishedContentTimestamp",
            )
            .lean();

        if (!applet) {
            return jsonNoStore(
                { error: "Published applet not found" },
                { status: 404 },
            );
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
        });
    } catch (error) {
        console.error("Error fetching published applet:", error);
        return jsonNoStore({ error: "Internal server error" }, { status: 500 });
    }
}
