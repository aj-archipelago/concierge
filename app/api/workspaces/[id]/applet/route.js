import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/utils/auth";
import { migrateWorkspaceAppletToV2 } from "@/app/api/canvas-applets/migration";

function jsonError(error, fallback = "Internal server error") {
    return NextResponse.json(
        { error: error?.message || fallback },
        { status: error?.status || 500 },
    );
}

function compatibilityPayload(result, status = 200) {
    return NextResponse.json(
        {
            ...result.applet,
            appletId: result.appletId,
            version: 2,
            migrated: true,
            workspaceId: result.workspaceId,
            workspacePath: result.workspacePath || null,
            fileHash: result.fileHash || null,
            fileBlobPath: result.fileBlobPath || null,
            app: result.app || null,
            warnings: result.warnings || [],
        },
        { status },
    );
}

// Legacy workspace applet endpoint. Workspace applets are no longer edited in
// place; authenticated access promotes the applet to v2 and returns the v2
// applet metadata so old callers can redirect/open the canvas applet.
export async function GET(request, { params }) {
    const { id } = await params;

    try {
        const user = await getCurrentUser();
        const result = await migrateWorkspaceAppletToV2({
            workspaceId: id,
            user,
        });
        return compatibilityPayload(result);
    } catch (error) {
        console.error("Error migrating workspace applet:", error);
        return jsonError(error, "Failed to fetch workspace applet");
    }
}

// Editing through this legacy route is intentionally closed. Migrate first,
// then tell clients to use the v2 canvas applet APIs.
export async function PUT(request, { params }) {
    const { id } = await params;

    try {
        const user = await getCurrentUser();
        const result = await migrateWorkspaceAppletToV2({
            workspaceId: id,
            user,
        });
        return compatibilityPayload(result, 410);
    } catch (error) {
        console.error("Error migrating workspace applet before edit:", error);
        return jsonError(error, "Failed to update workspace applet");
    }
}
