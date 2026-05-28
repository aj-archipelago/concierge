import { NextResponse } from "next/server";
import AppletSharedDataRevision from "../../../../../models/applet-shared-data-revision";
import { getCanvasAppletForDataAccess } from "../../../utils";
import {
    APPLET_SDK_LIMITS,
    withAppletSdkGuard,
} from "../../../../../applet/sdk-guard";
import {
    revisionToken,
    validateSharedDataKey,
} from "../../../../shared-data-utils";

function toBackupSummary(backup) {
    return {
        id: backup._id?.toString?.() || backup._id,
        revision: revisionToken(backup.revision),
        value: backup.value,
        reason: backup.reason,
        createdAt: backup.createdAt,
        createdBy: backup.createdBy?.toString?.() || backup.createdBy,
    };
}

// GET: list shared data recovery snapshots for a workspace key.
export async function GET(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        const keyValidation = validateSharedDataKey(params.key);
        if (keyValidation.error) return keyValidation.error;

        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { user } = access;

        return await withAppletSdkGuard({
            appletId: id,
            userId: user._id,
            api: "sharedData.backups",
            limits: APPLET_SDK_LIMITS.read,
            run: async () => {
                const backups = await AppletSharedDataRevision.find({
                    appletId: id,
                    key: keyValidation.key,
                })
                    .sort({ revision: -1, createdAt: -1 })
                    .limit(50)
                    .lean();

                return NextResponse.json({
                    backups: backups.map(toBackupSummary),
                });
            },
        });
    } catch (error) {
        console.error(
            "Error listing canvas applet shared data backups:",
            error,
        );
        return NextResponse.json(
            { error: error.status ? error.message : "Internal server error" },
            { status: error.status || 500 },
        );
    }
}
