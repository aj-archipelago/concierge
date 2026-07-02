import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";
import { migrateWorkspaceAppletToV2 } from "../migration";

function jsonError(error, fallback = "Internal server error") {
    return NextResponse.json(
        { error: error?.message || fallback },
        { status: error?.status || 500 },
    );
}

export async function POST(request) {
    try {
        const user = await getCurrentUser();
        if (!user?._id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const result = await migrateWorkspaceAppletToV2({
            workspaceId: body.workspaceId || null,
            appletId: body.appletId || null,
            appSlug: body.appSlug || null,
            dryRun: body.dryRun === true,
            user,
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error("Error migrating applet to v2:", error);
        return jsonError(error);
    }
}
