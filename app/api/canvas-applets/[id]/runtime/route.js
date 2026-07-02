import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "../../../utils/auth";
import App, { APP_STATUS } from "../../../models/app";
import { resolveInstalledAppletRuntime } from "../../registry";

function jsonNoStore(body, init = {}) {
    const response = NextResponse.json(body, init);
    response.headers.set("Cache-Control", "no-store");
    return response;
}

function validateAppletId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }
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

export async function GET(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        validateAppletId(id);
        const user = await requireUser();
        const runtime = await resolveInstalledAppletRuntime(user, id);
        const app = await App.findOne({
            appletId: id,
            status: APP_STATUS.ACTIVE,
        })
            .select("name slug description icon status type listedInStore")
            .lean();

        return jsonNoStore({
            applet: {
                _id: runtime.applet._id,
                name: runtime.applet.name,
                publishedVersionIndex: runtime.publishedVersionIndex,
                latestVersionIndex: runtime.latestVersionIndex,
                runtimeSource: runtime.runtimeSource,
                runtimeHtml: runtime.html,
            },
            app: app || null,
        });
    } catch (error) {
        console.error("Error fetching applet runtime:", error);
        return jsonNoStore(
            { error: error?.message || "Internal server error" },
            { status: error?.status || 500 },
        );
    }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
