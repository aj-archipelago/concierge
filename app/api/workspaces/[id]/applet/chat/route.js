import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/utils/auth";
import { migrateWorkspaceAppletToV2 } from "@/app/api/canvas-applets/migration";

export async function POST(request, { params }) {
    const { id } = await params;

    try {
        const user = await getCurrentUser();
        const result = await migrateWorkspaceAppletToV2({
            workspaceId: id,
            user,
        });

        return NextResponse.json(
            {
                error: "Workspace applet editing has moved to the v2 canvas applet editor.",
                appletId: result.appletId,
                workspaceId: result.workspaceId,
                workspacePath: result.workspacePath || null,
            },
            { status: 410 },
        );
    } catch (error) {
        console.error("Error migrating workspace applet chat:", error);
        return NextResponse.json(
            {
                error: error?.status
                    ? error.message
                    : "Failed to migrate workspace applet",
            },
            { status: error?.status || 500 },
        );
    }
}
